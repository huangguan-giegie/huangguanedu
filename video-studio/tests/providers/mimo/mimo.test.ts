import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MimoPlanningClient,
  buildImageDataUrl,
  MimoAdapterError,
  MimoTtsClient,
} from "../../../src/providers/mimo/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Mimo 规划适配器", () => {
  it("没有 MIMO_API_KEY 时给出中文错误", async () => {
    vi.stubEnv("MIMO_API_KEY", "");
    const client = new MimoPlanningClient({ fetch: vi.fn() as typeof fetch });

    await expect(client.plan({ title: "分数" })).rejects.toThrow("缺少 MIMO_API_KEY");
  });

  it("将支持的图片读取为 data URL，并拒绝过长原始 Base64", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mimo-image-"));
    tempDirs.push(directory);
    const imagePath = join(directory, "lesson.JPEG");
    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff]));

    await expect(buildImageDataUrl(imagePath)).resolves.toBe("data:image/jpeg;base64,/9j/");
    await expect(buildImageDataUrl(imagePath, 2)).rejects.toThrow("图片 Base64 长度超过限制");
  });

  it("使用 JSON response_format 解析结构化规划，并在结构失败时有限重试", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    let attempts = 0;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      attempts += 1;
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("mimo-v2.5");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[0].content).toContain("scenes");
      expect(body.messages[0].content).toContain("8-10");
      expect(body.messages[0].content).toContain("180 秒");
      expect(body.messages[0].content).toContain("不要生成英文可见文案");
      expect(body.messages[0].content).toContain("逐步化简");
      expect(body.messages[0].content).toContain("equationSteps");
      expect(body.messages[0].content).toContain("900 字");
      expect(body.messages[1].content.at(-1).text).toContain("targetDurationSeconds");
      expect(body.messages[1].content.at(-1).text).toContain("hook");
      expect(body.messages[1].content.at(-1).text).toContain("cta");
      if (attempts > 1) expect(body.messages[0].content).toContain("重试");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: attempts === 1 ? "{}" : JSON.stringify({ scenes: [{ id: "s1", type: "summary", start: 0, duration: 1, narration: "测试", equationSteps: ["a = b", "b = c"] }] }) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await new MimoPlanningClient({ fetch: fetcher, maxRetries: 1 }).plan({
      title: "分数",
      targetDurationSeconds: 180,
      hook: "先猜一猜答案。",
      cta: "欢迎参加课程。",
    });

    expect(result.scenes).toHaveLength(1);
    expect(result.scenes?.[0]).toMatchObject({ equationSteps: ["a = b", "b = c"] });
    expect(attempts).toBe(2);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ "api-key": "secret" });
  });

  it("网络错误或 5xx 会有限重试", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    let attempts = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("网络暂时不可用");
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scenes: [{ id: "s1", type: "summary", start: 0, duration: 1, narration: "测试" }] }) } }] }), { status: 200 });
    });

    await expect(new MimoPlanningClient({ fetch: fetcher, maxRetries: 1 }).plan({ title: "分数" })).resolves.toMatchObject({ scenes: [{ id: "s1" }] });
    expect(attempts).toBe(2);
  });

  it("长视频旁白总字数偏离目标时会重新规划", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    let attempts = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      attempts += 1;
      const narration = attempts === 1 ? "长".repeat(250) : "短".repeat(180);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scenes: Array.from({ length: 5 }, (_, index) => ({
        id: `scene-${index + 1}`,
        type: "summary",
        start: index * 36,
        duration: 36,
        narration,
      })) }) } }] }), { status: 200 });
    });

    const result = await new MimoPlanningClient({ fetch: fetcher, maxRetries: 1 }).plan({ title: "二次函数", targetDurationSeconds: 180 });
    expect(result.scenes?.[0]).toMatchObject({ narration: "短".repeat(180) });
    expect(attempts).toBe(2);
  });

  it("请求超时会中止本次调用并返回中文适配器错误", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("请求超时", "AbortError")), { once: true });
    }));

    await expect(new MimoPlanningClient({ fetch: fetcher, timeoutMs: 5, maxRetries: 0 }).plan({ title: "分数" }))
      .rejects.toThrow("Mimo 规划结构校验失败");
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("拒绝缺少必填字段的分镜 JSON", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scenes: [{ id: "s1" }] }) } }] }),
      { status: 200 },
    ));

    await expect(new MimoPlanningClient({ fetch: fetcher, maxRetries: 0 }).plan({ title: "分数" })).rejects.toThrow("结构校验失败");
  });

  it("允许零时长分镜交给本地规范化层兜底", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scenes: [{ id: "s1", type: "summary", start: 0, duration: 0, narration: "测试" }] }) } }] }),
      { status: 200 },
    ));

    await expect(new MimoPlanningClient({ fetch: fetcher, maxRetries: 0 }).plan({ title: "分数" }))
      .resolves.toMatchObject({ scenes: [{ duration: 0 }] });
  });

  it("接受挑战题和参数变化场景类型", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scenes: [
        { id: "hook", type: "challenge", start: 0, duration: 10, narration: "先猜一猜", challenge: { badge: "先猜 3 秒", prompt: "最低点在哪里？", options: ["0", "-1", "3"] } },
        { id: "sweep", type: "parameter-sweep", start: 10, duration: 20, narration: "观察参数变化" },
      ] }) } }] }),
      { status: 200 },
    ));

    await expect(new MimoPlanningClient({ fetch: fetcher, maxRetries: 0 }).plan({ title: "二次函数" })).resolves.toMatchObject({
      scenes: [{ type: "challenge" }, { type: "parameter-sweep" }],
    });
  });
});

describe("Mimo voiceclone TTS", () => {
  it("缺 key 时给出中文错误", async () => {
    vi.stubEnv("MIMO_API_KEY", "");
    const client = new MimoTtsClient({ fetch: vi.fn() as typeof fetch, cacheDir: await mkdtemp(join(tmpdir(), "mimo-tts-")) });

    await expect(client.synthesizeVoiceClone({ text: "你好", samplePath: "sample.wav" })).rejects.toThrow(
      "缺少 MIMO_API_KEY",
    );
  });

  it("发送样本 data URL，非流式读取音频字节并缓存复用", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const directory = await mkdtemp(join(tmpdir(), "mimo-tts-"));
    tempDirs.push(directory);
    const samplePath = join(directory, "sample.mp3");
    await writeFile(samplePath, Buffer.from("sample"));
    const audio = Buffer.from("wav-bytes");
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("mimo-v2.5-tts-voiceclone");
      expect(body.messages[1].content).toBe("你好");
      expect(body.audio.voice).toMatch(/^data:audio\/mpeg;base64,/);
      expect(body.audio.format).toBe("wav");
      return new Response(JSON.stringify({ choices: [{ message: { audio: { data: audio.toString("base64") } } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new MimoTtsClient({ fetch: fetcher, cacheDir: directory });

    const first = await client.synthesizeVoiceClone({ text: "你好", samplePath, style: "温柔" });
    const second = await client.synthesizeVoiceClone({ text: "你好", samplePath, style: "温柔" });

    expect(await readFile(first.path)).toEqual(audio);
    expect(second.path).toBe(first.path);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("TTS 请求超时后返回中文错误，不让单个音频拖住批处理", async () => {
    vi.stubEnv("MIMO_API_KEY", "secret");
    const directory = await mkdtemp(join(tmpdir(), "mimo-tts-timeout-"));
    tempDirs.push(directory);
    const samplePath = join(directory, "sample.wav");
    await writeFile(samplePath, Buffer.from("sample"));
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const client = new MimoTtsClient({ fetch: fetcher, cacheDir: directory, timeoutMs: 10, maxRetries: 0 });

    await expect(client.synthesizeVoiceClone({ text: "测试", samplePath })).rejects.toThrow("Mimo TTS 请求超时");
  });
});

it("导出中文适配器错误类型", () => {
  expect(new MimoAdapterError("错误")).toBeInstanceOf(Error);
});
