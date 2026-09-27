import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import legacy from '../../harness/legacy-plugin-hashes.json';
import {safeBundlePath, type HarnessManifest} from './harness-policy';

/** Recover known pre-manifest bundled plugins, never infer that an unknown edit is disposable. */
export async function planLegacyPluginRepair(root: string, next: HarnessManifest,
  catalog: Record<string, Record<string, string>[]> = legacy) {
  const files = {...next.files};
  const packages: string[] = [];
  for (const [prefix, baselines] of Object.entries(catalog)) {
    const name = prefix.startsWith('community/packages/') ? prefix.slice(19, -1)
      : prefix === 'plugins/studio-library/' ? '@langbai/dsh-studio-library' : '';
    if (!name || !/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name)) continue;
    const home = path.join(root, 'user-home/profiles/node_modules');
    const directory = path.join(home, name);
    let linked = false;
    for (let dir = directory; dir !== home; dir = path.dirname(dir)) {
      try { if ((await fs.lstat(dir)).isSymbolicLink()) linked = true; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    if (linked) continue;
    const actual: Record<string, string> = {};
    const queue = [directory]; let unknown = false;
    while (queue.length && !unknown) {
      const dir = queue.pop()!; let entries;
      try { entries = await fs.readdir(dir, {withFileTypes: true}); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') break; throw e; }
      for (const entry of entries) {
        const file = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) { unknown = true; break; }
        if (entry.isDirectory()) queue.push(file);
        else if (entry.isFile()) actual[path.relative(directory, file).split(path.sep).join('/')] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
        else { unknown = true; break; }
      }
    }
    if (unknown) continue;
    const baseline = baselines.find(candidate => Object.keys(candidate).length === Object.keys(actual).length &&
      Object.entries(candidate).every(([name, hash]) => actual[name] === hash));
    if (!baseline) continue;
    const target = Object.fromEntries(Object.entries(next.files).filter(([name]) => name.startsWith(prefix)).map(([name, hash]) => [name.slice(prefix.length), hash]));
    if (!Object.keys(target).length || (Object.keys(target).length === Object.keys(actual).length && Object.entries(target).every(([name, hash]) => actual[name] === hash))) continue;
    for (const name of Object.keys(files)) if (name.startsWith(prefix)) delete files[name];
    for (const [name, hash] of Object.entries(baseline)) { safeBundlePath(root, prefix + name); files[prefix + name] = hash; }
    packages.push(name);
  }
  return {packages, before: {...next, files}};
}
