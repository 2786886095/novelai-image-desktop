import * as fs from 'node:fs/promises';
import path from 'node:path';
/** Adapter only for the two pinned JSONL publish sites, not a global fs patch.
 * SELinux may reject link(2). A per-target mkdir lock keeps exclusive publication;
 * rename exposes a complete fsynced file. A stale lock fails closed for recovery.
 */
export async function publishAndroid(source,target,io=fs){
  try {await io.link(source,target);return;}catch(error){if(!['EPERM','EOPNOTSUPP','ENOTSUP'].includes(error.code))throw error;}
  if(path.dirname(source)!==path.dirname(target))throw new Error('Android publication requires same-directory staging');
  const lock=target+'.studio-publish-lock';
  await io.mkdir(lock,{mode:0o700});
  try{
    try{await io.lstat(target);throw Object.assign(new Error('Publish target exists'),{code:'EEXIST'});}
    catch(error){if(error.code!=='ENOENT')throw error;}
    await io.rename(source,target);
  }finally{await io.rmdir(lock);}
}
