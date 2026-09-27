import fs from 'node:fs/promises';
import path from 'node:path';
type Link = {path:string;target:string;kind:'directory'|'file'|'unknown'};
/** Back up editable files without recreating Windows symbolic links (which require privileges).
 * Link destinations remain in retained engine slots; record them without traversing external data.
 * COMPLETE is written last; incomplete snapshots must not be used for recovery. */
export async function backupHarnessHome(source:string,destination:string) {
  const links:Link[]=[];
  await fs.mkdir(destination,{recursive:false});
  const walk=async(relative:string)=>{
    const from=path.join(source,relative),to=path.join(destination,relative);
    const stat=await fs.lstat(from);
    if(stat.isSymbolicLink()){
      const target=path.resolve(path.dirname(from),await fs.readlink(from));
      const kind=await fs.stat(from).then(s=>s.isDirectory()?'directory' as const:'file' as const).catch(()=>'unknown' as const);
      links.push({path:relative,target,kind});return;
    }
    if(stat.isDirectory()){await fs.mkdir(to,{recursive:true});for(const name of await fs.readdir(from))await walk(path.join(relative,name));}
    else if(stat.isFile())await fs.copyFile(from,to);
    else throw Error('Unsupported Agent backup entry: '+relative);
  };
  for(const name of await fs.readdir(source))await walk(name);
  await fs.writeFile(path.join(destination,'.studio-backup-links.json'),JSON.stringify({format:1,links},null,2),{flag:'wx'});
  await fs.writeFile(path.join(destination,'.studio-backup-complete'),'1\n',{flag:'wx'});
  return {links:links.length};
}

/** Restore into a NEW location only. Keep the previous engine slot until recovery is verified. */
export async function restoreHarnessBackup(source:string,destination:string){
  if(await fs.readFile(path.join(source,'.studio-backup-complete'),'utf8')!=='1\n')throw Error('Incomplete Agent backup');
  const manifest=JSON.parse(await fs.readFile(path.join(source,'.studio-backup-links.json'),'utf8'));
  if(manifest.format!==1 || !Array.isArray(manifest.links))throw Error('Invalid Agent backup manifest');
  const links=manifest.links as Link[];
  for(const link of links){
    if(typeof link.path!=='string'||typeof link.target!=='string'||!path.isAbsolute(link.target) || !['file','directory','unknown'].includes(link.kind))throw Error('Invalid backup link');
    const relative=path.relative(path.resolve(destination),path.resolve(destination,link.path));
    if(!relative || relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Backup link escapes destination');
    // A recorded link may not be the ancestor of another link.
    if(links.some(other=>other!==link && (other.path===link.path || other.path.startsWith(link.path+path.sep))))throw Error('Nested backup links');
  }
  await fs.mkdir(destination,{recursive:false});
  const walk=async(relative:string)=>{
    const from=path.join(source,relative),to=path.join(destination,relative),stat=await fs.lstat(from);
    if(stat.isSymbolicLink())throw Error('Unexpected link in backup files');
    if(stat.isDirectory()){await fs.mkdir(to,{recursive:true});for(const name of await fs.readdir(from))await walk(path.join(relative,name));}
    else if(stat.isFile())await fs.copyFile(from,to);
    else throw Error('Unsupported backup entry');
  };
  for(const name of await fs.readdir(source))if(!['.studio-backup-links.json','.studio-backup-complete','.studio-backup-active.json'].includes(name))await walk(name);
  for(const link of links){
    const to=path.join(destination,link.path);
    // Parent directories come only from the regular snapshot; links were not traversed above.
    await fs.symlink(link.target,to,link.kind==='directory'?(process.platform==='win32'?'junction':'dir'):'file');
  }
  return {links:links.length};
}
