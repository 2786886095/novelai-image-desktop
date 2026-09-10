import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PersistedData } from './store';
import { toLocalMediaUrl } from './local-media-protocol';
import { canonicalDataPath, isInstallationDataPath } from './update-output-protection';

function within(root: string, value: string) {
  const rel = path.relative(root, value);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
function digest(file: string) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let length: number;
    while ((length = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

/** Verify every file, preserve collisions and never follow directory links or delete sources. */
export function copyRecoveryTree(source: string, destination: string, mapped = new Map<string, string>()) {
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error('恢复目录含链接，请先复制到独立目录。');
  fs.mkdirSync(destination, { recursive: true });
  if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('恢复位置含链接，请更换位置。');
  let count = 0;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    let to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error('恢复目录含链接，请先复制到独立目录。');
    if (entry.isDirectory()) { count += copyRecoveryTree(from, to, mapped); continue; }
    if (!entry.isFile()) throw new Error('恢复目录包含非普通文件。');
    const hash = digest(from);
    if (fs.existsSync(to) && (fs.lstatSync(to).isSymbolicLink() || !fs.statSync(to).isFile() || digest(to) !== hash)) {
      const ext = path.extname(to);
      to = path.join(destination, `${path.basename(to, ext)}.recovered-${hash}${ext}`);
    }
    if (fs.existsSync(to)) {
      if (fs.lstatSync(to).isSymbolicLink() || !fs.statSync(to).isFile() || digest(to) !== hash) throw new Error('恢复文件名冲突，原文件已保留。');
    } else fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    if (digest(to) !== hash || digest(from) !== hash) throw new Error('恢复校验失败，原位置继续保留。');
    mapped.set(path.resolve(from), to); count++;
  }
  return count;
}

export function migrateInstalledOutputData(data: PersistedData, oldRoot: string, newRoot: string, backupRoot?: string, installRoot?: string) {
  const unchanged = { data, changed: false, copied: false };
  const configured = data.settings.outputDir;
  if (typeof configured !== 'string' || !configured.trim() || !path.isAbsolute(configured)) return unchanged;
  let source = oldRoot; let target = newRoot;
  const legacy = within(oldRoot, configured);
  if (!legacy && (!installRoot || !isInstallationDataPath(configured, installRoot))) return unchanged;
  if (!legacy) { source = configured; target = path.join(newRoot, 'Recovered', path.basename(configured)); }
  const sources = [source, ...(legacy && backupRoot ? [backupRoot] : [])].filter(p => fs.existsSync(p));
  const mapped = new Map<string, string>();
  let copiedFiles = 0;
  try {
    if (installRoot && path.resolve(configured).toLowerCase() === path.resolve(installRoot).toLowerCase()) throw new Error('输出目录是安装目录本身，请把图片单独复制到外部文件夹后重新选择输出目录。');
    if (installRoot && isInstallationDataPath(target, installRoot)) throw new Error('恢复目标仍在安装目录内，请更换系统图片位置。');
    if (within(source, target) || within(target, source) || within(canonicalDataPath(source), canonicalDataPath(target)) || within(canonicalDataPath(target), canonicalDataPath(source))) throw new Error('恢复位置与原位置重叠。');
    if (!sources.length) throw new Error('原目录和更新备份均未找到；请检查其他备份，不会把空目录当作已恢复。');
    // A rescued outputs subtree keeps its configured relative location.
    for (const from of sources) copiedFiles += copyRecoveryTree(from, target, mapped);
    const nextDir = legacy ? path.join(target, path.relative(oldRoot, configured)) : target;
    fs.mkdirSync(nextDir, { recursive: true });
    const history = data.history.map(item => {
      if (!item.filePath || !within(source, item.filePath)) return item;
      const relative = path.relative(source, item.filePath);
      const nextPath = mapped.get(path.resolve(item.filePath))
        ?? (legacy && backupRoot ? mapped.get(path.resolve(backupRoot, relative)) : undefined);
      return nextPath ? { ...item, filePath: nextPath, fileUrl: toLocalMediaUrl(nextPath) } : item;
    });
    return { data: { ...data, history, settings: { ...data.settings, outputDir: nextDir,
      protectedOutputPaths: [...new Set([...(data.settings.protectedOutputPaths ?? []), source])],
      outputMigrationNotice: { id: crypto.randomUUID(), status: 'recovered' as const, sourcePaths: sources, targetPath: nextDir, copiedFiles } } }, changed: true, copied: copiedFiles > 0 };
  } catch (error) {
    return { data: { ...data, settings: { ...data.settings,
      outputMigrationNotice: { id: crypto.randomUUID(), status: 'failed' as const, sourcePaths: sources.length ? sources : [source], targetPath: target, copiedFiles,
        error: error instanceof Error ? error.message : String(error) } } }, changed: true, copied: false };
  }
}
