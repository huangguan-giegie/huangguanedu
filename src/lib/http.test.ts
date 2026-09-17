import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { getClientIp } from "./http";

function requestWith(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/auth/login", {
    headers,
  });
}

describe("可信代理 IP 解析", () => {
  it("未开启 TRUSTED_PROXY 时返回 unknown，不信任客户端伪造头", () => {
    const old = process.env.TRUSTED_PROXY;
    process.env.TRUSTED_PROXY = "false";
    try {
      const ip = getClientIp(
        requestWith({ "x-forwarded-for": "203.0.113.7" }),
      );
      expect(ip).toBe("unknown");
    } finally {
      process.env.TRUSTED_PROXY = old;
    }
  });

  it("开启 TRUSTED_PROXY=1 层时取 X-Forwarded-For 最右侧地址", () => {
    const oldProxy = process.env.TRUSTED_PROXY;
    const oldHops = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY = "true";
    process.env.TRUSTED_PROXY_HOPS = "1";
    try {
      const ip = getClientIp(
        requestWith({ "x-forwarded-for": "198.51.100.9, 203.0.113.7" }),
      );
      expect(ip).toBe("203.0.113.7");
    } finally {
      process.env.TRUSTED_PROXY = oldProxy;
      process.env.TRUSTED_PROXY_HOPS = oldHops;
    }
  });

  it("TRUSTED_PROXY_HOPS=2 时跳过最右侧两层代理", () => {
    const oldProxy = process.env.TRUSTED_PROXY;
    const oldHops = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY = "true";
    process.env.TRUSTED_PROXY_HOPS = "2";
    try {
      const ip = getClientIp(
        requestWith({
          "x-forwarded-for": "198.51.100.9, 203.0.113.7, 192.0.2.1",
        }),
      );
      expect(ip).toBe("203.0.113.7");
    } finally {
      process.env.TRUSTED_PROXY = oldProxy;
      process.env.TRUSTED_PROXY_HOPS = oldHops;
    }
  });
});
