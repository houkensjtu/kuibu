import { packSession } from "../core/sessionPacker.js";
import type { Block } from "../schema/types/pack.js";

function block(id: string, seq: number, est_seconds: number): Block {
  return {
    id,
    seq,
    section_path: ["1", "1.1", "1.1.1"],
    section_title: "The Elements of Programming",
    content_md: "...",
    est_seconds,
    recap_md: `recap of ${id}`,
  };
}

const blocks: Block[] = [
  block("b0001", 1, 150),
  block("b0002", 2, 140),
  block("b0003", 3, 130),
  block("b0004", 4, 200),
  block("b0005", 5, 120),
];

const targets = [480, 720];

for (const targetSeconds of targets) {
  const selected = packSession({ blocks, readBlockIds: new Set(), targetSeconds });
  const total = selected.reduce((sum, b) => sum + b.est_seconds, 0);
  console.log(
    `目标 ${targetSeconds}s -> 选中 [${selected.map((b) => b.id).join(", ")}]，累计 ${total}s`,
  );
}
