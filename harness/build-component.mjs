import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceName=process.argv[3]??'harness-runtime-017';
if(!/^[a-zA-Z0-9-]+$/.test(sourceName))throw new Error('Invalid runtime source name');
const source=path.join(repo,'.tmp',sourceName);
const targetName=process.argv[2]??'harness-component';
if(!/^[a-zA-Z0-9-]+$/.test(targetName))throw new Error('Invalid component output name');
const target=path.join(repo,'.tmp',targetName);
const files={};let bytes=0;
async function copyTree(from,relative){
  // Community code comes only from the checked seed, not developer runtime experiments.
  if(relative.startsWith('runtime/') && /\/node_modules\/(?:@lutrodev\/dsh-roleplay|dsh-roleplay-[^/]+|mindspace-dsh-session-memory)(?:\/|$)/.test(relative))return;
  const stat=await fs.lstat(from);
  if(stat.isSymbolicLink())return; // Never bake developer junctions into the distributable.
  if(stat.isDirectory()){
    if(path.basename(from)==='.bin')return;
    for(const name of await fs.readdir(from))await copyTree(path.join(from,name),`${relative}/${name}`);
  }else if(stat.isFile()){
    const destination=path.join(target,relative);await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.copyFile(from,destination);const data=await fs.readFile(destination);
    files[relative]=crypto.createHash('sha256').update(data).digest('hex');bytes+=data.length;
  }
}
await fs.mkdir(target,{recursive:true});
await copyTree(path.join(source,'node_modules'),'runtime/node_modules');
await copyTree(process.execPath,process.platform==='win32'?'node.exe':'node');
await copyTree(path.join(repo,'harness/plugins'),'plugins');
// Community plugins are built separately from pinned, checked archives.
try{await fs.access(path.join(repo,'.tmp/harness-community/manifest.json'));await copyTree(path.join(repo,'.tmp/harness-community'),'community');}
catch(error){if(error.code!=='ENOENT')throw error;}
const packageInfo=JSON.parse(await fs.readFile(path.join(source,'node_modules/@deepseek-ai/dsh/package.json'),'utf8'));
const lock=JSON.parse(await fs.readFile(path.join(repo,'harness/community/lock.json'),'utf8'));
if(packageInfo.version!==lock.harnessCli)throw new Error('Runtime does not match the tested Harness lock');
const manifest={format:1,protocol:1,version:'0.1.7',upstream:packageInfo.version,platform:process.platform,arch:process.arch,node:process.platform==='win32'?'node.exe':'node',cli:'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js',files};
await fs.writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Component prepared: ${manifest.version}, upstream ${manifest.upstream}, ${Object.keys(files).length} hashed files, ${Math.round(bytes/1024/1024)} MiB. User data excluded.`);
