// Package only manifest-listed, verified files. Never package a user's Agent home.
import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
const require=createRequire(import.meta.url);
const {validateManifest,verifyBundle}=require('../dist-electron/electron/ipc/harness-policy.js');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
const seed=path.resolve(project,pkg.build.win.extraResources.find(e=>e.to==='harness-seed')?.from ?? '.tmp/harness-release240');
const manifest=validateManifest(JSON.parse(await fs.readFile(path.join(seed,'manifest.json'),'utf8')));
await verifyBundle(seed,manifest);
const out=path.resolve(process.argv[2] ?? path.join(project,'artifacts',`agent-v${manifest.version}`));await fs.mkdir(out,{recursive:true});
const file=path.join(out,`tavern-agent-${manifest.platform}-${manifest.arch}-protocol${manifest.protocol}.zip`);
const zip=new JSZip();zip.file('manifest.json',JSON.stringify(manifest));
for(const [name,hash] of Object.entries(manifest.files)){
 const bytes=await fs.readFile(path.join(seed,name));if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Bundle changed while packaging: '+name);
 zip.file(name,bytes,{date:new Date('2026-01-01T00:00:00Z')});
}
await pipeline(zip.generateNodeStream({streamFiles:true,compression:'DEFLATE',compressionOptions:{level:6}}),createWriteStream(file,{flags:'wx'}));
const bytes=await fs.readFile(file),archive=await JSZip.loadAsync(bytes);
for(const [name,hash] of Object.entries(manifest.files))if(crypto.createHash('sha256').update(await archive.file(name).async('nodebuffer')).digest('hex')!==hash)throw Error('Archive verification failed: '+name);
await fs.writeFile(file+'.sha256',crypto.createHash('sha256').update(bytes).digest('hex')+'  '+path.basename(file)+'\n');
console.log(`RELEASE PACKAGE PASS: agent-v${manifest.version}; ${Object.keys(manifest.files).length} verified members; ${bytes.length} bytes; ${file}`);
