import { readFileSync, writeFileSync } from "node:fs";
import { computeCheckpointBoundaries } from "../core/recapCheckpoints.js";
import type { Block } from "../schema/types/pack.js";

// 用法：tsx scripts/compute-recap-boundaries.ts [packDir] [targetSeconds]
// 不传参数时保持原来的行为（SICP、720s/12min 每日假设）——DESIGN.md §14.7
// 提到的"小改成接受 pack 路径参数"就是这里，多本书都复用同一份切分逻辑。
const packDir = process.argv[2] ?? "packs/public/sicp";
const targetSeconds = Number(process.argv[3] ?? 720);
const bookId = packDir.split(/[\\/]/).filter(Boolean).at(-1)!;

const blocks: Block[] = JSON.parse(readFileSync(`${packDir}/blocks.json`, "utf-8"));
const boundaries = computeCheckpointBoundaries(blocks, targetSeconds);

let previous = 0;
const checkpoints = boundaries.map((throughCount, index) => {
  const dayBlocks = blocks.slice(previous, throughCount);
  const info = {
    checkpoint_index: index + 1,
    through_block_count: throughCount,
    block_ids: dayBlocks.map((b) => b.id),
    section_paths: [...new Set(dayBlocks.map((b) => b.section_path.join("/")))],
    recap_mds: dayBlocks.map((b) => b.recap_md),
  };
  previous = throughCount;
  return info;
});

const outPath = `pack-gen/build/${bookId}/recap-boundaries.json`;
writeFileSync(outPath, JSON.stringify(checkpoints, null, 2) + "\n", "utf-8");

console.log(
  `${checkpoints.length} checkpoints computed for ${blocks.length} blocks ` +
    `(${targetSeconds}s/day target) -> ${outPath}`,
);
