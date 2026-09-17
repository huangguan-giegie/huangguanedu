// 图片规范化：自动旋转、去 EXIF、限制最长边、压缩（sharp）
import sharp from "sharp";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 默认最大 8MB
export const MAX_EDGE_PX = 2048; // 最长边约 2048px

const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);

export class ImageError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isAllowedMime(mimeType: string): boolean {
  return ALLOWED_MIME.has(mimeType);
}

/**
 * 规范化图片：
 * - sharp 自动旋转（EXIF Orientation）
 * - 去除 EXIF 元数据
 * - 最长边不超过 2048px
 * - JPEG 压缩质量 80，目标约 1-2MB
 * 返回规范化后的 Buffer 与输出 MIME。
 */
export async function normalizeImage(
  input: Buffer,
): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
  const image = sharp(input, { failOn: "error" })
    .rotate() // 依据 EXIF 自动旋转
    .resize({
      width: MAX_EDGE_PX,
      height: MAX_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    });

  // 统一输出为 JPEG（去 EXIF；PNG 输入保留透明通道需求时可转 png，MVP 统一 jpeg 更省空间）
  const buffer = await image
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return { buffer, mimeType: "image/jpeg", extension: "jpg" };
}
