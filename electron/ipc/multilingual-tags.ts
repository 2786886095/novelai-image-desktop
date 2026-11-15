import {app,dialog} from "electron";
import axios from "axios";
import {createHash,randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import {createReadStream,createWriteStream,existsSync,readFileSync,statSync} from "node:fs";
import path from "node:path";
import {pipeline} from "node:stream/promises";
import {DatabaseSync} from "node:sqlite";
import {createGunzip} from "node:zlib";
import {TAG_PACK_LANGUAGES,TAG_PACK_MANIFEST,tagPackLanguage,type TagPackLanguage,type TagPackStatus} from "../../shared/multilingual-tag-pack-contract";
import type {TagSuggestion} from "../../src/types";
import {proxyConfig} from "./proxy";

let installing=false;
const root=()=>path.join(app.getPath("userData"),"resources","multilingual-tags");
const dbPath=(lang:TagPackLanguage)=>path.join(root(),TAG_PACK_MANIFEST.packs[lang].file.replace(/\.gz$/,""));
const selection=()=>path.join(root(),"active.json");
function installed(lang:TagPackLanguage){
 try{return existsSync(dbPath(lang))&&statSync(dbPath(lang)).size===TAG_PACK_MANIFEST.packs[lang].databaseSize;}catch{return false;}
}
export function activeTagPack():TagPackLanguage|null{
 try{
  const lang=tagPackLanguage(JSON.parse(readFileSync(selection(),"utf8")));
  return lang&&installed(lang)?lang:null;
 }catch{return null;}
}
export function multilingualTagStatus():TagPackStatus {
 return {active:activeTagPack(),installed:TAG_PACK_LANGUAGES.filter(installed),updatedAt:TAG_PACK_MANIFEST.updatedAt};
}
function fold(value:string){return value.normalize("NFKC").toLowerCase().replaceAll("_"," ").trim().replace(/\s+/g," ");}
function limitOf(value:number){return Number.isSafeInteger(value)?Math.max(1,Math.min(200,value)):20;}
export function searchTagPackDatabase(file:string,query:string,limit:number):TagSuggestion[]{
 const word=fold(query.slice(0,255));if(!word)return [];
 const n=limitOf(limit);
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const byTag=new Map<string,{tag:string;translated:string;count:number;category:number;priority:number}>();
  for(const col of ["key","translated_key"]){
   const candidates=db.prepare("SELECT tag,translated,category,count, CASE WHEN "+col+" = ? THEN 0 ELSE 1 END AS priority FROM terms WHERE "+col+" >= ? AND "+col+" < ? ORDER BY priority, count DESC, tag LIMIT ?")
    .all(word,word,word+String.fromCodePoint(0x10ffff),n) as unknown as Array<{tag:string;translated:string;count:number;category:number;priority:number}>;
   for(const s of candidates)if(!byTag.has(s.tag)||s.priority<byTag.get(s.tag)!.priority)byTag.set(s.tag,s);
  }
  return [...byTag.values()].sort((a,b)=>a.priority-b.priority||b.count-a.count||a.tag.localeCompare(b.tag))
   .slice(0,n).map(row=>({tag:row.tag,description:row.translated,count:row.count,category:row.category,localizedDescription:true}));
 }finally{db.close();}
}
/** Null means no selected library; [] is an authoritative offline miss. */
export function searchMultilingualTags(query:string,limit=20):TagSuggestion[]|null {
 const lang=activeTagPack();if(!lang)return null;
 return searchTagPackDatabase(dbPath(lang),query,limit);
}
async function copyVerified(input:AsyncIterable<Uint8Array>,dest:string,size:number,sha:string){
 const hash=createHash("sha256");let length=0;
 await pipeline(input,async function* (chunks:AsyncIterable<Uint8Array>){
  for await(const b of chunks){length+=b.byteLength;if(length>size)throw Error("Tag pack exceeds expected size");hash.update(b);yield b;}
 },createWriteStream(dest,{flags:"wx",mode:0o600}));
 if(length!==size||hash.digest("hex")!==sha)throw Error("Tag pack checksum or size mismatch");
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
   let stream:AsyncIterable<Uint8Array>;
   if(input==="file"){
    const file=await dialog.showOpenDialog({properties:["openFile"],filters:[{name:"Tag pack",extensions:["gz"]}]});
    if(file.canceled||!file.filePaths.length)return multilingualTagStatus();
    if((await fs.stat(file.filePaths[0])).size!==pack.size)throw Error("File size does not match the selected language pack");
    stream=createReadStream(file.filePaths[0]);
   }else{
    // Dataset assets are distributed separately from the MIT source. Pin the
    // release name and verify bytes before decompression or making it active.
    const url="https://github.com/2786886095/novelai-image-desktop/releases/download/tag-packs-"+TAG_PACK_MANIFEST.updatedAt+"/"+pack.file;
    const response=await axios.get(url,{...proxyConfig("update"),responseType:"stream",timeout:30_000,signal:AbortSignal.timeout(300_000),maxRedirects:3});
    stream=response.data;
   }
   await fs.mkdir(root(),{recursive:true});
   await copyVerified(stream,temp,pack.size,pack.sha256);
   const unpacked=createReadStream(temp).pipe(createGunzip());
   await copyVerified(unpacked,dbTemp,pack.databaseSize,pack.databaseSha256);
   const db=new DatabaseSync(dbTemp,{readOnly:true});
   try{
    const info=db.prepare("select language,updated_at from info").get();
    if(info?.language!==lang||info.updated_at!==TAG_PACK_MANIFEST.updatedAt)throw Error("Wrong tag pack language or version");
   }finally{db.close();}
   await fs.rename(dbTemp,dbPath(lang));
  }
  await selectInstalled(lang);
  return multilingualTagStatus();
 }finally{
  installing=false;
  await Promise.allSettled([fs.rm(temp,{force:true}),fs.rm(dbTemp,{force:true})]);
 }
}
