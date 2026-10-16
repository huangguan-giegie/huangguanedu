import { z } from "zod";
import { advancedDiagramOptions, compileAdvancedDiagramProblem } from "./practice-advanced-diagram";

/**
 * A diagram is generated from the same numerical data that produces the
 * question/answer. Never trust an LLM-generated bitmap or drawing instructions
 * as the source of truth for a mathematics question.
 */
export const PracticeDiagramSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rectangle"),
    width: z.number().int().min(2).max(24),
    height: z.number().int().min(2).max(24),
    task: z.enum(["AREA", "PERIMETER"]),
  }),
  z.object({
    type: z.literal("right_triangle"),
    triple: z.enum(["3-4-5", "5-12-13", "8-15-17", "7-24-25"]),
  }),
  z.object({
    type: z.literal("linear_function"),
    slope: z.number().int().min(-3).max(3).refine((v) => v !== 0),
    intercept: z.number().int().min(-4).max(4),
  }),
  ...advancedDiagramOptions,
]);

export type PracticeDiagram = z.infer<typeof PracticeDiagramSchema>;

export interface DiagramQuestion {
  question: string;
  answer: string;
  explanation: string;
  diagram: PracticeDiagram;
}

/** Generate the authoritative problem statement AND answer from one spec. */
export function compileDiagramProblem(diagram: PracticeDiagram): DiagramQuestion {
  if (diagram.type === "rectangle") {
    const { width, height, task } = diagram;
    if (task === "AREA") {
      return {
        question: `如图，长方形 ABCD 的长为 ${width} cm，宽为 ${height} cm，求这个长方形的面积。`,
        answer: `${width * height} cm²`,
        explanation: `长方形面积＝长×宽＝${width}×${height}＝${width * height}（cm²）。`,
        diagram,
      };
    }
    return {
      question: `如图，长方形 ABCD 的长为 ${width} cm，宽为 ${height} cm，求这个长方形的周长。`,
      answer: `${2 * (width + height)} cm`,
      explanation: `长方形周长＝2×（长＋宽）＝2×（${width}＋${height}）＝${2 * (width + height)}（cm）。`,
      diagram,
    };
  }
  if (diagram.type === "right_triangle") {
    const [a, b, c] = diagram.triple.split("-").map(Number);
    return {
      question: `如图，在直角三角形 ABC 中，∠A＝90°，AB＝${a} cm，AC＝${b} cm，求斜边 BC 的长度。`,
      answer: `${c} cm`,
      explanation: `由勾股定理 BC²＝AB²＋AC²＝${a}²＋${b}²＝${c * c}，所以 BC＝${c} cm。`,
      diagram,
    };
  }
  if (diagram.type !== "linear_function") {
    return compileAdvancedDiagramProblem(diagram);
  }
  const { slope, intercept } = diagram;
  const y2 = slope + intercept;
  const formula = `y = ${slope === 1 ? "" : slope === -1 ? "-" : slope}x${intercept > 0 ? ` + ${intercept}` : intercept < 0 ? ` - ${-intercept}` : ""}`;
  return {
    question: `如图，在直角坐标系中，直线经过 A(0, ${intercept}) 与 B(1, ${y2})，求这条直线的函数解析式。`,
    answer: formula,
    explanation: `设 y＝kx＋b。由 A(0, ${intercept}) 知 b＝${intercept}；由 B(1, ${y2}) 知 k＝${y2}－(${intercept})＝${slope}。所以 ${formula}。`,
    diagram,
  };
}

/** Fail closed: a textual 'see figure' problem must carry a verified diagram. */
export function refersToMissingFigure(question: string): boolean {
  return /如图|见图|下图|图中|图示|如右图|see (the )?(figure|diagram)|shown (below|above)/i.test(question);
}
