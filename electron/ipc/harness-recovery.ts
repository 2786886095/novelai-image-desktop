import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {restoreHarnessBackup} from './harness-backup';
import {validateManifest} from './harness-policy';

async function regularDirectory(directory:string) {
  const stat=await fs.lstat(directory);
  if(stat.isSymbolicLink() || !stat.isDirectory())throw Error('Recovery directory must not be a link');
}
/** Only explicit, local, completed backups may be activated. All current user
 * data is retained under restore-preserved, and neither branch starts a process. */
export async function recoverHarnessHome(root:string, source:string) {
  root=path.resolve(root);source=path.resolve(source);
  const backups=path.join(root,'backups');
  if(path.dirname(source)!==backups)throw Error('Select a dated folder inside the Agent backup directory');
  await regularDirectory(root);await regularDirectory(backups);await regularDirectory(source);
  let incoming:Buffer|null=null;
  try {
    const file=path.join(source,'.studio-backup-active.json');
    if(!(await fs.lstat(file)).isFile()||(await fs.lstat(file)).isSymbolicLink())throw Error('Invalid backup component record');
    incoming=await fs.readFile(file);
    const active=JSON.parse(incoming.toString('utf8'));
    if(typeof active.slot!=='string'||!/^[a-zA-Z0-9.-]+$/.test(active.slot)||active.slot==='.'||active.slot==='..')throw Error('Invalid backup component slot');
    const versions=path.join(root,'versions'),slot=path.join(versions,active.slot);
    await regularDirectory(versions);await regularDirectory(slot);
    validateManifest(JSON.parse(await fs.readFile(path.join(slot,'manifest.json'),'utf8')));
  }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'||incoming)throw e;}
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(4).toString('hex');
  const staged=path.join(root,`restore-staging-${id}`),home=path.join(root,'user-home');
  await restoreHarnessBackup(source,staged); // Full copy/link validation BEFORE touching active data.
  let previous:Buffer|null=null;
  try{previous=await fs.readFile(path.join(root,'active.json'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const preservedRoot=path.join(root,'restore-preserved');await fs.mkdir(preservedRoot,{recursive:true});await regularDirectory(preservedRoot);
  const saved=path.join(preservedRoot,id);await fs.mkdir(saved);
  if(previous)await fs.writeFile(path.join(saved,'active.json'),previous,{flag:'wx'});
  let moved=false,activated=false;
  try {
    try{await regularDirectory(home);await fs.rename(home,path.join(saved,'user-home'));moved=true;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    await fs.rename(staged,home);activated=true;
    if(incoming){const temp=path.join(root,`active-restore-${id}.json`);await fs.writeFile(temp,incoming,{flag:'wx'});await fs.rename(temp,path.join(root,'active.json'));}
  }catch(error){
    if(activated)await fs.rename(home,staged);
    if(moved)await fs.rename(path.join(saved,'user-home'),home);
    throw error;
  }
  return {preserved:saved,componentRestored:!!incoming};
}
