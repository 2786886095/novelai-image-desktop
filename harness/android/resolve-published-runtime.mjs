import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export async function reusePublishedRuntime({lock,out,fetcher=fetch,checkSource}){
 const base=`https://github.com/2786886095/novelai-image-desktop/releases/download/agent-v${lock.version}/`;
 const response=await fetcher(base+'android-agent.json');
 if(response.status===404)return false;
 if(!response.ok)throw Error('Published descriptor request failed: '+response.status);
 const meta=await response.json();
 for(const key of ['format','protocol','version','upstream','platform','arch','minSdk'])if(meta[key]!==lock[key])throw Error('Published component differs from lock: '+key);
 if(meta.url!==base+'agent-rootfs.zip'||!Number.isSafeInteger(meta.bytes)||meta.bytes<=0||meta.bytes>768*1024*1024||!/^[a-f0-9]{64}$/.test(meta.sha256))throw Error('Invalid published download descriptor');
 await checkSource('agent-v'+lock.version);
 const archive=await fetcher(meta.url);if(!archive.ok||!archive.body)throw Error('Published component download failed');
 await fs.mkdir(out,{recursive:true});const file=path.join(out,'agent-rootfs.zip'),tmp=file+'.partial';
 const handle=await fs.open(tmp,'wx');let bytes=0;const hash=createHash('sha256');
 try {
  for await(const chunk of archive.body){bytes+=chunk.length;if(bytes>meta.bytes)throw Error('Published archive exceeds declared size');hash.update(chunk);await handle.writeFile(chunk);}
  if(bytes!==meta.bytes||hash.digest('hex')!==meta.sha256)throw Error('Published archive hash/size mismatch');
 }catch(error){await handle.close();await fs.rm(tmp,{force:true});throw error;}
 await handle.close();await fs.rename(tmp,file);
 const seed={...meta,asset:'agent-rootfs.zip'};delete seed.url;
 await fs.writeFile(path.join(out,'seed.json'),JSON.stringify(seed,null,2)+'\n');
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const lock=JSON.parse(await fs.readFile('harness/android/runtime-lock.json','utf8'));
 const reused=await reusePublishedRuntime({lock,out:'artifacts/android-runtime',fetcher:url=>fetch(url,{signal:AbortSignal.timeout(600000)}),checkSource:tag=>{
  // Same component version is immutable. Runtime/plugin changes require a new version.
  execFileSync('git',['diff','--exit-code',tag,'HEAD','--','harness',':!harness/android/resolve-published-runtime.mjs',':!harness/android/tests'],{stdio:'inherit',timeout:30000});
 }});
 if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`reused=${reused}\n`);
 console.log(reused?'PUBLISHED_RUNTIME_REUSED: exact public archive and hash verified':'NEW_COMPONENT_BUILD_REQUIRED');
}
