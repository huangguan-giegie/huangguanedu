import { describe, expect, it } from "vitest";

import {
  monthPeriod,
  monthPeriodFromString,
  semesterPeriod,
  SummaryError,
  weekPeriod,
} from "./summary";

function local(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("学习总结周期边界", () => {
  it("周报：周一 00:00 至下周一 00:00（含周一至周日）", () => {
    // 2026-06-03 是周三，所属周为 2026-06-01（周一）至 2026-06-07（周日）
    const period = weekPeriod(new Date(2026, 5, 3));
    expect(local(period.periodStart)).toBe("2026-06-01");
    expect(period.periodStart.getHours()).toBe(0);
    expect(period.periodStart.getMinutes()).toBe(0);
    expect(local(period.periodEnd)).toBe("2026-06-08");
    expect(period.periodEnd.getTime() - period.periodStart.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
  });

  it("月报：自然月首日 00:00 至下月首日 00:00", () => {
    const period = monthPeriod(new Date(2026, 1, 15)); // 2026-02
    expect(local(period.periodStart)).toBe("2026-02-01");
    expect(local(period.periodEnd)).toBe("2026-03-01");
    expect(period.label).toBe("2026-02");
  });

  it("学期：配置开始日期至结束日期次日 00:00（含结束日）", () => {
    const period = semesterPeriod({
      startDate: new Date(2026, 1, 1),
      endDate: new Date(2026, 5, 30),
    });
    expect(local(period.periodStart)).toBe("2026-02-01");
    expect(local(period.periodEnd)).toBe("2026-07-01");
  });

  it("monthPeriodFromString 解析并拒绝非法月份", () => {
    expect(monthPeriodFromString("2026-06").label).toBe("2026-06");
    expect(() => monthPeriodFromString("2026-13")).toThrow(SummaryError);
    expect(() => monthPeriodFromString("2026-00")).toThrow(SummaryError);
  });
});
