import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAudioDataUrl } from "./media.js";
import { MimoAdapterError } from "./errors.js";
import type { MimoFetchOptions } from "./types.js";
import { configureProviderNetwork } from "../network.js";

configureProviderNetwork();

const DEFAULT_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";

function getApiKey(apiKey?: string): string {
  const key = apiKey ?? process.env.MIMO_API_KEY;
  if (!key) throw new MimoAdapterError("缺少 MIMO_API_KEY");
  return key;
}

export interface VoiceCloneRequest {
  text: string;
  samplePath: string;
  style?: string;
  model?: string;
}

export interface TtsResult {
  path: string;
  cacheHit: boolean;
}

export class MimoTtsClient {
  private readonly apiKey?: string;
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly cacheDir: string;
  private readonly maxAudioBase64Chars: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: MimoFetchOptions & { cacheDir: string; maxAudioBase64Chars?: number; maxRetries?: number }) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.cacheDir = options.cacheDir;
    this.maxAudioBase64Chars = options.maxAudioBase64Chars ?? 10_000_000;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs as number : 120_000;
    this.maxRetries = Math.max(0, Math.min(3, options.maxRetries ?? 2));
  }

  async synthesizeVoiceClone(request: VoiceCloneRequest): Promise<TtsResult> {
    const key = getApiKey(this.apiKey);
    const sample = await buildAudioDataUrl(request.samplePath, this.maxAudioBase64Chars);
    const model = request.model ?? "mimo-v2.5-tts-voiceclone";
    const cacheKey = createHash("sha256")
      .update(JSON.stringify({ text: request.text, sample: createHash("sha256").update(sample.bytes).digest("hex"), model, style: request.style ?? "" }))
      .digest("hex");
    const path = join(this.cacheDir, `${cacheKey}.wav`);
    try {
      await readFile(path);
      return { path, cacheHit: true };
    } catch {
      // 缓存不存在时继续请求。
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", "api-key": key },
          body: JSON.stringify({
            model,
            messages: [
              { role: "user", content: request.style ?? "" },
              { role: "assistant", content: request.text },
            ],
            audio: { format: "wav", voice: sample.dataUrl },
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new MimoAdapterError(`Mimo TTS 请求失败：HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") ?? "";
        let bytes: Buffer;
        if (contentType.includes("json")) {
          const payload = (await response.json()) as {
            choices?: Array<{ message?: { audio?: { data?: string } } }>;
            audio?: string;
            data?: string;
          };
          const encoded = payload.choices?.[0]?.message?.audio?.data ?? payload.audio ?? payload.data ?? "";
          bytes = Buffer.from(encoded, "base64");
        } else {
          bytes = Buffer.from(await response.arrayBuffer());
        }
        if (!bytes.length) throw new MimoAdapterError("Mimo TTS 返回了空音频");
        await mkdir(this.cacheDir, { recursive: true });
        await writeFile(path, bytes);
        return { path, cacheHit: false };
      } catch (error) {
        lastError = controller.signal.aborted ? new MimoAdapterError("Mimo TTS 请求超时") : error;
        if (attempt >= this.maxRetries) throw lastError;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new MimoAdapterError("Mimo TTS 请求失败");
  }
}
