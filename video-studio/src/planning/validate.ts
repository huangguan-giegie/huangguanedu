import { teachingPlanSchema } from "./schema.js";
import type { MathFinding, SolutionPlan, TeachingPlan, TeachingValidationResult } from "./types.js";

const hasChinese = (value: string): boolean => /[\u3400-\u9fff]/u.test(value);
const nonEmpty = (values: string[] | undefined): boolean => Boolean(values?.some((value) => value.trim()));

function finding(code: string, message: string, path?: string, details?: Record<string, unknown>): MathFinding {
  return { code, message, blocking: false, severity: "warning", ...(path ? { path } : {}), ...(details ? { details } : {}) };
}

function addChineseFinding(findings: MathFinding[], value: unknown, path: string): void {
  if (typeof value === "string" && value.trim() && !hasChinese(value)) {
    findings.push(finding("CHINESE_TEXT_MISSING", "教学文本应包含中文，避免生成英文旁白或字幕。", path));
  }
}

function solutionFingerprint(solution: SolutionPlan): string {
  return [solution.trigger, solution.idea, ...solution.steps, solution.conclusion]
    .join("|")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase();
}

export function validateTeachingPlan(input: unknown): TeachingValidationResult {
  const findings: MathFinding[] = [];
  const parsed = teachingPlanSchema.safeParse(input);
  if (!parsed.success) {
    findings.push(finding("TEACHING_PLAN_SCHEMA_INVALID", "教学计划结构不符合规划 schema，详情见 details。", undefined, {
      issues: parsed.error.issues,
    }));
    return { valid: false, findings };
  }

  const plan = parsed.data as TeachingPlan;
  addChineseFinding(findings, plan.hook, "hook");
  addChineseFinding(findings, plan.summary, "summary");
  plan.intuition.forEach((item, index) => addChineseFinding(findings, item, `intuition[${index}]`));
  plan.mistakes.forEach((item, index) => addChineseFinding(findings, item, `mistakes[${index}]`));
  plan.solutions.forEach((solution, index) => {
    addChineseFinding(findings, solution.name, `solutions[${index}].name`);
    addChineseFinding(findings, solution.trigger, `solutions[${index}].trigger`);
    addChineseFinding(findings, solution.idea, `solutions[${index}].idea`);
    addChineseFinding(findings, solution.conclusion, `solutions[${index}].conclusion`);
    solution.steps.forEach((step, stepIndex) => addChineseFinding(findings, step, `solutions[${index}].steps[${stepIndex}]`));
    if (!nonEmpty(solution.steps)) findings.push(finding("SOLUTION_STEPS_MISSING", "每种解法都必须给出可讲解的逐步推导。", `solutions[${index}].steps`));
    if (!solution.trigger.trim()) findings.push(finding("SOLUTION_TRIGGER_MISSING", "必须说明题干中的哪条信息触发了该解法。", `solutions[${index}].trigger`));
    if (!solution.idea.trim()) findings.push(finding("SOLUTION_IDEA_MISSING", "必须说明该解法的核心思路。", `solutions[${index}].idea`));
  });

  if (plan.solutions.length < 2) {
    findings.push(finding("ALT_SOLUTION_UNAVAILABLE", "没有可靠的替代解法，视频可以继续生成但需要人工复核。", "solutions"));
  } else {
    const fingerprints = new Map<string, number>();
    plan.solutions.forEach((solution, index) => {
      const fingerprint = solutionFingerprint(solution);
      const previous = fingerprints.get(fingerprint);
      if (previous !== undefined) {
        findings.push(finding("DUPLICATE_SOLUTION", "主解法和替代解法的推理链重复，不能只更换标题。", `solutions[${index}]`, { duplicateOf: previous }));
      } else fingerprints.set(fingerprint, index);
    });
  }

  if (plan.proof) {
    addChineseFinding(findings, plan.proof.premise, "proof.premise");
    addChineseFinding(findings, plan.proof.statement, "proof.statement");
    addChineseFinding(findings, plan.proof.conclusion, "proof.conclusion");
    if (!nonEmpty(plan.proof.conditions)) findings.push(finding("PROOF_CONDITIONS_MISSING", "定理证明必须先列出成立条件。", "proof.conditions"));
    if (!nonEmpty(plan.proof.construction)) findings.push(finding("PROOF_CONSTRUCTION_MISSING", "定理证明必须说明构造或观察对象。", "proof.construction"));
    if (!nonEmpty(plan.proof.reasoningSteps)) findings.push(finding("PROOF_REASONING_MISSING", "定理证明必须给出完整推理步骤，不能只写结论。", "proof.reasoningSteps"));
  }

  return { valid: findings.length === 0, plan, findings };
}
