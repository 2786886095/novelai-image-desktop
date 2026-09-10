import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import type { ArtistCatalogSelection, ArtistCatalogInfo, ArtistPoolSyncProgress } from "../../src/artist-lab";
import { normalizeArtistPoolCount } from "../../src/artist-pool-options";
import { readArtistCatalogPage } from "./artist-pool-selected";

type Job={owner:number;update:boolean;controller:AbortController;resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;progress?:(p:ArtistPoolSyncProgress)=>void};
export function createArtistCatalogService(config:{workerPath:string;bundled:string;current:string}) {
  let worker:Worker|null=null;
  const jobs=new Map<string,Job>();
  const failAll=(message:string)=>{for(const job of jobs.values()){clearTimeout(job.timer);job.controller.abort();job.reject(new Error(message));}jobs.clear();};
  function ensureWorker() {
    if(worker)return worker;
    const current=new Worker(config.workerPath,{workerData:{bundled:config.bundled,current:config.current}});worker=current;
    current.on("message",async message=>{
      const id=String(message.id),job=jobs.get(id);if(!job)return;
      if(message.type==="fetch"&&job.update) {
        try {
          if(!/^(?:1|b[1-9]\d*)$/.test(String(message.page)))throw new Error("Invalid catalog cursor");
          const rows=await readArtistCatalogPage(message.page,job.controller.signal);
          if(worker===current)current.postMessage({type:"page",request:message.request,rows});
        } catch(error) {
          const detail=error as {response?:{status?:number}};
          if(worker===current)current.postMessage({type:"page",request:message.request,error:job.controller.signal.aborted?"Catalog update cancelled":`Catalog network request failed${detail?.response?.status?` (${detail.response.status})`:""}`});
        }
      } else if(message.type==="progress") {
        job.progress?.({requestId:id,loaded:message.loaded,pages:message.pages,state:"loading"});
      } else if(message.type==="result") {
        clearTimeout(job.timer);jobs.delete(id);
        if(message.error)job.reject(new Error(message.error));else job.resolve(message.result);
      }
    });
    current.on("error",()=>{if(worker===current){worker=null;failAll("Catalog worker failed");}});
    current.on("exit",()=>{if(worker===current){worker=null;failAll("Catalog worker stopped");}});
    current.unref();return current;
  }
  function request(owner:number,id:string,type:"select"|"update",payload:object,progress?:Job["progress"]):Promise<unknown> {
    if(typeof id!=="string"||!id||id.length>120||jobs.has(id))return Promise.reject(new Error("Invalid catalog request ID"));
    if(type==="update"&&[...jobs.values()].some(job=>job.update))return Promise.reject(new Error("Catalog update already running"));
    return new Promise((resolve,reject)=>{
      const current=ensureWorker(),controller=new AbortController();
      const timer=setTimeout(()=>{controller.abort();current.postMessage({type:"cancel",id});jobs.delete(id);reject(new Error("Catalog operation timed out"));},type==="update"?45*60_000:30_000);
      timer.unref();jobs.set(id,{owner,update:type==="update",controller,resolve,reject,timer,progress});
      current.postMessage({type,id,...payload});
    });
  }
  const cancel=(owner:number,id:string)=>{
    const job=jobs.get(id);if(!job||job.owner!==owner)return false;
    job.controller.abort();worker?.postMessage({type:"cancel",id});return true;
  };
  return {
    select(owner:number,count:unknown,mode:unknown,seed:unknown):Promise<ArtistCatalogSelection> {
      if(mode!=="random"&&mode!=="ranked")return Promise.reject(new Error("Invalid selection mode"));
      return request(owner,randomUUID(),"select",{count:normalizeArtistPoolCount(count),mode,seed:Number(seed)>>>0}) as Promise<ArtistCatalogSelection>;
    },
    update(owner:number,id:string,progress:Job["progress"]):Promise<ArtistCatalogInfo> {return request(owner,id,"update",{},progress) as Promise<ArtistCatalogInfo>;},
    cancel,
    disposeOwner(owner:number){for(const [id,job] of jobs)if(job.owner===owner)cancel(owner,id);},
    dispose(){const current=worker;worker=null;failAll("Catalog closed");void current?.terminate();},
  };
}
