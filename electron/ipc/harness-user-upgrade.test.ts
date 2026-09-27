import {it,expect} from 'vitest';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {upgradeBundledUserFiles} from './harness-user-upgrade';
it('retargets a hoisted runtime SDK and restores its original nested link on rollback',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-migration-'));
 try{
  const home=path.join(root,'user-home/profiles/node_modules'),old=path.join(root,'versions/old/runtime/node_modules/app/node_modules/sdk'),next=path.join(root,'versions/new');
  await fs.mkdir(home,{recursive:true});await fs.mkdir(old,{recursive:true});await fs.mkdir(path.join(next,'runtime/node_modules/sdk'),{recursive:true});
  const link=path.join(home,'sdk');await fs.symlink(old,link,process.platform==='win32'?'junction':'dir');
  const result=await upgradeBundledUserFiles(root,{files:{}} as any,next,{files:{}} as any);
  expect(result.links).toBe(1);expect(await fs.realpath(link)).toBe(await fs.realpath(path.join(next,'runtime/node_modules/sdk')));
  await result.rollback();expect(await fs.realpath(link)).toBe(await fs.realpath(old));
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('harness-migration-'))await fs.rm(root,{recursive:true,force:true});}
});
it('migrates only untouched bundled code and owned links, and supports transaction rollback',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-migration-'));const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
 try {
  const home=path.join(root,'user-home/profiles/node_modules'),old=path.join(root,'versions/old'),next=path.join(root,'versions/new');
  const write=async(p:string,s:string)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,s);};
  const relative='plugins/studio-brand/index.js',custom='plugins/studio-brand/custom.js';
  await write(path.join(home,'@langbai/dsh-studio-brand/index.js'),'old');await write(path.join(home,'@langbai/dsh-studio-brand/custom.js'),'user edit');
  await write(path.join(next,relative),'new');await write(path.join(next,custom),'new custom');
  await fs.mkdir(path.join(old,'runtime/node_modules/test'),{recursive:true});await fs.mkdir(path.join(next,'runtime/node_modules/test'),{recursive:true});
  const link=path.join(home,'test');await fs.symlink(path.join(old,'runtime/node_modules/test'),link,process.platform==='win32'?'junction':'dir');
  const result=await upgradeBundledUserFiles(root,{files:{[relative]:hash('old'),[custom]:hash('shipped')}} as any,next,{files:{[relative]:hash('new'),[custom]:hash('new custom')}} as any);
  expect(result).toMatchObject({changed:0,custom:2,links:1});expect(await fs.readFile(path.join(home,'@langbai/dsh-studio-brand/custom.js'),'utf8')).toBe('user edit');
  expect(await fs.readFile(path.join(home,'@langbai/dsh-studio-brand/index.js'),'utf8')).toBe('old');
  expect(await fs.realpath(link)).toBe(await fs.realpath(path.join(next,'runtime/node_modules/test')));
  await result.rollback();expect(await fs.readFile(path.join(home,'@langbai/dsh-studio-brand/index.js'),'utf8')).toBe('old');expect(await fs.realpath(link)).toBe(await fs.realpath(path.join(old,'runtime/node_modules/test')));
 } finally {if(path.dirname(root)===os.tmpdir() && path.basename(root).startsWith('harness-migration-'))await fs.rm(root,{recursive:true,force:true});}
});
it('updates an untouched package coherently, removes obsolete files and restores all bytes on rollback',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-migration-'));
 const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
 const prefix='community/packages/example/';const home=path.join(root,'user-home/profiles/node_modules/example');const next=path.join(root,'versions/new');
 const write=async(p:string,s:string)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,s);};
 try{
  await write(path.join(home,'index.js'),'old');await write(path.join(home,'obsolete.js'),'obsolete');
  await write(path.join(next,prefix,'index.js'),'new');await write(path.join(next,prefix,'new.js'),'added');
  const before={files:{[prefix+'index.js']:hash('old'),[prefix+'obsolete.js']:hash('obsolete')}} as any;
  const after={files:{[prefix+'index.js']:hash('new'),[prefix+'new.js']:hash('added')}} as any;
  const result=await upgradeBundledUserFiles(root,before,next,after);
  expect(result.changed).toBe(3);expect(await fs.readFile(path.join(home,'index.js'),'utf8')).toBe('new');
  await expect(fs.access(path.join(home,'obsolete.js'))).rejects.toThrow();
  await result.rollback();expect(await fs.readFile(path.join(home,'index.js'),'utf8')).toBe('old');expect(await fs.readFile(path.join(home,'obsolete.js'),'utf8')).toBe('obsolete');
  await expect(fs.access(path.join(home,'new.js'))).rejects.toThrow();
  await write(path.join(home,'my-plugin-config.json'),'user');
  expect((await upgradeBundledUserFiles(root,before,next,after)).changed).toBe(0);
  expect(await fs.readFile(path.join(home,'index.js'),'utf8')).toBe('old');
  await fs.unlink(path.join(home,'my-plugin-config.json'));await fs.unlink(path.join(home,'obsolete.js'));
  expect((await upgradeBundledUserFiles(root,before,next,after)).changed).toBe(0);
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('harness-migration-'))await fs.rm(root,{recursive:true,force:true});}
});
it('updates only untouched shipped composition and rolls its defaults back exactly',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-migration-')),hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
 const next=path.join(root,'versions/new'),rel='community/community.patch.yml',target=path.join(root,'user-home/studio-community.patch.yml');
 try{
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.mkdir(path.join(next,'community'),{recursive:true});
  await fs.writeFile(target,'chatMaxStepsPerRun: 5');await fs.writeFile(path.join(next,rel),'chatMaxStepsPerRun: 12');
  const before={files:{[rel]:hash('chatMaxStepsPerRun: 5')}} as any,after={files:{[rel]:hash('chatMaxStepsPerRun: 12')}} as any;
  const result=await upgradeBundledUserFiles(root,before,next,after);expect(result.changed).toBe(1);expect(await fs.readFile(target,'utf8')).toContain(': 12');
  await result.rollback();expect(await fs.readFile(target,'utf8')).toBe('chatMaxStepsPerRun: 5');
  await fs.writeFile(target,'chatMaxStepsPerRun: 5\n# user customization');
  const custom=await upgradeBundledUserFiles(root,before,next,after);expect(custom.changed).toBe(0);expect(custom.custom).toBe(1);expect(await fs.readFile(target,'utf8')).toContain('# user customization');
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('harness-migration-'))await fs.rm(root,{recursive:true,force:true});}
});
