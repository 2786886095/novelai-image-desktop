import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { afterEach, expect, it } from 'vitest';
import { validateArchiveEntries, parseSevenZipListing, inspectComfyArchive, extractComfyArchive, COMFY_ARCHIVE_EXECUTOR_SHA256, hashComfyFile } from './comfyui-archive';
const roots:string[]=[];
const exe=path.resolve(__dirname,'../../build/vendor/comfy-archive/win32-x64/7za.exe');
async function fixture(){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'comfy-archive-')));roots.push(root);return root;}
afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
it.each(['../escape','/absolute','C:/drive','a:ads','a/CON.txt','a/trailing.','a/trailing ','a\nname'])('rejects unsafe archive path %s',name=>{expect(()=>validateArchiveEntries([{name,size:1,crc:'00000000',directory:false}])).toThrow();});
it('rejects case collisions and ancestor file collisions',()=>{for(const names of [['A.txt','a.txt'],['file','file/child']])expect(()=>validateArchiveEntries(names.map(name=>({name,size:1,crc:'00000000',directory:false})))).toThrow();});
it('rejects encrypted or link-bearing technical listings',()=>{for(const extra of ['Encrypted = +','Symbolic Link = target','Hard Link = target'])expect(()=>parseSevenZipListing('----------\nPath = safe\nSize = 1\nCRC = 00000000\nAttributes = A\n'+extra+'\n')).toThrow();});
it('parses the strict technical grammar without requiring a console preamble',()=>{expect(parseSevenZipListing('----------\nPath = safe\nSize = 1\nCRC = 00000000\nAttributes = A\nEncrypted = -\n')).toEqual([{name:'safe',sourceName:'safe',size:1,crc:'00000000',directory:false}]);});
it('rejects expansion/count/entry budgets and ambiguous technical listing fields',()=>{const entries=[{name:'a',size:10,crc:'00000000',directory:false}];expect(()=>validateArchiveEntries(entries,{maxBytes:9})).toThrow('SIZE_LIMIT');expect(()=>validateArchiveEntries(entries,{maxEntries:0})).toThrow('ENTRY_LIMIT');expect(()=>validateArchiveEntries(entries,{maxEntryBytes:9})).toThrow('SIZE_LIMIT');expect(()=>parseSevenZipListing('----------\nPath = a\nPath = b\nSize = 1\nCRC = 00000000\nEncrypted = -\n')).toThrow();});
it.each([['A/one','a/two'],['é/a','e\u0301/b'],['@list'],['a//b']])('rejects directory spelling aliases and listfile syntax %j',(...names)=>{expect(()=>validateArchiveEntries(names.map(name=>({name,size:1,crc:'00000000',directory:false})))).toThrow();});
it('pins the actual official standalone executable bytes',async()=>{expect(await hashComfyFile(exe)).toBe(COMFY_ARCHIVE_EXECUTOR_SHA256);});
it.each(['zip','7z'])('real %s decoder roundtrip with Chinese paths, exact bytes and no tool filesystem extraction',async format=>{
 const root=await fixture();const archive=path.join(root,`small.${format}`);const stage=path.join(root,'out');await fs.mkdir(stage);
 if(process.platform!=='win32'||process.arch!=='x64'){await fs.writeFile(archive,Buffer.from([0x50,0x4b,3,4,0,0,0,0]));await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');return;}
 const input=path.join(root,'input');await fs.mkdir(path.join(input,'中文 空格'),{recursive:true});const bytes=Buffer.from('exact bytes 中文\u0000');await fs.writeFile(path.join(input,'中文 空格','one.txt'),bytes);await fs.writeFile(path.join(input,'zero'),Buffer.alloc(0));
 await promisify(execFile)(exe,['a',`-t${format}`,archive,'.'],{cwd:input,windowsHide:true});
 const manifest=await inspectComfyArchive(archive);expect(manifest.format).toBe(format);await extractComfyArchive(manifest,stage);expect(await fs.readFile(path.join(stage,'中文 空格','one.txt'))).toEqual(bytes);expect((await fs.stat(path.join(stage,'zero'))).size).toBe(0);
});
it.each(['../escape','D:/absolute','good:stream','CON.txt','A.txt|a.txt','symlink'])('real untrusted ZIP %s refused before any extraction',async kind=>{
 const root=await fixture(),archive=path.join(root,'bad.zip');const zip=new JSZip();
 if(kind==='symlink')zip.file('link','../escape',{unixPermissions:0o120777,createFolders:false});else if(kind==='newline')zip.file('line\nPath = fake','bad',{createFolders:false});else for(const name of kind.split('|'))zip.file(name,'payload',{createFolders:false});
 await fs.writeFile(archive,await zip.generateAsync({type:'nodebuffer',platform:'UNIX'}));
 if(process.platform!=='win32'||process.arch!=='x64'){await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');return;}
 await expect(inspectComfyArchive(archive)).rejects.toThrow();expect(await fs.readdir(root)).toEqual(['bad.zip']);
});
it('real newline ZIP has an explicit safe-alias warning and writes only validated alias with exact CRC/size',async()=>{
 const root=await fixture(),archive=path.join(root,'newline.zip'),stage=path.join(root,'out');const zip=new JSZip();zip.file('line\nPath = fake','payload',{createFolders:false});await fs.writeFile(archive,await zip.generateAsync({type:'nodebuffer'}));await fs.mkdir(stage);
 if(process.platform!=='win32'||process.arch!=='x64'){await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');return;}
 const manifest=await inspectComfyArchive(archive);expect(manifest.warnings).toContain('COMFY_ARCHIVE_CLI_SAFE_ALIASES_NOT_RAW_NAMES');expect(manifest.entries[0].name).toBe('line_Path = fake');await extractComfyArchive(manifest,stage);expect(await fs.readdir(stage)).toEqual(['line_Path = fake']);expect(await fs.readFile(path.join(stage,'line_Path = fake'),'utf8')).toBe('payload');
});
it.each(['zip','7z'])('real single-pass %s honors archive item order with unsorted names, repeated content, empty and Chinese files',async format=>{
 const root=await fixture(),input=path.join(root,'input'),archive=path.join(root,`unordered.${format}`),stage=path.join(root,'out');await fs.mkdir(input);await fs.mkdir(stage);
 if(process.platform!=='win32'||process.arch!=='x64'){await fs.writeFile(archive,Buffer.from([0x50,0x4b,3,4,0,0,0,0]));await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');return;}
 const files=new Map([['zz.txt',Buffer.from('repeat')],['a.py',Buffer.from('repeat')],['中文.txt',Buffer.from('中文 and a different size')],['empty',Buffer.alloc(0)],['b.bin',Buffer.from(Array.from({length:100003},(_,i)=>i%251))]]);
 for(const [name,bytes]of files)await fs.writeFile(path.join(input,name),bytes);
 await promisify(execFile)(exe,['a',`-t${format}`,...(format==='7z'?['-ms=on']:[]),archive,...files.keys()],{cwd:input,windowsHide:true});const manifest=await inspectComfyArchive(archive);await extractComfyArchive(manifest,stage);for(const[name,bytes]of files)expect(await fs.readFile(path.join(stage,name))).toEqual(bytes);
});
it('rejects mutated archive and wx destination collision without overwriting sentinel',async()=>{
 const root=await fixture(),archive=path.join(root,'ok.zip'),stage=path.join(root,'out');const zip=new JSZip();zip.file('one','hello');await fs.writeFile(archive,await zip.generateAsync({type:'nodebuffer'}));await fs.mkdir(stage);
 if(process.platform!=='win32'||process.arch!=='x64'){await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');return;}
 const manifest=await inspectComfyArchive(archive);await fs.writeFile(path.join(stage,'one'),'sentinel');await expect(extractComfyArchive(manifest,stage)).rejects.toThrow();expect(await fs.readFile(path.join(stage,'one'),'utf8')).toBe('sentinel');await fs.appendFile(archive,'tamper');await expect(extractComfyArchive(manifest,stage)).rejects.toThrow('ARCHIVE_CHANGED');
});
it('preaborted extraction performs no writes',async()=>{const controller=new AbortController();controller.abort();await expect(inspectComfyArchive('absent',{signal:controller.signal})).rejects.toThrow('CANCELLED');});
it('real solid7z stores a junction as a link and import refuses it without traversing or modifying target',async()=>{
 const root=await fixture(),input=path.join(root,'input'),outside=path.join(root,'outside'),archive=path.join(root,'links.7z');await fs.mkdir(input);await fs.mkdir(outside);await fs.writeFile(path.join(outside,'sentinel'),'keep');
 if(process.platform!=='win32'||process.arch!=='x64'){await fs.writeFile(archive,Buffer.from([0x50,0x4b,3,4,0,0,0,0]));await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');return;}
 await fs.symlink(outside,path.join(input,'link'),'junction');await promisify(execFile)(exe,['a','-t7z','-snl',archive,'.'],{cwd:input,windowsHide:true});await expect(inspectComfyArchive(archive)).rejects.toThrow();expect(await fs.readFile(path.join(outside,'sentinel'),'utf8')).toBe('keep');
});
it('real encrypted 7z and ZIP are refused rather than requesting interactive input',async()=>{
 const root=await fixture(),input=path.join(root,'input');await fs.mkdir(input);await fs.writeFile(path.join(input,'a'),'data');
 for(const format of ['7z','zip']){const archive=path.join(root,`encrypted.${format}`);if(process.platform!=='win32'||process.arch!=='x64'){await fs.writeFile(archive,Buffer.from([0x50,0x4b,3,4,0,0,0,0]));await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');continue;}await promisify(execFile)(exe,['a',`-t${format}`,'-pfixture-password',archive,'a'],{cwd:input,windowsHide:true});await expect(inspectComfyArchive(archive)).rejects.toThrow();}
});
it('real bad CRC and deliberately wrong segment order fail closed',async()=>{
 const root=await fixture(),archive=path.join(root,'badcrc.zip'),stage=path.join(root,'out');await fs.mkdir(stage);const zip=new JSZip();zip.file('a','original-payload',{createFolders:false});zip.file('b','different',{createFolders:false});const raw=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
 if(process.platform!=='win32'||process.arch!=='x64'){await fs.writeFile(archive,raw);await expect(inspectComfyArchive(archive)).rejects.toThrow('EXECUTOR_UNAVAILABLE');return;}
 await fs.writeFile(archive,raw);const manifest=await inspectComfyArchive(archive);await expect(extractComfyArchive({...manifest,entries:[...manifest.entries].reverse()},stage)).rejects.toThrow();
 const badStage=path.join(root,'badout');await fs.mkdir(badStage);raw[raw.indexOf(Buffer.from('original-payload'))]^=1;await fs.writeFile(archive,raw);const bad=await inspectComfyArchive(archive);await expect(extractComfyArchive(bad,badStage)).rejects.toThrow();expect(await fs.readdir(root)).not.toContain('original-payload');
});
