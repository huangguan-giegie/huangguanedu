// 数据库 Session 与会话 Cookie 工具
// Cookie 只存随机令牌原文，数据库只存令牌的 SHA-256 哈希，降低令牌泄露后的影响
import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient } from "../generated/prisma/client";

// 会话 Cookie 名称（可通过环境变量覆盖）
export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "yy_session";

// 会话有效期：7 天
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Cookie 与令牌的最小字节数（32 字节随机数）
const TOKEN_BYTES = 32;

/** 生成 URL 安全的随机会话令牌（base64url，无 padding） */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** 计算令牌的 SHA-256 哈希，数据库仅保存该值 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 会话 Cookie 属性：HttpOnly + SameSite=Lax + Path=/，仅生产环境启用 Secure */
export function getSessionCookieOptions(
  expiresAt: Date,
): {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  const maxAge = Math.max(
    1,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  );
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

/**
 * 创建会话并返回令牌与过期时间。
 * 业务方负责把令牌写入 Cookie；数据库只保存哈希。
 */
export async function createSession(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

/**
 * 根据 Cookie 中的令牌查找会话所属用户。
 * 令牌无效或会话已过期时返回 null；过期会话会顺手删除。
 */
export async function findSessionUser(
  prisma: PrismaClient,
  token: string | null | undefined,
): Promise<import("../generated/prisma/client").User | null> {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

/** 注销：删除指定令牌对应的会话 */
export async function deleteSessionByToken(
  prisma: PrismaClient,
  token: string,
): Promise<void> {
  await prisma.session.deleteMany({
    where: { tokenHash: hashSessionToken(token) },
  });
}

/** 撤销某用户的全部会话（例如管理员重置密码后），返回删除条数 */
export async function revokeAllUserSessions(
  prisma: PrismaClient,
  userId: string,
): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId } });
  return result.count;
}
