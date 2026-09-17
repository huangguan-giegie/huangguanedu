// 认证与角色权限中间件：供 /api/v1 路由处理器复用
import type { NextRequest, NextResponse } from "next/server";

import type { PrismaClient } from "../generated/prisma/client";
import type { UserRole } from "../generated/prisma/enums";
import { jsonError } from "./http";
import { SESSION_COOKIE_NAME, findSessionUser } from "./session";

/** 对外暴露的安全用户信息（不含 passwordHash，手机号脱敏） */
export interface SafeUser {
  id: string;
  role: UserRole;
  name: string;
  phoneMasked: string;
  mustChangePassword: boolean;
}

/** 手机号脱敏：保留前 3 位与后 4 位，其余用星号代替 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) {
    return "****";
  }
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 将数据库用户映射为安全用户信息 */
export function toSafeUser(user: {
  id: string;
  role: UserRole;
  name: string;
  phone: string;
  mustChangePassword: boolean;
}): SafeUser {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    phoneMasked: maskPhone(user.phone),
    mustChangePassword: user.mustChangePassword,
  };
}

/** 中间件结果：返回用户或统一错误响应 */
export type AuthResult =
  | { user: SafeUser }
  | { error: NextResponse };

/** 必须登录：未登录、已停用或已删除用户返回 401 */
export async function requireUser(
  request: NextRequest,
  prisma: PrismaClient,
): Promise<AuthResult> {
  const user = await findSessionUser(
    prisma,
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user || !user.isActive || user.deletedAt) {
    return { error: jsonError(401, "UNAUTHENTICATED", "请先登录") };
  }

  return { user: toSafeUser(user) };
}

/** 必须登录且角色匹配：无权限时返回 403 */
export async function requireRole(
  request: NextRequest,
  prisma: PrismaClient,
  roles: UserRole[],
): Promise<AuthResult> {
  const result = await requireUser(request, prisma);
  if ("error" in result) {
    return result;
  }
  if (!roles.includes(result.user.role)) {
    return { error: jsonError(403, "FORBIDDEN", "无权执行该操作") };
  }
  return result;
}
