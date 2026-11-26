import oldSizes from "../../shared/legacy-tag-pack-sizes.json";
import {app,dialog} from "electron";
import {openTagAsset} from "./tag-asset-download";
import {createHash,randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import {createReadStream,createWriteStream,existsSync,readFileSync,renameSync,statSync} from "node:fs";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import {DatabaseSync} from "node:sqlite";
import {createGunzip} from "node:zlib";
import {TAG_PACK_LANGUAGES,TAG_PACK_MANIFEST,tagPackLanguage,tagPackSort,type TagPackLanguage,type TagPackStatus} from "../../shared/multilingual-tag-pack-contract";
import type {TagSuggestion} from "../../src/types";
import {relatedResourceTags} from "./resource-databases";
import {relatedTags} from "../../src/related-tags";
import {browseTagPackDatabase,closeTagPackReader,lookupTagPackDatabase,searchTagPackDatabase,type TagDictionaryMatch} from "./tag-pack-reader";
export {lookupTagPackDatabase,searchTagPackDatabase,type TagDictionaryMatch} from "./tag-pack-reader";

let installing=false;
const root=()=>path.join(app.getPath("userData"),"resources","multilingual-tags");
const dbPath=(lang:TagPackLanguage)=>path.join(root(),TAG_PACK_MANIFEST.packs[lang].file.replace(/\.gz$/,""));
const selection=()=>path.join(root(),"active.json");
function installed(lang:TagPackLanguage){
 try{return existsSync(dbPath(lang))&&statSync(dbPath(lang)).size===TAG_PACK_MANIFEST.packs[lang].databaseSize;}catch{return false;}
}
// Keep the originally installed, verified file readable while staging its replacement.
const legacyDates=Object.keys(oldSizes).sort().reverse() as (keyof typeof oldSizes)[];
const oldPath=(lang:TagPackLanguage,date:string)=>path.join(root(),`tags-${date}-${lang}.sqlite`);
function previousVersion(lang:TagPackLanguage){
 for(const date of legacyDates){
  try{const stat=statSync(oldPath(lang,date));if(stat.isFile() && stat.size===oldSizes[date][lang])return date;}catch{/* not installed */}
 }
 return null;
}
function readablePack(lang:TagPackLanguage){
 if(installed(lang))return {file:dbPath(lang),legacy:null};
 const legacy=previousVersion(lang);return legacy?{file:oldPath(lang,legacy),legacy}:null;
}
function preferredTagPack():TagPackLanguage|null {
 try{return tagPackLanguage(JSON.parse(readFileSync(selection(),"utf8")));}catch{return null;}
}
export function activeTagPack():TagPackLanguage|null{
 const lang=preferredTagPack();
 return lang&&readablePack(lang)?lang:null;
}
export function multilingualTagStatus():TagPackStatus {
 const outdated:NonNullable<TagPackStatus["outdated"]>={};
 for(const lang of TAG_PACK_LANGUAGES){const version=readablePack(lang)?.legacy;if(version)outdated[lang]=version;}
 return {...(Object.keys(outdated).length?{outdated}:{}),active:activeTagPack(),installed:TAG_PACK_LANGUAGES.filter(installed),updatedAt:TAG_PACK_MANIFEST.updatedAt,preferred:preferredTagPack()};
}
export function browseMultilingualTags(group:unknown,query:unknown,page:unknown,sort?:unknown){
 const lang=activeTagPack();
 if(!lang||typeof group!=="string"||typeof query!=="string"||typeof page!=="number")return {rows:[],total:0,page:0};
 const pack=readablePack(lang)!;
 // The two archived dictionaries have identical rowid/tag/count sequences.
 const index=pack.legacy?"tag-pack-groups-20261116.bin":"tag-pack-groups.bin";
 return browseTagPackDatabase(pack.file,path.join(app.getAppPath(),"shared",index),group,query,page,tagPackSort(sort),pack.legacy?"2026-11-16":TAG_PACK_MANIFEST.updatedAt);
}
/** Null means no selected library; [] is an authoritative offline miss. */
export function searchMultilingualTags(query:string,limit=20,sort?:unknown):TagSuggestion[]|null {
 const lang=activeTagPack();if(!lang)return null;
 return searchTagPackDatabase(readablePack(lang)!.file,query,limit,tagPackSort(sort));
}
export function lookupMultilingualTags(input: readonly string[], includeTranslation = false): TagDictionaryMatch[] {
 const lang = activeTagPack();
 if (!lang) return [];
 return lookupTagPackDatabase(readablePack(lang)!.file, input, includeTranslation);
}

/** Rank suggestions locally, and use the active dictionary as the sole display/translation source. */
export function relatedMultilingualTags(input:unknown,limit:unknown=8):TagSuggestion[]|null {
 const lang=activeTagPack();if(!lang)return null;
 if(!Array.isArray(input))return [];
 const seeds=input.slice(0,12).filter((item):item is string=>typeof item==="string").map(item=>item.slice(0,128));
 const file=readablePack(lang)!.file;
 const anchors=lookupTagPackDatabase(file,seeds,true).map(item=>item.tag);
 if(!anchors.length)return [];
 const cap=typeof limit==="number"&&Number.isInteger(limit)?Math.max(1,Math.min(20,limit)):8;
 const key=(tag:string)=>tag.normalize("NFKC").toLowerCase().replaceAll("_"," ").trim().replace(/\s+/g," ");
 const excluded=new Set(anchors.map(key));
 const names=[...relatedResourceTags(anchors,Math.min(40,cap*3)),...relatedTags(anchors.join(", "),cap*3)].map(item=>item.tag);
 const eligible=[...new Set(names.map(key))].filter(name=>!excluded.has(name)&&!/^rating\s*:/.test(name)
  && !/^(?:commentary(?: request)?|translated|partially translated|translation request|check translation|copyright name|tagme)$/.test(name));
 return lookupTagPackDatabase(file,eligible).slice(0,cap).map(({query:_,...item})=>item);
}

async function copyVerified(input:AsyncIterable<Uint8Array>,dest:string,size:number,sha:string){
 const hash=createHash("sha256");let length=0;
 await pipeline(input,async function* (chunks:AsyncIterable<Uint8Array>){
  for await(const b of chunks){length+=b.byteLength;if(length>size)throw Error("Tag pack exceeds expected size");hash.update(b);yield b;}
 },createWriteStream(dest,{flags:"wx",mode:0o600}));
 if(length!==size||hash.digest("hex")!==sha)throw Error("Tag pack checksum or size mismatch");
}
// Keep transport bytes separate from the installed database and active language.
export async function resumeTagPack(url:string, archive:string, size:number, sha:string) {
 let offset=0;
 try { offset=(await fs.stat(archive)).size; }
 catch(e){ if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e; }
 if(offset>size){await fs.unlink(archive);offset=0;}
 let file=archive;
 try{
  if(offset<size){
   let response=await openTagAsset(url,size,undefined,offset);
   const restart=response.status===416;
   if(restart){response.data.destroy();response=await openTagAsset(url,size);}
   if(offset && (restart||response.status===200)){file=archive+'.restart';offset=0;}
   let received=offset;
   await pipeline(response.data,async function*(chunks:AsyncIterable<Uint8Array>){
    for await(const b of chunks){received+=b.byteLength;if(received>size)throw Error('Tag pack exceeds expected size');yield b;}
   },createWriteStream(file,{flags:offset?'a':'w',mode:0o600}));
   if(received!==size)throw Error('Incomplete tag pack download; retry to continue');
  }
  const hash=createHash('sha256');
  for await(const b of createReadStream(file))hash.update(b);
  if(hash.digest('hex')!==sha){await fs.unlink(file);throw Error('Tag pack checksum mismatch');}
  if(file!==archive)await fs.rename(file,archive);
 }finally{if(file!==archive)await fs.rm(file,{force:true}).catch(()=>{});}
}

async function selectInstalled(lang:TagPackLanguage){
 const tmp=selection()+"-"+randomUUID()+".tmp";
 try{await fs.writeFile(tmp,JSON.stringify(lang),{flag:"wx",mode:0o600});await fs.rename(tmp,selection());}
 finally{await fs.rm(tmp,{force:true});}
}
export async function installMultilingualTagPack(value:unknown, input:unknown):Promise<TagPackStatus>{
 const lang=tagPackLanguage(value);if(!lang||!["file","download","use"].includes(String(input)))throw Error("Invalid tag pack selection");
 if(installing)throw Error("Another tag pack operation is running");
 installing=true;
 const temp=path.join(root(),randomUUID()+".part");
 const dbTemp=temp+".sqlite";
 try{
  if(input==="use"){
   if(!installed(lang))throw Error("Selected language is not installed");
  }else{
   const pack=TAG_PACK_MANIFEST.packs[lang];
   let archive=temp;
   await fs.mkdir(root(),{recursive:true});
   if(input==="file"){
    const file=await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"Tag pack",extensions:["gz"]}]});
    if(file.canceled||!file.filePaths.length)return multilingualTagStatus();
    if((await fs.stat(file.filePaths[0])).size!==pack.size)throw Error("File size does not match the selected language pack");
    await copyVerified(createReadStream(file.filePaths[0]),temp,pack.size,pack.sha256);
   }else{
    // Dataset assets are distributed separately from the MIT source. Pin the
    // release name and verify bytes before decompression or making it active.
    const url="https://github.com/2786886095/novelai-image-desktop/releases/download/tag-packs-"+TAG_PACK_MANIFEST.updatedAt+"/"+pack.file;
    archive=path.join(root(),pack.file+'.part');
    await resumeTagPack(url,archive,pack.size,pack.sha256);
   }
   const unpacked=createReadStream(archive).pipe(createGunzip());
   await copyVerified(unpacked,dbTemp,pack.databaseSize,pack.databaseSha256);
   const db=new DatabaseSync(dbTemp,{readOnly:true});
   try{
    const info=db.prepare("select language,updated_at from info").get();
    if(info?.language!==lang||info.updated_at!==TAG_PACK_MANIFEST.updatedAt)throw Error("Wrong tag pack language or version");
   }finally{db.close();}
   const destination=dbPath(lang);
   // Release SQLite handles before replacing a downloaded pack on Windows.
   closeTagPackReader(destination);
   renameSync(dbTemp,destination);
   if(input==='download')await fs.rm(archive,{force:true}).catch(()=>{});
  }
  await selectInstalled(lang);
  return multilingualTagStatus();
 }finally{
  installing=false;
  await Promise.allSettled([fs.rm(temp,{force:true}),fs.rm(dbTemp,{force:true})]);
 }
}
