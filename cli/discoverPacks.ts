import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PackLoadError } from "./loadPack.js";

export interface DiscoveredPack {
  bookId: string;
  packDir: string;
}

const DEFAULT_ROOTS = ["packs/public", "packs/private"];

/**
 * 扫出所有"看起来是内容包"的目录（有 manifest.json 就算），不需要另开一份
 * 登记文件跟每个包的 manifest 手动保持同步——加一本新书只要把它的目录放进
 * packs/public 或 packs/private，这里自动认得到。
 *
 * packs/private 是可选的：它整个被 .gitignore 排除，大多数人机器上根本不
 * 存在，`readdirSync` 直接对着不存在的目录会抛错，所以先用 `existsSync` 挡一下。
 *
 * TS 小注：`readdirSync(dir, { withFileTypes: true })` 返回的是 `Dirent[]`
 * 而不是纯字符串数组，每个 Dirent 自带 `.isDirectory()`，不用再对每一项
 * 额外 `statSync` 一次去判断是不是目录。
 */
export function discoverPacks(roots: readonly string[] = DEFAULT_ROOTS): DiscoveredPack[] {
  const found: DiscoveredPack[] = [];

  for (const root of roots) {
    if (!existsSync(root)) continue;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      // node:path 的 join() 在 Windows 上用反斜杠拼路径（"packs\public\sicp"），
      // 但仓库里所有硬编码路径（DEFAULT_PACK、.gitignore 规则等）都是正斜杠——
      // 两种风格字符串 "packs/public/sicp" !== "packs\public\sicp"，会导致
      // cli/index.ts 的 defaultLogPath() 认不出"这就是默认的 SICP pack"，
      // 把它当成一本新书，算出一个错误的日志文件路径。统一转成正斜杠，
      // 让 discoverPacks() 返回的路径跟仓库里所有其他路径字符串风格一致。
      const packDir = join(root, entry.name).replace(/\\/g, "/");
      const manifestPath = join(packDir, "manifest.json");
      if (!existsSync(manifestPath)) continue;

      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      found.push({ bookId: manifest.book_id, packDir });
    }
  }

  return found;
}

/**
 * `--pack` 既可以是完整路径（老用法，"packs/public/gatsby"），也可以是
 * 短书名（新用法，"gatsby"）——先看它是不是一个真实存在的 pack 目录，不是
 * 的话再去 discoverPacks() 的结果里按 book_id 找。两种用法可以混用，互不
 * 冲突：短名不会跟长路径撞在一起，因为长路径本身就会在第一步直接命中。
 */
export function resolvePackDir(input: string, discovered: readonly DiscoveredPack[]): string {
  if (existsSync(join(input, "manifest.json"))) return input;

  const match = discovered.find((p) => p.bookId === input);
  if (match) return match.packDir;

  const known = discovered.map((p) => p.bookId).join(", ") || "(none found)";
  throw new PackLoadError(
    `Unknown pack "${input}". Known books: ${known}. You can also pass a full pack directory path.`,
  );
}
