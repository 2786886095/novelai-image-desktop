// Generates a 1024x1024 placeholder app icon (build/icon.png) so electron-builder
// always has a valid source icon. Replace build/icon.png with real art any time.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "build", "icon.png");

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Raw RGBA: diagonal purple gradient with a centered white diamond (✦ vibe).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
const cx = SIZE / 2;
const cy = SIZE / 2;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter byte: none
  for (let x = 0; x < SIZE; x++) {
    const t = (x + y) / (SIZE * 2);
    let r = Math.round(124 + t * 60);
    let g = Math.round(92 + t * 40);
    let b = Math.round(250 - t * 20);
    const diamond = Math.abs(x - cx) + Math.abs(y - cy);
    if (diamond < SIZE * 0.22) {
      const k = 1 - diamond / (SIZE * 0.22);
      r = Math.round(r + (255 - r) * k);
      g = Math.round(g + (255 - g) * k);
      b = Math.round(b + (255 - b) * k);
    }
    raw[p++] = r;
    raw[p++] = g;
    raw[p++] = b;
    raw[p++] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
