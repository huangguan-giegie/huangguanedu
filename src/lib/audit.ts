// 审计日志工具：管理员/老师的写操作、修改与审核操作统一落库
import type { PrismaClient } from "../generated/prisma/client";

/** 操作人信息（系统级操作为 null） */
export interface AuditActor {
  id: string;
  name: string;
}

/** 审计日志写入参数 */
export interface AuditLogInput {
  actor: AuditActor | null;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  ip?: string | null;
}

/** 写入一条审计日志 */
export async function writeAuditLog(
  prisma: PrismaClient,
  input: AuditLogInput,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      ip: input.ip ?? null,
    },
  });
}
