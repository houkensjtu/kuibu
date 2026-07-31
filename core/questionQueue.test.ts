import { describe, it, expect } from "vitest";
import { buildQuestionQueue, shuffleOptions } from "./questionQueue.js";
import type { KnowledgeItem, Question } from "../schema/types/pack.js";

function item(
  id: string,
  block_ids: [string, ...string[]],
  question_ids: [string, ...string[]],
): KnowledgeItem {
  return { id, block_ids, statement: `statement of ${id}`, question_ids };
}

function question(id: string, item_id: string): Question {
  return {
    id,
    item_id,
    type: "single_choice",
    prompt: `prompt of ${id}`,
    options: ["A", "B", "C", "D"],
    answer_index: 2,
    explanation: "because",
  };
}

describe("buildQuestionQueue", () => {
  const items: KnowledgeItem[] = [
    item("k0001", ["b0001"], ["q0001"]),
    item("k0002", ["b0002"], ["q0002"]),
    item("k0003", ["b0003"], ["q0003"]),
    item("k0004", ["b0004"], ["q0004"]),
  ];

  it("picks exactly newContentCount items introduced by today's read blocks", () => {
    const queue = buildQuestionQueue({
      todayReadBlockIds: new Set(["b0001", "b0002", "b0003"]),
      items,
      wrongQuestionIdByItemId: new Map(),
      dueItemIds: [],
      newContentCount: 2,
    });

    expect(queue).toEqual([
      { itemId: "k0001", questionId: "q0001", reason: "new_content" },
      { itemId: "k0002", questionId: "q0002", reason: "new_content" },
    ]);
  });

  it("includes all wrong-answer items uncapped, after new content", () => {
    const queue = buildQuestionQueue({
      todayReadBlockIds: new Set(["b0001"]),
      items,
      wrongQuestionIdByItemId: new Map([
        ["k0003", "q0003"],
        ["k0004", "q0004"],
      ]),
      dueItemIds: [],
      newContentCount: 2,
    });

    expect(queue).toEqual([
      { itemId: "k0001", questionId: "q0001", reason: "new_content" },
      { itemId: "k0003", questionId: "q0003", reason: "wrong_answer" },
      { itemId: "k0004", questionId: "q0004", reason: "wrong_answer" },
    ]);
  });

  it("does not duplicate an item that's both new content and due", () => {
    const queue = buildQuestionQueue({
      todayReadBlockIds: new Set(["b0001"]),
      items,
      wrongQuestionIdByItemId: new Map(),
      dueItemIds: ["k0001", "k0002"],
      newContentCount: 2,
    });

    // k0001 already claimed by new_content; k0002 falls through to due.
    expect(queue).toEqual([
      { itemId: "k0001", questionId: "q0001", reason: "new_content" },
      { itemId: "k0002", questionId: "q0002", reason: "due" },
    ]);
  });

  it("truncates only the due-items tail when over maxTotalQuestions", () => {
    const queue = buildQuestionQueue({
      todayReadBlockIds: new Set(),
      items,
      wrongQuestionIdByItemId: new Map([["k0001", "q0001"]]),
      dueItemIds: ["k0002", "k0003", "k0004"],
      newContentCount: 2,
      maxTotalQuestions: 2,
    });

    // wrong_answer is never truncated; only 1 of the 3 due items fits under the cap.
    expect(queue).toEqual([
      { itemId: "k0001", questionId: "q0001", reason: "wrong_answer" },
      { itemId: "k0002", questionId: "q0002", reason: "due" },
    ]);
  });
});

describe("shuffleOptions", () => {
  const q = question("q0001", "k0001");

  it("keeps the same set of option strings", () => {
    const { options } = shuffleOptions(q, () => 0.5);
    expect([...options].sort()).toEqual([...q.options].sort());
  });

  it("answerIndex still points at the correct option text after shuffling", () => {
    const correctText = q.options[q.answer_index];
    for (const seed of [0, 0.1, 0.4, 0.6, 0.99]) {
      const { options, answerIndex } = shuffleOptions(q, () => seed);
      expect(options[answerIndex]).toBe(correctText);
    }
  });

  it("produces a different order for a different injected random sequence", () => {
    const seedZero = shuffleOptions(q, () => 0);
    const seedHigh = shuffleOptions(q, () => 0.999);
    expect(seedZero.options).not.toEqual(seedHigh.options);
  });
});
