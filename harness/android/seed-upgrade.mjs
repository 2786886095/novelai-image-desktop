import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

async function exists(file) {
  try { return await fs.lstat(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// Compare the WHOLE package, including extra/deleted files. Links are never
// followed: a linked/custom package is retained for the real compatibility probe.
export async function seedDigest(root) {
  if (!await exists(root)) return null;
  const hash = createHash('sha256');
  async function walk(file, relative) {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) return false;
    hash.update(JSON.stringify([relative, stat.isDirectory() ? 'dir' : 'file', stat.mode & 0o111]));
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(file)).sort()) {
        if (!await walk(path.join(file, name), `${relative}/${name}`)) return false;
      }
    } else if (stat.isFile()) {
      hash.update(createHash('sha256').update(await fs.readFile(file)).digest());
    } else return false;
    return true;
  }
  return await walk(root, '') ? hash.digest('hex') : null;
}

// previous is supplied ONLY for isolated probe/activation staging homes. Normal
// startup remains copy-if-missing. The launcher switches homes only after the
// complete staged migration succeeds, and retains the original for rollback.
export async function seedEntry(from, to, previous = null) {
  const present = await exists(to);
  if (present) {
    if (!previous || present.isSymbolicLink()) return 'retained';
    const original = await seedDigest(previous);
    if (!original || await seedDigest(to) !== original) return 'retained';
    if (await seedDigest(from) === original) return 'retained';
  }
  await fs.mkdir(path.dirname(to), {recursive: true});
  const id = randomUUID(), staged = `${to}.seed-${id}`, saved = `${to}.prior-${id}`;
  let moved = false;
  try {
    await fs.cp(from, staged, {recursive: true, dereference: false, errorOnExist: true, force: false});
    if (present) { await fs.rename(to, saved); moved = true; }
    try { await fs.rename(staged, to); }
    catch (error) { if (moved) { await fs.rename(saved, to); moved = false; } throw error; }
    if (moved) await fs.rm(saved, {recursive: true, force: true});
    return present ? 'updated' : 'copied';
  } finally {
    await fs.rm(staged, {recursive: true, force: true});
  }
}
