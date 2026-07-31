import { describe, it, expect, vi } from "vitest";
import { runAnswerFlow } from "./answerFlow.js";
import type { QueueEntry } from "../core/questionQueue.js";
import type { Question } from "../schema/types/pack.js";

function question(id: string, item_id: string): Question {
  return {
    id,
    item_id,
    type: "single_choice",
    prompt: `prompt of ${id}`,
    options: ["A", "B", "C", "D"],
    answer_index: 2, // "C"
    explanation: `explanation of ${id}`,
  };
}

describe("runAnswerFlow", () => {
  const questionsById = new Map([
    ["q0001", question("q0001", "k0001")],
    ["q0002", question("q0002", "k0002")],
  ]);
  const queue: QueueEntry[] = [
    { itemId: "k0001", questionId: "q0001", reason: "new_content" },
    { itemId: "k0002", questionId: "q0002", reason: "due" },
  ];

  it("grades correct vs wrong based on the shuffled answer index", async () => {
    // random=() => 0 with a 4-option Fisher-Yates yields indices [1,2,3,0],
    // so the original correct option (index 2, "C") ends up at shuffled index 1.
    const answers = [1, 0]; // first question: correct; second: wrong
    let call = 0;
    const onAnswered = vi.fn();

    await runAnswerFlow(queue, questionsById, {
      ask: () => answers[call++],
      onAnswered,
      random: () => 0,
    });

    expect(onAnswered).toHaveBeenCalledTimes(2);
    expect(onAnswered.mock.calls[0][4]).toBe(true); // correct
    expect(onAnswered.mock.calls[1][4]).toBe(false); // wrong
  });

  it("passes the matching entry/question/shuffled/chosenIndex through to onAnswered", async () => {
    const onAnswered = vi.fn();

    await runAnswerFlow(queue, questionsById, {
      ask: (_q, shuffled) => shuffled.answerIndex, // always answer correctly
      onAnswered,
      random: () => 0.5,
    });

    for (const [i, call] of onAnswered.mock.calls.entries()) {
      const [entry, q, shuffled, chosenIndex, correct] = call;
      expect(entry).toBe(queue[i]);
      expect(q.id).toBe(queue[i].questionId);
      expect(shuffled.options).toHaveLength(4);
      expect(chosenIndex).toBe(shuffled.answerIndex);
      expect(correct).toBe(true);
    }
  });

  it("skips a queue entry whose question_id isn't in the map, without throwing", async () => {
    const onAnswered = vi.fn();
    const brokenQueue: QueueEntry[] = [
      { itemId: "k9999", questionId: "does-not-exist", reason: "due" },
    ];

    await expect(
      runAnswerFlow(brokenQueue, questionsById, { ask: () => 0, onAnswered }),
    ).resolves.toBeUndefined();
    expect(onAnswered).not.toHaveBeenCalled();
  });
});
