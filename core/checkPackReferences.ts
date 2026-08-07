import type { ContentPack } from "../schema/types/pack.js";

/**
 * schema/pack.schema.json 只校验形状，不校验交叉引用——`question_ids` 只是
 * `array of string`，不保证指向真实存在的题；`answer_index` 只有
 * `minimum: 0`，不跟 `options.length` 挂钩。越界的 answer_index 是最阴的
 * 一种坏输入：shuffleOptions 会算出 answerIndex: -1，题目变成"选什么都算
 * 错"——不崩溃、完全静默，只有专门检查才抓得到。
 *
 * 返回空数组代表干净；非空时每条都是人类可读的问题描述。
 */
export function checkPackReferences(pack: ContentPack): string[] {
  const errors: string[] = [];

  const blockIds = new Set<string>();
  for (const block of pack.blocks) {
    if (blockIds.has(block.id)) errors.push(`duplicate block id: ${block.id}`);
    blockIds.add(block.id);
  }

  const itemIds = new Set<string>();
  for (const item of pack.items) {
    if (itemIds.has(item.id)) errors.push(`duplicate item id: ${item.id}`);
    itemIds.add(item.id);
  }

  const questionIds = new Set<string>();
  for (const question of pack.questions) {
    if (questionIds.has(question.id)) errors.push(`duplicate question id: ${question.id}`);
    questionIds.add(question.id);
  }

  for (const item of pack.items) {
    for (const blockId of item.block_ids) {
      if (!blockIds.has(blockId)) {
        errors.push(`item ${item.id} references missing block ${blockId}`);
      }
    }
    for (const questionId of item.question_ids) {
      if (!questionIds.has(questionId)) {
        errors.push(`item ${item.id} references missing question ${questionId}`);
      }
    }
  }

  for (const question of pack.questions) {
    if (!itemIds.has(question.item_id)) {
      errors.push(`question ${question.id} references missing item ${question.item_id}`);
    }
    if (question.answer_index >= question.options.length) {
      errors.push(
        `question ${question.id} answer_index ${question.answer_index} is out of range for ${question.options.length} options`,
      );
    }
  }

  for (const exercise of pack.exercises) {
    if (!blockIds.has(exercise.block_id)) {
      errors.push(`exercise ${exercise.id} references missing block ${exercise.block_id}`);
    }
  }

  return errors;
}
