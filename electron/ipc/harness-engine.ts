import {userPluginFingerprint,copyHarnessProbeHome} from './harness-compatibility';
import {startHarnessBridge} from './harness-bridge';
import type {HarnessUpdateProposal} from '../../src/harness-types';
import {planLegacyPluginRepair} from './harness-legacy-repair';
import {isHarnessBootFailure} from './harness-readiness';
import {checkHarnessUpdates,type HarnessUpdateCheck} from './harness-update-check';
import {backupHarnessHome} from './harness-backup';
import {recoverHarnessHome} from './harness-recovery';
import {upgradeBundledUserFiles} from './harness-user-upgrade';
import {spawn, execFile, type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {StringDecoder} from 'node:string_decoder';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import type {HarnessLog, HarnessPhase, HarnessSnapshot} from '../../src/harness-types';
import {engineLaunchUrl, installVerifiedBundle, isNewerBundle, redactHarnessLog, validateManifest, verifyBundle} from './harness-policy';
import {discardHarnessDownload} from './harness-update';
import {removeHarnessComponent} from './harness-component-removal';

const exec = promisify(execFile);
export interface EngineOptions {
  root: string; seed: string; workspace: string; previewSource?: string; responsiveSource?: string; librarySource?: string; toolsSource?: string;
  openBrowser: (url: string) => Promise<unknown>;
  bridge: () => Promise<{env: Record<string,string>; close: () => Promise<void>}>;
  updateSource?: (signal: AbortSignal, log: (text: string) => void) => Promise<string | null>;
}
/** The application is a launcher, never an owner of editable DSH profiles. */
export class HarnessEngine {
  private phase: HarnessPhase = 'stopped';
  private version: string | null = null;
  private installedUpstream: string | null = null;
  private logs: HarnessLog[] = [];
  private sequence = 0;
  private child: ChildProcess | null = null;
  private abort: AbortController | null = null;
  private action: Promise<void> | null = null;
  private bridgeClose: (() => Promise<void>) | null = null;
  private url: string | null = null;
  private updateInfo: HarnessUpdateCheck | null = null;
  private checking: Promise<void> | null = null;
  private prepared: {token:string;source:string;digest:string;active:string;plugins:string;expires:number;version:string;upstream:string} | null = null;
  async checkUpdates(){
    if(this.checking)return this.checking;
    this.checking=Promise.all([checkHarnessUpdates(),this.readActive().catch(()=>null)]).then(async([info,active])=>{
      // Remote publication and a locally bundled candidate are different sources.
      // Offline/unpublished remote metadata must not hide the bundled update.
      try {
        const bundled=validateManifest(JSON.parse(await fs.readFile(path.join(this.options.seed,'manifest.json'),'utf8')));
        info.bundledComponent=bundled.version;
        info.bundledUpdate=!active||isNewerBundle(bundled.version,active.manifest.version);
      } catch(error) {
        if((error as NodeJS.ErrnoException).code!=='ENOENT')info.errors.push('本机随附组件：'+String(error));
      }
      this.updateInfo=info;
    }).finally(()=>{this.checking=null;});
    return this.checking;
  }
  constructor(private readonly options: EngineOptions) {}
  get busy() { return !!this.child || !!this.action; }
  snapshot(): HarnessSnapshot { return {phase: this.phase, version: this.version, installedUpstream:this.installedUpstream, logs: [...this.logs], dataDirectory: this.options.root, updateInfo:this.updateInfo,checkingUpdates:!!this.checking}; }
  log(text: string, level: HarnessLog['level'] = 'info') {
    // Bounded, escaped by React. Never expose a bootstrap token to the renderer/log files.
    this.logs.push({id: ++this.sequence, time: new Date().toISOString(), level, text: redactHarnessLog(text).slice(0, 4000)});
    if (this.logs.length > 800) this.logs.splice(0, this.logs.length - 800);
    let chars=this.logs.reduce((sum,line)=>sum+line.text.length,0);
    while(chars>200000 && this.logs.length)chars-=this.logs.shift()!.text.length;
  }
  private async readActive() {
    try {
      const active = JSON.parse(await fs.readFile(path.join(this.options.root, 'active.json'), 'utf8'));
      if (typeof active.slot !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(active.slot)) throw new Error('Invalid active slot');
      const root = path.join(this.options.root, 'versions', active.slot);
      const manifest = validateManifest(JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8')));
      this.version = manifest.version;
      this.installedUpstream = manifest.upstream;
      return {root, manifest};
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  private async presentationPatch(bundle: string): Promise<string|null> {
    const source=this.options.responsiveSource ?? path.join(bundle,'plugins/studio-responsive');
    try {await fs.access(path.join(source,'package.json'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
    const names=['package.json','index.js','lib/client.js'];
    const files=await Promise.all(names.map(async name=>({name,bytes:await fs.readFile(path.join(source,name))})));
    const hash=crypto.createHash('sha256');for(const file of files)hash.update(file.name).update(file.bytes);
    const directory=path.join(this.options.root,'presentation',hash.digest('hex'));
    // Managed presentation files are outside all user-owned profiles/plugins.
    for(const {name,bytes} of files){const target=path.join(directory,name);await fs.mkdir(path.dirname(target),{recursive:true});
      try{await fs.writeFile(target,bytes,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
      if(!(await fs.readFile(target)).equals(bytes))throw Error('Presentation component checksum mismatch');
    }
    const patch=path.join(directory,'presentation.patch.yml');
    const content=`- insert:\n    - id: studio-responsive\n      name: ${JSON.stringify(path.join(directory,'index.js').replaceAll('\\','/'))}\n`;
    try{await fs.writeFile(patch,content,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    if(await fs.readFile(patch,'utf8')!==content)throw Error('Presentation patch checksum mismatch');
    return patch;
  }
  private async libraryPatch(bundle: string): Promise<string|null> {
    const names=['package.json','index.js','protocol.js','jev-config.js','lib/client.js'];
    const source=this.options.librarySource;if(!source)return null;
    const installed=path.join(this.options.root,'user-home/profiles/node_modules/@langbai/dsh-studio-library');
    const seed=path.join(bundle,'plugins/studio-library');
    // A customized integration remains active. Never overwrite or shadow it.
    for(const name of names){
      try{if(!(await fs.readFile(path.join(installed,name))).equals(await fs.readFile(path.join(seed,name)))){this.log('软件资料插件有本机修改；保留自定义版本，未替换。');return null;}}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return null;}
    }
    // New app-owned helper; tolerate its absence in an older seed, but preserve a user's custom helper.
    const extra='panel-layout-store.js';
    const optional=async(file:string)=>fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return null;throw e});
    const custom=await optional(path.join(installed,extra)),original=await optional(path.join(seed,extra));
    if(custom&&(!original||!custom.equals(original)))return null;
    const files=await Promise.all([...names,extra].map(async name=>({name,bytes:await fs.readFile(path.join(source,name))})));
    const hash=crypto.createHash('sha256');for(const file of files)hash.update(file.name).update(file.bytes);
    hash.update('disable-old-insert-managed-v2');
    const directory=path.join(this.options.root,'managed-library',hash.digest('hex'));
    for(const {name,bytes} of files){const target=path.join(directory,name);await fs.mkdir(path.dirname(target),{recursive:true});
      try{await fs.writeFile(target,bytes,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
      if(!(await fs.readFile(target)).equals(bytes))throw Error('Studio library checksum mismatch');
    }
    const patch=path.join(directory,'library.patch.yml');
    // In Harness patches, `name` is a matching guard, NOT a replacement field.
    // Disable the verified seed and insert the managed dual host/client package.
    const content=`- id: studio-library\n  disabled: true\n- insert:\n    - id: studio-library-managed\n      name: ${JSON.stringify(path.join(directory,'index.js').replaceAll('\\','/'))}\n`;
    try{await fs.writeFile(patch,content,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    if(await fs.readFile(patch,'utf8')!==content)throw Error('Studio library patch checksum mismatch');
    return patch;
  }
  private async toolsPatch(bundle:string):Promise<string|null>{
    const source=this.options.toolsSource;if(!source)return null;
    const names=['package.json','index.js'];
    const installed=path.join(this.options.root,'user-home/profiles/node_modules/@langbai/dsh-studio-tools');
    for(const name of names){
      try{if(!(await fs.readFile(path.join(installed,name))).equals(await fs.readFile(path.join(bundle,'plugins/studio-tools',name)))){this.log('生图工具插件有本机修改；保留自定义版本。');return null}}
      catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}
    }
    const files=await Promise.all(names.map(async name=>({name,bytes:await fs.readFile(path.join(source,name))})));
    const hash=crypto.createHash('sha256');for(const file of files)hash.update(file.name).update(file.bytes);
    const directory=path.join(this.options.root,'managed-tools',hash.digest('hex'));await fs.mkdir(directory,{recursive:true});
    for(const file of files){const target=path.join(directory,file.name);try{await fs.writeFile(target,file.bytes,{flag:'wx'})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}if(!(await fs.readFile(target)).equals(file.bytes))throw Error('Studio tools checksum mismatch')}
    const patch=path.join(directory,'tools.patch.yml');
    await fs.writeFile(patch,`- id: studio-tools\n  disabled: true\n- insert:\n    - id: studio-tools-managed\n      name: ${JSON.stringify(path.join(directory,'index.js').replaceAll('\\','/'))}\n`);
    this.log('已接入软件共用提示词模板工具（保留原组件和用户资料）。');return patch;
  }
  private async seedUserFiles(bundle: string) {
    const home = path.join(this.options.root, 'user-home');
    const modules = path.join(home, 'profiles', 'node_modules', '@langbai');
    await fs.mkdir(modules, {recursive: true});
    for (const name of ['studio-brand', 'studio-tools']) {
      const target = path.join(modules, `dsh-${name}`);
      // User owns these packages after first installation; NEVER replace on app/engine update.
      try { await fs.access(target); }
      catch { await fs.cp(path.join(bundle, 'plugins', name), target, {recursive: true, force: false, errorOnExist: true}); }
    }
    const patch = '- id: ui-brand-official\n  disabled: true\n- insert:\n    - id: studio-brand\n      name: "@langbai/dsh-studio-brand"\n    - id: studio-tools\n      name: "@langbai/dsh-studio-tools"\n';
    try { await fs.writeFile(path.join(home, 'studio.patch.yml'), patch, {flag: 'wx'}); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    // A new optional integration is seeded separately. Existing user plugins and
    // their composition are never overwritten, even when the app seed is newer.
    const dataSource=path.join(bundle,'plugins','studio-data');
    const dataTarget=path.join(modules,'dsh-studio-data');
    try {
      await fs.access(dataSource);
      try {await fs.access(dataTarget);}
      catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;await fs.cp(dataSource,dataTarget,{recursive:true,force:false,errorOnExist:true});}
      try {await fs.writeFile(path.join(home,'studio-data.patch.yml'),'- insert:\n    - id: studio-data\n      name: "@langbai/dsh-studio-data"\n',{flag:'wx'});}
      catch(error) {if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const community=path.join(bundle,'community');
    // A separate optional package reaches old installations without replacing
    // their brand plugin or patch. Existing custom preview packages stay owned
    // by the user and are not overwritten.
    const previewSource=this.options.previewSource ?? path.join(bundle,'plugins','studio-preview');
    const previewTarget=path.join(modules,'dsh-studio-preview');
    try {
      await fs.access(previewSource);
      try{await fs.access(previewTarget);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await fs.cp(previewSource,previewTarget,{recursive:true,force:false,errorOnExist:true});}
      try{await fs.writeFile(path.join(home,'studio-preview.patch.yml'),'- insert:\n    - id: studio-preview\n      name: "@langbai/dsh-studio-preview"\n',{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    let communityManifest:{harnessServices:string;packages:string[]}|null=null;
    try{communityManifest=JSON.parse(await fs.readFile(path.join(community,'manifest.json'),'utf8'));}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(communityManifest){
      const runtimeRequire=createRequire(path.join(bundle,'runtime/node_modules/@deepseek-ai/dsh/package.json'));
      const versionFile=runtimeRequire.resolve('@deepseek-ai/dsh-settings/package.json');
      const services=JSON.parse(await fs.readFile(versionFile,'utf8'));
      if(services.version!==communityManifest.harnessServices)throw new Error(`酒馆插件需已验证的 Harness 服务 ${communityManifest.harnessServices}；当前为 ${services.version}。`);
      const copyOnce=async(source:string,target:string)=>{
        try{await fs.access(target);return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
        await fs.mkdir(path.dirname(target),{recursive:true});
        const staging=target+'.install-'+crypto.randomBytes(6).toString('hex');
        await fs.cp(source,staging,{recursive:true,errorOnExist:true,force:false});
        // An interrupted copy never looks like an installed, editable plugin.
        for(let attempt=0;;attempt++) {
          try {await fs.rename(staging,target);break;}
          catch(error) {
            // Windows antivirus/indexers briefly hold newly copied plugin directories.
            if(attempt>=7 || !['EPERM','EBUSY','EACCES'].includes((error as NodeJS.ErrnoException).code ?? ''))throw error;
            await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
          }
        }
      };
      for(const name of communityManifest.packages){
        if(!/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name))throw new Error('Invalid community package name');
        await copyOnce(path.join(community,'packages',name),path.join(home,'profiles/node_modules',name));
      }
      await copyOnce(path.join(bundle,'plugins/studio-library'),path.join(modules,'dsh-studio-library'));
      try{await fs.writeFile(path.join(home,'studio-community.patch.yml'),await fs.readFile(path.join(community,'community.patch.yml')),{flag:'wx'});}
      catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    }
    // Only the fallback changes; upstream selectedDefault remains authoritative for existing users.
    const defaultPatch='- id: agent-preset-registry\n  config:\n    default: roleplay\n';
    if(communityManifest){try{await fs.writeFile(path.join(home,'studio-roleplay-default.patch.yml'),defaultPatch,{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}}
    return home;
  }
  private async install(source: string, signal: AbortSignal) {
    const manifest = validateManifest(JSON.parse(await fs.readFile(path.join(source, 'manifest.json'), 'utf8')));
    this.log(`校验 Agent ${manifest.version}（Harness ${manifest.upstream}）…`);
    const id = `${manifest.version}-${crypto.randomBytes(6).toString('hex')}`;
    const slot = path.join(this.options.root, 'versions', id);
    await fs.mkdir(path.dirname(slot), {recursive: true});
    await fs.mkdir(slot);
    let lastProgress = 0;
    await installVerifiedBundle(source, slot, manifest, signal, (done, total) => {
      const now = Date.now();
      if (done === 0 || done === total || now - lastProgress >= 750) {
        this.log(`准备组件：${Math.floor(done / total * 100)}%（${done}/${total}）`);
        lastProgress = now;
      }
    });
    await fs.writeFile(path.join(slot, 'manifest.json'), JSON.stringify(manifest));
    this.log('组件准备完成，正在检查 Node 和 Harness 启动兼容性…');
    await exec(path.join(slot, manifest.node), ['--version'], {windowsHide:true, timeout:15000, signal});
    const probeHome = path.join(slot, '.compatibility-home');
    await exec(path.join(slot, manifest.node), [path.join(slot, manifest.cli), 'web', '--help'], {
      windowsHide:true, timeout:30000, signal, env:{...process.env, DSH_HOME:probeHome, ELECTRON_RUN_AS_NODE:''}, maxBuffer:1024*1024,
    });
    signal.throwIfAborted();
    const previous = await this.readActive() ?? await this.readUninstalled();
    const migration = previous ? await upgradeBundledUserFiles(this.options.root, previous.manifest, slot, manifest) : null;
    try {
    await this.seedUserFiles(slot);
    if(migration)this.log(`组件兼容迁移：更新 ${migration.changed} 个未修改文件、${migration.links} 个组件链接；保留 ${migration.custom} 个自定义文件。`);
    // Retain the previous active descriptor and every old engine slot for recovery.
    const active = path.join(this.options.root, 'active.json');
    try { await fs.copyFile(active, path.join(this.options.root, 'previous.json')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const temp = active + '.tmp';
    await fs.writeFile(temp, JSON.stringify({slot:id, version:manifest.version}));
    await fs.rename(temp, active);
    } catch(error) {await migration?.rollback();throw error;}
    this.version = manifest.version;
    this.log('组件校验完成。用户配置、插件及对话目录未覆盖。');
    try{if(await discardHarnessDownload(this.options.root,source))this.log('已清理本次下载的临时副本；已安装组件、备份和用户资料保留。');}
    catch{this.log('临时下载副本清理未完成，不影响已安装组件。','warn');}
    return {root:slot, manifest};
  }
  private async runAction(task: (signal: AbortSignal) => Promise<void>) {
    if (this.action) return this.action;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.action = task(signal).catch(async error => {
      await this.kill();
      this.phase = signal.aborted ? 'stopped' : 'error';
      this.log(signal.aborted ? '操作已取消。' : String(error instanceof Error ? error.message : error), signal.aborted ? 'info' : 'error');
    }).finally(() => {this.action=null; this.abort=null;});
    return this.action;
  }
  private async bundledUpgrade(active: Awaited<ReturnType<HarnessEngine["readActive"]>>) {
    try {
      const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(this.options.seed,'manifest.json'),'utf8')));
      return !active || isNewerBundle(manifest.version,active.manifest.version) ? this.options.seed : null;
    } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error; }
  }
  /** Explicit install/update only. Merely opening the app or checking metadata never downloads. */
  private async availableSource(active: Awaited<ReturnType<HarnessEngine["readActive"]>>, signal:AbortSignal, upstream?:string) {
    signal.throwIfAborted();
    let local:string|null=null;
    try {
      local=await this.bundledUpgrade(active);
      if(local){
        const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(local,'manifest.json'),'utf8')));
        if(!upstream||manifest.upstream===upstream){
          await verifyBundle(local,manifest,signal);
          return local;
        }
      }
    } catch(error) {
      signal.throwIfAborted();
      this.log('随附组件不完整或校验失败，改从独立更新源获取；现有组件与用户资料保持不变。','warn');
      if(!this.options.updateSource)throw error;
    }
    signal.throwIfAborted();
    if(!this.options.updateSource)return null;
    const source=await this.options.updateSource(signal,text=>this.log(text));
    signal.throwIfAborted();
    if(source){
      const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8')));
      await verifyBundle(source,manifest,signal);
    }
    return source;
  }
  private async backupUserHome() {
    const home=path.join(this.options.root,'user-home');
    try { await fs.access(home); } catch(error) {if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
    this.log('更新前备份用户配置、插件和会话…');
    const backups=path.join(this.options.root,'backups');await fs.mkdir(backups,{recursive:true});
    const destination=path.join(backups,new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(3).toString('hex'));
    await backupHarnessHome(home,destination);
    try{await fs.copyFile(path.join(this.options.root,'active.json'),path.join(destination,'.studio-backup-active.json'));}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    this.log(`备份已保存：${destination}`);
  }
  async restoreBackup(source:string) {
    if(this.busy){this.log('请先关闭 Agent，再恢复备份。','warn');return;}
    return this.runAction(async()=>{
      this.phase='updating';
      const restored=await recoverHarnessHome(this.options.root,source);
      this.log(`恢复前的资料已保留：${restored.preserved}`);
      if(!restored.componentRestored)this.log('备份对应组件已卸载或没有组件记录：仅恢复资料，当前组件版本保持不变。','warn');
      const active=await this.readActive();this.version=active?.manifest.version ?? null;
      const removed=await this.readUninstalled();if(active&&removed)await upgradeBundledUserFiles(this.options.root,removed.manifest,active.root,active.manifest);
      this.phase='stopped';this.log('备份恢复完成。请检查后手动启动 Agent。');
    });
  }
  private async repairLegacyPlugins(active: NonNullable<Awaited<ReturnType<HarnessEngine["readActive"]>>>) {
    const plan = await planLegacyPluginRepair(this.options.root, active.manifest);
    if (!plan.packages.length) return;
    await this.backupUserHome();
    const repair = await upgradeBundledUserFiles(this.options.root, plan.before, active.root, active.manifest);
    this.log(`历史随附插件兼容修复：${plan.packages.length} 个；自定义插件和用户资料保持不变。`);
    return repair;
  }
  private async readUninstalled(){
    try{const saved=JSON.parse(await fs.readFile(path.join(this.options.root,'uninstalled.json'),'utf8'));return {manifest:validateManifest(saved.manifest)};}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
  }
  async uninstallComponent(){
    if(this.busy)throw Error('请先关闭 Agent，再卸载组件。');
    this.prepared=null;
    return this.runAction(async()=>{
      this.phase='updating';await this.backupUserHome();
      const result=await removeHarnessComponent(this.options.root);this.version=null;this.installedUpstream=null;
      this.phase='stopped';this.log(`组件已卸载（${result.removed} 个文件）；对话、角色卡、预设、图片、设置和备份保留。`);
      if(result.preserved)this.log('自定义或未知组件文件已保留，未删除。','warn');
    });
  }
  async start() {
    if (this.child || this.action) return;
    return this.runAction(async signal => {
      this.phase = 'installing';
      let active = await this.readActive();
      if (!active) {
        throw Error('尚未安装 Agent 组件，请先点击安装并确认下载。');
      }
      else if (await this.bundledUpgrade(active)) {
        this.log('发现软件随附的新组件；当前继续使用已安装版本，请关闭 Agent 后点击更新确认升级。');
      }
      await this.repairLegacyPlugins(active);
      const home = await this.seedUserFiles(active.root);
      signal.throwIfAborted();
      this.phase = 'starting'; this.log(`正在启动酒馆 Agent（Harness ${active.manifest.upstream}）…`);
      const bridge = await this.options.bridge(); this.bridgeClose=bridge.close;
      const runtimeRequire=createRequire(path.join(active.root, active.manifest.cli));
      const toolModule = runtimeRequire.resolve('@deepseek-ai/dsh-tools');
      const dataPatch=path.join(home,'studio-data.patch.yml');
      const additionalPatches:string[]=[];
      const library=await this.libraryPatch(active.root);
      const tools=await this.toolsPatch(active.root);
      const presentation=await this.presentationPatch(active.root);
      if(presentation)additionalPatches.push('--patch',presentation);
      const previewPatch=path.join(home,'studio-preview.patch.yml');
      try{await fs.access(previewPatch);additionalPatches.push('--patch',previewPatch);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      try{await fs.access(dataPatch);additionalPatches.push('--patch',dataPatch);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      const roleplayDefault=path.join(home,'studio-roleplay-default.patch.yml');
      try{await fs.access(roleplayDefault);additionalPatches.push('--patch',roleplayDefault);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      const communityPatch=path.join(home,'studio-community.patch.yml');
      try{await fs.access(communityPatch);additionalPatches.push('--patch',communityPatch);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      // The seed inserts studio-library. Apply its app-owned replacement AFTER
      // that insertion, otherwise the seed silently replaces the new UI.
      if(library)additionalPatches.push('--patch',library);
      const child = spawn(path.join(active.root, active.manifest.node), [path.join(active.root, active.manifest.cli), 'web', ...additionalPatches, '--patch', path.join(home, 'studio.patch.yml'), ...(tools?['--patch',tools]:[]), '--no-open', '--host', '127.0.0.1', '--port', '0'], {
        cwd:this.options.workspace, windowsHide:true, stdio:['ignore','pipe','pipe'],
        env:{...process.env, ELECTRON_RUN_AS_NODE:'', DSH_HOME:home, DSH_ROLEPLAY_DATA_DIR:path.join(home,'roleplay'), STUDIO_DSH_TOOLS:toolModule, STUDIO_WORKSPACE:this.options.workspace, ...bridge.env},
      });
      this.child=child; this.url=null;
      let bootFailure: string | null = null;
      const ready = new Promise<string>((resolve,reject) => {
        const timer=setTimeout(()=>reject(new Error('Agent 启动超时，请查看日志。')),120000);
        const onAbort=()=>reject(new Error('启动已取消'));
        signal.addEventListener('abort',onAbort,{once:true});
        const done=(error: Error|null,url?:string)=>{clearTimeout(timer);signal.removeEventListener('abort',onAbort);error?reject(error):resolve(url!);};
        child.once('error',error=>done(error));
        child.once('exit',(code,reason)=>{done(new Error(`Agent exited: ${code ?? reason}`));});
        for (const stream of [child.stdout,child.stderr]) {
          const decoder=new StringDecoder('utf8'); let pending='';
          stream?.on('data',(chunk:Buffer)=>{
            pending+=decoder.write(chunk);
            let index: number;
            while ((index=pending.search(/[\r\n]/))>=0) {
              const line=pending.slice(0,index);pending=pending.slice(index+1);
              if (isHarnessBootFailure(line)) { bootFailure = 'Agent 插件加载失败，请查看错误日志；尚未启动成功。'; done(new Error(bootFailure)); }
              const url=engineLaunchUrl(line); if(url && !this.url) {this.url=url;done(null,url);}
              if(line.trim())this.log(line, /\b(error|fatal)\b/i.test(line)?'error':/\bwarn\b/i.test(line)?'warn':'info');
            }
            if(pending.length>16000){this.log(pending);pending='';}
          });
          stream?.on('end',()=>{pending+=decoder.end();if(pending.trim())this.log(pending);});
        }
      });
      child.once('exit',(code)=>{
        if(this.child!==child)return;
        this.child=null; this.url=null;
        if(this.phase!=='stopping') {this.phase=code===0?'stopped':'error';this.log(`Agent 已退出（${code ?? 'signal'}）。`,code===0?'info':'error');}
        const close=this.bridgeClose;this.bridgeClose=null;void close?.();
      });
      const url=await ready; signal.throwIfAborted();
      // Check reachability WITHOUT consuming the one-use browser bootstrap token.
      const health=await fetch(new URL('/',url),{signal:AbortSignal.timeout(10000)});
      // An unauthenticated 401 is expected: only the browser may consume the bootstrap token.
      if(!health.ok && health.status!==401)throw new Error(`Agent Web HTTP ${health.status}`);
      if (bootFailure) throw new Error(bootFailure);
      this.phase='running'; this.log('Agent 已运行，正在打开浏览器。');
      try {await this.options.openBrowser(url);} catch {this.log('浏览器打开失败，请检查系统默认浏览器。','warn');}
    });
  }
  private async kill() {
    const child=this.child;
    if(child?.pid && child.exitCode===null) {
      const exited=new Promise<void>(resolve=>{child.once('exit',()=>resolve());setTimeout(resolve,5000).unref();});
      if(process.platform==='win32') {
        // Kill only the process tree owned by this launcher, never all node.exe processes.
        await exec('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000}).catch(error=>{if(child.exitCode===null)throw error;});
      } else child.kill('SIGTERM');
      await exited;
      if(child.exitCode===null && !child.signalCode) throw new Error('Agent process is still stopping');
    }
    this.child=null;this.url=null;
    const close=this.bridgeClose;this.bridgeClose=null;await close?.();
  }
  async stop() {
    this.phase='stopping';this.abort?.abort();
    await this.action; await this.kill();
    this.phase='stopped';this.log('[程序已由用户终止]');
  }
  private async activeStamp(){
    try{return await fs.readFile(path.join(this.options.root,'active.json'),'utf8');}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return '';throw e;}
  }
  private async probePreparedBundle(source:string,signal:AbortSignal){
    const root=path.join(this.options.root,'compatibility-checks',crypto.randomBytes(8).toString('hex'));
    await fs.mkdir(path.join(root,'versions'),{recursive:true});
    await fs.symlink(path.resolve(source),path.join(root,'versions/candidate'),process.platform==='win32'?'junction':'dir');
    await fs.writeFile(path.join(root,'active.json'),JSON.stringify({slot:'candidate'}));
    const current=await this.readActive();
    await copyHarnessProbeHome(this.options.root,path.join(root,'user-home'),source);
    // Mirror the real upgrade: migrate only wholly unchanged bundled packages.
    // Custom/new packages and their enabled/disabled configuration are copied intact.
    if(current){
      const next=validateManifest(JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8')));
      await upgradeBundledUserFiles(root,current.manifest,source,next);
    }
    const probe=new HarnessEngine({root,seed:source,workspace:root,previewSource:this.options.previewSource,responsiveSource:this.options.responsiveSource,librarySource:this.options.librarySource,toolsSource:this.options.toolsSource,
      openBrowser:async()=>{},bridge:()=>startHarnessBridge({journal:path.join(root,'journal'),tools:[],execute:async()=>{throw Error('Compatibility probe does not execute user tools');}})});
    const cancel=()=>{void probe.stop().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
    try{
      signal.throwIfAborted();await probe.start();signal.throwIfAborted();
      if(probe.snapshot().phase!=='running'){
        for(const entry of probe.snapshot().logs.filter(line=>line.level==='error').slice(-8))this.log(`兼容检查：${entry.text}`,'warn');
        throw Error('候选组件与当前插件组合启动检查未通过，请查看日志；现有酒馆保持不变。');
      }
    }finally{signal.removeEventListener('abort',cancel);await probe.stop();}
  }
  async prepareUpdate(kind:'component'|'official', approvedDownload?: (signal:AbortSignal)=>Promise<string|null>, reinstall=false):Promise<HarnessUpdateProposal>{
    if(kind!=='component'&&kind!=='official')throw Error('Invalid update kind');
    if(this.busy)return {status:'blocked',kind,message:'请先关闭 Agent，再进行兼容性更新。'};
    this.prepared=null;
    let result:HarnessUpdateProposal={status:'blocked',kind,message:'兼容检查未通过，现有酒馆保持不变。'};
    await this.runAction(async signal=>{
      this.phase='updating';
      try{
        await this.checkUpdates();signal.throwIfAborted();
        const active=await this.readActive(),official=this.updateInfo?.official;
        if(kind==='official'&&(!official||this.updateInfo?.officialFailed))throw Error('检查失败，请重试');
        if(kind==='official'&&active&&!isNewerBundle(official!,active.manifest.upstream)){
          result={status:'current',kind,message:'当前已是最新版本。'};return;
        }
        const source=approvedDownload ? await approvedDownload(signal) : await this.availableSource(active,signal,kind==='official'?official!:undefined);
        if(!source){result={status:kind==='official'?'blocked':'current',kind,message:kind==='official'?'官方新版尚无匹配的兼容组件，请等待适配。':'暂无可安装的适配更新。'};return;}
        const raw=await fs.readFile(path.join(source,'manifest.json'),'utf8'),manifest=validateManifest(JSON.parse(raw));
        if(kind==='official'&&manifest.upstream!==official)throw Error('官方新版尚无匹配的兼容组件，请等待适配。');
        if(active&&!isNewerBundle(manifest.version,active.manifest.version)&&!reinstall){
          result={status:kind==='official'?'blocked':'current',kind,message:kind==='official'?'官方新版尚无匹配的兼容组件，请等待适配。':'当前已是最新版本。'};return;
        }
        await verifyBundle(source,manifest,signal);
        const plugins=await userPluginFingerprint(this.options.root,active?.manifest??null,manifest,this.options.previewSource);
        this.log('正在隔离环境检查候选组件，不改动现有酒馆资料。');
        await this.probePreparedBundle(source,signal);signal.throwIfAborted();
        if(plugins!==await userPluginFingerprint(this.options.root,active?.manifest??null,manifest,this.options.previewSource))throw Error('检查后插件发生变化，请重新检查。');
        const token=crypto.randomBytes(24).toString('hex');
        this.prepared={token,source,digest:crypto.createHash('sha256').update(raw).digest('hex'),active:await this.activeStamp(),plugins,expires:Date.now()+600000,version:manifest.version,upstream:manifest.upstream};
        result={status:'ready',kind,message:'兼容检查通过，等待确认升级。',token,version:manifest.version,upstream:manifest.upstream,fromVersion:active?.manifest.version,fromUpstream:active?.manifest.upstream};
      }catch(e){result={status:'blocked',kind,message:e instanceof Error?e.message:String(e)};this.log(result.message,'warn');}
      finally{this.phase='stopped';}
    });return result;
  }
  async applyPreparedUpdate(token:string){
    if(this.busy)throw Error('请先关闭 Agent，再进行兼容性更新。');
    const prepared=this.prepared;this.prepared=null;
    if(!prepared||prepared.token!==token||prepared.expires<Date.now())throw Error('升级确认已失效，请重新检查。');
    await this.runAction(async signal=>{
      this.phase='updating';
      const raw=await fs.readFile(path.join(prepared.source,'manifest.json'),'utf8');
      if(crypto.createHash('sha256').update(raw).digest('hex')!==prepared.digest||await this.activeStamp()!==prepared.active)throw Error('升级确认已失效，请重新检查。');
      const manifest=validateManifest(JSON.parse(raw)),active=await this.readActive();
      await verifyBundle(prepared.source,manifest,signal);
      if(await userPluginFingerprint(this.options.root,active?.manifest??null,manifest,this.options.previewSource)!==prepared.plugins)throw Error('检查后插件发生变化，请重新检查。');
      await this.backupUserHome();signal.throwIfAborted();
      await this.install(prepared.source,signal);this.phase='stopped';
      // Refresh local status immediately; do not keep offering the installed seed.
      await this.readActive();
      if(this.updateInfo?.bundledComponent)this.updateInfo.bundledUpdate=isNewerBundle(this.updateInfo.bundledComponent,this.version!);
    });
  }
  async update() {
    if(this.busy){this.log('请先关闭 Agent，再进行兼容性更新。','warn');return;}
    return this.runAction(async signal=>{
      this.phase='updating';this.log('正在检查独立 Agent 组件更新…');
      const active=await this.readActive();
      // A newer bundled component is available offline even before a remote release.
      const source = active || !this.options.updateSource
        ? await this.availableSource(active,signal)
        : await this.options.updateSource(signal,text=>this.log(text));
      signal.throwIfAborted();
      if(source===null){if(active)await this.repairLegacyPlugins(active);this.log('检查完成，没有可用更新；可以点击启动。');this.phase='stopped';return;}
      const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8')));
      if(active && !isNewerBundle(manifest.version,active.manifest.version)){this.log('当前没有经过适配的新版 Agent 组件；用户数据保持不变。');this.phase='stopped';return;}
      if(active) {
        // Compatibility upgrades may migrate upstream data: create a consistent stopped-engine backup first.
        await this.backupUserHome();
      }
      await this.install(source,signal);this.phase='stopped';
    });
  }
}

