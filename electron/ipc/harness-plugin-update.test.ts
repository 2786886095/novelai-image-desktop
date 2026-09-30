import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
vi.mock('./download-request',()=>({updateFetch:vi.fn()}));
import {updateFetch} from './download-request';
import {planPluginUpgrades,compatibleRelease,selectPluginChanges,applyPluginUpgrades,stagePluginPackages,pluginFingerprint,validatePluginChanges,type PluginMeta} from './harness-plugin-update';
import type {HarnessManifest} from './harness-policy';
const roots:string[]=[];const signal=new AbortController().signal;
const peerOld='^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2',peerNew=peerOld+' || ^0.2.0-rc.1';
const meta=(version:string,range=peerNew):PluginMeta=>({name:'dshmarket',version,peerDependencies:{'@deepseek-ai/dsh-settings':range},dist:{tarball:`https://registry.npmjs.org/dshmarket/-/dshmarket-${version}.tgz`,integrity:'sha512-'+Buffer.alloc(64).toString('base64')}});
const registry={versions:{'1.66.2':meta('1.66.2',peerOld),'1.66.6':meta('1.66.6'),'1.67.0-beta.1':meta('1.67.0-beta.1')}};
const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
async function write(root:string,file:string,value:unknown){const p=path.join(root,file);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,typeof value==='string'?value:JSON.stringify(value));}
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-plugin-'));roots.push(root);
 await write(root,'user-home/profiles/web/package.json',{dependencies:{dshmarket:'1.66.1'},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','dshmarket']}},custom:{preserved:true}});
 await write(root,'user-home/profiles/node_modules/dshmarket/package.json',meta('1.66.1',peerOld));
 await write(root,'user-home/profiles/node_modules/dshmarket/user-extension.txt','kept in backup');
 await write(root,'user-home/settings.json',{example:'untouched'});
 vi.mocked(updateFetch).mockImplementation(async()=>new Response(JSON.stringify(registry)));
 return root;
}
async function candidate(root:string,disable=false){
 const plan=await planPluginUpgrades(root,'0.2.0-rc.2',signal),changes=selectPluginChanges(plan,disable?['dshmarket']:[]);
 const text=JSON.stringify(meta('1.66.6'));await write(root,'candidate/plugin-updates/dshmarket/package.json',text);
 const manifest={pluginChanges:changes,files:{'plugin-updates/dshmarket/package.json':hash(text)}} as unknown as HarnessManifest;
 return {plan,manifest,bundle:path.join(root,'candidate')};
}
afterEach(async()=>{vi.mocked(updateFetch).mockReset();for(const root of roots.splice(0))if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('harness-plugin-'))await fs.rm(root,{recursive:true,force:true});});
it('selects a declared-compatible newer stable release, never widens peer ranges',()=>{
 expect(compatibleRelease('dshmarket','1.66.1','0.2.0-rc.2',registry.versions)?.version).toBe('1.66.6');
 expect(compatibleRelease('dshmarket','1.66.6','0.2.0-rc.2',registry.versions)).toBeUndefined();
 expect(compatibleRelease('dshmarket','1.66.1','0.3.0',registry.versions)).toBeUndefined();
});
it('plans without changing user files or downloading tarballs; cancel means no mutation',async()=>{
 const root=await fixture(),home=path.join(root,'user-home'),before=await pluginFingerprint(home);
 const result=await planPluginUpgrades(root,'0.2.0-rc.2',signal);expect(result).toHaveLength(1);expect(result[0]).toMatchObject({name:'dshmarket',version:'1.66.6',canDisable:true});
 expect(await pluginFingerprint(home)).toBe(before);expect(vi.mocked(updateFetch).mock.calls).toHaveLength(1);expect(vi.mocked(updateFetch).mock.calls[0][0]).not.toContain('.tgz');
});
it('missing release and network errors preserve an explicit disable-or-cancel choice',async()=>{
 const root=await fixture();vi.mocked(updateFetch).mockResolvedValue(new Response(JSON.stringify({versions:{'1.66.2':meta('1.66.2',peerOld)}})));
 let plan=await planPluginUpgrades(root,'0.2.0-rc.2',signal);expect(plan[0].version).toBeUndefined();expect(plan[0].canDisable).toBe(true);expect(selectPluginChanges(plan)).toEqual([]);expect(selectPluginChanges(plan,['dshmarket'])[0].action).toBe('disable');
 vi.mocked(updateFetch).mockRejectedValue(Error('offline'));plan=await planPluginUpgrades(root,'0.2.0-rc.2',signal);expect(plan[0].reason).toContain('offline');expect(()=>selectPluginChanges(plan,['unknown'])).toThrow();
});
it('upgrades only approved packages and restores exact old files/config on rollback',async()=>{
 const root=await fixture(),home=path.join(root,'user-home'),before=await pluginFingerprint(home),{manifest,bundle}=await candidate(root);
 const tx=await applyPluginUpgrades(root,bundle,manifest);
 expect(JSON.parse(await fs.readFile(path.join(home,'profiles/node_modules/dshmarket/package.json'),'utf8')).version).toBe('1.66.6');
 expect(JSON.parse(await fs.readFile(path.join(home,'profiles/web/package.json'),'utf8')).dependencies.dshmarket).toBe('1.66.6');
 expect(JSON.parse(await fs.readFile(path.join(home,'settings.json'),'utf8'))).toEqual({example:'untouched'});
 await tx.rollback();expect(await pluginFingerprint(home)).toBe(before);
});
it('disables only approved bundle references, retains plugin bytes and custom settings, and rolls back',async()=>{
 const root=await fixture(),home=path.join(root,'user-home'),before=await pluginFingerprint(home),{manifest,bundle}=await candidate(root,true);
 const tx=await applyPluginUpgrades(root,bundle,manifest),profile=JSON.parse(await fs.readFile(path.join(home,'profiles/web/package.json'),'utf8'));
 expect(profile.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base']);expect(profile.custom).toEqual({preserved:true});expect(profile.dependencies.dshmarket).toBe('1.66.1');
 expect(await fs.readFile(path.join(home,'profiles/node_modules/dshmarket/user-extension.txt'),'utf8')).toBe('kept in backup');
 await tx.rollback();expect(await pluginFingerprint(home)).toBe(before);
});
it.each(['package','profile'])('rejects changed %s before any live mutation',async kind=>{
 const root=await fixture(),{manifest,bundle}=await candidate(root),home=path.join(root,'user-home');
 await write(root,kind==='package'?'user-home/profiles/node_modules/dshmarket/new.txt':'user-home/profiles/web/package.json','changed');
 const before=await pluginFingerprint(home);await expect(applyPluginUpgrades(root,bundle,manifest)).rejects.toThrow('变化');expect(await pluginFingerprint(home)).toBe(before);
});
it('rejects corrupt candidate and path traversal without altering originals',async()=>{
 const root=await fixture(),home=path.join(root,'user-home'),before=await pluginFingerprint(home),{manifest,bundle}=await candidate(root);
 await write(root,'candidate/plugin-updates/dshmarket/package.json','corrupt');await expect(applyPluginUpgrades(root,bundle,manifest)).rejects.toThrow('校验');expect(await pluginFingerprint(home)).toBe(before);
 expect(()=>validatePluginChanges([{...manifest.pluginChanges![0],directory:'profiles/../../node_modules/dshmarket'}])).toThrow();
});
it('vendors hoisted/scoped dependencies, keeps cycles finite and skips absent optional dependencies',async()=>{
 const root=await fixture(),{manifest}=await candidate(root),runtime=path.join(root,'runtime'),target=path.join(root,'staged');
 await write(runtime,'node_modules/dshmarket/package.json',{...meta('1.66.6'),dependencies:{'@demo/dep':'1.0.0'},optionalDependencies:{optional:'1.0.0'}});
 await write(runtime,'node_modules/@demo/dep/package.json',{name:'@demo/dep',version:'1.0.0',dependencies:{dshmarket:'1.66.6'}});
 const files:Record<string,string>={};await stagePluginPackages(runtime,target,manifest.pluginChanges!,files,signal);
 expect(Object.keys(files).sort()).toEqual(['plugin-updates/dshmarket/node_modules/@demo/dep/package.json','plugin-updates/dshmarket/package.json']);
});
it('does not offer unrelated, already disabled or host packages',async()=>{
 const root=await fixture();await write(root,'user-home/profiles/web/package.json',{dsh:{profile:{bundles:['@deepseek-ai/dsh-base']}}});
 expect(await planPluginUpgrades(root,'0.2.0-rc.2',signal)).toEqual([]);expect(updateFetch).not.toHaveBeenCalled();
});
it('rolls back an already swapped plugin if the following profile write fails',async()=>{
 const root=await fixture(),home=path.join(root,'user-home'),before=await pluginFingerprint(home),{manifest,bundle}=await candidate(root);
 const original=fs.writeFile;let failed=false;
 const spy=vi.spyOn(fs,'writeFile').mockImplementation(async(file,...args)=>{
  if(!failed&&String(file)===path.join(home,'profiles/web/package.json')){failed=true;throw Error('fixture write failure');}
  return original(file,...args);
 });
 try{await expect(applyPluginUpgrades(root,bundle,manifest)).rejects.toThrow('fixture write failure');}finally{spy.mockRestore();}
 expect(failed).toBe(true);expect(await pluginFingerprint(home)).toBe(before);
});
