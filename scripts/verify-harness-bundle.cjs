// electron-builder excludes VCS dotfiles, even when a component manifest needs them.
// Restore ONLY explicitly hashed bundle members, then verify the final seed bytes.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async function(context){
 if(context.electronPlatformName!=='win32')return;
 const pkg=JSON.parse(await fs.readFile(path.join(context.packager.projectDir,'package.json'),'utf8'));
 const entry=(pkg.build.win?.extraResources ?? pkg.build.extraResources ?? []).find(item=>item.to==='harness-seed');
 if(!entry?.from)throw Error('Missing harness-seed build source');
 const source=path.resolve(context.packager.projectDir,entry.from);
 const target=path.join(context.appOutDir,'resources/harness-seed');
 const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
 let restored=0;
 for(const [name,hash] of Object.entries(manifest.files)){
  if(name.includes('\\')||name.includes(':')||name.split('/').some(s=>!s||s==='..'||s==='.'))throw Error('Invalid seed member');
  const file=path.join(target,name);let bytes;
  try{bytes=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;bytes=await fs.readFile(path.join(source,name));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);restored++;}
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Packaged seed hash mismatch: '+name);
 }
 console.log(`HARNESS SEED VERIFIED: ${Object.keys(manifest.files).length} files; ${restored} filtered members restored`);
};
