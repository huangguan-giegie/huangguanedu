export type MathFindingSeverity = "info" | "warning" | "error";

export interface MathFinding {
  code: string;
  message: string;
  blocking: false;
  severity: MathFindingSeverity;
  path?: string;
  details?: Record<string, unknown>;
}

export interface ProofPlan {
  /** 兼容教案中“证明前提”的命名。 */
  premise?: string;
  /** 兼容定理摘要中的“定理陈述”命名。 */
  statement?: string;
  conditions: string[];
  construction: string[];
  reasoningSteps: string[];
  conclusion: string;
}

export interface SolutionPlan {
  name: string;
  trigger: string;
  idea: string;
  steps: string[];
  conclusion: string;
}

export interface TeachingPlan {
  hook: string;
  intuition: string[];
  proof?: ProofPlan;
  solutions: SolutionPlan[];
  mistakes: string[];
  summary: string;
  cta?: string;
}

export interface LessonExample {
  statement: string;
  keyInformation: string[];
  candidateSolutions: SolutionPlan[];
  sourcePage?: number;
}

export interface LessonMap {
  title: string;
  coreKnowledge: string[];
  theorems: ProofPlan[];
  examples: LessonExample[];
}

export interface VideoBrief {
  id: string;
  title: string;
  coreKnowledge: string[];
  theorem?: Pick<ProofPlan, "statement" | "conditions" | "conclusion">;
  example?: Pick<LessonExample, "statement" | "sourcePage">;
  targetDurationSeconds: number;
}

export interface TeachingPromptInput {
  title: string;
  text: string;
  images?: string[];
  targetDurationSeconds?: number;
}

export interface TeachingValidationResult {
  valid: boolean;
  plan?: TeachingPlan;
  findings: MathFinding[];
}
