import { computeProgress } from "../core/progress.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string, seq: number, section_path: [string, ...string[]]): Block {
  return {
    id,
    seq,
    section_path,
    section_title: section_path.join("."),
    content_md: "...",
    est_seconds: 100,
    recap_md: "...",
  };
}

const blocks: Block[] = [
  block("b0001", 1, ["1", "1.1", "1.1.1"]),
  block("b0002", 2, ["1", "1.1", "1.1.1"]),
  block("b0003", 3, ["1", "1.1", "1.1.2"]),
  block("b0004", 4, ["1", "1.1", "1.1.3"]),
];

const readSoFar = new Set(["b0001", "b0002", "b0003"]);
const { lastCompletedSectionPath, percentRead } = computeProgress(blocks, readSoFar);

// section_path 的每一段本身可能带小数点（如 "1.1.2"），展示时只取最后一段，
// 不能把整个 section_path 数组再 join(".") 一次，否则会重复拼出 "1.1.1.1.1.2"。
const sectionLabel = lastCompletedSectionPath?.at(-1) ?? "（还没读完任何小节）";
console.log(`${sectionLabel} 已读完 · 全书 ${percentRead}%`);
