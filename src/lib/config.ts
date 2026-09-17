// 服务端配置模块：从环境变量读取并校验配置

const DEFAULT_DASHSCOPE_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_DASHSCOPE_MODEL = "qwen3.7-plus";
const DEFAULT_IMAGE_TRANSPORT = "object_storage";
const DEFAULT_MAX_PIXELS = 4194304;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_OSS_URL_EXPIRES_SECONDS = 300;

// Qwen 运行模式：mock 为本地模拟，live 为真实调用
export type QwenMode = "mock" | "live";

// 配置错误：环境变量缺失或非法时抛出
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

// Qwen 相关配置
export interface QwenConfig {
  mode: QwenMode;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  imageTransport: string;
  maxPixels: number;
  requestTimeoutMs: number;
  maxRetries: number;
  enableThinking: boolean;
}

// 存储配置：本地开发 local；生产 oss（阿里云 OSS 私有 Bucket）
export interface StorageConfig {
  provider: "local" | "oss";
  oss: {
    endpoint: string;
    region: string | null;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    urlExpiresSeconds: number;
  } | null;
}

// 应用全局配置
export interface AppConfig {
  databaseUrl: string;
  sessionSecret: string | null;
  cronSecret: string | null;
  appName: string;
  trustedProxy: boolean;
  trustedProxyHops: number;
  qwen: QwenConfig;
  storage: StorageConfig;
}

// 从环境变量加载并校验配置；live 模式缺少必要变量时直接抛错，禁止静默回退 mock
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const mode = parseQwenMode(env.QWEN_MODE);
  validateLiveMode(mode, env);
  const storage = parseStorageConfig(env);
  validateProduction(env, mode, storage);

  return {
    databaseUrl: env.DATABASE_URL ?? "file:./dev.db",
    sessionSecret: env.SESSION_SECRET ?? null,
    cronSecret: env.CRON_SECRET ?? null,
    appName: env.NEXT_PUBLIC_APP_NAME ?? "黄冠AI Academy",
    trustedProxy: parseBoolean(env.TRUSTED_PROXY, false, "TRUSTED_PROXY"),
    trustedProxyHops: parsePositiveInt(
      env.TRUSTED_PROXY_HOPS,
      1,
      "TRUSTED_PROXY_HOPS",
    ),
    qwen: {
      mode,
      apiKey: normalizeOptional(env.DASHSCOPE_API_KEY) ?? null,
      baseUrl:
        normalizeOptional(env.DASHSCOPE_BASE_URL) ?? DEFAULT_DASHSCOPE_BASE_URL,
      model: normalizeOptional(env.DASHSCOPE_MODEL) ?? DEFAULT_DASHSCOPE_MODEL,
      imageTransport:
        normalizeOptional(env.QWEN_IMAGE_TRANSPORT) ?? DEFAULT_IMAGE_TRANSPORT,
      maxPixels: parsePositiveInt(
        env.QWEN_MAX_PIXELS,
        DEFAULT_MAX_PIXELS,
        "QWEN_MAX_PIXELS",
      ),
      requestTimeoutMs: parsePositiveInt(
        env.QWEN_REQUEST_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS,
        "QWEN_REQUEST_TIMEOUT_MS",
      ),
      maxRetries: parsePositiveInt(
        env.QWEN_MAX_RETRIES,
        DEFAULT_MAX_RETRIES,
        "QWEN_MAX_RETRIES",
      ),
      enableThinking: parseBoolean(
        env.QWEN_ENABLE_THINKING,
        false,
        "QWEN_ENABLE_THINKING",
      ),
    },
    storage,
  };
}

// 解析 QWEN_MODE，未设置时默认 mock
function parseQwenMode(value: string | undefined): QwenMode {
  const mode = normalizeOptional(value);
  if (mode === undefined) {
    return "mock";
  }
  if (mode === "mock" || mode === "live") {
    return mode;
  }
  throw new ConfigError(`QWEN_MODE 必须是 "mock" 或 "live"，当前值：${value}`);
}

// live 模式下必须提供 API Key 与 Base URL，否则抛出配置错误
function validateLiveMode(
  mode: QwenMode,
  env: Record<string, string | undefined>,
): void {
  if (mode !== "live") {
    return;
  }
  const missing: string[] = [];
  if (!normalizeOptional(env.DASHSCOPE_API_KEY)) {
    missing.push("DASHSCOPE_API_KEY");
  }
  if (!normalizeOptional(env.DASHSCOPE_BASE_URL)) {
    missing.push("DASHSCOPE_BASE_URL");
  }
  if (missing.length > 0) {
    throw new ConfigError(
      `QWEN_MODE=live 时必须配置以下环境变量：${missing.join("、")}`,
    );
  }
}

// 解析存储提供方：local（本地文件）或 oss（阿里云 OSS 私有 Bucket）
function parseStorageConfig(
  env: Record<string, string | undefined>,
): StorageConfig {
  const provider = normalizeOptional(env.STORAGE_PROVIDER) ?? "local";
  if (provider !== "local" && provider !== "oss") {
    throw new ConfigError(
      `STORAGE_PROVIDER 必须是 "local" 或 "oss"，当前值：${provider}`,
    );
  }
  if (provider === "local") {
    return { provider, oss: null };
  }

  const missing: string[] = [];
  const endpoint = normalizeOptional(env.OSS_ENDPOINT);
  const bucket = normalizeOptional(env.OSS_BUCKET);
  const accessKeyId = normalizeOptional(env.OSS_ACCESS_KEY_ID);
  const accessKeySecret = normalizeOptional(env.OSS_ACCESS_KEY_SECRET);
  if (!endpoint) {
    missing.push("OSS_ENDPOINT");
  }
  if (!bucket) {
    missing.push("OSS_BUCKET");
  }
  if (!accessKeyId) {
    missing.push("OSS_ACCESS_KEY_ID");
  }
  if (!accessKeySecret) {
    missing.push("OSS_ACCESS_KEY_SECRET");
  }
  if (missing.length > 0) {
    throw new ConfigError(
      `STORAGE_PROVIDER=oss 时必须配置：${missing.join("、")}`,
    );
  }

  return {
    provider,
    oss: {
      endpoint: endpoint!,
      region: normalizeOptional(env.OSS_REGION) ?? null,
      bucket: bucket!,
      accessKeyId: accessKeyId!,
      accessKeySecret: accessKeySecret!,
      urlExpiresSeconds: parsePositiveInt(
        env.OSS_URL_EXPIRES_SECONDS,
        DEFAULT_OSS_URL_EXPIRES_SECONDS,
        "OSS_URL_EXPIRES_SECONDS",
      ),
    },
  };
}

// 生产环境严格校验：缺关键配置直接报错，禁止静默回退
function validateProduction(
  env: Record<string, string | undefined>,
  qwenMode: QwenMode,
  storage: StorageConfig,
): void {
  if (env.NODE_ENV !== "production") {
    return;
  }
  const missing: string[] = [];
  if (!normalizeOptional(env.DATABASE_URL)) {
    missing.push("DATABASE_URL");
  }
  if (!normalizeOptional(env.APP_BASE_URL)) {
    missing.push("APP_BASE_URL");
  }
  if (!normalizeOptional(env.SESSION_SECRET)) {
    missing.push("SESSION_SECRET");
  }
  if (!normalizeOptional(env.CRON_SECRET)) {
    missing.push("CRON_SECRET");
  }
  if (!normalizeOptional(env.STORAGE_PROVIDER)) {
    missing.push("STORAGE_PROVIDER");
  }
  if (!normalizeOptional(env.TRUSTED_PROXY)) {
    missing.push("TRUSTED_PROXY");
  }
  if (qwenMode !== "live") {
    missing.push("QWEN_MODE=live");
  }
  if (missing.length > 0) {
    throw new ConfigError(
      `生产环境缺少必要配置：${missing.join("、")}`,
    );
  }
  void storage;
}

// 去掉首尾空白；空字符串视为未设置
function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// 解析正整数环境变量，非法值时抛出配置错误
function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} 必须是正整数，当前值：${value}`);
  }
  return parsed;
}

// 解析布尔环境变量，非法值时抛出配置错误
function parseBoolean(
  value: string | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new ConfigError(`${name} 必须是 true 或 false，当前值：${value}`);
}
