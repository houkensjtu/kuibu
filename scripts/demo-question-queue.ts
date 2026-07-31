import { buildQuestionQueue, shuffleOptions } from "../core/questionQueue.js";
import type { KnowledgeItem, Question } from "../schema/types/pack.js";

const items: KnowledgeItem[] = [
  { id: "k0001", block_ids: ["b0001"], statement: "...", question_ids: ["q0001"] },
  { id: "k0002", block_ids: ["b0002"], statement: "...", question_ids: ["q0002"] },
  { id: "k0003", block_ids: ["b0003"], statement: "...", question_ids: ["q0003"] },
];

const queue = buildQuestionQueue({
  todayReadBlockIds: new Set(["b0001", "b0002"]),
  items,
  wrongQuestionIdByItemId: new Map([["k0003", "q0003"]]),
  dueItemIds: [],
  newContentCount: 2,
});

console.log("今日题目队列:", queue);
console.log();

const question: Question = {
  id: "q0001",
  item_id: "k0001",
  type: "single_choice",
  prompt: "以下哪个是组合式求值的第一步？",
  options: ["求值各子表达式", "打印结果", "跳过求值", "报错"],
  answer_index: 0,
  explanation: "先求值再应用。",
};

console.log("同一道题连续呈现两次（每次都重新 shuffle）:");
for (let i = 0; i < 2; i++) {
  const { options, answerIndex } = shuffleOptions(question);
  console.log(`  第${i + 1}次: [${options.join(", ")}]，正确答案在第 ${answerIndex} 位`);
}
