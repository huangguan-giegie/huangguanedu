import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "./config";

// 服务端配置校验模块的单元测试
describe("loadConfig 配置校验", () => {
  it("未设置 QWEN_MODE 时默认使用 mock 模式", () => {
    const config = loadConfig({});

    expect(config.qwen.mode).toBe("mock");
  });

  it("mock 模式下不需要 API Key，可正常加载配置", () => {
    const config = loadConfig({ QWEN_MODE: "mock" });

    expect(config.qwen.mode).toBe("mock");
    expect(config.qwen.apiKey).toBeNull();
    expect(config.qwen.baseUrl).toBe(
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    );
  });

  it("live 模式缺少 DASHSCOPE_API_KEY 时抛出配置错误", () => {
    expect(() =>
      loadConfig({
        QWEN_MODE: "live",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({
        QWEN_MODE: "live",
        DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      }),
    ).toThrowError(/DASHSCOPE_API_KEY/);
  });

  it("live 模式缺少 DASHSCOPE_BASE_URL 时抛出配置错误", () => {
    expect(() =>
      loadConfig({ QWEN_MODE: "live", DASHSCOPE_API_KEY: "sk-test" }),
    ).toThrowError(/DASHSCOPE_BASE_URL/);
  });

  it("live 模式配置完整时正常加载", () => {
    const config = loadConfig({
      QWEN_MODE: "live",
      DASHSCOPE_API_KEY: "sk-test",
      DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    expect(config.qwen.mode).toBe("live");
    expect(config.qwen.apiKey).toBe("sk-test");
  });

  it("QWEN_MODE 为非法值时抛出配置错误", () => {
    expect(() => loadConfig({ QWEN_MODE: "invalid" })).toThrowError(/QWEN_MODE/);
  });

  it("数字与布尔环境变量使用计划中的默认值", () => {
    const config = loadConfig({ QWEN_MODE: "mock" });

    expect(config.qwen.maxPixels).toBe(4194304);
    expect(config.qwen.requestTimeoutMs).toBe(30000);
    expect(config.qwen.maxRetries).toBe(2);
    expect(config.qwen.enableThinking).toBe(false);
  });

  it("允许通过环境变量覆盖默认值", () => {
    const config = loadConfig({
      QWEN_MODE: "mock",
      QWEN_MAX_PIXELS: "1024",
      QWEN_REQUEST_TIMEOUT_MS: "5000",
      QWEN_MAX_RETRIES: "5",
      QWEN_ENABLE_THINKING: "true",
    });

    expect(config.qwen.maxPixels).toBe(1024);
    expect(config.qwen.requestTimeoutMs).toBe(5000);
    expect(config.qwen.maxRetries).toBe(5);
    expect(config.qwen.enableThinking).toBe(true);
  });

  it("生产环境缺少必要配置时抛出配置错误", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrowError(
      /DATABASE_URL|APP_BASE_URL|SESSION_SECRET|CRON_SECRET|STORAGE_PROVIDER|TRUSTED_PROXY|QWEN_MODE/,
    );
  });

  it("生产环境必须显式配置 TRUSTED_PROXY（true/false 均可）", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db:5432/app",
      APP_BASE_URL: "https://edu.example.com",
      SESSION_SECRET: "s",
      CRON_SECRET: "c",
      STORAGE_PROVIDER: "local",
      QWEN_MODE: "live",
      DASHSCOPE_API_KEY: "sk-test",
      DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    };
    expect(() => loadConfig(base)).toThrowError(/TRUSTED_PROXY/);
    expect(() => loadConfig({ ...base, TRUSTED_PROXY: "true" })).not.toThrow();
    expect(() => loadConfig({ ...base, TRUSTED_PROXY: "false" })).not.toThrow();
  });

  it("生产环境 oss 存储缺少 OSS 配置时抛出配置错误", () => {
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db:5432/app",
      APP_BASE_URL: "https://edu.example.com",
      SESSION_SECRET: "s",
      CRON_SECRET: "c",
      STORAGE_PROVIDER: "oss",
      TRUSTED_PROXY: "true",
      QWEN_MODE: "live",
      DASHSCOPE_API_KEY: "sk-test",
      DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    };
    expect(() => loadConfig(base)).toThrowError(/OSS_ENDPOINT|OSS_BUCKET/);
  });
});
