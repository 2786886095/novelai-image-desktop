import {describe,it,expect} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {installVerifiedBundle,validateManifest,verifyBundle} from './harness-policy';

const exec=promisify(execFile),sha=(bytes:Buffer)=>crypto.createHash('sha256').update(bytes).digest('hex');
describe('verified component Node executable boundary (actual host filesystem)',()=>{
  it('executes the installed host Node without changing bytes or making ordinary data executable',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-node-mode-'));
    try {
      const source=path.join(root,'source'),destination=path.join(root,'installed'),node=process.platform==='win32'?'node.exe':'node';
      await fs.mkdir(path.join(source,'runtime'),{recursive:true});
      await fs.copyFile(process.execPath,path.join(source,node));
      const nodeBytes=await fs.readFile(process.execPath),cli=Buffer.from('console.log("SYNTHETIC_COMPONENT_MODE_BOUNDARY");\n');
      await fs.writeFile(path.join(source,'runtime/entry.js'),cli);
      const manifest=validateManifest({format:1,protocol:1,version:'0.1.7-mode-test',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node,cli:'runtime/entry.js',files:{[node]:sha(nodeBytes),'runtime/entry.js':sha(cli)}});
      await installVerifiedBundle(source,destination,manifest,new AbortController().signal,()=>{});
      await verifyBundle(destination,manifest);
      const installed=path.join(destination,node),result=await exec(installed,['--version'],{timeout:15000,windowsHide:true});
      expect(result.stdout.trim()).toBe(process.version);
      expect(sha(await fs.readFile(installed))).toBe(sha(nodeBytes));
      expect(await fs.readFile(path.join(destination,'runtime/entry.js'))).toEqual(cli);
      if(process.platform!=='win32'){
        expect((await fs.stat(installed)).mode&0o777).toBe(0o755);
        expect((await fs.stat(path.join(destination,'runtime/entry.js'))).mode&0o111).toBe(0);
      }
    } finally {await fs.rm(root,{recursive:true,force:true});}
  },30000);
  it('rejects corrupt Node bytes before activation and retains the input bytes',async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-node-corrupt-'));
    try {
      const source=path.join(root,'source'),destination=path.join(root,'installed');await fs.mkdir(source);
      const bytes=Buffer.from('NOT_AN_EXECUTABLE');await fs.writeFile(path.join(source,'node'),bytes);
      await expect(installVerifiedBundle(source,destination,{format:1,protocol:1,version:'0.1.7-mode-test',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node:'node',cli:'node',files:{node:'0'.repeat(64)}},new AbortController().signal,()=>{})).rejects.toThrow('Component integrity mismatch');
      expect(await fs.readFile(path.join(source,'node'))).toEqual(bytes);
      await expect(fs.access(path.join(destination,'node'))).rejects.toMatchObject({code:'ENOENT'});
    } finally {await fs.rm(root,{recursive:true,force:true});}
  });
});
