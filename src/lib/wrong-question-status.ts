/**
 * 错题状态的**单一事实来源**。
 *
 * 为什么必须集中：原先 `wrong-questions/page.tsx` 与 `wrong-questions/[id]/page.tsx`
 * 各有一份本地常量，而两份对 `PROCESSING` 的文案还不一致 —— 列表页写"识别中"，
 * 详情页写"AI 分析中"。用户在列表看到"识别中"，点进去变成"AI 分析中"，会怀疑
 * 这是两个不同的状态。
 *
 * 语义色映射的三条判断：
 *
 * 1. `PROCESSING`（识别中）用 info 而不是 warning。琥珀是心理警示色；识别期间
 *    用户什么都做不了只能等，把它渲染成警示色会让家长以为出错了，产生不必要
 *    的焦虑。信息蓝传达"系统正在处理，请稍候"。
 *
 * 2. `PENDING_STUDENT_CONFIRMATION` / `NEEDS_REVIEW` 用 warning，因为它们确实
 *    需要用户或老师采取行动 —— "有事要你做"就是警示的准确含义。
 *
 * 3. `PUBLISHED`（AI 初步生成）用 primary 而不是 success。这是最容易做错的
 *    一处：PUBLISHED 意味着 AI 刚给出结果、还没老师看过。标成绿色会让用户认为
 *    "这是最终答案、可以放心了" —— 对教育产品是有害的误导。等 `REVIEWED`
 *    才转绿。这个区分是产品可信度的关键。
 */

export type WrongQuestionStatus =
  | "PROCESSING"
  | "PENDING_STUDENT_CONFIRMATION"
  | "PUBLISHED"
  | "NEEDS_REVIEW"
  | "REVIEWED";

export type StatusTone = "info" | "warning" | "primary" | "success";
export type StatusMark = "spinner" | "dot-solid" | "dot-hollow" | "dot-half" | "check";

export interface StatusMeta {
  /** 唯一文案来源 —— 列表页与详情页都从这里取，禁止再写本地常量 */
  label: string;
  /** 语义色调，决定 .status-tag--* 修饰类 */
  tone: StatusTone;
  /**
   * 图形。状态**同时用三通道**表达：颜色 + 图形 + 文字。
   * 不能只靠颜色 —— `--primary-ink` 与 `--muted` 在深色下相互对比仅 1.04:1，
   * 色弱用户完全看不出差别。
   */
  mark: StatusMark;
  /** 供读屏的状态补充说明 */
  srText: string;
  /** 是否需要用户或老师行动 —— 用于筛选与排序 */
  actionable: boolean;
}

export const WRONG_QUESTION_STATUS: Record<WrongQuestionStatus, StatusMeta> = {
  PROCESSING: {
    label: "识别中",
    tone: "info",
    mark: "spinner",
    srText: "正在识别",
    actionable: false,
  },
  PENDING_STUDENT_CONFIRMATION: {
    label: "待确认识别",
    tone: "warning",
    mark: "dot-solid",
    srText: "等待学生确认",
    actionable: true,
  },
  PUBLISHED: {
    label: "AI 初步生成",
    tone: "primary",
    mark: "dot-hollow",
    srText: "AI 已生成，未经老师审核",
    actionable: false,
  },
  NEEDS_REVIEW: {
    label: "待老师复核",
    tone: "warning",
    mark: "dot-half",
    srText: "等待老师复核",
    actionable: true,
  },
  REVIEWED: {
    label: "老师已审核",
    tone: "success",
    mark: "check",
    srText: "老师已审核通过",
    actionable: false,
  },
};

/** 需要行动的状态排在前面 —— 列表排序与筛选统一用这个顺序 */
export const STATUS_ORDER: WrongQuestionStatus[] = [
  "NEEDS_REVIEW",
  "PENDING_STUDENT_CONFIRMATION",
  "PROCESSING",
  "PUBLISHED",
  "REVIEWED",
];

/**
 * 取状态元数据。未知枚举（后端加了新状态而前端未跟进）回退到 primary 调，
 * 而不是返回 undefined 让 UI 崩掉或直接吐英文枚举 —— 中文界面绝不能泄露
 * `OPEN` / `BOOKED` 这样的英文枚举值。
 */
export function statusMeta(status: string): StatusMeta {
  return (
    WRONG_QUESTION_STATUS[status as WrongQuestionStatus] ?? {
      label: status,
      tone: "primary",
      mark: "dot-hollow",
      srText: "状态未知",
      actionable: false,
    }
  );
}
