import fs from 'node:fs/promises';
import path from 'node:path';

export interface ComfyLocationPolicy {
  installDirectories: string[];
  temporaryDirectories: string[];
  userDataDirectory: string;
  forbiddenDirectories?: string[];
}
export interface ComfyLocationInspection { target: string; parent: string; existingEmpty: boolean; warnings: string[] }
function fold(value: string) { return process.platform === 'win32' ? value.toLowerCase() : value; }
export function locationContains(parent: string, child: string): boolean {
  const relative = path.relative(fold(parent), fold(child));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export async function assertNoComfyPathLinks(input: string): Promise<void> {
  const resolved = path.resolve(input), parsed = path.parse(resolved);
  let cursor = parsed.root;
  for (const segment of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error('COMFY_LOCATION_LINK');
      if (!stat.isDirectory() && cursor !== resolved) throw new Error('COMFY_LOCATION_PARENT');
      const real = await fs.realpath(cursor);
      // Also rejects Windows junctions and aliases not represented as a regular directory.
      if (fold(path.resolve(real)) !== fold(cursor)) throw new Error('COMFY_LOCATION_LINK');
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  }
}
export function defaultComfyEnvironmentRoot(softwareHome: string): string { return path.join(softwareHome, 'ComfyUI 环境'); }
function absoluteLocal(input: string): string {
  if (typeof input !== 'string' || !path.isAbsolute(input) || (process.platform==='win32'&&!/^[A-Za-z]:[\\/]/.test(input)) || /[\0\r\n]/.test(input) || /^(?:\\\\|\/\/|\\\?)/.test(input)) throw new Error('COMFY_LOCATION_LOCAL_ABSOLUTE');
  const target = path.resolve(input);
  for (const part of target.slice(path.parse(target).root.length).split(path.sep)) {
    if (!part || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)) throw new Error('COMFY_LOCATION_NAME');
  }
  return target;
}
async function canonicalAbsent(input: string): Promise<string> {
  let ancestor = input; const tail: string[] = [];
  for (;;) {
    try { return path.join(await fs.realpath(ancestor), ...tail.reverse()); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; const next = path.dirname(ancestor); if (next === ancestor) throw error; tail.push(path.basename(ancestor)); ancestor = next; }
  }
}
export async function assertSafeComfyLocation(input: string, policy: ComfyLocationPolicy, options: { allowExistingEmpty?: boolean } = {}): Promise<ComfyLocationInspection> {
  const target = absoluteLocal(input);
  await assertNoComfyPathLinks(target);
  const protectedRoots = [...policy.installDirectories, ...policy.temporaryDirectories, policy.userDataDirectory, ...(policy.forbiddenDirectories || [])].filter(Boolean);
  for (const value of protectedRoots) {
    const protectedRoot = await canonicalAbsent(absoluteLocal(value));
    if (locationContains(protectedRoot, target) || locationContains(target, protectedRoot)) throw new Error(`COMFY_LOCATION_PROTECTED: ${value}`);
  }
  const parent = await fs.realpath(path.dirname(target));
  if (! (await fs.stat(parent)).isDirectory()) throw new Error('COMFY_LOCATION_PARENT');
  let existingEmpty = false;
  try { const stat = await fs.lstat(target); if (!stat.isDirectory() || (await fs.readdir(target)).length !== 0) throw new Error('COMFY_LOCATION_NOT_EMPTY'); if(options.allowExistingEmpty===false)throw new Error('COMFY_LOCATION_EXISTS'); existingEmpty = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  return { target, parent, existingEmpty, warnings: /[^\x20-\x7e]/.test(target) ? ['COMFY_LOCATION_UNICODE'] : [] };
}
