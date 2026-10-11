import {rename as renameOnce} from 'node:fs/promises';

// Retry only the same atomic commit when Windows briefly locks a freshly
// written file/directory. Never delete the target or replay the whole create.
export function retryingRename(operation,{platform=process.platform,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 return async function rename(from,to){
  for(let attempt=0;;attempt++){
   try{return await operation(from,to);}
   catch(error){
    if(platform!=='win32'||!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=7)throw error;
    await sleep(100*(attempt+1));
   }
  }
 };
}
export const rename=retryingRename(renameOnce);

export function adaptRename(source){
 const pattern=/import\s*\{([^}]+)\}\s*from\s*['"]node:fs\/promises['"]/;
 const match=source.match(pattern);
 if(!match||!match[1].split(',').some(x=>x.trim()==='rename'))throw Error('Roleplay rename adapter no longer matches upstream');
 return "import {rename} from './studio-fs-rename.mjs';\n"+source.replace(pattern,(_all,names)=>`import {${names.split(',').filter(x=>x.trim()!=='rename').join(',')}} from 'node:fs/promises'`);
}
