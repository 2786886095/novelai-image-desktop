import {it,expect} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {HarnessEngine} from './harness-engine';
it('includes the durable layout helper in packaged desktop resources',async()=>{
 const pkg=JSON.parse(await fs.readFile(path.resolve('package.json'),'utf8'));
 const entries=JSON.stringify(pkg.build);
 expect(entries).toContain('panel-layout-store.js');
 const resource=pkg.build.win.extraResources.find((v:any)=>v.to==='studio-library');
 expect(resource.filter).toContain('panel-layout-store.js');
});
it('loads the managed UI by disabling and inserting, leaving installed plugin files unchanged',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-panel-patch-'));
 try{
  const seed=path.join(root,'seed'),source=path.join(root,'source'),home=path.join(root,'home'),installed=path.join(home,'user-home/profiles/node_modules/@langbai/dsh-studio-library');
  const names=['package.json','index.js','protocol.js','jev-config.js','lib/client.js'];
  for(const folder of [path.join(seed,'plugins/studio-library'),source,installed])for(const name of names){await fs.mkdir(path.dirname(path.join(folder,name)),{recursive:true});await fs.writeFile(path.join(folder,name),'original '+name)}
  await fs.writeFile(path.join(source,'panel-layout-store.js'),'layout helper');await fs.writeFile(path.join(source,'lib/client.js'),'floating panel');
  const engine=new HarnessEngine({root:home,seed,workspace:root,librarySource:source,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
  const patch=await (engine as any).libraryPatch(seed),body=await fs.readFile(patch,'utf8');
  expect(body).toContain('- id: studio-library\n  disabled: true\n- insert:');expect(body).toContain('id: studio-library-managed');
  expect(await fs.readFile(path.join(path.dirname(patch),'lib/client.js'),'utf8')).toBe('floating panel');
  expect(await fs.readFile(path.join(path.dirname(patch),'panel-layout-store.js'),'utf8')).toBe('layout helper');
  expect(await fs.readFile(path.join(installed,'lib/client.js'),'utf8')).toBe('original lib/client.js');
  expect(await (engine as any).libraryPatch(seed)).toBe(patch);
  await fs.writeFile(path.join(installed,'panel-layout-store.js'),'user custom helper');expect(await (engine as any).libraryPatch(seed)).toBe(null);
  await fs.unlink(path.join(installed,'panel-layout-store.js'));await fs.writeFile(path.join(installed,'lib/client.js'),'custom UI');expect(await (engine as any).libraryPatch(seed)).toBe(null);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
