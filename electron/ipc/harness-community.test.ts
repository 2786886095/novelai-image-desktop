import {it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
vi.mock('node:child_process',()=>({spawn:vi.fn(),execFile:vi.fn()}));
import {HarnessEngine} from './harness-engine';
it.each(['nested','hoisted'])('seeds %s runtime plugins without replacing user code, composition or data',async(layout)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-community-test-'));
 try {
  const seed=path.join(root,'seed'),home=path.join(root,'home');
  for(const name of ['studio-brand','studio-tools','studio-library']){const dir=path.join(seed,'plugins',name);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'index.js'),name);}
  const community=path.join(seed,'community');await fs.mkdir(path.join(community,'packages/example-plugin'),{recursive:true});
  await fs.writeFile(path.join(community,'packages/example-plugin/package.json'),'{}');await fs.writeFile(path.join(community,'packages/example-plugin/index.js'),'original');
  await fs.writeFile(path.join(community,'manifest.json'),JSON.stringify({harnessServices:'0.1.5-rc.3',packages:['example-plugin']}));await fs.writeFile(path.join(community,'community.patch.yml'),'original patch');
  const version=path.join(seed,layout==='nested'?'runtime/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-settings':'runtime/node_modules/@deepseek-ai/dsh-settings');await fs.mkdir(version,{recursive:true});await fs.writeFile(path.join(version,'package.json'),JSON.stringify({version:'0.1.5-rc.3'}));
  const engine=new HarnessEngine({root:home,seed,workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
  const run=(engine as unknown as {seedUserFiles:(bundle:string)=>Promise<string>}).seedUserFiles.bind(engine);
  const user=await run(seed),file=path.join(user,'profiles/node_modules/example-plugin/index.js'),patch=path.join(user,'studio-community.patch.yml');
  expect(await fs.readFile(file,'utf8')).toBe('original');expect(await fs.readFile(patch,'utf8')).toBe('original patch');
  const defaults=path.join(user,'studio-roleplay-default.patch.yml');expect(await fs.readFile(defaults,'utf8')).toContain('default: roleplay');await fs.writeFile(defaults,'user default');
  await fs.writeFile(file,'user edits');await fs.writeFile(patch,'user composition');await run(seed);
  expect(await fs.readFile(defaults,'utf8')).toBe('user default');
  expect(await fs.readFile(file,'utf8')).toBe('user edits');expect(await fs.readFile(patch,'utf8')).toBe('user composition');
  expect(await fs.readFile(path.join(user,'profiles/node_modules/@langbai/dsh-studio-library/index.js'),'utf8')).toBe('studio-library');
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('studio-community-test-'))await fs.rm(root,{recursive:true,force:true});}
});
