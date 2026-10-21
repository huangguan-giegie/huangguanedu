import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EXAM_PAPERS } from "../src/lib/exam-bank";
import { EXAM_QUESTIONS } from "../src/lib/exam-bank-catalog";

const target = resolve(process.argv[2] ?? ".pkg/exam-bank-export.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify({ papers: EXAM_PAPERS, questions: EXAM_QUESTIONS }, null, 2) + "\n", "utf-8");
process.stdout.write(`已导出${EXAM_PAPERS.length}份试卷、${EXAM_QUESTIONS.length}道题：${target}\n`);
