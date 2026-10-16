import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {PNG} from 'pngjs';
import {imagePngBlob, copyImageForClipboard} from './image-copy';
import {preparePngForClipboard} from '../electron/ipc/image-clipboard';
import {readPngStealthMetadata} from './png-metadata-codecs';
vi.mock('electron', () => ({app: {}, clipboard: {}}));
afterEach(() => vi.unstubAllGlobals());
const official = path.resolve('shared/official-image-metadata-fixtures');

describe('actual PNG Blob preparation for privacy copies', () => {
  for (const name of ['rgba-8-plain.png', 'rgba-16-adam7.png', 'png-text-plus-stealth.png']) {
    it(`passes ${name} through bounded native sanitization instead of returning original Blob`, async () => {
      const original = fs.readFileSync(path.join(official, name)), snapshot = Buffer.from(original);
      const blob = new Blob([Uint8Array.from(original)], {type:'image/png'});
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true, blob:async () => blob}));
      const sanitize = vi.fn(async bytes => preparePngForClipboard(bytes));
      const output = await imagePngBlob('fixture://image', sanitize);
      expect(output).not.toBe(blob);
      expect(sanitize).toHaveBeenCalledOnce();
      const bytes = Buffer.from(await output.arrayBuffer());
      expect(bytes).not.toEqual(original);
      expect(readPngStealthMetadata(bytes)).toEqual({});
      const image = PNG.sync.read(bytes);
      expect([image.width, image.height]).toEqual([64,128]);
      expect(original).toEqual(snapshot);
    });
  }
  it.each(['missing', 'rejected'])('fails closed when the sanitizer bridge is %s', async mode => {
    const original = fs.readFileSync(path.join(official, 'rgba-8-plain.png'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,blob:async () => new Blob([Uint8Array.from(original)],{type:'image/png'})}));
    const nativeOriginalCopy = vi.fn(), copyImageAt = vi.fn();
    vi.stubGlobal('window', {naiDesktop: mode === 'missing' ? {} : {
      preparePngForClipboard: vi.fn().mockRejectedValue(new Error('fixture IPC rejection')),
    }, copyImageAt});
    await expect(copyImageForClipboard('fixture://image', false, nativeOriginalCopy,
      async src => imagePngBlob(src))).rejects.toThrow(mode === 'missing' ? 'IMAGE_COPY_PRIVACY_UNAVAILABLE' : 'fixture IPC rejection');
    expect(nativeOriginalCopy).not.toHaveBeenCalled();
    expect(copyImageAt).not.toHaveBeenCalled();
  });
});
