/**
 * 终端里宽字符（CJK 汉字/假名/韩文/全角符号等）占两个字符宽度，窄字符占一个——
 * `kuibu books` 要把多本书的书名排成表格，书名可能中英文混杂（"西遊記" 三个字
 * 在 JS 字符串 .length 眼里只有 3，视觉上却占 6 列），直接按字符数 padEnd 补齐
 * 对不齐，得先按视觉宽度而不是字符数对齐。
 */

// 覆盖常见的东亚宽字符区段：谚文字母、CJK 部首/符号/汉字/兼容表意文字、
// 谚文音节、全角形式等。不追求穷尽 Unicode East Asian Width 表，只覆盖
// 这个项目实际会用到的书名文字（中文、日文假名、韩文）。
function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // 谚文字母
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) || // CJK 部首……雅依文
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // 谚文音节
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK 兼容表意文字
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) || // CJK 兼容形式
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // 全角形式
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd) // CJK 扩展 B 及以后
  );
}

/**
 * 一段文本在终端里实际占用的列数（宽字符算 2，其余算 1）。
 *
 * TS 小知识：`for (const ch of text)` 按 Unicode 码点（code point）遍历字符串，
 * 不是按 UTF-16 code unit——跟 `text[i]`/`text.length` 不一样，后两者会把
 * 基本多文种平面之外的字符（代理对 surrogate pair）拆成两个单元，宽度算法
 * 用 `for...of` 才不会把一个字符误算成两个。
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += isWideCodePoint(ch.codePointAt(0)!) ? 2 : 1;
  }
  return width;
}

/** 按视觉宽度（而不是字符数）补空格到 targetWidth；已经达到或超过就原样返回，不截断。 */
export function padDisplayWidth(text: string, targetWidth: number): string {
  const pad = targetWidth - displayWidth(text);
  return pad > 0 ? text + " ".repeat(pad) : text;
}
