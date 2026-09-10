import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inventoryWorkspace, resolveSafeWorkspace, snapshotLegacyWorkspace, WORKSPACE_MIGRATIONS, WORKSPACE_LOCATION } from './agent-workspace-migration';

const roots:string[]=[];
const tempRoot=fs.realpathSync.native(os.tmpdir());
function fixture() {
  const root=fs.mkdtempSync(path.join(tempRoot,'nai-workspace-migration-'));roots.push(root);
  const install=path.join(root,'installed'), appData=path.join(root,'AppData'), userData=path.join(appData,'novelai-image-desktop'), source=path.join(install,'LangbaiWorkspace');
  fs.mkdirSync(source,{recursive:true});fs.mkdirSync(userData,{recursive:true});
  const attach=path.join(source,'attachments','portrait.webp');fs.mkdirSync(path.dirname(attach));fs.writeFileSync(attach,'attachment bytes');
  const raw=JSON.stringify({version:4,conversations:[{id:'chat',title:'Keep my clothing',messages:[{id:'message',content:'red coat; keep other character unchanged',attachments:[{id:'image',name:'portrait.webp',filePath:attach}]}]}]});
  for(const name of ['agent-workspace.json','agent-workspace.json.bak','agent-workspace.json.bak2'])fs.writeFileSync(path.join(source,name),raw);
  const run=(migrate=true) => spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('build/protect-update-data.ps1'),'-InstallDir',install,'-AppDataDir',appData,...(migrate?['-MigrateWorkspace']:[])],{encoding:'utf8',timeout:30_000,windowsHide:true});
  return {root,install,appData,userData,source,attach,raw,run};
}
afterEach(()=>{
  vi.restoreAllMocks();
  for(const root of roots.splice(0)){
    if(path.dirname(root)!==tempRoot||!path.basename(root).startsWith('nai-workspace-migration-'))throw Error('Unexpected fixture target');
    fs.rmSync(root,{recursive:true,force:true});
  }
});
describe('safe workspace migration',()=>{
  it('keeps migration and update notices in the single existing shell grid row',()=>{
    expect(fs.readFileSync(path.resolve('src/App.tsx'),'utf8')).toMatch(/<div className="app-notice-slot">\s*<UpdateBanner \/>\s*<WorkspaceMigrationNotice \/>\s*<\/div>/);
  });
  it('places fresh workspaces outside the install tree without creating an adjacent workspace',()=>{
    const f=fixture();fs.rmSync(f.source,{recursive:true});
    const loc=resolveSafeWorkspace(f.userData,f.install,[]);
    expect(loc.path).toBe(path.join(f.userData,'LangbaiWorkspace'));
    expect(fs.existsSync(f.source)).toBe(false);
  });
  it('keeps an existing app-data profile, original JSON, backups and attachments; activates a separate copy',()=>{
    const f=fixture(),old=path.join(f.userData,'LangbaiWorkspace');fs.mkdirSync(old);fs.writeFileSync(path.join(old,'agent-workspace.json'),'previous profile');
    const before=inventoryWorkspace(f.source),r=snapshotLegacyWorkspace(f.source,f.userData);
    const loc=resolveSafeWorkspace(f.userData,f.install,[f.source]);
    expect(loc.migrationId).toBe(r.id);expect(loc.migratedFromLegacy).toBe(true);
    expect(inventoryWorkspace(f.source)).toEqual(before);expect(inventoryWorkspace(loc.backupPath!)).toEqual(before);expect(inventoryWorkspace(loc.path)).toEqual(before);
    expect(fs.readFileSync(path.join(old,'agent-workspace.json'),'utf8')).toBe('previous profile');
  });
  it('does not replace new edits on restart or installer retry',()=>{
    const f=fixture(),r=snapshotLegacyWorkspace(f.source,f.userData),loc=resolveSafeWorkspace(f.userData,f.install,[]);
    fs.writeFileSync(path.join(loc.path,'agent-workspace.json'),'edited after upgrade');
    expect(snapshotLegacyWorkspace(f.source,f.userData).id).toBe(r.id);
    const reopened=resolveSafeWorkspace(f.userData,f.install,[f.source]);
    expect(reopened.migratedFromLegacy).toBe(false);expect(fs.readFileSync(path.join(reopened.path,'agent-workspace.json'),'utf8')).toBe('edited after upgrade');
  });
  it('rejects corrupt backups rather than starting an empty workspace',()=>{
    const f=fixture(),r=snapshotLegacyWorkspace(f.source,f.userData);
    fs.writeFileSync(path.join(f.userData,WORKSPACE_MIGRATIONS,r.id,'original','agent-workspace.json'),'corrupt');
    expect(()=>resolveSafeWorkspace(f.userData,f.install,[])).toThrow('校验失败');
    expect(fs.existsSync(path.join(f.userData,WORKSPACE_LOCATION))).toBe(false);
    expect(fs.readFileSync(path.join(f.source,'agent-workspace.json'),'utf8')).toBe(f.raw);
  });
  it('keeps a correctly hashed but unreadable source from becoming an empty active workspace',()=>{
    const f=fixture();for(const n of ['agent-workspace.json','agent-workspace.json.bak','agent-workspace.json.bak2'])fs.writeFileSync(path.join(f.source,n),'{broken');
    snapshotLegacyWorkspace(f.source,f.userData);
    expect(()=>resolveSafeWorkspace(f.userData,f.install,[])).toThrow('读取校验');expect(fs.existsSync(path.join(f.userData,WORKSPACE_LOCATION))).toBe(false);
  });
  it('does not commit a pointer on partial copy failure and preserves the original',()=>{
    const f=fixture(),before=inventoryWorkspace(f.source);
    vi.spyOn(fs,'copyFileSync').mockImplementationOnce(()=>{throw Error('disk full');});
    expect(()=>snapshotLegacyWorkspace(f.source,f.userData)).toThrow('disk full');
    expect(inventoryWorkspace(f.source)).toEqual(before);expect(fs.existsSync(path.join(f.userData,WORKSPACE_LOCATION))).toBe(false);
  });
  it('rejects directory links and app-data inside the installation',()=>{
    const f=fixture();fs.symlinkSync(f.userData,path.join(f.source,'link'),process.platform==='win32'?'junction':'dir');
    expect(()=>snapshotLegacyWorkspace(f.source,f.userData)).toThrow('链接');
    expect(()=>resolveSafeWorkspace(f.install,f.install,[])).toThrow('安装目录内');
  });
  it('preserves a previous active profile when a later migration is selected',()=>{
    const f=fixture(),first=resolveSafeWorkspace(f.userData,f.install,[f.source]);
    fs.writeFileSync(path.join(f.source,'agent-workspace.json'),f.raw.replace('red coat','green coat'));
    snapshotLegacyWorkspace(f.source,f.userData);
    const next=resolveSafeWorkspace(f.userData,f.install,[]);
    expect(next.path).not.toBe(first.path);expect(fs.readFileSync(path.join(first.path,'agent-workspace.json'),'utf8')).toBe(f.raw);
  });
  it('does not turn a missing active workspace into a fresh empty profile',()=>{
    const f=fixture(),loc=resolveSafeWorkspace(f.userData,f.install,[f.source]);
    fs.rmSync(loc.path,{recursive:true});
    expect(()=>resolveSafeWorkspace(f.userData,f.install,[])).toThrow('工作区缺失');
  });
});
describe.skipIf(process.platform!=='win32')('real installer backup → app recovery',()=>{
  it('upgrades an ordinary in-install workspace and retains attachment bytes after old-install removal',()=>{
    const f=fixture(),before=inventoryWorkspace(f.source);
    expect(f.run(false).status).toBe(20);
    const result=f.run();expect(result.status,result.stdout+result.stderr).toBe(0);expect(result.stdout).toContain('WORKSPACE_BACKUP_VERIFIED');
    expect(inventoryWorkspace(f.source)).toEqual(before);
    expect(f.run().status).toBe(0);expect(fs.readdirSync(path.join(f.userData,WORKSPACE_MIGRATIONS))).toHaveLength(1);
    expect(f.install.startsWith(f.root+path.sep)).toBe(true);fs.rmSync(f.install,{recursive:true});
    const loc=resolveSafeWorkspace(f.userData,f.install,[]);
    expect(inventoryWorkspace(loc.path)).toEqual(before);expect(fs.readFileSync(path.join(loc.path,'attachments','portrait.webp'),'utf8')).toBe('attachment bytes');
  },40_000);
  it('still blocks real image output risks and corrupt settings before making a backup',()=>{
    const f=fixture();fs.mkdirSync(path.join(f.install,'outputs'));fs.writeFileSync(path.join(f.install,'outputs','image.png'),'image');
    expect(f.run().status).toBe(20);expect(fs.existsSync(path.join(f.userData,WORKSPACE_MIGRATIONS))).toBe(false);
    fs.rmSync(path.join(f.install,'outputs'),{recursive:true});fs.writeFileSync(path.join(f.userData,'novelai-image-desktop.json'),'{bad');
    expect(f.run().status).toBe(21);expect(fs.readFileSync(path.join(f.source,'agent-workspace.json'),'utf8')).toBe(f.raw);
  });
});
