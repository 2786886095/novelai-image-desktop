import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import type {ImageFavorite,ImageFavoriteLibrary} from '../../src/favorites-types';

interface Index extends ImageFavoriteLibrary {version:1}
const extensions=new Set(['.png','.jpg','.jpeg','.webp','.gif','.avif','.bmp']);
// One service instance per application. All read/modify/write operations share a queue.
export function createImageFavorites(options:{indexPath:string;defaultDirectory:string;now?:()=>Date}) {
 let tail:Promise<unknown>=Promise.resolve();
 const serial=<T>(fn:()=>Promise<T>):Promise<T>=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;};
 const revision=(data:Index)=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const check=(data:Index,expected?:string)=>{if(expected!==undefined&&expected!==revision(data))throw Error('收藏已变化，请重新读取');};
 async function read():Promise<Index>{
  let raw:string;try{raw=await fs.readFile(options.indexPath,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {version:1,directory:options.defaultDirectory,items:[]};throw e;}
  const data=JSON.parse(raw) as Index;
  if(data.version!==1||typeof data.directory!=='string'||!path.isAbsolute(data.directory)||!Array.isArray(data.items)||data.items.some(x=>!x||typeof x.id!=='string'||typeof x.filePath!=='string'||!path.isAbsolute(x.filePath)||!/^\d{8}_\d+x\d+_\d+$/.test(x.prefix)||!extensions.has(x.extension)))throw Error('收藏索引损坏，请保留文件后检查索引。');
  return data;
 }
 async function save(data:Index){
  await fs.mkdir(path.dirname(options.indexPath),{recursive:true});
  const temp=options.indexPath+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temp,JSON.stringify(data,null,2),{flag:'wx'});await fs.rename(temp,options.indexPath);}finally{await fs.unlink(temp).catch(()=>{});}
 }
 async function regular(file:string){const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink())throw Error('请选择实际图片文件。');return st;}
 async function missing(file:string){try{await regular(file);return false;}catch{return true;}}
 async function ensureDirectory(directory:string){
  if(!path.isAbsolute(directory))throw Error('收藏目录必须是绝对路径。');
  await fs.mkdir(directory,{recursive:true});
  const stat=await fs.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('收藏目录不可为链接。');
  return fs.realpath(directory);
 }
 return {
  status:(source:string)=>serial(async()=>{
   const data=await read();
   if(!data.items.length)return null;
   const st=await regular(source);
   if(st.size>200*1024*1024||!extensions.has(path.extname(source).toLowerCase()))return null;
   const direct=data.items.find(item=>path.resolve(item.filePath)===path.resolve(source));
   if(direct)return direct;
   const hash=createHash('sha256').update(await fs.readFile(source)).digest('hex');
   const item=data.items.find(item=>item.sha256===hash);
   return item&&!await missing(item.filePath)?item:null;
  }),
  list:()=>serial(async()=>{const data=await read();return {revision:revision(data),directory:data.directory,items:await Promise.all(data.items.map(async x=>({...x,missing:await missing(x.filePath)})))};}),
  setDirectory:(directory:string,expectedRevision?:string)=>serial(async()=>{
   const data=await read();check(data,expectedRevision);const targetRoot=await ensureDirectory(directory),created:string[]=[];
   try{
    const items:ImageFavorite[]=[];
    for(const item of data.items){
     await regular(item.filePath);const target=path.join(targetRoot,path.basename(item.filePath));
     if(path.resolve(target)!==path.resolve(item.filePath)){
      try{await fs.copyFile(item.filePath,target,fs.constants.COPYFILE_EXCL);created.push(target);}
      catch(e){
       if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
       await regular(target);
       const digest=createHash('sha256').update(await fs.readFile(target)).digest('hex');
       if(digest!==item.sha256)throw Error('新目录已有同名的不同图片，请选择空目录或先处理重名文件。');
      }
     }
     items.push({...item,filePath:target});
    }
    await save({...data,directory:targetRoot,items});return targetRoot;
   }catch(e){for(const file of created)await fs.unlink(file).catch(()=>{});throw e;}
   // Old directory copies are deliberately retained; only the index switches after all copies succeed.
  }),
  add:(source:string,expectedRevision?:string)=>serial(async()=>{
   const data=await read();check(data,expectedRevision);const st=await regular(source),extension=path.extname(source).toLowerCase();
   if(!extensions.has(extension)||st.size>200*1024*1024)throw Error('请选择小于 200 MiB 的原始图片。');
   // Hash and archive the same bytes. Never re-encode: embedded PNG/EXIF metadata is preserved.
   const bytes=await fs.readFile(source),hash=createHash('sha256').update(bytes).digest('hex');
   const old=data.items.find(x=>x.sha256===hash);
   if(old&&!await missing(old.filePath))return {item:old,duplicate:true};
   const meta=await sharp(bytes,{limitInputPixels:268402689}).metadata();
   if(!meta.width||!meta.height)throw Error('图片分辨率读取失败。');
   const directory=await ensureDirectory(data.directory),now=options.now?.()??new Date();
   const date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('');
   // Reserve the immutable sequence independently of editable suffix or extension.
   // Include retained/unindexed files so removing a bookmark cannot reuse its prefix.
   const base=`${date}_${meta.width}x${meta.height}_`,reserved=new Set<number>();
   for(const fileName of [...data.items.map(x=>x.prefix),...await fs.readdir(directory)]){
    if(!fileName.startsWith(base))continue;
    const match=/^(\d+)(?:[_.]|$)/.exec(fileName.slice(base.length));
    if(match)reserved.add(Number(match[1]));
   }
   let seq=1,prefix='',target='';
   while(true){while(reserved.has(seq))seq++;prefix=base+String(seq++).padStart(2,'0');target=path.join(directory,prefix+extension);
    try{await fs.writeFile(target,bytes,{flag:'wx'});break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
   }
   const item:ImageFavorite={id:old?.id??randomUUID(),sha256:hash,filePath:target,prefix,name:'',extension,width:meta.width,height:meta.height,savedAt:now.toISOString()};
   data.items=[item,...data.items.filter(x=>x.id!==item.id)];
   try{await save(data);}catch(e){await fs.unlink(target).catch(()=>{});throw e;}
   return {item,duplicate:false};
  }),
  rename:(id:string,name:string,expectedRevision?:string)=>serial(async()=>{
   if(typeof name!=='string'||name.length>100||/[\\/:*?"<>|\x00-\x1f]/.test(name)||name==='.'||name==='..')throw Error('名称只填写末尾名称段，不能含路径或特殊符号。');
   const data=await read();check(data,expectedRevision);const item=data.items.find(x=>x.id===id);if(!item)throw Error('收藏不存在。');
   const suffix=name.trim().replace(/[. ]+$/,'');await regular(item.filePath);
   const target=path.join(path.dirname(item.filePath),item.prefix+(suffix?'_'+suffix:'')+item.extension);
   if(target===item.filePath)return item;
   // COPYFILE_EXCL prevents overwrite, including files created outside the app.
   await fs.copyFile(item.filePath,target,fs.constants.COPYFILE_EXCL);
   const renamed={...item,name:suffix,filePath:target};data.items=data.items.map(x=>x.id===id?renamed:x);
   try{await save(data);}catch(e){await fs.unlink(target).catch(()=>{});throw e;}
   // Index now points at a durable copy. A failed cleanup must not lose the favorite.
   await fs.unlink(item.filePath).catch(()=>{});
   return renamed;
  }),
  remove:(id:string,expectedRevision?:string)=>serial(async()=>{const data=await read();check(data,expectedRevision);if(!data.items.some(x=>x.id===id))throw Error('收藏不存在。');data.items=data.items.filter(x=>x.id!==id);await save(data);return {removed:true,filesRetained:true};}),
 };
}
