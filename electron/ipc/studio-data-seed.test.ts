import {it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
vi.mock('node:child_process',()=>({spawn:vi.fn(),execFile:vi.fn()}));
import {HarnessEngine} from './harness-engine';
it('seeds data only from selected component, never mixes newer app plugins into old engine',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-data-seed-'));
  try {
    const seed=path.join(root,'new-seed'),old=path.join(root,'old-bundle'),home=path.join(root,'data');
    for(const [base,names] of [[seed,['studio-data']],[old,['studio-brand','studio-tools']]] as const)
      for(const name of names){const dir=path.join(base,'plugins',name);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'index.js'),`original ${name}`);}
    const engine=new HarnessEngine({root:home,seed,workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
    const seedFiles=(engine as unknown as {seedUserFiles:(root:string)=>Promise<string>}).seedUserFiles.bind(engine);
    const user=await seedFiles(old);const plugin=path.join(user,'profiles/node_modules/@langbai/dsh-studio-data/index.js');
    await expect(fs.access(plugin)).rejects.toThrow();
    await fs.cp(path.join(seed,'plugins/studio-data'),path.join(old,'plugins/studio-data'),{recursive:true});await seedFiles(old);
    expect(await fs.readFile(plugin,'utf8')).toBe('original studio-data');
    const patch=path.join(user,'studio-data.patch.yml'),custom=path.join(user,'studio.patch.yml');
    await fs.writeFile(plugin,'custom data plugin');await fs.writeFile(patch,'custom overlay');await fs.writeFile(custom,'custom user composition');
    await seedFiles(old);
    expect(await fs.readFile(plugin,'utf8')).toBe('custom data plugin');expect(await fs.readFile(patch,'utf8')).toBe('custom overlay');expect(await fs.readFile(custom,'utf8')).toBe('custom user composition');
  } finally {if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('studio-data-seed-'))await fs.rm(root,{recursive:true,force:true});}
});
