// 登录失败锁定：同一手机号或 IP 在 15 分钟内最多允许 5 次失败，触发后锁定 15 分钟
// 计数与锁定状态持久化在 SystemSetting（JSON 存储），避免新增数据表
import type { PrismaClient } from "../generated/prisma/client";

// 统计窗口：15 分钟
const LOCK_WINDOW_MS = 15 * 60 * 1000;
// 锁定持续时间：15 分钟
const LOCK_DURATION_MS = 15 * 60 * 1000;
// 窗口内最大失败次数
const MAX_FAILURES = 5;

interface LockState {
  /** 窗口内的失败时间戳（毫秒） */
  times: number[];
  /** 锁定截止时间戳（毫秒），未锁定时为 null */
  lockedUntil: number | null;
}

const EMPTY_STATE: LockState = { times: [], lockedUntil: null };

function phoneKey(phone: string): string {
  return `login_failures:phone:${phone}`;
}

function ipKey(ip: string): string {
  return `login_failures:ip:${ip}`;
}

/** 读取并解析锁定状态，同时清理窗口外的旧失败记录 */
async function readLockState(
  prisma: PrismaClient,
  key: string,
  now: number,
): Promise<LockState> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  });
  if (!setting) {
    return { ...EMPTY_STATE };
  }

  let state: LockState = { ...EMPTY_STATE };
  try {
    const parsed = JSON.parse(setting.value) as LockState;
    state = {
      times: Array.isArray(parsed.times) ? parsed.times : [],
      lockedUntil:
        typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : null,
    };
  } catch {
    // 存储值损坏时按空状态处理并重建
  }

  const cutoff = now - LOCK_WINDOW_MS;
  const freshTimes = state.times.filter((time) => time > cutoff);
  const lockedUntil =
    state.lockedUntil !== null && state.lockedUntil > now
      ? state.lockedUntil
      : null;

  // 有变化时写回，保持存储精简
  if (
    freshTimes.length !== state.times.length ||
    lockedUntil !== state.lockedUntil
  ) {
    await writeLockState(prisma, key, { times: freshTimes, lockedUntil });
  }

  return { times: freshTimes, lockedUntil };
}

async function writeLockState(
  prisma: PrismaClient,
  key: string,
  state: LockState,
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: JSON.stringify(state) },
    create: { key, value: JSON.stringify(state) },
  });
}

/** 是否处于锁定状态（手机号或 IP 任一被锁定即返回 true） */
export async function isLoginLocked(
  prisma: PrismaClient,
  phone: string,
  ip: string,
  now: Date = new Date(),
): Promise<boolean> {
  const time = now.getTime();
  const phoneState = await readLockState(prisma, phoneKey(phone), time);
  const ipState = await readLockState(prisma, ipKey(ip), time);

  return phoneState.lockedUntil !== null || ipState.lockedUntil !== null;
}

/**
 * 记录一次登录失败并返回是否触发锁定。
 * 手机号与 IP 各自计数，任一达到阈值即锁定。
 */
export async function recordLoginFailure(
  prisma: PrismaClient,
  phone: string,
  ip: string,
  now: Date = new Date(),
): Promise<{ locked: boolean; failures: number }> {
  const time = now.getTime();
  let maxFailures = 0;
  let locked = false;

  for (const key of [phoneKey(phone), ipKey(ip)]) {
    const state = await readLockState(prisma, key, time);
    const times = [...state.times, time];
    const lockedUntil =
      state.lockedUntil ?? (times.length >= MAX_FAILURES ? time + LOCK_DURATION_MS : null);
    await writeLockState(prisma, key, { times, lockedUntil });

    maxFailures = Math.max(maxFailures, times.length);
    locked = locked || lockedUntil !== null;
  }

  return { locked, failures: maxFailures };
}

/** 登录成功后清除手机号与 IP 的失败计数 */
export async function clearLoginFailures(
  prisma: PrismaClient,
  phone: string,
  ip: string,
): Promise<void> {
  await prisma.systemSetting.deleteMany({
    where: { key: { in: [phoneKey(phone), ipKey(ip)] } },
  });
}
