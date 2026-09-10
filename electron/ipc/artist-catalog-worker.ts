import { parentPort, workerData } from "node:worker_threads";
import { promises as fs } from "node:fs";
import path from "node:path";
import { decodeArtistCatalog, sampleArtistIndices, type ArtistCatalog } from "./artist-catalog-codec";
import { collectArtistCatalog } from "./artist-catalog-update";

const port=parentPort!;
const config=workerData as {bundled:string; current:string};
let catalog:ArtistCatalog|null=null, source:"bundled"|"downloaded"="bundled", loading:Promise<void>|null=null;
let updateId:string|null=null, sequence=0;
const cancelled=new Set<string>();
const reads=new Map<number,{resolve:(rows:unknown[])=>void;reject:(error:Error)=>void}>();
async function load() {
  if (catalog) return;
  if (loading) return loading;
  loading=(async()=>{
    try { catalog=decodeArtistCatalog(await fs.readFile(config.current)); source="downloaded"; }
    catch { catalog=decodeArtistCatalog(await fs.readFile(config.bundled)); source="bundled"; }
  })().finally(()=>{loading=null;});return loading;
}
function check(id:string) { if(cancelled.has(id))throw new Error("Catalog update cancelled"); }
function read(id:string,page:number|string) {
  check(id); const request=++sequence;
  return new Promise<unknown[]>((resolve,reject)=>{reads.set(request,{resolve,reject});port.postMessage({type:"fetch",id,request,page});});
}
port.on("message",async message=>{
  if(message.type==="page") {
    const request=reads.get(message.request);if(!request)return;reads.delete(message.request);
    if(message.error)request.reject(new Error(message.error));else request.resolve(message.rows);return;
  }
  if(message.type==="cancel") { if(updateId===message.id){cancelled.add(message.id);for(const request of reads.values())request.reject(new Error("Catalog update cancelled"));reads.clear();} return; }
  const id=String(message.id);
  try {
    if(message.type==="select") {
      await load();const current=catalog!;
      const count=Math.max(1,Math.min(1_000_000,Math.floor(Number(message.count)||1000)));
      const mode=message.mode==="ranked"?"ranked":"random",seed=Number(message.seed)>>>0;
      const indices=mode==="random"?sampleArtistIndices(current.total,count,seed):Array.from({length:Math.min(count,current.total)},(_,i)=>i);
      port.postMessage({type:"result",id,result:{items:indices.map(i=>current.row(i)),source:"cache",requested:count,rankedCount:indices.length,
        complete:true,issue:null,savedAt:current.savedAt,mode,seed,catalog:{total:current.total,savedAt:current.savedAt,source}}});
    } else if(message.type==="update") {
      if(updateId)throw new Error("Catalog update already running");updateId=id;
      const temporary=config.current+".pending";
      try {
        await load();
        const result=await collectArtistCatalog(page=>read(id,page),()=>check(id),(loaded,pages)=>port.postMessage({type:"progress",id,loaded,pages}));
        check(id);await fs.mkdir(path.dirname(config.current),{recursive:true});
        await fs.writeFile(temporary,result.packed);check(id);
        await fs.rename(temporary,config.current);
        catalog=result.catalog;source="downloaded";
        port.postMessage({type:"result",id,result:{total:catalog.total,savedAt:catalog.savedAt,source,pages:result.pages}});
      } finally {await fs.unlink(temporary).catch(()=>{});updateId=null;cancelled.delete(id);}
    } else throw new Error("Unknown catalog operation");
  } catch(error) { port.postMessage({type:"result",id,error:error instanceof Error?error.message:"Catalog operation failed"}); }
});
