import { readFileSync, writeFileSync } from "node:fs";
import { computeCheckpointBoundaries } from "../core/recapCheckpoints.js";
import type { Block } from "../schema/types/pack.js";

// 用法：tsx scripts/compute-recap-boundaries.ts [packDir] [targetSeconds]
// 不传参数时保持原来的行为（SICP、720s/12min 每日假设）——DESIGN.md §14.7
// 提到的"小改成接受 pack 路径参数"就是这里，多本书都复用同一份切分逻辑。
const packDir = process.argv[2] ?? "packs/public/sicp";
const targetSeconds = Number(process.argv[3] ?? 720);
const bookId = packDir.split(/[\\/]/).filter(Boolean).at(-1)!;
// 私有书的输出必须落在 pack-gen/build/private/ 这个 wholesale gitignore 的
// 根下面，不能跟公开书一样直接落在 pack-gen/build/<bookId>/——那个路径没有
// 被 .gitignore 覆盖（私有书是逐本 gitignore 公开书的 build 产物，不是靠
// 目录名模式），recap-boundaries.json 里的 recap_md 是从受版权保护原文派生
// 的内容，写错目录就是一次真实的私有内容泄漏（compute-recap-boundaries.ts
// 曾经对 packs/private/sjobs 硬编码算出 pack-gen/build/sjobs/，不在任何
// gitignore 规则覆盖范围内，跑的时候才发现）。
const isPrivate = packDir.split(/[\\/]/).includes("private");
const buildDir = isPrivate ? `pack-gen/build/private/${bookId}` : `pack-gen/build/${bookId}`;

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

const outPath = `${buildDir}/recap-boundaries.json`;
writeFileSync(outPath, JSON.stringify(checkpoints, null, 2) + "\n", "utf-8");

console.log(
  `${checkpoints.length} checkpoints computed for ${blocks.length} blocks ` +
    `(${targetSeconds}s/day target) -> ${outPath}`,
);
