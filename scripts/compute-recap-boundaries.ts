import { readFileSync, writeFileSync } from "node:fs";
import { computeCheckpointBoundaries } from "../core/recapCheckpoints.js";
import type { Block } from "../schema/types/pack.js";

const blocks: Block[] = JSON.parse(readFileSync("packs/public/sicp/blocks.json", "utf-8"));
const boundaries = computeCheckpointBoundaries(blocks, 720);

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

writeFileSync(
  "pack-gen/build/sicp/recap-boundaries.json",
  JSON.stringify(checkpoints, null, 2) + "\n",
  "utf-8",
);

console.log(`${checkpoints.length} checkpoints computed for ${blocks.length} blocks (720s/day target)`);
