const { PNG } = require('pngjs');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngWithComment() {
  const image = new PNG({ width: 2, height: 1 });
  image.data.set([255, 0, 0, 255, 0, 128, 255, 128]);
  const png = PNG.sync.write(image);
  const text = Buffer.from('Comment\0{"prompt":"clipboard test fixture","seed":44}');
  const chunk = Buffer.alloc(text.length + 12);
  chunk.writeUInt32BE(text.length, 0);
  chunk.write('tEXt', 4);
  text.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
}

module.exports = { pngWithComment };
