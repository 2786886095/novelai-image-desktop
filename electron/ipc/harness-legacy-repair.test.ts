import {it, expect} from 'vitest';
import fs from 'node:fs/promises'; import path from 'node:path'; import os from 'node:os'; import crypto from 'node:crypto';
import {planLegacyPluginRepair} from './harness-legacy-repair';
import {upgradeBundledUserFiles} from './harness-user-upgrade';
it('repairs only a complete known legacy package even when the active version already changed', async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-legacy-'));
 const prefix='community/packages/legacy/', home=path.join(root,'user-home/profiles/node_modules/legacy');
 const nextRoot=path.join(root,'versions/new');const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
 const next={files:{[prefix+'index.js']:hash('new')}} as any;
 try {
  await fs.mkdir(home,{recursive:true});await fs.writeFile(path.join(home,'index.js'),'old');
  await fs.mkdir(path.join(nextRoot,prefix),{recursive:true});await fs.writeFile(path.join(nextRoot,prefix,'index.js'),'new');
  const catalog={[prefix]:[{'index.js':hash('old')}]};
  const plan=await planLegacyPluginRepair(root,next,catalog);expect(plan.packages).toEqual(['legacy']);
  const changed=await upgradeBundledUserFiles(root,plan.before,nextRoot,next);expect(changed.changed).toBe(1);
  expect(await fs.readFile(path.join(home,'index.js'),'utf8')).toBe('new');
  expect((await planLegacyPluginRepair(root,next,catalog)).packages).toEqual([]);
  await changed.rollback();expect(await fs.readFile(path.join(home,'index.js'),'utf8')).toBe('old');
  await fs.writeFile(path.join(home,'user.json'),'custom');expect((await planLegacyPluginRepair(root,next,catalog)).packages).toEqual([]);
  await fs.unlink(path.join(home,'user.json'));await fs.writeFile(path.join(home,'index.js'),'user edit');expect((await planLegacyPluginRepair(root,next,catalog)).packages).toEqual([]);
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('studio-legacy-'))await fs.rm(root,{recursive:true,force:true});}
});
it('entering the persistent Agent tab checks metadata without installing or starting',async()=>{
 const ui=await fs.readFile('src/HarnessPage.tsx','utf8'),app=await fs.readFile('src/App.tsx','utf8');
 expect(app).toContain('<AgentPage active={activeTab === "agent"} />');
 const entry=ui.match(/useEffect\(\(\)=>\{([\s\S]*?)\},\[active\]\);/)?.[1] ?? '';
 expect(entry).toContain('if(!active)return;');
 expect(entry).toContain('harnessCheckUpdates()');
 expect(entry).not.toMatch(/harness(?:Start|ApplyPreparedUpdate)\(/);
 expect(ui).toContain('void window.naiDesktop.harnessCheckUpdates()');
});
