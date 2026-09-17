import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { MimoAdapterError } from "./errors.js";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

export async function buildImageDataUrl(path: string, maxBase64Chars = 8_000_000): Promise<string> {
  const mime = MIME_TYPES[extname(path).toLowerCase()];
  if (!mime) {
    throw new MimoAdapterError("不支持的图片格式，仅支持 jpg/jpeg/png/gif/webp/bmp");
  }
  const base64 = (await readFile(path)).toString("base64");
  if (base64.length > maxBase64Chars) {
    throw new MimoAdapterError("图片 Base64 长度超过限制");
  }
  return `data:${mime};base64,${base64}`;
}

export async function buildAudioDataUrl(path: string, maxBase64Chars = 8_000_000): Promise<{ dataUrl: string; bytes: Buffer }> {
  const extension = extname(path).toLowerCase();
  const mime = extension === ".mp3" ? "audio/mpeg" : extension === ".wav" ? "audio/wav" : undefined;
  if (!mime) {
    throw new MimoAdapterError("不支持的音频样本格式，仅支持 mp3/wav");
  }
  const bytes = await readFile(path);
  const base64 = bytes.toString("base64");
  if (base64.length > maxBase64Chars) {
    throw new MimoAdapterError("音频样本 Base64 长度超过限制");
  }
  return { dataUrl: `data:${mime};base64,${base64}`, bytes };
}
