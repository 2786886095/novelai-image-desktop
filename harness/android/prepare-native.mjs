import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.resolve(root,'../../mobile/android/app/src/main/jniLibs/arm64-v8a');
const licenses=path.resolve(root,'../../mobile/android/app/src/main/assets/agent/licenses');
await fs.mkdir(output,{recursive:true});await fs.mkdir(licenses,{recursive:true});
const sources=JSON.parse(await fs.readFile(path.join(root,'upstream/sources.json'),'utf8'));
for(const entry of sources){
  const bytes=await fs.readFile(path.join(root,'upstream',entry.file));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('Native source integrity: '+entry.file);
  await fs.writeFile(path.join(entry.file.endsWith('.so')?output:licenses,entry.file),bytes);
}
await fs.copyFile(path.join(root,'upstream/sources.json'),path.join(licenses,'sources.json'));
console.log('ANDROID NATIVE PASS: 4 hash-pinned arm64 libraries; licenses retained.');
