// CI consumes the same reviewed archive as the standalone component release.
// Download to a new staging directory; never touch a user's Agent home.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import JSZip from 'jszip';
const root=process.cwd();
const lock=JSON.parse(await fs.readFile(path.join(root,'harness/release-seed.json'),'utf8'));
if(process.platform!=='win32'||process.arch!=='x64')throw Error('This seed is Windows x64 only');
if(lock.tag!=='agent-v0.1.2'||lock.asset!=='tavern-agent-win32-x64-protocol1.zip'||!/^[a-f0-9]{64}$/.test(lock.sha256))throw Error('Invalid seed lock');
const destination=path.join(root,'.tmp/harness-component012');
try{await fs.access(destination);throw Error('Seed destination already exists; do not overwrite it');}catch(e){if(e.code!=='ENOENT')throw e;}
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'studio-release-seed-'));
execFileSync('gh',['release','download',lock.tag,'--repo','2786886095/novelai-image-desktop','--pattern',lock.asset,'--dir',temp],{stdio:'inherit',timeout:600000,windowsHide:true});
const bytes=await fs.readFile(path.join(temp,lock.asset));
if(bytes.length!==lock.size||crypto.createHash('sha256').update(bytes).digest('hex')!==lock.sha256)throw Error('Seed archive checksum mismatch');
const zip=await JSZip.loadAsync(bytes),manifest=JSON.parse(await zip.file('manifest.json').async('string'));
if(manifest.version!==lock.tag.slice(7)||manifest.platform!=='win32'||manifest.arch!=='x64'||manifest.protocol!==1)throw Error('Incompatible seed manifest');
const staging=path.join(temp,'verified');let count=0;
for(const [name,hash] of Object.entries(manifest.files)){
 if(name.includes('\\')||name.includes(':')||name.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid seed member');
 const file=zip.file(name);if(!file||(file.unsafeOriginalName&&file.unsafeOriginalName!==name))throw Error('Missing/unsafe seed member');
 const data=await file.async('nodebuffer');
 if(crypto.createHash('sha256').update(data).digest('hex')!==hash)throw Error('Seed member checksum mismatch: '+name);
 const target=path.join(staging,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data,{flag:'wx'});count++;
}
await fs.writeFile(path.join(staging,'manifest.json'),JSON.stringify(manifest));
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.cp(staging,destination,{recursive:true,errorOnExist:true,force:false});
console.log(`PINNED_AGENT_SEED_OK ${manifest.version}; ${count} verified members; ${lock.sha256}`);
