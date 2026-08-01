import { describe, it, expect } from "vitest";
import { isCheckinComplete } from "./checkinJudgment.js";

const queue = [{ questionId: "q0001" }, { questionId: "q0002" }];
const assignedBlockIds = ["b0001", "b0002"];

describe("isCheckinComplete", () => {
  it("is false when a question is still unanswered, even if every block was read", () => {
    const result = isCheckinComplete({
      assignedBlockIds,
      readBlockIdsToday: new Set(["b0001", "b0002"]),
      queue,
      answeredQuestionIds: new Set(["q0001"]),
    });
    expect(result).toBe(false);
  });

  it("is false when a block is still unread, even if every question is answered", () => {
    const result = isCheckinComplete({
      assignedBlockIds,
      readBlockIdsToday: new Set(["b0001"]),
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    });
    expect(result).toBe(false);
  });

  it("is true once every assigned block is read and every question is answered, regardless of time spent", () => {
    const result = isCheckinComplete({
      assignedBlockIds,
      readBlockIdsToday: new Set(["b0001", "b0002"]),
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    });
    expect(result).toBe(true);
  });

  it("counts a wrong answer as completed, not as blocking checkin", () => {
    // answeredQuestionIds doesn't carry correctness - being present is enough.
    const result = isCheckinComplete({
      assignedBlockIds,
      readBlockIdsToday: new Set(["b0001", "b0002"]),
      queue,
      answeredQuestionIds: new Set(["q0001", "q0002"]),
    });
    expect(result).toBe(true);
  });

  it("is true with no assigned blocks and an empty queue (nothing left to do today)", () => {
    const result = isCheckinComplete({
      assignedBlockIds: [],
      readBlockIdsToday: new Set(),
      queue: [],
      answeredQuestionIds: new Set(),
    });
    expect(result).toBe(true);
  });
});
