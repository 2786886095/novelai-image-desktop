import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ComfyInstallInspection, ComfyLocalConfig } from '../../src/comfyui/contract';
import type { ComfyManagedEnvironment, ComfySetupState } from '../../src/comfyui/setup-contract';
import { discoverComfyEnvironments, discoverConfiguredComfyEnvironments } from './comfyui-discovery';
import { installComfyPackage, COMFY_ENVIRONMENT_MARKER, type ComfyInstallFailure } from './comfyui-installer';
import { assertSafeComfyLocation, type ComfyLocationPolicy } from './comfyui-location-policy';
import { assertSafeDataDirectory } from './update-output-protection';

export const COMFY_OFFICIAL_ACQUISITION_PAGE = 'https://www.bilibili.com/read/cv31254871/';
interface Registry { schema: 1; selectedRoot: string; environments: ComfyManagedEnvironment[] }
export interface ComfySetupOptions {
  userData: string;
  softwareHome: string;
  policy: ComfyLocationPolicy;
  discoveryRoots: string[];
  desktopDirectory: string;
  platform?: NodeJS.Platform;
  executorPath?: string;
  configurationLocked?: () => boolean;
  /** Main service only: no renderer paths and no help/probe execution. */
  configuredInstall?: () => Promise<ComfyInstallInspection | null>;
  chooseDirectory(kind: 'target' | 'discovery'): Promise<string | null>;
  chooseArchive(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  adopt(root: string, python: string): Promise<ComfyLocalConfig>;
  writeShortcut(file: string, options: { target: string; cwd: string; icon: string; iconIndex: number; description: string }): boolean;
  readShortcut(file: string): { target: string; cwd?: string };
}
const active = (state: ComfySetupState) => ['hashing', 'preflight', 'extracting', 'validating'].includes(state.phase);
function validId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('COMFY_SETUP_INVALID_ID');
}
function localFile(file: string): fs.Stats {
  if (!path.isAbsolute(file) || /^(?:\\\\|\/\/)/.test(file) || /[\0\r\n]/.test(file)) throw new Error('COMFY_SETUP_LOCAL_PATH');
  for (let current = file; ; current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('COMFY_SETUP_LINK_REFUSED');
    if (path.dirname(current) === current) break;
  }
  const stat = fs.statSync(file);
  if (!stat.isFile()) throw new Error('COMFY_SETUP_FILE_REQUIRED');
  return stat;
}
async function shaFile(file: string, signal?: AbortSignal, progress?: (bytes: number) => void): Promise<string> {
  const hash = createHash('sha256'); let bytes = 0;
  const stream = fs.createReadStream(file, { signal });
  for await (const chunk of stream) { hash.update(chunk); bytes += chunk.length; progress?.(bytes); }
  return hash.digest('hex');
}
/** Managed installation is separate from the active Comfy process and account store. */
export class ComfySetupController {
  private readonly events = new EventEmitter();
  private readonly state: ComfySetupState;
  private initialized: Promise<void> | null = null;
  private archivePath: string | null = null;
  private archiveStamp: { size: number; mtimeMs: number; ino: number } | null = null;
  private abort: AbortController | null = null;
  private pending: Promise<unknown> | null = null;
  private closed = false;
  private choosing = false;
  private extraDiscoveryRoot: string | null = null;
  private readonly registryFile: string;
  constructor(private readonly options: ComfySetupOptions) {
    const defaultRoot = path.join(options.softwareHome, 'ComfyUI 环境');
    this.registryFile = path.join(options.userData, 'comfyui-local', 'environments.json');
    this.state = { supported: (options.platform || process.platform) === 'win32', defaultRoot, selectedRoot: defaultRoot,
      rootsChecked: [], discovery: null, package: null, phase: 'idle', jobId: null, message: null,
      progress: null, environments: [], installed: null, shortcutPath: null };
  }
  onEvent(callback: (state: ComfySetupState) => void): () => void { this.events.on('state', callback); return () => this.events.off('state', callback); }
  private emit(): void { const state = structuredClone(this.state); for (const callback of this.events.listeners('state')) { try { callback(state); } catch { /* closed renderer */ } } }
  private async initialize(): Promise<void> {
    this.initialized ??= (async () => {
      if (!fs.existsSync(this.registryFile)) return;
      const stat = localFile(this.registryFile);
      if (stat.size > 4 * 1024 * 1024) throw new Error('COMFY_SETUP_REGISTRY_LIMIT');
      const record = JSON.parse(await fsp.readFile(this.registryFile, 'utf8'));
      const data = record?.data as Registry;
      if (record?.version !== 1 || data?.schema !== 1 || !path.isAbsolute(data.selectedRoot)
        || !Array.isArray(data.environments) || data.environments.length > 100) throw new Error('COMFY_SETUP_REGISTRY_INVALID');
      for (const env of data.environments) {
        validId(env?.id);
        if (![env.root, env.python, env.launcherPath].every(x => typeof x === 'string' && path.isAbsolute(x))
          || !/^[a-f0-9]{64}$/.test(env.launcherSha256)) throw new Error('COMFY_SETUP_REGISTRY_INVALID');
      }
      this.state.selectedRoot = data.selectedRoot; this.state.environments = data.environments;
    })();
    return this.initialized;
  }
  private async persist(): Promise<void> {
    if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
    const directory = path.dirname(this.registryFile);
    await fsp.mkdir(this.options.userData, { recursive: true });
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('COMFY_SETUP_LINK_REFUSED');
    await fsp.mkdir(directory, { recursive: true });
    if (fs.existsSync(this.registryFile)) localFile(this.registryFile);
    const temporary = path.join(directory, `.environments-${randomUUID()}.tmp`);
    const data: Registry = { schema: 1, selectedRoot: this.state.selectedRoot, environments: this.state.environments };
    await fsp.writeFile(temporary, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), data }, null, 2), { flag: 'wx' });
    if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
    await fsp.rename(temporary, this.registryFile);
  }
  async getState(): Promise<ComfySetupState> { await this.initialize(); return structuredClone(this.state); }
  private assertEditable(): void {
    if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
    if (active(this.state) || this.pending || this.choosing) throw new Error('COMFY_SETUP_BUSY');
  }
  private async scan(): Promise<void> {
    const configured = discoverConfiguredComfyEnvironments(await this.options.configuredInstall?.());
    const roots = [...new Set([...(this.extraDiscoveryRoot ? [this.extraDiscoveryRoot] : []),
      ...configured.filter(item => item.isCurrent).map(item => item.root), this.state.selectedRoot,
      ...this.state.environments.map(x => x.root), ...this.options.discoveryRoots])].slice(0, 16);
    this.state.rootsChecked = roots;
    const found = discoverComfyEnvironments({ roots, maxDepth: 3, maxEntries: 512 });
    const folded = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
    const merged = [...configured, ...found.environments].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
      .filter(item => !item.root.split(/[\\/]/).some(part => part.startsWith('.langbai-comfy-staging-')));
    const environments = merged.filter(item => item.isCurrent || item.python
      || !merged.some(other => folded(other.root) === folded(item.root) && other.python));
    const conflict = environments.some(item => item.python && environments.some(other => other.python
      && folded(other.root) === folded(item.root) && folded(other.python) !== folded(item.python)));
    if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
    this.state.discovery = { ...found, environments, current: environments.find(item => item.isCurrent) || null, conflict,
      warnings: found.warnings.map(item => `${item.code}: ${item.sourceRoot}`) };
    this.emit();
  }
  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    this.assertEditable(); const operation = action(); this.pending = operation;
    try { return await operation; } finally { if (this.pending === operation) this.pending = null; }
  }
  async discover(): Promise<ComfySetupState> { await this.initialize(); this.assertEditable(); await this.scan(); return this.getState(); }
  async chooseDiscoveryRoot(): Promise<ComfySetupState> {
    await this.initialize();
    return this.exclusive(async () => {
      const selected = await this.options.chooseDirectory('discovery');
      if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
      if (selected) { this.extraDiscoveryRoot = selected; await this.scan(); }
      return this.getState();
    });
  }
  async adoptCandidate(id: string, confirmExecution: boolean): Promise<ComfyLocalConfig> {
    await this.initialize(); this.assertEditable(); validId(id);
    if (this.options.configurationLocked?.()) throw new Error('COMFY_SETUP_BUSY');
    if (confirmExecution !== true) throw new Error('COMFY_SETUP_EXECUTION_CONFIRMATION_REQUIRED');
    const candidate = this.state.discovery?.environments.find(item => item.id === id);
    if (!candidate) throw new Error('COMFY_SETUP_CANDIDATE_NOT_FOUND');
    // Recompute the static ID and paths immediately before the explicit executable probe.
    const configured = discoverConfiguredComfyEnvironments(await this.options.configuredInstall?.());
    const current = configured.find(item => item.id === id)
      || (candidate.source !== 'configured' ? discoverComfyEnvironments({ roots: [candidate.sourceRoot], maxDepth: 3, maxEntries: 512 }).environments.find(item => item.id === id) : undefined);
    if (!current || current.root !== candidate.root || current.python !== candidate.python) throw new Error('COMFY_SETUP_STALE_CANDIDATE');
    for (const install of this.options.policy.installDirectories) {
      assertSafeDataDirectory(current.root, install);
      if (current.python) assertSafeDataDirectory(current.python, install);
    }
    const operation = this.options.adopt(current.root, current.python); this.pending = operation;
    try { return await operation; } finally { if (this.pending === operation) this.pending = null; }
  }
  async openOfficialPage(): Promise<void> { if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN'); await this.options.openExternal(COMFY_OFFICIAL_ACQUISITION_PAGE); }
  async chooseTargetDirectory(): Promise<ComfySetupState> {
    await this.initialize();
    return this.exclusive(async () => {
      const selected = await this.options.chooseDirectory('target');
      if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
      if (!selected) return this.getState();
      await assertSafeComfyLocation(selected, this.options.policy);
      if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
      this.state.selectedRoot = selected; await this.persist(); this.emit(); return this.getState();
    });
  }
  async chooseArchive(): Promise<ComfySetupState> {
    await this.initialize();
    return this.exclusive(async () => {
      const selected = await this.options.chooseArchive();
      if (this.closed) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
      if (!selected) return this.getState();
      const stat = localFile(selected);
      if (!/\.(?:zip|7z)$/i.test(selected) || stat.size < 1 || stat.size > 80 * 1024 ** 3) throw new Error('COMFY_SETUP_ARCHIVE_TYPE_OR_SIZE');
      const abort = new AbortController(); this.abort = abort;
      this.state.phase = 'hashing'; this.state.message = null; this.state.package = null;
      this.archivePath = null; this.archiveStamp = null; this.state.progress = { completed: 0, total: stat.size, unit: 'bytes' }; this.emit();
      try {
        let emittedAt = 0;
        const sha256 = await shaFile(selected, abort.signal, completed => {
          this.state.progress = { completed, total: stat.size, unit: 'bytes' };
          if (Date.now() - emittedAt > 200) { emittedAt = Date.now(); this.emit(); }
        });
        if (this.closed || abort.signal.aborted) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
        const after = localFile(selected);
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino) throw new Error('COMFY_SETUP_ARCHIVE_CHANGED');
        this.archivePath = selected; this.archiveStamp = { size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino };
        this.state.package = { id: randomUUID(), name: path.basename(selected), bytes: stat.size, sha256, officialHash: null, source: 'user-import' };
        this.state.phase = 'idle'; this.state.progress = null;
      } catch (error) { this.state.phase = abort.signal.aborted ? 'cancelled' : 'failed'; this.state.message = String(error); throw error; }
      finally { if (this.abort === abort) this.abort = null; this.emit(); }
      return this.getState();
    });
  }
  async install(input: { acknowledgeUnverifiedSource: boolean }): Promise<ComfySetupState> {
    await this.initialize(); this.assertEditable();
    if (!this.state.supported) throw new Error('COMFY_SETUP_WINDOWS_ONLY');
    if (this.options.configurationLocked?.()) throw new Error('COMFY_SETUP_BUSY_CONFIGURATION');
    if (!input || Object.keys(input).some(key => key !== 'acknowledgeUnverifiedSource') || input.acknowledgeUnverifiedSource !== true) throw new Error('COMFY_SETUP_SOURCE_CONFIRMATION_REQUIRED');
    if (!this.archivePath || !this.archiveStamp || !this.state.package) throw new Error('COMFY_SETUP_ARCHIVE_NOT_SELECTED');
    const stat = localFile(this.archivePath);
    if (stat.size !== this.archiveStamp.size || stat.mtimeMs !== this.archiveStamp.mtimeMs || stat.ino !== this.archiveStamp.ino) throw new Error('COMFY_SETUP_ARCHIVE_CHANGED');
    const abort = new AbortController(); this.abort = abort; this.state.jobId = randomUUID();
    this.state.phase = 'preflight'; this.state.message = null; this.state.installed = null; this.state.shortcutPath = null; this.emit();
    const archivePath = this.archivePath;
    const operation = (async () => {
      // The local review hash is not an author hash; nevertheless the exact reviewed bytes must remain bound.
      if (await shaFile(archivePath, abort.signal) !== this.state.package!.sha256) throw new Error('COMFY_SETUP_ARCHIVE_CHANGED');
      const environment = await installComfyPackage({ archivePath, target: this.state.selectedRoot, policy: this.options.policy,
        acknowledgeUnverifiedSource: true, signal: abort.signal, executorPath: this.options.executorPath,
        onPhase: (phase, message) => { this.state.phase = phase; this.state.message = message || null; this.emit(); },
        onProgress: (completed, total) => { this.state.progress = { completed, total, unit: 'bytes' }; this.emit(); },
        register: async env => { this.state.environments.push(env); this.state.installed = env; await this.persist(); },
      });
      this.state.installed = environment; this.state.phase = 'completed'; this.state.progress = null;
    })();
    this.pending = operation;
    try { await operation; }
    catch (error) {
      const promoted = (error as ComfyInstallFailure)?.promotedEnvironment;
      if (promoted) {
        this.state.installed = promoted;
        if (!this.state.environments.some(item => item.id === promoted.id)) this.state.environments.push(promoted);
      }
      this.state.phase = abort.signal.aborted && !promoted ? 'cancelled' : 'failed';
      this.state.message = (promoted ? 'COMFY_SETUP_REGISTRATION_OR_CLEANUP_REQUIRED: ' : '') + String(error); throw error;
    }
    finally { if (this.pending === operation) this.pending = null; if (this.abort === abort) this.abort = null; this.emit(); }
    return this.getState();
  }
  async cancel(): Promise<ComfySetupState> { this.abort?.abort(); await this.pending?.catch(() => undefined); return this.getState(); }
  async createShortcut(environmentId: string): Promise<ComfySetupState> {
    await this.initialize(); this.assertEditable(); validId(environmentId);
    const abort = new AbortController(); this.abort = abort;
    const operation = this.writeLauncherShortcut(environmentId, abort.signal); this.pending = operation;
    try { return await operation; }
    finally { if (this.pending === operation) this.pending = null; if (this.abort === abort) this.abort = null; }
  }
  private async writeLauncherShortcut(environmentId: string, signal: AbortSignal): Promise<ComfySetupState> {
    const env = this.state.environments.find(item => item.id === environmentId);
    if (!env) throw new Error('COMFY_SETUP_ENVIRONMENT_NOT_FOUND');
    const marker = path.join(env.root, COMFY_ENVIRONMENT_MARKER);
    const markerStat = localFile(marker);
    if (markerStat.size > 4 * 1024 * 1024) throw new Error('COMFY_SETUP_RECEIPT_INVALID');
    const receipt = JSON.parse(await fsp.readFile(marker, 'utf8'));
    if (receipt?.schema !== 1 || receipt.environment?.id !== env.id || receipt.launcherSha256 !== env.launcherSha256
      || receipt.environment?.launcherPath !== env.launcherPath) throw new Error('COMFY_SETUP_RECEIPT_INVALID');
    const launcher = env.launcherPath; localFile(launcher);
    const allowed = path.relative(env.root, launcher);
    if (allowed === '..' || allowed.startsWith('..' + path.sep) || path.isAbsolute(allowed)) throw new Error('COMFY_SETUP_LAUNCHER_OUTSIDE_ENVIRONMENT');
    if (await shaFile(launcher, signal) !== env.launcherSha256) throw new Error('COMFY_SETUP_LAUNCHER_CHANGED');
    const file = await fsp.open(launcher, 'r');
    try { const signature = Buffer.alloc(2); await file.read(signature, 0, 2, 0); if (signature.toString('ascii') !== 'MZ') throw new Error('COMFY_SETUP_LAUNCHER_INVALID'); }
    finally { await file.close(); }
    const cwd = path.dirname(launcher);
    for (let suffix = 0; suffix < 100; suffix++) {
      const shortcut = path.join(this.options.desktopDirectory, `绘世启动器${suffix ? ` (${suffix + 1})` : ''}.lnk`);
      if (fs.existsSync(shortcut)) {
        try { const old = this.options.readShortcut(shortcut); if (path.resolve(old.target) === path.resolve(launcher) && path.resolve(old.cwd || cwd) === path.resolve(cwd)) { this.state.shortcutPath = shortcut; this.emit(); return this.getState(); } } catch { /* preserve unknown existing shortcut */ }
        continue;
      }
      // Build only an unpredictable owned temporary link; atomic hard-link promotion
      // refuses EEXIST rather than trusting Electron's overwriting create mode.
      if (this.closed || signal.aborted) throw new Error('COMFY_SETUP_SHUTTING_DOWN');
      const temporary = path.join(this.options.desktopDirectory, `.comfy-launcher-${randomUUID()}.lnk`);
      const reservation = await fsp.open(temporary, 'wx'); await reservation.close();
      try {
        const success = this.options.writeShortcut(temporary, { target: launcher, cwd, icon: launcher, iconIndex: 0, description: '绘世启动器（用户导入环境）' });
        if (!success) throw new Error('COMFY_SETUP_SHORTCUT_FAILED');
        const verified = this.options.readShortcut(temporary);
        if (path.resolve(verified.target) !== path.resolve(launcher)) throw new Error('COMFY_SETUP_SHORTCUT_VERIFY_FAILED');
        try { await fsp.link(temporary, shortcut); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
        this.state.shortcutPath = shortcut; this.emit(); return this.getState();
      } finally { await fsp.unlink(temporary); }
    }
    throw new Error('COMFY_SETUP_SHORTCUT_COLLISION');
  }
  busy(): boolean { return active(this.state) || this.pending !== null || this.choosing; }
  abortSync(): void { this.closed = true; this.abort?.abort(); }
  async shutdown(): Promise<void> { this.closed = true; await this.cancel(); }
  resume(): void { this.closed = false; }
}
