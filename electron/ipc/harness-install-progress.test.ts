import {afterEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {installVerifiedBundle, type HarnessManifest} from './harness-policy';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('studio-copy-test-'))
      await fs.rm(root, {recursive: true, force: true});
  }
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-copy-test-')); roots.push(root);
  const source = path.join(root, 'source'), target = path.join(root, 'target');
  const files: Record<string,string> = {};
  for (let i = 0; i < 32; i++) {
    const name = `shared/${i}.js`, content = `fixture-${i}`;
    await fs.mkdir(path.dirname(path.join(source, name)), {recursive: true});
    await fs.writeFile(path.join(source, name), content);
    files[name] = crypto.createHash('sha256').update(content).digest('hex');
  }
  const manifest: HarnessManifest = {format:1, protocol:1, version:'0.1.0', upstream:'test', platform:process.platform,
    arch:process.arch, node:'shared/0.js', cli:'shared/1.js', files};
  return {source, target, manifest};
}
describe('verified component preparation', () => {
  it('copies exact bytes and reports monotonic progress through completion', async () => {
    const {source, target, manifest} = await fixture(); const done: number[] = [];
    await installVerifiedBundle(source, target, manifest, new AbortController().signal, n => done.push(n));
    expect(done).toEqual(Array.from({length: 33}, (_, i) => i));
    for (const name of Object.keys(manifest.files))
      expect(await fs.readFile(path.join(target, name))).toEqual(await fs.readFile(path.join(source, name)));
  });
  it('rejects corrupted source and does not claim 100 percent', async () => {
    const {source, target, manifest} = await fixture(); const progress = vi.fn();
    await fs.writeFile(path.join(source, 'shared/0.js'), 'corrupt');
    await expect(installVerifiedBundle(source, target, manifest, new AbortController().signal, progress)).rejects.toThrow('integrity mismatch');
    expect(progress).not.toHaveBeenCalledWith(32,32);
  });
  it('drains workers on cancellation so no writes continue after return', async () => {
    const {source, target, manifest} = await fixture(); const controller = new AbortController();
    await expect(installVerifiedBundle(source, target, manifest, controller.signal, done => {
      if (done === 1) controller.abort();
    })).rejects.toThrow();
    const before = await fs.readdir(target, {recursive:true});
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(await fs.readdir(target, {recursive:true})).toEqual(before);
    expect(before.filter(n => n.endsWith('.js')).length).toBeLessThan(32);
  });
});
