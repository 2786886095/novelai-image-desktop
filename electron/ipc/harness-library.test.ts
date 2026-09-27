import {it,expect} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {HarnessEngine} from './harness-engine';
it('loads current app UI without writing user files, keeps customized integrations active',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-library-test-'));
 try{
 const bundle=path.join(root,'bundle'),source=path.join(root,'new-ui'),user=path.join(root,'user-home/profiles/node_modules/@langbai/dsh-studio-library');
 const names=['package.json','index.js','protocol.js','jev-config.js','lib/client.js'];
 for(const name of names)for(const [base,value] of [[path.join(bundle,'plugins/studio-library'),'original'],[source,'new'],[user,'original']]){await fs.mkdir(path.dirname(path.join(base,name)),{recursive:true});await fs.writeFile(path.join(base,name),value);}
 await fs.writeFile(path.join(source,'panel-layout-store.js'),'managed helper');
 const engine=new HarnessEngine({root,seed:bundle,workspace:root,librarySource:source,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})});
 const patch=await (engine as any).libraryPatch(bundle);expect(patch).toContain('managed-library');expect(await fs.readFile(patch,'utf8')).toContain('- id: studio-library');
 expect(await fs.readFile(path.join(user,'lib/client.js'),'utf8')).toBe('original');
 await fs.writeFile(path.join(user,'lib/client.js'),'user customization');expect(await (engine as any).libraryPatch(bundle)).toBeNull();
 expect(await fs.readFile(path.join(user,'lib/client.js'),'utf8')).toBe('user customization');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
