// Generates placeholder PWA icons: a solid stone-900 square, hand-encoded
// as PNG via only Node's built-in zlib (no image library available in this
// environment). Explicitly placeholder branding -- swap web/public/icon-*.png
// for real artwork whenever there is one; nothing else references these by
// content, only by filename/size, so replacing the files is a safe drop-in.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(webRoot, "public");

// Tailwind's stone-900, the darkest neutral already used throughout the
// app's light-mode theme (web/src/index.css) -- see index.css's remapped
// shadcn tokens.
const STONE_900 = [0x1c, 0x19, 0x17];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function solidSquarePng(size, [r, g, b]) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk("IHDR", ihdrData);

  const rowBytes = 1 + size * 4; // filter byte + RGBA per pixel
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }
  const idat = chunk("IDAT", deflateSync(raw));

  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

for (const size of [192, 512]) {
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, solidSquarePng(size, STONE_900));
  console.log(`generate-icons: wrote ${path}`);
}
