// Executed INSIDE the guest. APK/startup never overwrite existing plugins.
// An explicit runtime upgrade migrates unchanged official packages on a COPY.
import fs from 'node:fs/promises';
import path from 'node:path';
import {seedEntry} from './seed-upgrade.mjs';
const home=process.env.DSH_HOME;
if(!home || !['/studio-home','/probe-home'].includes(home))throw new Error('Invalid Agent home');
const source='/opt/agent';
const previous=process.env.STUDIO_PREVIOUS_SEED;
if(previous && previous!=='/studio-previous-seed')throw new Error('Invalid previous seed');
async function copyOnce(from,to){
  // A user-managed linked scope/directory is not a seed destination.
  for(let parent=path.dirname(to);parent!==home;parent=path.dirname(parent)){
    if(!parent.startsWith(home+'/'))throw new Error('Seed destination escapes home');
    try{if((await fs.lstat(parent)).isSymbolicLink())return;}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const old=previous ? path.join(previous,path.relative(source,from)) : null;
  const result=await seedEntry(from,to,old);
  if(result==='updated')console.log('Official plugin upgraded: '+path.basename(to));
}
async function patch(name,text){
  try{await fs.writeFile(path.join(home,name),text,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
}
await fs.mkdir(home,{recursive:true});
const manifest=JSON.parse(await fs.readFile(source+'/community/manifest.json','utf8'));
for(const name of manifest.packages){
  if(!/^(?:@[a-z0-9-]+\/)?[a-z0-9-]+$/.test(name))throw new Error('Invalid package');
  await copyOnce(source+'/community/packages/'+name,home+'/profiles/node_modules/'+name);
}
for(const name of ['studio-brand','studio-tools','studio-library','studio-preview','studio-data']){
  await copyOnce(source+'/plugins/'+name,home+'/profiles/node_modules/@langbai/dsh-'+name);
}
await patch('studio-community.patch.yml',await fs.readFile(source+'/community/community.patch.yml','utf8'));
await patch('studio.patch.yml','- id: ui-brand-official\n  disabled: true\n- insert:\n    - id: studio-brand\n      name: "@langbai/dsh-studio-brand"\n    - id: studio-tools\n      name: "@langbai/dsh-studio-tools"\n');
await patch('studio-preview.patch.yml','- insert:\n    - id: studio-preview\n      name: "@langbai/dsh-studio-preview"\n');
await patch('studio-data.patch.yml','- insert:\n    - id: studio-data\n      name: "@langbai/dsh-studio-data"\n');
await patch('studio-roleplay-default.patch.yml','- id: agent-preset-registry\n  config:\n    default: roleplay\n');
console.log('ANDROID HOME PASS: existing user files preserved.');
