import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const HARNESS_PROTOCOL = 1;
export function isNewerBundle(candidate: string, current: string) {
  const valid=/^(\d+)\.(\d+)\.(\d+)(?:-([a-z0-9.-]+))?$/i;
  const a=valid.exec(candidate),b=valid.exec(current);if(!a||!b)return false;
  for(let i=1;i<=3;i++)if(Number(a[i])!==Number(b[i]))return Number(a[i])>Number(b[i]);
  if(a[4]===b[4])return false;if(!a[4])return true;if(!b[4])return false;
  const x=a[4].split('.'),y=b[4].split('.');for(let i=0;i<Math.max(x.length,y.length);i++){
    if(x[i]===y[i])continue;if(x[i]===undefined)return false;if(y[i]===undefined)return true;
    const an=/^\d+$/.test(x[i]),bn=/^\d+$/.test(y[i]);if(an&&bn)return Number(x[i])>Number(y[i]);if(an!==bn)return !an;return x[i]>y[i];
  }return false;
}
export interface HarnessManifest {
  format: 1; protocol: 1; version: string; upstream: string;
  platform: string; arch: string; node: string; cli: string;
  files: Record<string, string>;
}
export function safeBundlePath(root: string, relative: string) {
  if (!relative || relative.includes('\\') || relative.includes(':') || relative.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('Invalid component path');
  const result = path.resolve(root, relative);
  if (!result.startsWith(path.resolve(root) + path.sep)) throw new Error('Component path escapes destination');
  return result;
}
export function validateManifest(value: unknown, platform = process.platform, arch: string = process.arch): HarnessManifest {
  const m = value as HarnessManifest;
  if (!m || m.format !== 1 || m.protocol !== HARNESS_PROTOCOL || m.platform !== platform || m.arch !== arch ||
      !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(m.version) || !m.upstream ||
      !m.files || typeof m.files !== 'object' || Array.isArray(m.files) ||
      typeof m.node !== 'string' || typeof m.cli !== 'string') throw new Error('Agent component is not compatible with this app/platform');
  for (const [name, hash] of Object.entries(m.files)) {
    safeBundlePath(path.resolve('bundle'), name);
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid component digest');
  }
  if (!m.files[m.node] || !m.files[m.cli]) throw new Error('Missing engine entry points');
  return m;
}
export async function verifyBundle(root: string, manifest: HarnessManifest, signal?: AbortSignal) {
  for (const [name, expected] of Object.entries(manifest.files)) {
    signal?.throwIfAborted();
    const file = safeBundlePath(root, name);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid component file: ${name}`);
    const actual = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    if (actual !== expected) throw new Error(`Component integrity mismatch: ${name}`);
  }
}
/** Copy verified bytes into a new, unpublished slot with bounded I/O concurrency. */
export async function installVerifiedBundle(source: string, destination: string, manifest: HarnessManifest,
  signal: AbortSignal, progress: (done: number, total: number) => void) {
  const entries = Object.entries(manifest.files);
  const directories = new Map<string, Promise<unknown>>();
  let next = 0, completed = 0;
  let failed = false, failure: unknown;
  signal.throwIfAborted();
  progress(0, entries.length);
  const worker = async () => {
    try {
      while (!failed && next < entries.length) {
        signal.throwIfAborted();
        const [name, expected] = entries[next++];
        const input = safeBundlePath(source, name), output = safeBundlePath(destination, name);
        const stat = await fs.lstat(input);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid component file: ${name}`);
        const bytes = await fs.readFile(input, {signal});
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
          throw new Error(`Component integrity mismatch: ${name}`);
        const directory = path.dirname(output);
        if (!directories.has(directory)) directories.set(directory, fs.mkdir(directory, {recursive: true}));
        await directories.get(directory);
        signal.throwIfAborted();
        if (failed) return;
        await fs.writeFile(output, bytes, {flag: 'wx', signal});
        // Verify the written file too; a slot is never activated with partial/corrupt data.
        const written = await fs.readFile(output, {signal});
        if (crypto.createHash('sha256').update(written).digest('hex') !== expected)
          throw new Error(`Component integrity mismatch: ${name}`);
        signal.throwIfAborted();
        if (!failed) progress(++completed, entries.length);
      }
    } catch (error) {
      if (!failed) { failed = true; failure = error; }
    }
  };
  // Drain all workers before returning, including cancellation/error paths.
  await Promise.all(Array.from({length: Math.min(8, entries.length)}, worker));
  if (failed) throw failure;
  signal.throwIfAborted();
}
export function redactHarnessLog(value: string) {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/https?:\/\/127\.0\.0\.1:\d+[^\s]*/g, '[本地 Agent 地址]')
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password)\s*["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi, '$1[redacted]')
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, '[redacted]');
}
export function engineLaunchUrl(text: string) {
  const match = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').match(/http:\/\/127\.0\.0\.1:\d+[^\s<>"']*/g);
  if (!match?.length) return null;
  const url = new URL(match[match.length - 1]);
  return url.hostname === '127.0.0.1' && Number(url.port) > 0 ? url.toString() : null;
}
