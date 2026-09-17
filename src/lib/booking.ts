// 一对一预约业务逻辑：创建/取消/管理员变更状态，全部在数据库事务内完成
// 课时账务：创建预约时 remainingHours-1 且 lockedHours=1（记录 entitlementId）；
// 提前 24h 取消释放回 remainingHours；临期取消/缺席/完成时 lockedHours 转 usedHours
import type { PrismaClient } from "../generated/prisma/client";

// Prisma 7 的 $transaction 回调参数类型（去掉客户端管理方法）
export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends"
>;

// 取消截止提前小时数（与 seed 系统设置一致，可被 SystemSetting 覆盖）
export async function getCancelDeadlineHours(
  prisma: TransactionClient,
): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "booking_cancel_deadline_hours" },
  });
  const parsed = Number(setting?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

export class BookingError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 计算距离时段开始的小时数（负数表示已开始） */
function hoursBeforeStart(startTime: Date, now: Date): number {
  return (startTime.getTime() - now.getTime()) / (60 * 60 * 1000);
}

/** 释放时段：无其他未结束预约时恢复 OPEN */
async function releaseSlotIfFree(
  tx: TransactionClient,
  slotId: string,
): Promise<void> {
  const active = await tx.booking.count({
    where: { slotId, status: { in: ["PENDING", "CONFIRMED", "ABSENT"] } },
  });
  if (active === 0) {
    await tx.courseSlot.update({
      where: { id: slotId },
      data: { status: "OPEN" },
    });
  }
}

/**
 * 创建一对一预约（事务）：
 * - 学生需有 paid=true 且 remainingHours>0 的一对一权益
 * - 时段须存在、类型 ONE_ON_ONE、OPEN、未来
 * - 防重复预约、防学生时间冲突
 * - 锁定 1 课时（记录 entitlementId），时段置 FULL
 */
export async function createBookingTx(
  prisma: PrismaClient,
  studentId: string,
  slotId: string,
  now: Date = new Date(),
): Promise<{ bookingId: string }> {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.courseSlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      throw new BookingError(404, "SLOT_NOT_FOUND", "课程时段不存在");
    }
    if (slot.type !== "ONE_ON_ONE") {
      throw new BookingError(400, "SLOT_NOT_BOOKABLE", "小班课程不开放在线预约");
    }
    if (slot.status !== "OPEN") {
      throw new BookingError(409, "SLOT_NOT_AVAILABLE", "该时段已被占用或不可预约");
    }
    if (slot.startTime.getTime() <= now.getTime()) {
      throw new BookingError(400, "SLOT_IN_PAST", "不能预约已开始的时段");
    }

    // 有效的一对一权益
    const entitlement = await tx.studentEntitlement.findFirst({
      where: {
        studentId,
        plan: { type: "ONE_ON_ONE" },
        paid: true,
        remainingHours: { gt: 0 },
      },
    });
    if (!entitlement) {
      throw new BookingError(400, "NO_ENTITLEMENT", "没有可用的一对一课时权益");
    }

    // 防重复预约
    const duplicate = await tx.booking.findFirst({
      where: {
        studentId,
        slotId,
        status: { in: ["PENDING", "CONFIRMED", "ABSENT"] },
      },
    });
    if (duplicate) {
      throw new BookingError(409, "DUPLICATE_BOOKING", "该时段已有预约记录");
    }

    // 防学生时间冲突
    const slotStart = slot.startTime.getTime();
    const slotEnd = slot.endTime.getTime();
    const existing = await tx.booking.findMany({
      where: {
        studentId,
        status: { in: ["PENDING", "CONFIRMED"] },
        slot: { type: "ONE_ON_ONE" },
      },
      include: { slot: true },
    });
    const timeConflict = existing.some((b) => {
      const s = b.slot.startTime.getTime();
      const e = b.slot.endTime.getTime();
      return slotStart < e && s < slotEnd;
    });
    if (timeConflict) {
      throw new BookingError(409, "TIME_CONFLICT", "该时段与其他预约时间冲突");
    }

    // 锁定 1 课时 + 创建预约 + 时段置 FULL
    await tx.studentEntitlement.update({
      where: { id: entitlement.id },
      data: { remainingHours: { decrement: 1 } },
    });
    const booking = await tx.booking.create({
      data: {
        studentId,
        slotId,
        entitlementId: entitlement.id,
        status: "PENDING",
        lockedHours: 1,
      },
    });
    await tx.courseSlot.update({
      where: { id: slotId },
      data: { status: "FULL" },
    });

    return { bookingId: booking.id };
  });
}

/** 取消预约（事务）：提前 24h 释放锁定课时；临期取消转已使用 */
export async function cancelBookingTx(
  prisma: PrismaClient,
  bookingId: string,
  now: Date = new Date(),
): Promise<{ bookingId: string }> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { slot: true, entitlement: true },
    });
    if (!booking) {
      throw new BookingError(404, "BOOKING_NOT_FOUND", "预约不存在");
    }
    if (
      booking.status === "CANCELLED" ||
      booking.status === "COMPLETED" ||
      booking.status === "ABSENT"
    ) {
      throw new BookingError(400, "BOOKING_NOT_CANCELLABLE", "该预约当前状态不可取消");
    }

    const deadlineHours = await getCancelDeadlineHours(tx);
    const isEarly = hoursBeforeStart(booking.slot.startTime, now) >= deadlineHours;

    if (isEarly && booking.entitlementId) {
      // 提前取消：释放锁定课时
      await tx.studentEntitlement.update({
        where: { id: booking.entitlementId },
        data: { remainingHours: { increment: booking.lockedHours } },
      });
    } else if (!isEarly && booking.entitlementId && booking.lockedHours > 0) {
      // 临期取消：锁定课时转已使用
      await tx.studentEntitlement.update({
        where: { id: booking.entitlementId },
        data: { usedHours: { increment: booking.lockedHours } },
      });
    }

    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: now, lockedHours: 0 },
    });
    await releaseSlotIfFree(tx, booking.slotId);

    return { bookingId };
  });
}

/** 管理员变更预约状态：CONFIRM / COMPLETE / ABSENT / CANCEL */
export async function adminChangeBookingStatusTx(
  prisma: PrismaClient,
  bookingId: string,
  action: "CONFIRM" | "COMPLETE" | "ABSENT" | "CANCEL",
  now: Date = new Date(),
): Promise<{ bookingId: string }> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { slot: true, entitlement: true },
    });
    if (!booking) {
      throw new BookingError(404, "BOOKING_NOT_FOUND", "预约不存在");
    }

    // 锁定课时转已使用（COMPLETE/ABSENT/临期 CANCEL 共用）
    const consumeLocked = async () => {
      if (booking.entitlementId && booking.lockedHours > 0) {
        await tx.studentEntitlement.update({
          where: { id: booking.entitlementId },
          data: { usedHours: { increment: booking.lockedHours } },
        });
      }
    };

    if (action === "CONFIRM") {
      if (booking.status !== "PENDING") {
        throw new BookingError(400, "INVALID_STATUS", "仅待确认预约可确认");
      }
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "CONFIRMED" },
      });
    } else if (action === "COMPLETE") {
      if (booking.status !== "CONFIRMED") {
        throw new BookingError(400, "INVALID_STATUS", "仅已确认预约可完成");
      }
      await consumeLocked();
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "COMPLETED", lockedHours: 0 },
      });
      await releaseSlotIfFree(tx, booking.slotId);
    } else if (action === "ABSENT") {
      if (booking.status !== "CONFIRMED" && booking.status !== "PENDING") {
        throw new BookingError(400, "INVALID_STATUS", "仅待确认/已确认预约可标记缺席");
      }
      await consumeLocked();
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "ABSENT", lockedHours: 0, cancelledAt: now },
      });
      await releaseSlotIfFree(tx, booking.slotId);
    } else if (action === "CANCEL") {
      if (booking.status === "COMPLETED" || booking.status === "ABSENT") {
        throw new BookingError(400, "INVALID_STATUS", "已完成/缺席预约不可取消");
      }
      const deadlineHours = await getCancelDeadlineHours(tx);
      const isEarly = hoursBeforeStart(booking.slot.startTime, now) >= deadlineHours;
      if (isEarly && booking.entitlementId) {
        await tx.studentEntitlement.update({
          where: { id: booking.entitlementId },
          data: { remainingHours: { increment: booking.lockedHours } },
        });
      } else if (!isEarly) {
        await consumeLocked();
      }
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: "CANCELLED", lockedHours: 0, cancelledAt: now },
      });
      await releaseSlotIfFree(tx, booking.slotId);
    }

    return { bookingId };
  });
}
