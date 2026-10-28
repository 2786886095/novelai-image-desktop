import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {describe, expect, it, vi} from 'vitest';
import {PNG} from 'pngjs';
import {preparePngForClipboard} from './image-clipboard';
vi.mock('electron', () => ({app: {}, clipboard: {}}));

describe('pure clipboard PNG bridge', () => {
  it('strongly cleans actual bytes without clipboard or path authority', () => {
    const bytes = fs.readFileSync(path.resolve('shared/official-image-metadata-fixtures/rgba-8-plain.png'));
    const snapshot = Buffer.from(bytes), result = Buffer.from(preparePngForClipboard(bytes));
    const image = PNG.sync.read(result);
    expect(image.data.every((value,i) => i % 4 === 3 ? value === 255 : !(value & 1))).toBe(true);
    expect(bytes).toEqual(snapshot);
  });
  it('rejects untyped, non-PNG, oversized and corrupt data without a raw fallback', () => {
    for (const input of [null, 'F:/private.png', {path:'F:/private.png'}, new Uint8Array(),
      new Uint8Array(64 * 1024 * 1024 + 1), new Uint8Array([255,216,255,217])]) {
      expect(() => preparePngForClipboard(input)).toThrow();
    }
  });
});

describe('actual main context-menu privacy branch', () => {
  const main = fs.readFileSync(path.resolve('electron/main.ts'), 'utf8');
  const start = main.indexOf('          if(!getSettings().copyImageMetadata){');
  const end = main.indexOf('          void copyImageWithMetadata(params.srcURL).then', start);
  const branch = main.slice(start, end);
  it.each(['failed', 'unsupported', 'copied'])('never falls back to copyImageAt for %s OFF results', async status => {
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    const exports: Record<string, Function> = {};
    const body = `export function execute(params:any,win:any,getSettings:any,copyImageWithMetadata:any){${branch}}`;
    const code = ts.transpileModule(body, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInNewContext(code, {exports});
    const copyImageAt = vi.fn(), send = vi.fn(), copy = vi.fn().mockResolvedValue({status});
    exports.execute({srcURL:'nai-local://fixture',x:1,y:2}, {isDestroyed:()=>false,webContents:{copyImageAt,send}}, ()=>({copyImageMetadata:false}),copy);
    await new Promise(resolve => setTimeout(resolve,0));
    expect(copy).toHaveBeenCalledExactlyOnceWith('nai-local://fixture',false);
    expect(copyImageAt).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1]).toContain(status === 'copied' ? '已强力清除原数据' : '未写入未经清理的原图');
  });
});
