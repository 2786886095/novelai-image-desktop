import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
vi.mock('node:child_process',()=>({spawn:vi.fn(),execFile:(_f:unknown,_a:unknown,_o:unknown,cb:Function)=>cb(null,'ok','')}));
import {HarnessEngine} from './harness-engine';import {recoverHarnessHome} from './harness-recovery';import {removeHarnessComponent} from './harness-component-removal';import {HarnessDownloadConsent} from './harness-download-consent';
const roots:string[]=[];
afterEach(async()=>{vi.useRealTimers();for(const root of roots.splice(0)){if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('studio-remove-'))throw Error('bad fixture');await fs.rm(root,{recursive:true,force:true});}});
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-remove-'));roots.push(root);const seed=path.join(root,'seed'),home=path.join(root,'home'),files:Record<string,string>={};
 for(const name of ['node.exe','runtime/bin.js','runtime/node_modules/owned/index.js','plugins/studio-brand/index.js','plugins/studio-tools/index.js']){const file=path.join(seed,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,name);files[name]=crypto.createHash('sha256').update(name).digest('hex');}
 await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify({format:1,protocol:1,version:'0.1.7',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files}));
 const engine=new HarnessEngine({root:home,seed,workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});await engine.update();expect(engine.snapshot().version).toBe('0.1.7');return {root,home,engine,seed};}
it('uninstall and reinstall keep conversation, plugin edits, cards, images, settings and backups byte-identical',async()=>{
 const {home,engine}=await fixture();const names=['user-home/sessions/chat.jsonl','user-home/roleplay/card.json','user-home/profiles/custom.json','session-generation/session.json','images/image.png','backups/old/user.json'];
 for(const name of names){await fs.mkdir(path.dirname(path.join(home,name)),{recursive:true});await fs.writeFile(path.join(home,name),'user:'+name);}
 const active=JSON.parse(await fs.readFile(path.join(home,'active.json'),'utf8'));const slot=path.join(home,'versions',active.slot);
 await fs.writeFile(path.join(slot,'unknown-user.txt'),'keep unknown');
 const link=path.join(home,'user-home/profiles/node_modules/owned');await fs.symlink(path.join(slot,'runtime/node_modules/owned'),link,process.platform==='win32'?'junction':'dir');
 await engine.uninstallComponent();expect(engine.snapshot().version).toBeNull();await expect(fs.access(path.join(slot,'node.exe'))).rejects.toThrow();
 expect(await fs.readFile(path.join(slot,'unknown-user.txt'),'utf8')).toBe('keep unknown');
 // Broken runtime links must be repaired on reinstall, without traversing or deleting user plugins.
 await engine.update();expect(engine.snapshot().version).toBe('0.1.7');
 for(const name of names)expect(await fs.readFile(path.join(home,name),'utf8')).toBe('user:'+name);
 const next=JSON.parse(await fs.readFile(path.join(home,'active.json'),'utf8'));expect(next.slot).not.toBe(active.slot);expect(await fs.realpath(link)).toBe(await fs.realpath(path.join(home,'versions',next.slot,'runtime/node_modules/owned')));
 const dated=(await fs.readdir(path.join(home,'backups'))).find(n=>n!=='old')!;
 const restored=await recoverHarnessHome(home,path.join(home,'backups',dated));expect(restored.componentRestored).toBe(false);
 expect(JSON.parse(await fs.readFile(path.join(home,'active.json'),'utf8')).slot).toBe(next.slot);
 expect(await fs.readFile(path.join(home,'user-home/sessions/chat.jsonl'),'utf8')).toBe('user:user-home/sessions/chat.jsonl');
});
it('modified runtime files are not deleted and linked version roots are rejected',async()=>{
 const {home}=await fixture();const active=JSON.parse(await fs.readFile(path.join(home,'active.json'),'utf8'));const file=path.join(home,'versions',active.slot,'node.exe');await fs.writeFile(file,'custom runtime');
 await removeHarnessComponent(home);expect(await fs.readFile(file,'utf8')).toBe('custom runtime');
 const other=await fixture();await fs.rename(path.join(other.home,'versions'),path.join(other.home,'original-versions'));await fs.symlink(path.join(other.home,'original-versions'),path.join(other.home,'versions'),process.platform==='win32'?'junction':'dir');
 await expect(removeHarnessComponent(other.home)).rejects.toThrow('Linked');expect(await fs.readFile(path.join(other.home,'active.json'),'utf8')).toContain('slot');
});
it('download consent is exact, one-use, expiring and invalidated by a replacement plan',()=>{
 const gate=new HarnessDownloadConsent();const asset:any={version:'0.1.7',bytes:100,asset:{url:'test',size:100,digest:'sha256:test'},tag:'agent-v0.1.7'};
 const first=gate.issue(asset,'component',false);expect(first.bytes).toBe(100);expect(gate.consume(first.token,'component').asset).toBe(asset);expect(()=>gate.consume(first.token,'component')).toThrow();
 const replaced=gate.issue(asset,'component',false);gate.issue(asset,'component',true);expect(()=>gate.consume(replaced.token,'component')).toThrow();
 vi.useFakeTimers();const expired=gate.issue(asset,'official',false);vi.advanceTimersByTime(600001);expect(()=>gate.consume(expired.token,'official')).toThrow();
});
it('reinstall prepares same version without altering active data before confirmation',async()=>{
 const {home,engine,seed}=await fixture();vi.spyOn(engine,'checkUpdates').mockResolvedValue();vi.spyOn(engine as any,'probePreparedBundle').mockResolvedValue(undefined);
 const before=await fs.readFile(path.join(home,'active.json'),'utf8');const proposal=await engine.prepareUpdate('component',async()=>seed,true);expect(proposal.status).toBe('ready');expect(await fs.readFile(path.join(home,'active.json'),'utf8')).toBe(before);
 await engine.applyPreparedUpdate(proposal.token!);expect(engine.snapshot().phase).toBe('stopped');expect(await fs.readFile(path.join(home,'active.json'),'utf8')).not.toBe(before);
});
