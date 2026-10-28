import fs from 'node:fs';
import path from 'node:path';

export const PROTECTED_DIRECTORY_KEYS = ['outputDir', 'onlineGalleryDownloadDir', 'backupDir', 'logDir'] as const;

/** Resolve existing ancestors as well, so junction aliases and not-yet-created subfolders are checked. */
export function canonicalDataPath(input: string): string {
  if (!path.isAbsolute(input)) throw new Error('保存目录必须是绝对路径。');
  let ancestor = path.resolve(input);
  const suffix: string[] = [];
  for (;;) {
    try { return path.resolve(fs.realpathSync.native(ancestor), ...suffix.reverse()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.push(path.basename(ancestor)); ancestor = parent;
    }
  }
}

export function isInstallationDataPath(directory: string, installDirectory: string): boolean {
  const inside = (root: string, target: string) => {
    const rel = path.relative(root, target);
    return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
  };
  // Both lexical location and physical target matter: an in-install junction itself is deleted on update.
  return inside(path.resolve(installDirectory), path.resolve(directory))
    || inside(canonicalDataPath(installDirectory), canonicalDataPath(directory));
}

export function assertSafeDataDirectory(directory: string, installDirectory: string): void {
  if (directory.trim()) canonicalDataPath(directory);
  if (directory.trim() && isInstallationDataPath(directory, installDirectory)) {
    throw new Error(`请选择软件安装目录以外的保存位置，例如系统“图片”目录；安装目录会在更新时被替换。\n${directory}`);
  }
}
