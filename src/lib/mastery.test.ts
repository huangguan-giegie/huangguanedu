import { describe, expect, it } from "vitest";

import { nextMasteryState } from "./mastery";

describe("mastery scheduler", () => {
  const current = {
    knowledgePoint: "一元一次方程",
    masteryScore: 50,
    stability: 2,
    difficulty: 5,
    reviewCount: 2,
    lapseCount: 1,
    lastReviewedAt: null,
    nextReviewAt: null,
  };

  it("correct answer raises mastery and schedules farther review", () => {
    const now = new Date("2026-10-05T00:00:00Z");
    const next = nextMasteryState(current, "CORRECT", now);
    expect(next.masteryScore).toBeGreaterThan(current.masteryScore);
    expect(next.reviewCount).toBe(3);
    expect(next.lapseCount).toBe(1);
    expect(next.nextReviewAt!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("incorrect answer lowers mastery and reviews next day", () => {
    const now = new Date("2026-10-05T00:00:00Z");
    const next = nextMasteryState(current, "INCORRECT", now);
    expect(next.masteryScore).toBeLessThan(current.masteryScore);
    expect(next.lapseCount).toBe(2);
    expect(next.nextReviewAt!.toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });
});
