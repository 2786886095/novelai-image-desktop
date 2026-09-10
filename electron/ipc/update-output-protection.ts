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

export function outputProtectionMessage(paths: string[]): string {
  return `更新已停止：以下用户数据目录位于软件安装目录内，更新会清理该位置。请先把文件复制到安装目录以外，核对图片完整，再在设置中更改输出/下载目录后重试。安装目录下的旧 outputs / LangbaiWorkspace 也需保存到外部并移出安装目录；酒馆可先导出工作区。原文件未移动或删除。\n${[...new Set(paths)].join('\n')}`;
}

export function assertSafeDataDirectory(directory: string, installDirectory: string): void {
  if (directory.trim()) canonicalDataPath(directory);
  if (directory.trim() && isInstallationDataPath(directory, installDirectory)) {
    throw new Error(`请选择软件安装目录以外的保存位置，例如系统“图片”目录；安装目录会在更新时被替换。\n${directory}`);
  }
}

export function assertUpdateOutputProtection(installDirectory: string, data: unknown): void {
  if (!data || typeof data !== 'object') throw new Error('更新已停止：读取图片保存设置失败。');
  const record = data as Record<string, unknown>;
  const settings = record.settings as Record<string, unknown> | undefined;
  if (!settings || typeof settings !== 'object') throw new Error('更新已停止：图片保存设置格式无效。');
  const risky: string[] = [];
  for (const key of PROTECTED_DIRECTORY_KEYS) {
    const value = settings[key];
    if (value != null && typeof value !== 'string') throw new Error('更新已停止：保存目录设置格式无效，请重新选择目录。');
    if (typeof value === 'string' && value.trim() && isInstallationDataPath(value, installDirectory)) risky.push(value);
  }
  for (const source of Array.isArray(settings.protectedOutputPaths) ? settings.protectedOutputPaths : []) {
    if (typeof source === 'string' && fs.existsSync(source) && isInstallationDataPath(source, installDirectory)) risky.push(source);
  }
  // Old output directories still containing images must not be lost just because the setting changed.
  for (const item of Array.isArray(record.history) ? record.history : []) {
    if (item && typeof item.filePath === 'string' && fs.existsSync(item.filePath)
        && isInstallationDataPath(item.filePath, installDirectory)) risky.push(path.dirname(item.filePath));
  }
  for (const name of ['outputs', 'LangbaiWorkspace']) {
    const legacy = path.join(installDirectory, name);
    if (fs.existsSync(legacy) && fs.readdirSync(legacy).length) risky.push(legacy);
  }
  if (risky.length) throw new Error(outputProtectionMessage(risky));
}
