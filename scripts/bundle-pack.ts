import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { discoverPacks, resolvePackDir } from "../cli/discoverPacks.js";
import { loadPack } from "../cli/loadPack.js";
import { validatePack } from "../core/schemaValidators.js";
import { checkPackReferences } from "../core/checkPackReferences.js";

/**
 * 把一个内容包目录（7 个 JSON 文件）打成单个 <book_id>.kuibu.json，方便传到
 * 手机上给网页版导入（网页版不能像 CLI 那样扫目录，也没法一次选 7 个文件）。
 * `loadPack` 已经做了 校验+版本闸门+引用完整性检查，所以打出来的包是
 * "构造即已校验"的——这里不用重新写一遍校验逻辑。
 */
function parseArgs(argv: string[]): { input: string; outDir: string } {
  let outDir = "bundles";
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      outDir = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }

  if (positional.length !== 1) {
    console.error("Usage: npm run bundle -- <book-id-or-pack-dir> [--out <dir>]");
    process.exit(1);
  }

  return { input: positional[0], outDir };
}

function main() {
  const { input, outDir } = parseArgs(process.argv.slice(2));

  const discovered = discoverPacks();
  const packDir = resolvePackDir(input, discovered);

  // 输出目录若落在 web/ 之内，下一次部署就会把这个文件发布出去——bundle 的
  // 整个意义就是绕开构建/发布这一环，落在 web/ 里等于白做。
  const resolvedOutDir = resolve(outDir);
  const webRoot = resolve("web");
  if (resolvedOutDir === webRoot || resolvedOutDir.startsWith(webRoot + sep)) {
    throw new Error(`Refusing to write into web/ (${outDir}) -- the bundle must never enter the deploy output.`);
  }

  const pack = loadPack(packDir);
  const bookId = pack.manifest.book_id;

  mkdirSync(resolvedOutDir, { recursive: true });
  const outPath = resolve(resolvedOutDir, `${bookId}.kuibu.json`);
  writeFileSync(outPath, JSON.stringify(pack));

  // 回读一遍，确认写出来的文件本身就是浏览器能接受的——不是"loadPack 校验过
  // 内存里的对象"和"写到磁盘的字节"这两件事被悄悄当成了一回事。
  const roundTripped = JSON.parse(readFileSync(outPath, "utf-8"));
  const result = validatePack(roundTripped);
  if (!result.valid) {
    throw new Error(`Bundle failed re-validation after write:\n${result.errors.join("\n")}`);
  }
  const referenceErrors = checkPackReferences(result.data);
  if (referenceErrors.length > 0) {
    throw new Error(`Bundle failed reference check after write:\n${referenceErrors.join("\n")}`);
  }

  console.log(
    `bundle-pack: wrote ${outPath} (${pack.blocks.length} blocks, ${pack.items.length} items, ` +
      `${pack.questions.length} questions, ${pack.exercises.length} exercises)`,
  );

  if (/^(packs\/private\/|packs-private\/)/.test(packDir)) {
    console.error(
      "\n⚠ 私有内容包 —— bundles/ 已被 .gitignore + pre-commit 挡住，但这个文件本身是" +
        "受版权保护原文的派生内容，不要提交、不要公开分发。",
    );
  }
}

main();
