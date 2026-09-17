import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { discoverCourseLessons } from "../../src/course-batch.js";

describe("course batch discovery", () => {
  it("按讲次目录分组并识别知识讲解与巩固练习", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-batch-discovery-"));
    const basic = join(root, "第2讲 总复习：整式与因式分解(基础)");
    const advanced = join(root, "第10讲 二次函数(提高)");
    await mkdir(basic);
    await mkdir(advanced);
    await writeFile(join(basic, "知识讲解.doc"), "lesson");
    await writeFile(join(basic, "巩固练习.doc"), "exercise");
    await writeFile(join(advanced, "知识讲解.doc"), "lesson");
    await writeFile(join(advanced, "巩固练习.doc"), "exercise");
    await writeFile(join(root, "说明.txt"), "ignore root file");

    const lessons = await discoverCourseLessons(root);

    expect(lessons.map((lesson) => lesson.id)).toEqual([
      "lesson-02-basic",
      "lesson-10-advanced",
    ]);
    expect(lessons[0]).toMatchObject({ knowledgeFiles: [join(basic, "知识讲解.doc")], exerciseFiles: [join(basic, "巩固练习.doc")] });
  });

  it("跳过没有可读取教学文件的目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "course-batch-empty-"));
    await mkdir(join(root, "第1讲 空目录"));
    await mkdir(join(root, "第3讲 有内容"));
    await writeFile(join(root, "第3讲 有内容", "lesson.doc"), "lesson");

    const lessons = await discoverCourseLessons(root);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.id).toBe("lesson-03");
  });
});
