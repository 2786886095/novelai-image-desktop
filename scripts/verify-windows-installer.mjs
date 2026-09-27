// Decode the actual embedded app archive with NSIS's actual Nsis7z plugin, NOT 7-Zip.
// The decoder-only executable is silent, writes only into the isolated evidence directory,
// and never registers/uninstalls an app or accesses the user's Studio profile.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {crc32} from 'node:zlib';
const require=createRequire(import.meta.url);
const {getMakeNsisPath,getNsisPluginsPath}=require('app-builder-lib/out/toolsets/windows.js');
if(process.platform!=='win32')throw Error('Windows installer decoder verification requires Windows');
const installer=path.resolve(process.argv[2]);
const expected=path.resolve(process.argv[3]);
const evidence=path.resolve(process.argv[4]??'release/installer-smoke');
await fs.mkdir(evidence,{recursive:true});
const work=await fs.mkdtemp(path.join(evidence,'decode-'));
const decoded=path.join(work,'decoded');await fs.mkdir(decoded);
const bytes=await fs.readFile(installer),signature=Buffer.from('377abcaf271c','hex');
let found=-1,end=0;
for(let i=bytes.indexOf(signature);i>=0;i=bytes.indexOf(signature,i+1)){
 if(i+32>bytes.length)continue;
 const next=Number(bytes.readBigUInt64LE(i+12)),size=Number(bytes.readBigUInt64LE(i+20));
 if(Number.isSafeInteger(next)&&Number.isSafeInteger(size)&&next>1024&&size>0&&i+32+next+size<=bytes.length
   &&crc32(bytes.subarray(i+12,i+32))===bytes.readUInt32LE(i+8)
   &&crc32(bytes.subarray(i+32+next,i+32+next+size))===bytes.readUInt32LE(i+28)){found=i;end=i+32+next+size;break;}
}
if(found<0)throw Error('No embedded 7z app payload found');
const archive=path.join(work,'app.7z');await fs.writeFile(archive,bytes.subarray(found,end));
const tool=await getMakeNsisPath(),plugins=await getNsisPluginsPath();
function quote(s){if(/[\r\n"$]/.test(s))throw Error('Unsupported NSIS test path');return s.replaceAll('/','\\');}
const exe=path.join(work,'decode.exe'),script=path.join(work,'decode.nsi');
await fs.writeFile(script,`Unicode true\nName "Studio isolated decoder verification"\nOutFile "${quote(exe)}"\nSilentInstall silent\nRequestExecutionLevel user\n!addplugindir /x86-unicode "${quote(path.join(plugins,'x86-unicode'))}"\nSection\nSetOutPath "${quote(decoded)}"\nNsis7z::Extract "${quote(archive)}"\nSectionEnd\n`);
for(const [name,cmd,args] of [['compile',tool.path,['-INPUTCHARSET','UTF8',script]],['decode',exe,[]]]){
 const r=spawnSync(cmd,args,{windowsHide:true,timeout:240000,encoding:'utf8',env:{...process.env,...tool.env}});
 await fs.writeFile(path.join(work,name+'.log'),(r.stdout??'')+(r.stderr??''));
 if(r.status!==0||r.error)throw Error(name+': '+(r.error?.message??r.stderr));
}
let checked=0;const errors=[];
async function compare(dir,relative=''){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const name=relative?relative+'/'+entry.name:entry.name;
  if(entry.isDirectory())await compare(path.join(dir,entry.name),name);
  else if(entry.isFile()){
   try{const source=await fs.readFile(path.join(dir,entry.name)),actual=await fs.readFile(path.join(decoded,name));
    if(!source.equals(actual))errors.push('HASH '+name);else checked++;
   }catch(e){errors.push(e.code+' '+name);}
  }else errors.push('Unsupported file '+name);
 }
}
await compare(expected);
const result={installer,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),decoder:plugins,decoded,checked,errors,pass:errors.length===0};
await fs.writeFile(path.join(evidence,path.basename(installer)+'.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({checked,errors:errors.slice(0,15),pass:result.pass,decoded}));
if(!result.pass)process.exitCode=1;
