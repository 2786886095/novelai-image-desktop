import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {PNG} from 'pngjs';
import {describe, expect, it} from 'vitest';
import {removePngGenerationMetadata, removePngMetadataChunks} from './png-privacy';
import {copyPngMetadataChunks, prepareImageBufferForSave} from './nai';
import {readPngStealthMetadata} from '../../src/png-metadata-codecs';

function chunk(type: string, data = Buffer.alloc(0)) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); out.write(type, 4, 4, 'ascii'); data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, out.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
function idats(bytes: Buffer) {
  const out: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') out.push(bytes.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(out);
}
const payload = Buffer.from(JSON.stringify({Description: 'private prompt', Comment: '{"prompt":"private prompt","seed":424242}'}));
function fixture(rgb = false, compressed = false, alpha = 255) {
  const png = new PNG({width: 64, height: 64});
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 103; png.data[i + 1] = 151; png.data[i + 2] = 217; png.data[i + 3] = alpha;
  }
  const bytes = compressed ? gzipSync(payload) : payload;
  const signature = Buffer.from(`stealth_${rgb ? 'rgb' : 'png'}${compressed ? 'comp' : 'info'}`);
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length * 8);
  const stream = Buffer.concat([signature, length, bytes]);
  for (let bit = 0; bit < stream.length * 8; bit++) {
    const pixel = Math.floor(bit / (rgb ? 3 : 1)), x = Math.floor(pixel / png.height), y = pixel % png.height;
    const index = (y * png.width + x) * 4 + (rgb ? bit % 3 : 3);
    png.data[index] = (png.data[index] & 254) | ((stream[bit >>> 3] >>> (7 - (bit & 7))) & 1);
  }
  return {bytes: PNG.sync.write(png), bits: stream.length * 8, rgb};
}

describe('PNG save privacy', () => {
  for (const rgb of [false, true]) for (const compressed of [false, true]) for (const alpha of [255, 121]) {
    it(`erases complete ${rgb ? 'RGB' : 'alpha'} ${compressed ? 'gzip' : 'plain'} payload at alpha ${alpha}`, () => {
      const input = fixture(rgb, compressed, alpha), original = Buffer.from(input.bytes);
      const output = prepareImageBufferForSave(input.bytes, false);
      const before = PNG.sync.read(input.bytes), after = PNG.sync.read(output);
      expect([after.width, after.height]).toEqual([before.width, before.height]);
      let maxDelta = 0, wrongCarrier = 0;
      for (let i = 0; i < before.data.length; i++) {
        maxDelta = Math.max(maxDelta, Math.abs(before.data[i] - after.data[i]));
        const expected = i % 4 === 3 && alpha === 255 ? 255 : before.data[i] & 254;
        if (after.data[i] !== expected) wrongCarrier++;
      }
      expect({maxDelta, wrongCarrier}).toEqual({maxDelta: 1, wrongCarrier: 0});
      expect(readPngStealthMetadata(output)).toEqual({});
      expect(input.bytes).toEqual(original);
      expect(prepareImageBufferForSave(input.bytes, true)).toBe(input.bytes);
    });
  }
  const official = path.resolve('shared/official-image-metadata-fixtures');
  it('clears every 16-bit carrier convention while retaining low-bit precision', () => {
    const image = new PNG({width: 256, height: 256});
    const native = new Uint16Array(image.data.length);
    for (let i = 0; i < native.length; i++) native[i] = i % 65536;
    image.data = Buffer.from(native.buffer);
    const bytes = PNG.sync.write(image, {bitDepth: 16, colorType: 6, inputColorType: 6});
    const before = PNG.sync.read(bytes, {skipRescale: true}).data;
    const after = PNG.sync.read(prepareImageBufferForSave(bytes, false), {skipRescale: true}).data;
    let highDelta = 0, roundedDelta = 0, remainingCarrier = 0;
    for (let i = 0; i < before.length; i++) {
      highDelta = Math.max(highDelta, Math.abs((before[i] >>> 8) - (after[i] >>> 8)));
      roundedDelta = Math.max(roundedDelta, Math.abs(Math.round(before[i] / 257) - Math.round(after[i] / 257)));
      if ((after[i] & 1) || ((after[i] >>> 8) & 1) || (Math.round(after[i] / 257) & 1)) remainingCarrier++;
    }
    expect({highDelta, roundedDelta, remainingCarrier}).toEqual({highDelta: 1, roundedDelta: 1, remainingCarrier: 0});
    expect(new Set(after).size).toBeGreaterThan(128);
  });
  for (const name of fs.readdirSync(official).filter(name => name.endsWith('.png'))) {
    it(`clears existing official-parser PNG fixture ${name}`, () => {
      const input = fs.readFileSync(path.join(official, name)), output = prepareImageBufferForSave(input, false);
      expect(output).not.toEqual(input);
      expect(readPngStealthMetadata(output)).toEqual({});
      expect(PNG.sync.read(output)).toMatchObject({width: 64, height: 128});
    });
  }
  it('freshly encodes ordinary PNG and clears random LSBs without a signature', () => {
    const image = new PNG({width: 32, height: 32});
    for (let i = 0; i < image.data.length; i++) image.data[i] = (i * 37 + 3) & 255;
    const plain = PNG.sync.write(image), text = chunk('tEXt', Buffer.from('Comment\0private'));
    const input = Buffer.concat([plain.subarray(0, 33), text, plain.subarray(33)]);
    const output = prepareImageBufferForSave(input, false);
    expect(idats(output)).not.toEqual(idats(input));
    expect(PNG.sync.read(output).data).toEqual(Buffer.from(image.data.map(value => value & 254)));
    expect(prepareImageBufferForSave(plain, false)).not.toBe(plain);
  });
  it('does not scrub stealth during metadata-preserving compositing', () => {
    const input = fixture().bytes, text = chunk('tEXt', Buffer.from('Comment\0preserved'));
    const source = Buffer.concat([input.subarray(0, 33), text, input.subarray(33)]);
    const copied = copyPngMetadataChunks(source, input);
    expect(idats(copied)).toEqual(idats(input));
    expect(PNG.sync.read(copied).data).toEqual(PNG.sync.read(input).data);
    expect(copied.toString('latin1')).toContain('preserved');
    expect(idats(removePngMetadataChunks(source))).toEqual(idats(source));
  });
  it('drops all ancillary chunks and IEND trailers rather than copying unknown metadata', () => {
    const plain = fixture().bytes;
    const marker = 'private-parameters-424242';
    const extras = [chunk('tEXt', Buffer.from(`Comment\0${marker}`)),
      chunk('zTXt', Buffer.from(`Comment\0\0${marker}`)),
      chunk('iTXt', Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${marker}`)),
      chunk('eXIf', Buffer.from(marker)), chunk('iCCP', Buffer.from(`profile\0\0${marker}`)),
      chunk('raNd', Buffer.from(marker)), chunk('tIME', Buffer.alloc(7)), chunk('gAMA', Buffer.from([0,0,177,143]))];
    const input = Buffer.concat([plain.subarray(0, 33), ...extras, plain.subarray(33), Buffer.from(marker)]);
    const output = prepareImageBufferForSave(input, false);
    const types: string[] = [];
    let offset = 8;
    while (offset < output.length) {
      types.push(output.toString('ascii', offset + 4, offset + 8));
      offset += output.readUInt32BE(offset) + 12;
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(offset).toBe(output.length);
    expect(output.includes(Buffer.from(marker))).toBe(false);
    expect(prepareImageBufferForSave(input, true)).toBe(input);
  });
  it('erases full payload planes even with damaged magic or impossible advertised length', () => {
    for (const damage of ['magic', 'length']) {
      const image = PNG.sync.read(fixture(false, true, 121).bytes);
      const start = damage === 'magic' ? 0 : 120, end = damage === 'magic' ? 120 : 152;
      for (let bit = start; bit < end; bit++) {
        const x = Math.floor(bit / image.height), y = bit % image.height;
        image.data[(y * image.width + x) * 4 + 3] |= 1;
      }
      const output = PNG.sync.read(prepareImageBufferForSave(PNG.sync.write(image), false));
      expect(output.data.every(value => (value & 1) === 0)).toBe(true);
    }
  });
  it('preserves transparent-pixel RGB within one level when alpha is carried through tRNS', () => {
    const input = fs.readFileSync(path.join(official, 'rgb-trns-stealth.png'));
    const withoutTrns = [input.subarray(0, 8)];
    for (let offset = 8; offset < input.length;) {
      const end = offset + input.readUInt32BE(offset) + 12;
      if (input.toString('ascii', offset + 4, offset + 8) !== 'tRNS') withoutTrns.push(input.subarray(offset, end));
      offset = end;
    }
    const raw = PNG.sync.read(Buffer.concat(withoutTrns));
    const output = PNG.sync.read(prepareImageBufferForSave(input, false));
    let rgbChanges = 0;
    for (let i = 0; i < raw.data.length; i++) if (i % 4 !== 3 && (Math.abs(raw.data[i] - output.data[i]) > 1 || output.data[i] & 1)) rgbChanges++;
    expect(rgbChanges).toBe(0);
    expect(readPngStealthMetadata(prepareImageBufferForSave(input, false))).toEqual({});
  });
  it('rejects corrupt structure, CRC, dimensions, DEFLATE, and APNG instead of returning a leaky image', () => {
    const good = fixture().bytes, badCrc = Buffer.from(good); badCrc[29] ^= 1;
    const hugeHeader = Buffer.from(good.subarray(16, 29)); hugeHeader.writeUInt32BE(0x7fffffff);
    const huge = Buffer.concat([good.subarray(0, 8), chunk('IHDR', hugeHeader), good.subarray(33)]);
    const corrupt = Buffer.concat([good.subarray(0, 33), chunk('IDAT', Buffer.from([1,2,3])), chunk('IEND')]);
    const animated = Buffer.concat([good.subarray(0, 33), chunk('acTL', Buffer.alloc(8)), good.subarray(33)]);
    for (const input of [good.subarray(0, 4), good.subarray(0, -1), badCrc, huge, corrupt, animated]) {
      expect(() => removePngGenerationMetadata(input)).toThrow(/无法安全移除 PNG 元数据/);
      expect(prepareImageBufferForSave(input, true)).toBe(input);
    }
  });
  it('fails closed for non-PNG formats instead of calling them cleaned', () => {
    for (const input of [Buffer.from([255,216,255,217]), Buffer.from('RIFFxxxxWEBP')]) {
      expect(() => removePngGenerationMetadata(input)).toThrow(/仅支持 PNG/);
      expect(prepareImageBufferForSave(input, true)).toBe(input);
    }
  });
});
