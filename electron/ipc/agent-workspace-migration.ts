import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { canonicalDataPath, isInstallationDataPath } from './update-output-protection';
import { AGENT_WORKSPACE_VERSION } from '../../src/agent/types';

export interface WorkspaceFile { path: string; size: number; sha256: string }
export interface WorkspaceReceipt {
  version: 1; id: string; sourcePath: string; createdAt: string;
  files: WorkspaceFile[]; directories: string[];
}
interface LocationState {
  version: 1; activeId: string; applied: string[]; sourcePath: string;
}
export const WORKSPACE_MIGRATIONS = 'workspace-migrations';
export const WORKSPACE_LOCATION = 'workspace-location.json';

function hash(file: string) {
  const digest=crypto.createHash('sha256'), fd=fs.openSync(file,'r'), buffer=Buffer.allocUnsafe(1024*1024);
  try { for (;;) { const count=fs.readSync(fd,buffer,0,buffer.length,null); if(!count)break; digest.update(buffer.subarray(0,count)); } }
  finally { fs.closeSync(fd); }
  return digest.digest('hex');
}
function writeAtomic(file: string, value: unknown) {
  const pending = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(pending, JSON.stringify(value, null, 2), { flag: 'wx' });
  fs.renameSync(pending, file);
}
function relativeFile(root: string, name: string) {
  if (!name || name.includes('\\') || name.includes(':') || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error('酒馆迁移文件路径无效。');
  }
  const file = path.join(root, ...name.split('/'));
  let current = file;
  while (current !== path.dirname(root)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('酒馆迁移目录含有链接，请先保留数据并检查路径。');
    if (current === root) break;
    current = path.dirname(current);
  }
  return file;
}
export function inventoryWorkspace(root: string): Pick<WorkspaceReceipt, 'files' | 'directories'> {
  if (fs.lstatSync(root).isSymbolicLink() || canonicalDataPath(root) !== path.resolve(root)) throw new Error('酒馆迁移不跟随目录链接。');
  const files: WorkspaceFile[] = [], directories: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name), name = path.relative(root, file).split(path.sep).join('/');
      if (entry.isSymbolicLink()) throw new Error('酒馆迁移不跟随文件链接。');
      if (entry.isDirectory()) { directories.push(name); visit(file); }
      else if (entry.isFile()) files.push({ path: name, size: fs.statSync(file).size, sha256: hash(file) });
      else throw new Error('酒馆迁移发现不支持的文件类型。');
    }
  };
  visit(root);
  files.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0); directories.sort();
  return { files, directories };
}
function sameInventory(a: Pick<WorkspaceReceipt, 'files'|'directories'>, b: Pick<WorkspaceReceipt, 'files'|'directories'>) {
  const normalize = (v: typeof a) => JSON.stringify({ files: [...v.files].sort((x,y) => x.path < y.path ? -1 : x.path > y.path ? 1 : 0), directories: [...v.directories].sort() });
  return normalize(a) === normalize(b);
}
function receiptAt(root: string, id: string): WorkspaceReceipt {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('酒馆迁移标识无效。');
  const value = JSON.parse(fs.readFileSync(relativeFile(root, `${id}/receipt.json`), 'utf8').replace(/^\uFEFF/, '')) as WorkspaceReceipt;
  if (value.version !== 1 || value.id !== id || !path.isAbsolute(value.sourcePath) || !Array.isArray(value.files) || !Array.isArray(value.directories)) throw new Error('酒馆迁移记录无效。');
  for (const f of value.files) {
    relativeFile(path.join(root,id,'original'),f.path);
    if (!/^[a-f0-9]{64}$/i.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 0) throw new Error('酒馆迁移校验值无效。');
  }
  for (const d of value.directories) relativeFile(path.join(root,id,'original'),d);
  return value;
}
function copyInventory(source: string, destination: string, inventory: Pick<WorkspaceReceipt,'files'|'directories'>) {
  fs.mkdirSync(destination, { recursive: true });
  for (const dir of inventory.directories) fs.mkdirSync(relativeFile(destination,dir), { recursive: true });
  for (const file of inventory.files) {
    const target = relativeFile(destination,file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(relativeFile(source,file.path), target, fs.constants.COPYFILE_EXCL);
  }
  if (!sameInventory(inventory,inventoryWorkspace(destination))) throw new Error('酒馆数据备份校验失败，原数据未改变。');
}

function assertReadableWorkspace(root: string) {
  for (const name of ['agent-workspace.json','agent-workspace.json.bak','agent-workspace.json.bak2']) {
    let value: { version?: unknown; conversations?: unknown };
    try { value=JSON.parse(fs.readFileSync(path.join(root,name),'utf8')); }
    catch { continue; }
    // A parseable incompatible primary must not reach the store's legacy-reset branch.
    if (value?.version === AGENT_WORKSPACE_VERSION && Array.isArray(value.conversations)) return;
    throw new Error('酒馆备份格式与当前版本不一致，原始备份已保留，未创建空工作区。');
  }
  throw new Error('酒馆主文件与备份均未通过读取校验，原始备份已保留。');
}

/** Never edits/removes the legacy workspace, and never overwrites another profile. */
export function snapshotLegacyWorkspace(source: string, userData: string): WorkspaceReceipt {
  const root = path.join(userData, WORKSPACE_MIGRATIONS);
  const inventory = inventoryWorkspace(source);
  fs.mkdirSync(root,{recursive:true});
  for (const id of fs.readdirSync(root)) {
    if (!fs.existsSync(path.join(root,id,'receipt.json'))) continue;
    const previous = receiptAt(root,id);
    if (path.resolve(previous.sourcePath) === path.resolve(source) && sameInventory(previous,inventory)
      && sameInventory(previous,inventoryWorkspace(path.join(root,id,'original')))) return previous;
  }
  const receipt: WorkspaceReceipt = {version:1,id:crypto.randomUUID(),sourcePath:path.resolve(source),createdAt:new Date().toISOString(),...inventory};
  const original = path.join(root,receipt.id,'original');
  copyInventory(source,original,inventory);
  if (!sameInventory(inventory,inventoryWorkspace(source))) throw new Error('备份过程中酒馆数据发生变化，请关闭旧版后重试。');
  writeAtomic(path.join(root,receipt.id,'receipt.json'),receipt);
  return receipt;
}

export function resolveSafeWorkspace(userData: string, install: string | undefined, legacySources: string[]) {
  if (install && isInstallationDataPath(userData,install)) throw new Error('应用数据目录位于安装目录内，请先保留数据并更换数据目录。');
  fs.mkdirSync(userData,{recursive:true});
  const root = path.join(userData, WORKSPACE_MIGRATIONS), stateFile = path.join(userData, WORKSPACE_LOCATION);
  let state: LocationState | undefined;
  if (fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile,'utf8')) as LocationState;
    if (state.version !== 1 || !Array.isArray(state.applied) || !/^[a-f0-9-]{36}$/i.test(state.activeId)) throw new Error('酒馆存储位置记录损坏，已停止读取以保护数据。');
  }
  const readReceipts = () => fs.existsSync(root) ? fs.readdirSync(root).filter(id => fs.existsSync(path.join(root,id,'receipt.json'))).map(id => receiptAt(root,id)) : [];
  let receipts = readReceipts();
  if (!state && !receipts.length) {
    const source = legacySources.find(dir => fs.existsSync(dir) && fs.readdirSync(dir).length);
    if (source) { snapshotLegacyWorkspace(source,userData); receipts=readReceipts(); }
  }
  const pending = receipts.filter(r => !state?.applied.includes(r.id)).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  const newest = pending.at(-1);
  let migrated = false;
  if (newest) {
    const base = path.join(root,newest.id), original = path.join(base,'original'), active = path.join(base,'active');
    if (!sameInventory(newest,inventoryWorkspace(original))) throw new Error('酒馆迁移备份校验失败，已停止以保护原数据。');
    assertReadableWorkspace(original);
    if (!fs.existsSync(active)) {
      const staging = path.join(base,`active-${crypto.randomUUID()}.tmp`);
      copyInventory(original,staging,newest);
      fs.renameSync(staging,active);
    } else if (!sameInventory(newest,inventoryWorkspace(active))) {
      throw new Error('待启用的酒馆工作区与备份不一致，已保留两者并停止迁移。');
    }
    state={version:1,activeId:newest.id,sourcePath:newest.sourcePath,applied:[...new Set([...(state?.applied ?? []),...pending.map(r=>r.id)])]};
    writeAtomic(stateFile,state); migrated=true;
  }
  const target = state ? path.join(root,state.activeId,'active') : path.join(userData,'LangbaiWorkspace');
  if (state && !fs.existsSync(target)) throw new Error('酒馆工作区缺失；请使用保留的迁移备份恢复，不会创建空会话覆盖记录。');
  fs.mkdirSync(target,{recursive:true});
  if (canonicalDataPath(target) !== path.resolve(target)) throw new Error('酒馆存储路径含有目录链接。');
  return {path:target,installAdjacent:false,migratedFromLegacy:migrated,
    ...(state ? {migrationId:state.activeId,backupPath:path.join(root,state.activeId,'original'),sourcePath:state.sourcePath} : {})};
}
