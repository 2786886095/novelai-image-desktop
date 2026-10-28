import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
// Public executable assets only. Never accepts an image, token or arbitrary URL.
const output=path.resolve(process.argv[2]||'');
if(!process.argv[2]||fs.existsSync(output))throw Error('A fresh explicit external asset directory is required.');
fs.mkdirSync(output,{recursive:true});
const records=[],hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let exit=1,failure;
const provenance=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
try{
 if(process.env.GITHUB_ACTIONS==='true'&&(provenance.status!==0||provenance.stdout.trim()!==process.env.GITHUB_SHA))throw Error('Asset receipt must bind actual CI checkout.');
 const inventory=fs.readFileSync(path.resolve('shared/official-metadata-assets.ts'),'utf8');
 const assets=[...inventory.matchAll(/\{ id: "([^"]+)", url: "([^"]+)", bytes: (\d+), sha256: "([a-f0-9]{64})", kind: "([^"]+)" \}/g)];
 if(assets.length!==10)throw Error('Expected exactly ten pinned production assets.');
 for(const [,id,url,size,sha256]of assets){
  const u=new URL(url);
  if(!/^[a-z-]+$/.test(id)||u.origin!=='https://novelai.net'||!u.pathname.startsWith('/_next/static/')||u.username||u.password)throw Error('Refuse non-fixed public asset.');
  const record={command:`GET ${url}`,id,url,expectedBytes:+size,expectedSha256:sha256,stdout:'',stderr:'',exitStatus:1,method:'GET',requestBodyBytes:0};records.push(record);
  try{
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90000)});record.httpStatus=response.status;
   if(response.status!==200)throw Error(`HTTP ${response.status}`);
   const data=Buffer.from(await response.arrayBuffer());record.bytes=data.length;record.sha256=hash(data);
   if(data.length!==+size||record.sha256!==sha256)throw Error(`Pinned size/SHA mismatch ${id}`);
   fs.writeFileSync(path.join(output,id),data,{flag:'wx'});
   record.stdout=`${id} HTTP=200 bytes=${data.length} SHA256=${record.sha256}\n`;record.exitStatus=0;process.stdout.write(record.stdout);
  }catch(error){record.stderr=String(error.stack||error);throw error;}
 }
 exit=0;
}catch(error){failure=String(error.stack||error);process.stderr.write(failure+'\n');}
finally{
 const receipt={sourceSha:process.env.GITHUB_ACTIONS==='true'&&provenance.status===0?provenance.stdout.trim():'uncommitted',provenanceCommand:{command:['git','rev-parse','HEAD'],stdout:provenance.stdout??'',stderr:provenance.stderr??'',exitStatus:provenance.status},records,exitStatus:exit,failure:failure??null,imagesUploaded:0,paidCalls:0,scope:'ten real pinned public executable assets only; no feature/native execution certification',full195Certified:false};
 fs.writeFileSync(path.join(output,'PUBLIC_ASSET_GETS.json'),JSON.stringify(receipt,null,2)+'\n');process.exitCode=exit;
}
