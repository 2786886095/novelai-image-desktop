import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validGenerationTimestamp} from './history-generation-time';

/** A timestamp and digest recorded at the local successful generation-save boundary. */
export interface FavoriteHistoryReference {
 id:string; filePath:string; generatedAt?:string;
 generatedAtSource?:'local-completion'; generatedImageSha256?:string;
}
export interface FavoriteGenerationTime {
 generatedAt:string; generatedAtSource:'local-completion'; generatedAtHistoryId:string;
}
export type FavoriteGenerationTimeResolver=(source:string,sha256:string,bytes:number)=>Promise<FavoriteGenerationTime|undefined>;

/** Bounded verification of an archive before associating legacy records with it. */
export async function hashFavoriteFile(file:string,maxBytes:number):Promise<{sha256:string;bytes:number}|undefined>{
 const before=await fs.lstat(file,{bigint:true});
 if(!before.isFile()||before.isSymbolicLink()||before.size>BigInt(maxBytes))return;
 const bytes=Number(before.size),signature=[before.size,before.mtimeNs,before.ctimeNs,before.dev,before.ino].join(':');
 const handle=await fs.open(file,'r');
 try{
  const opened=await handle.stat({bigint:true});if([opened.size,opened.mtimeNs,opened.ctimeNs,opened.dev,opened.ino].join(':')!==signature)return;
  const hash=createHash('sha256'),chunk=Buffer.alloc(Math.min(64*1024,Math.max(bytes,1)));let offset=0;
  while(offset<bytes){const read=await handle.read(chunk,0,Math.min(chunk.length,bytes-offset),offset);if(!read.bytesRead)break;hash.update(chunk.subarray(0,read.bytesRead));offset+=read.bytesRead;}
  const extra=await handle.read(chunk,0,1,offset),after=await fs.lstat(file,{bigint:true});
  if(offset!==bytes||extra.bytesRead||!after.isFile()||after.isSymbolicLink()||[after.size,after.mtimeNs,after.ctimeNs,after.dev,after.ino].join(':')!==signature)return;
  return {sha256:hash.digest('hex'),bytes};
 }finally{await handle.close();}
}

// A duration, date-only value or timezone-less timestamp is not a generation instant.
export function normalizeFavoriteGenerationTime(value:unknown):string|undefined {
 return validGenerationTimestamp(value)?new Date(value).toISOString():undefined;
}

/** Only matching, provenance-marked records are read; no full-history image scan. */
export function createFavoriteHistoryTimeResolver(options:{
 references:()=>readonly FavoriteHistoryReference[];
 maxCandidates?:number; maxReadBytes?:number; maxCacheEntries?:number;
}):FavoriteGenerationTimeResolver {
 const maxCandidates=options.maxCandidates??256,maxReadBytes=options.maxReadBytes??64*1024*1024,maxCacheEntries=options.maxCacheEntries??256;
 const cache=new Map<string,{signature:string;hash:string}>();
 return async(source,sha256,bytes)=>{
  if(!path.isAbsolute(source)||!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(bytes)||bytes<0)return;
  let references:readonly FavoriteHistoryReference[];
  try{references=options.references();if(!Array.isArray(references))return;}catch{return;}
  const matches=references.flatMap(reference=>{
   if(!reference||typeof reference.id!=='string'||typeof reference.filePath!=='string')return [];
   const generatedAt=normalizeFavoriteGenerationTime(reference.generatedAt);
   if(reference.generatedAtSource!=='local-completion'||!generatedAt||!reference.id||!path.isAbsolute(reference.filePath)||reference.generatedImageSha256!==sha256)return [];
   return [{reference,generatedAt}];
  });
  // The same bytes can appear in distinct generations. Do not arbitrarily pick a time.
  if(!matches.length||matches.length>maxCandidates||new Set(matches.map(x=>x.generatedAt)).size!==1)return;
  matches.sort((a,b)=>Number(path.resolve(b.reference.filePath)===path.resolve(source))-Number(path.resolve(a.reference.filePath)===path.resolve(source))||a.reference.id.localeCompare(b.reference.id));
  let readBytes=0;
  for(const {reference,generatedAt} of matches){
   const file=path.resolve(reference.filePath);
   try{
    const before=await fs.lstat(file,{bigint:true});
    if(!before.isFile()||before.isSymbolicLink()||before.size!==BigInt(bytes))continue;
    // mtime/ctime are cache invalidators ONLY. They are never exposed as generation time.
    const signature=[before.size,before.mtimeNs,before.ctimeNs,before.dev,before.ino].join(':');
    let hash=cache.get(file)?.signature===signature?cache.get(file)!.hash:undefined;
    if(!hash){
     if(readBytes+bytes>maxReadBytes)return;
     readBytes+=bytes;
     const verified=await hashFavoriteFile(file,bytes),after=await fs.lstat(file,{bigint:true});
     if(!verified||verified.bytes!==bytes||[after.size,after.mtimeNs,after.ctimeNs,after.dev,after.ino].join(':')!==signature){cache.delete(file);continue;}
     hash=verified.sha256;
     cache.delete(file);cache.set(file,{signature,hash});
     while(cache.size>maxCacheEntries)cache.delete(cache.keys().next().value!);
    }
    if(hash===sha256)return {generatedAt,generatedAtSource:'local-completion',generatedAtHistoryId:reference.id};
   }catch{cache.delete(file);} // Missing/unreadable/moved history means unknown, not a fabricated date.
  }
 };
}
