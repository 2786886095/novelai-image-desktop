// Executed INSIDE the guest. Missing files are seeded once; existing user
// profiles/plugins are never replaced by an APK or runtime update.
import fs from 'node:fs/promises';
import path from 'node:path';
const home=process.env.DSH_HOME;
if(!home || !['/studio-home','/probe-home'].includes(home))throw new Error('Invalid Agent home');
const source='/opt/agent';
async function copyOnce(from,to){
  try{await fs.lstat(to);return;}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(path.dirname(to),{recursive:true});
  const temp=to+'.seed-tmp';
  // An interrupted seed copy is never mistaken for a complete user plugin.
  await fs.rm(temp,{recursive:true,force:true});
  await fs.cp(from,temp,{recursive:true,dereference:false,errorOnExist:true,force:false});
  await fs.rename(temp,to);
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
