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

/** Strictly read the separate Comfy store; never touch accounts or repair files here. */
export function comfyUpdateProtectedPaths(userData: string): string[] {
  const directory = path.join(userData, 'comfyui-local');
  const paths: string[] = [];
  const add = (value: unknown) => {
    if (value == null || value === '') return;
    if (typeof value !== 'string' || !path.isAbsolute(value) || (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(value)) || /[\0\r\n]/.test(value)) throw new Error('更新已停止：ComfyUI 保存路径格式无效。');
    paths.push(value);
  };
  const read = (name: string): unknown => {
    const primary = path.join(directory, name);
    let present = false;
    for (const file of [primary, primary + '.bak']) {
      if (!fs.existsSync(file)) continue;
      present = true;
      try {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('invalid file');
        const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!envelope || envelope.version !== 1 || (!Object.hasOwn(envelope, 'data') || envelope.data === null)) throw new Error('invalid envelope');
        return envelope.data;
      } catch { /* A valid backup may still protect the previous environment. */ }
    }
    if (present) throw new Error(`更新已停止：无法核验 ComfyUI ${name}，原文件未改动。`);
    return null;
  };
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('更新已停止：ComfyUI 数据目录为链接。');
  if (fs.existsSync(directory)) add(directory);
  const settings = read('settings.json') as Record<string, any> | null;
  if (settings !== null) {
    if (typeof settings !== 'object' || Array.isArray(settings)) throw new Error('更新已停止：ComfyUI 设置格式无效。');
    if (settings.install != null && (typeof settings.install !== 'object' || Array.isArray(settings.install))) throw new Error('Invalid ComfyUI install settings');
    for (const key of ['root', 'cwd', 'python', 'mainPy']) add(settings.install?.[key]);
    add(settings.outputDirectory);
  }
  const registry = read('environments.json') as Record<string, any> | null;
  if (registry !== null) {
    if (typeof registry !== 'object' || !Array.isArray(registry.environments)) throw new Error('更新已停止：ComfyUI 环境登记格式无效。');
    add(registry.selectedRoot);
    for (const item of registry.environments) { if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('\u66f4\u65b0\u5df2\u505c\u6b62: invalid ComfyUI environment'); for (const key of ['root', 'python', 'launcherPath', 'modelDirectory']) add(item?.[key]); }
  }
  const results = read('results.json');
  if (results !== null) {
    if (!Array.isArray(results)) throw new Error('更新已停止：ComfyUI 结果格式无效。');
    for (const item of results) { if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('\u66f4\u65b0\u5df2\u505c\u6b62: invalid ComfyUI result'); add(item.filePath); }
  }
  return [...new Set(paths)];
}

/** Shallow bounded inspection also covers unregistered bundles placed in app/. */
export function nestedComfyData(installDirectory: string): string[] {
  if (!fs.existsSync(installDirectory)) return [];
  const risks: string[] = [], queue = [{ directory: installDirectory, depth: 0 }];
  let examined = 0;
  while (queue.length) {
    const { directory, depth } = queue.shift()!;
    if (fs.existsSync(path.join(directory, 'main.py')) && fs.existsSync(path.join(directory, 'comfy'))) risks.push(directory);
    if (fs.existsSync(path.join(directory, 'python_embeded', 'python.exe'))) risks.push(directory);
    if (depth >= 2) continue;
    const handle = fs.opendirSync(directory);
    try {
      for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
        if (++examined > 4096) throw new Error('更新已停止：安装目录检查超出安全上限，请先核查嵌套环境。');
        const child = path.join(directory, entry.name), stat = fs.lstatSync(child);
        if (stat.isSymbolicLink()) { risks.push(child); continue; }
        if (stat.isDirectory()) queue.push({ directory: child, depth: depth + 1 });
      }
    } finally { handle.closeSync(); }
  }
  return risks;
}

export function assertUpdateOutputProtection(installDirectory: string, data: unknown, options: { installerMigratesWorkspace?: boolean; comfyUserData?: string } = {}): void {
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
    // Only callers using the new verified-backup installer may defer this check.
    // Images/settings/history remain protected; this is not a global bypass.
    if (name === 'LangbaiWorkspace' && options.installerMigratesWorkspace) continue;
    const legacy = path.join(installDirectory, name);
    if (fs.existsSync(legacy) && fs.readdirSync(legacy).length) risky.push(legacy);
  }
  if (options.comfyUserData) for (const value of comfyUpdateProtectedPaths(options.comfyUserData)) {
    if (isInstallationDataPath(value, installDirectory)) risky.push(value);
  }
  risky.push(...nestedComfyData(installDirectory));
  if (risky.length) throw new Error(outputProtectionMessage(risky));
}
