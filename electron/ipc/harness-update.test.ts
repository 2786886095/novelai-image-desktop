import {afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import JSZip from 'jszip';
import {downloadCompatibleHarness} from './harness-update';
import {verifyBundle,validateManifest} from './harness-policy';
afterEach(()=>vi.unstubAllGlobals());
it('downloads a compatible independent release, verifies its digest and rejects tampering',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-update-test-'));
 try{
  const hash=(b:Buffer|string)=>crypto.createHash('sha256').update(b).digest('hex');
  const manifest={format:1,protocol:1,version:'0.1.2',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'bin.js',files:{'node.exe':hash('node'),'bin.js':hash('cli')}};
  const zip=new JSZip();zip.file('manifest.json',JSON.stringify(manifest));zip.file('node.exe','node');zip.file('bin.js','cli');const bytes=await zip.generateAsync({type:'nodebuffer'});
  const asset={name:`tavern-agent-${process.platform}-${process.arch}-protocol1.zip`,size:bytes.length,digest:'sha256:'+hash(bytes),url:'https://api.github.com/repos/2786886095/novelai-image-desktop/releases/assets/123'};
  const fetcher=vi.fn(async(input:string)=>input.includes('/assets/')?new Response(bytes):new Response(JSON.stringify([{tag_name:'agent-v0.1.2',assets:[asset],draft:false,prerelease:false}])));
  vi.stubGlobal('fetch',fetcher);const output=await downloadCompatibleHarness(root,new AbortController().signal,()=>{});expect(output).not.toBeNull();await verifyBundle(output!,validateManifest(manifest));
  asset.digest='sha256:'+'0'.repeat(64);await expect(downloadCompatibleHarness(root,new AbortController().signal,()=>{})).rejects.toThrow('摘要');
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('harness-update-test-'))await fs.rm(root,{recursive:true,force:true});}
});
