import { describe, it, expect } from "vitest";
import { isCheckinComplete } from "./checkinJudgment.js";

const queue = [{ questionId: "q0001" }, { questionId: "q0002" }];

describe("isCheckinComplete", () => {
  it("is false when reading time is under target, even if all questions are answered", () => {
    const result = isCheckinComplete({
      totalReadSeconds: 300,
      targetSeconds: 720,
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    });
    expect(result).toBe(false);
  });

  it("is false when reading time is enough but a question is still unanswered", () => {
    const result = isCheckinComplete({
      totalReadSeconds: 720,
      targetSeconds: 720,
      queue,
      answeredQuestionIds: new Set(["q0001"]),
    });
    expect(result).toBe(false);
  });

  it("is true once reading time meets target and every question is answered", () => {
    const result = isCheckinComplete({
      totalReadSeconds: 720,
      targetSeconds: 720,
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    });
    expect(result).toBe(true);
  });

  it("counts a wrong answer as completed, not as blocking checkin", () => {
    // answeredQuestionIds doesn't carry correctness - being present is enough.
    const result = isCheckinComplete({
      totalReadSeconds: 800,
      targetSeconds: 720,
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    });
    expect(result).toBe(true);
  });

  it("is true with an empty queue once reading time is met", () => {
    const result = isCheckinComplete({
      totalReadSeconds: 720,
      targetSeconds: 720,
      queue: [],
      answeredQuestionIds: new Set(),
    });
    expect(result).toBe(true);
  });
});
