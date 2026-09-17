// Next.js 路由处理器通用工具：统一错误响应与客户端 IP 获取
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { ApiResponse } from "./api-response";
import { loadConfig } from "./config";

/** 构造符合 ApiResponse 约定的错误响应 */
export function jsonError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  const body: ApiResponse<never> = {
    success: false,
    error: { code, message },
  };
  return NextResponse.json(body, { status });
}

/**
 * 解析客户端 IP：仅在明确配置 TRUSTED_PROXY=true 时信任代理头，
 * 并按 TRUSTED_PROXY_HOPS 从右向左取真实客户端地址，避免客户端伪造 IP。
 */
export function getClientIp(request: NextRequest): string {
  const config = loadConfig();
  if (!config.trustedProxy) {
    return "unknown";
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const hops = Math.max(1, config.trustedProxyHops);
    const candidate = parts[parts.length - hops];
    if (candidate) {
      return candidate;
    }
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}
