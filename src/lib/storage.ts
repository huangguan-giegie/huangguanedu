// 文件存储抽象：开发环境本地文件；生产环境阿里云 OSS 私有 Bucket。
// 应用只保存对象 Key，不保存公网地址；读取时由服务端生成短期签名 URL。
// AccessKey 只存在于服务端环境变量，不进入浏览器、数据库或日志。
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import OSS from "ali-oss";

import { loadConfig } from "./config";

export interface StorageProvider {
  /** 保存文件并返回相对存储根目录的 Key。 */
  save(
    buffer: Buffer,
    options: { extension: string; subdir?: string },
  ): Promise<string>;
  /** 删除文件（相对 Key）。 */
  delete(relativePath: string): Promise<void>;
  /** 生成短期读取 URL；本地存储返回 null（由 /api/v1/images/:id 直接读取）。 */
  getReadUrl(relativePath: string, expiresSeconds: number): Promise<string | null>;
}

const storageRoot = process.env.STORAGE_DIR ?? join(process.cwd(), "storage");

/** 本地文件存储（开发环境）。 */
export const localStorage: StorageProvider = {
  async save(buffer, { extension, subdir = "" }) {
    const dir = join(storageRoot, subdir);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(dir, filename), buffer);
    return subdir ? `${subdir}/${filename}` : filename;
  },
  async delete(relativePath) {
    const target = join(storageRoot, relativePath);
    // 只允许删除存储根目录内的文件
    if (!target.startsWith(storageRoot)) {
      throw new Error("非法存储路径");
    }
    await rm(target, { force: true });
  },
  async getReadUrl() {
    return null;
  },
};

/** 阿里云 OSS 私有 Bucket 存储（生产环境）。 */
export function createOssStorage(
  config: NonNullable<
    ReturnType<typeof loadConfig>["storage"]["oss"]
  >,
): StorageProvider {
  const client = new OSS({
    ...(config.region ? { region: config.region } : {}),
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
  });

  return {
    async save(buffer, { extension, subdir = "" }) {
      const filename = `${randomUUID()}.${extension}`;
      const key = subdir ? `${subdir}/${filename}` : filename;
      await client.put(key, buffer);
      return key;
    },
    async delete(relativePath) {
      await client.delete(relativePath);
    },
    async getReadUrl(relativePath, expiresSeconds) {
      return client.signatureUrl(relativePath, { expires: expiresSeconds });
    },
  };
}

let cachedStorage: StorageProvider | null = null;

/** 根据配置返回当前存储实现（进程内缓存，配置不随请求变化）。 */
export function getStorage(): StorageProvider {
  if (cachedStorage) {
    return cachedStorage;
  }
  const config = loadConfig();
  cachedStorage =
    config.storage.provider === "oss" && config.storage.oss
      ? createOssStorage(config.storage.oss)
      : localStorage;
  return cachedStorage;
}

/** 生成短期读取 URL；本地存储返回 null。 */
export async function getStorageReadUrl(
  relativePath: string,
  expiresSeconds = 300,
): Promise<string | null> {
  return getStorage().getReadUrl(relativePath, expiresSeconds);
}
