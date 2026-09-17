import { z } from "zod";

const theoremSchema = z.object({
  statement: z.string().min(1),
  conditions: z.array(z.string().min(1)).min(1),
  conclusion: z.string().min(1),
});

const solutionSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().min(1),
  idea: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  conclusion: z.string().min(1),
});

const exampleSchema = z.object({
  id: z.string().min(1).default("example-1"),
  statement: z.string().min(1),
  sourcePage: z.number().int().positive().optional(),
  keyClues: z.array(z.string().min(1)).min(1).optional(),
  keyInformation: z.array(z.string().min(1)).min(1).optional(),
  solutions: z.array(solutionSchema).min(1).optional(),
  candidateSolutions: z.array(solutionSchema).min(1).optional(),
}).refine((value) => Boolean(value.keyClues?.length || value.keyInformation?.length) && Boolean(value.solutions?.length || value.candidateSolutions?.length), {
  message: "例题至少需要一条题干关键信息和一种可行解法",
  path: ["keyClues"],
}).transform((value) => ({
  ...value,
  keyClues: value.keyClues ?? value.keyInformation ?? [],
  solutions: value.solutions ?? value.candidateSolutions ?? [],
}));

export const lessonMapSchema = z.object({
  id: z.string().min(1).default("lesson-map"),
  title: z.string().min(1),
  coreKnowledge: z.array(z.string().min(1)).min(1),
  theorems: z.array(theoremSchema).default([]),
  examples: z.array(exampleSchema).default([]),
});

export const videoBriefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  coreKnowledge: z.array(z.string().min(1)).min(1),
  theorem: theoremSchema.optional(),
  example: exampleSchema.optional(),
  targetDurationSeconds: z.number().int().min(90).max(195),
  reviewFlags: z.array(z.string()).default([]),
});

export type LessonMap = z.infer<typeof lessonMapSchema>;
export type VideoBrief = z.infer<typeof videoBriefSchema>;
export type SolutionPlan = z.infer<typeof solutionSchema>;

const pinyin: Record<string, string> = {
  全: "quan", 等: "deng", 三: "san", 角: "jiao", 形: "xing", 辅: "fu", 助: "zhu", 线: "xian",
  相: "xiang", 似: "si", 构: "gou", 造: "zao",
};

function slugPart(value: string): string {
  const chunks: string[] = [];
  let latin = "";
  const flushLatin = () => {
    if (latin) chunks.push(latin.toLowerCase());
    latin = "";
  };
  for (const char of value.trim()) {
    if (/[a-zA-Z0-9]/.test(char)) {
      latin += char;
      continue;
    }
    flushLatin();
    if (pinyin[char]) chunks.push(pinyin[char]);
  }
  flushLatin();
  return chunks.join("-");
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

function briefId(mapId: string, knowledge: string, index: number): string {
  const mapPart = slugPart(mapId) || "lesson";
  const knowledgePart = slugPart(knowledge) || `topic-${index + 1}`;
  const raw = `${mapPart}-${knowledgePart}`.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (raw.length <= 72) return raw;
  return `${raw.slice(0, 64).replace(/-+$/u, "")}-${shortHash(raw)}`;
}

export function mapLessonMapToVideoBriefs(input: LessonMap): VideoBrief[] {
  const map = lessonMapSchema.parse(input);
  const baseIds = map.coreKnowledge.map((knowledge, index) => briefId(map.id, knowledge, index));
  const baseCounts = new Map<string, number>();
  for (const id of baseIds) baseCounts.set(id, (baseCounts.get(id) ?? 0) + 1);
  const seenIds = new Map<string, number>();
  return map.coreKnowledge.map((knowledge, index) => {
    const example = map.examples[index] ?? map.examples[0];
    const theorem = map.theorems[index] ?? map.theorems[0];
    const reviewFlags = example && example.solutions.length < 2 ? ["ALT_SOLUTION_UNAVAILABLE"] : [];
    const baseId = baseIds[index]!;
    const occurrence = (seenIds.get(baseId) ?? 0) + 1;
    seenIds.set(baseId, occurrence);
    const id = (baseCounts.get(baseId) ?? 0) > 1 ? `${baseId}-${occurrence}` : baseId;
    const hasRealExample = Boolean(example && !/^代表例题$/u.test(example.statement.trim()));
    const targetDurationSeconds = hasRealExample
      ? (example!.solutions.length >= 2 ? 135 : 115)
      : theorem
        ? 120
        : knowledge.length > 18 ? 120 : 105;
    return videoBriefSchema.parse({
      id,
      title: `${map.title}：${knowledge}`,
      coreKnowledge: [knowledge],
      theorem,
      example,
      targetDurationSeconds,
      reviewFlags,
    });
  });
}

export function batchVideoBriefs(maps: LessonMap[]): VideoBrief[] {
  return maps.flatMap(mapLessonMapToVideoBriefs);
}
