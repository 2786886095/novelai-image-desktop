// Preserve edits to the generated Roleplay preset, not only plugin packages.
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const ledger='.studio-owned-files.json';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function withStudioLedger(files){return {...files,[ledger]:JSON.stringify(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,digest(text)])),null,2)+'\n'};}
async function list(root,prefix=''){
 const files=[];for(const entry of await readdir(resolve(root,prefix),{withFileTypes:true})){
  const name=prefix?`${prefix}/${entry.name}`:entry.name;
  if(entry.isSymbolicLink())return null;
  if(entry.isDirectory()){const children=await list(root,name);if(children===null)return null;files.push(...children);}else files.push(name);
 }return files;
}
export async function hasUserPresetChanges(directory){
 try{
  const hashes=JSON.parse(await readFile(resolve(directory,ledger),'utf8'));if(!hashes||typeof hashes!=='object'||Array.isArray(hashes))return true;
  const files=await list(directory);if(files===null)return true;
  if(files.filter(n=>n!==ledger).length!==Object.keys(hashes).length)return true;
  for(const name of files.filter(n=>n!==ledger))if(hashes[name]!==digest(await readFile(resolve(directory,name))))return true;
  return false;
 }catch{return true;} // Older installs or unreadable/customized ledgers remain user-owned.
}
