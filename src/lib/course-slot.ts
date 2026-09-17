// 课程时段校验与老师时间冲突检查
import type { PrismaClient } from "../generated/prisma/client";
import type { CourseType, Subject } from "../generated/prisma/enums";

export class CourseSlotError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface SlotInput {
  type: CourseType;
  grade: string;
  subject: Subject;
  teacherId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  location?: string;
  capacity?: number;
}

/** 校验时段输入并返回规范化容量（小班上限 5；一对一固定 1） */
export function normalizeSlotInput(input: SlotInput): SlotInput {
  if (!input.grade.trim() || !input.subject) {
    throw new CourseSlotError(400, "INVALID_INPUT", "年级与科目不能为空");
  }
  if (!(input.endTime.getTime() > input.startTime.getTime())) {
    throw new CourseSlotError(400, "INVALID_TIME", "结束时间必须晚于开始时间");
  }
  // date 与 startTime 必须属于同一天
  const sameDay =
    input.date.getFullYear() === input.startTime.getFullYear() &&
    input.date.getMonth() === input.startTime.getMonth() &&
    input.date.getDate() === input.startTime.getDate();
  if (!sameDay) {
    throw new CourseSlotError(400, "INVALID_DATE", "日期与开始时间不一致");
  }

  if (input.type === "ONE_ON_ONE") {
    return { ...input, capacity: 1 };
  }
  // SMALL_CLASS
  const capacity = input.capacity ?? 5;
  if (capacity < 1 || capacity > 5) {
    throw new CourseSlotError(400, "INVALID_CAPACITY", "小班容量必须在 1-5 之间");
  }
  return { ...input, capacity };
}

/** 检查老师在同一时间段的时段重叠（创建/修改时） */
export async function assertNoTeacherConflict(
  prisma: PrismaClient,
  teacherId: string,
  startTime: Date,
  endTime: Date,
  excludeSlotId?: string,
): Promise<void> {
  const start = startTime.getTime();
  const end = endTime.getTime();
  const overlapping = await prisma.courseSlot.findMany({
    where: {
      teacherId,
      status: { not: "CANCELLED" },
      ...(excludeSlotId ? { NOT: { id: excludeSlotId } } : {}),
    },
  });
  const conflict = overlapping.some((s) => {
    const sStart = s.startTime.getTime();
    const sEnd = s.endTime.getTime();
    return start < sEnd && sStart < end;
  });
  if (conflict) {
    throw new CourseSlotError(409, "TEACHER_TIME_CONFLICT", "该老师在此时间段已有课程");
  }
}
