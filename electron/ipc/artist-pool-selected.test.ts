import {beforeEach,afterEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock("axios",()=>({default:{get:m.get}}));vi.mock("./proxy",()=>({proxyConfig:()=>({})}));
import {loadSelectedArtistPool,fetchArtistPoolTotal,createSelectedArtistPoolManager,createArtistPoolTotalService} from "./artist-pool-selected";
import {normalizeArtistPoolCount} from "../../src/artist-pool-options";
const row=(id:number)=>({id,name:`artist_${id}`,post_count:id,category:1,is_deprecated:false});
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(10000);m.get.mockReset();});afterEach(()=>vi.useRealTimers());
async function settle<T>(p:Promise<T>){await vi.runAllTimersAsync();return p;}
function fixture(size=738106){m.get.mockImplementation((_url,{params})=>{
 const count=Math.min(params.limit,Math.max(0,size-(params.page-1)*params.limit));
 return {data:Array.from({length:count},(_,i)=>params.only==='id'?{id:size-(params.page-1)*params.limit-i}:row(size-(params.page-1)*params.limit-i))};
});}
it("defaults to1000 and stops at one candidate API page, not a full-catalog scan",async()=>{
 fixture();const r=await settle(loadSelectedArtistPool(undefined));expect(r).toMatchObject({requested:1000,complete:true,rankedCount:1000,source:"network"});
 expect(m.get).toHaveBeenCalledTimes(1);expect(m.get.mock.calls[0][1].params["search[order]"]).toBe("count");
});
it("refreshes only a selected ranking window with fixed pagination beyond the old5000 cap",async()=>{
 fixture();const r=await settle(loadSelectedArtistPool(6005));expect(r.items).toHaveLength(6005);expect(r.items[6004].id).toBe(738106-6004);
 expect(m.get).toHaveBeenCalledTimes(7);expect(m.get.mock.calls.every(x=>x[1].params.limit===1000)).toBe(true);
});
it("custom non-round counts and one-row counts are preserved",async()=>{
 fixture();expect((await settle(loadSelectedArtistPool(1))).items).toHaveLength(1);
 m.get.mockClear();expect((await settle(loadSelectedArtistPool(2500))).items).toHaveLength(2500);expect(m.get.mock.calls.map(x=>x[1].params.page)).toEqual([1,2,3]);
});
it("fresh refresh does not use previous candidates or a completed promise",async()=>{
 fixture();await settle(loadSelectedArtistPool(1000));m.get.mockClear();fixture(50000);
 const r=await settle(loadSelectedArtistPool(1000));expect(m.get).toHaveBeenCalledTimes(1);expect(r.items[0].id).toBe(50000);
});
it("small real libraries stop at their end, without fabricating the requested number",async()=>{
 fixture(25);const r=await settle(loadSelectedArtistPool(1000));expect(r).toMatchObject({rankedCount:25,requested:1000,complete:true});
});
it("deduplicates names so same-name IDs do not multiply sampling chances",async()=>{
 m.get.mockResolvedValue({data:[row(3),{...row(2),name:'artist_3'},row(1)]});
 const r=await settle(loadSelectedArtistPool(1000));expect(r.items.map(x=>x.name)).toEqual(['artist_3','artist_1']);
});
it.each(["<html>blocked</html>",[null],[{...row(1),category:0}]])("rejects malformed candidate responses %j",async data=>{
 m.get.mockResolvedValue({data});expect(await settle(loadSelectedArtistPool(1000))).toMatchObject({items:[],complete:false,issue:"invalid-response"});
});
it("a second-page failure does not leak a partial selection or cached candidates",async()=>{
 fixture();const original=m.get.getMockImplementation()!;m.get.mockImplementation((...args)=>args[1].params.page===1?original(...args):Promise.reject({response:{status:403}}));
 expect(await settle(loadSelectedArtistPool(2500))).toMatchObject({items:[],complete:false,issue:"network",httpStatus:403});
});
it("count is independent, transfers IDs only, and uses at most10 queries",async()=>{
 fixture();const r=await settle(fetchArtistPoolTotal());expect(r).toMatchObject({total:738106,lowerBound:false,issue:null});
 expect(m.get.mock.calls.length).toBeLessThanOrEqual(10);expect(m.get.mock.calls.every(x=>x[1].params.only==='id')).toBe(true);
});
it.each([0,1,1000,1001,1000000,1000001])("counts total %i with an honest lower bound at the API ceiling",async size=>{
 fixture(size);const r=await settle(fetchArtistPoolTotal());expect(r.total).toBe(Math.min(size,1000000));expect(r.lowerBound).toBe(size>=1000000);
});
it("an unavailable count is unknown, not zero, and does not prevent selected candidates",async()=>{
 m.get.mockRejectedValue({response:{status:403}});expect(await settle(fetchArtistPoolTotal())).toMatchObject({total:null,issue:"network"});
 fixture();expect((await settle(loadSelectedArtistPool(1000))).items).toHaveLength(1000);
});
it("coalesces metadata queries, reuses a recent count, and explicitly refreshes it",async()=>{
 fixture();const service=createArtistPoolTotalService();const a=service(),b=service(true);expect(a).toBe(b);await settle(a);m.get.mockClear();
 expect((await service()).total).toBe(738106);expect(m.get).not.toHaveBeenCalled();
 fixture(100001);expect((await settle(service(true))).total).toBe(100001);expect(m.get).toHaveBeenCalled();
});
it("matches request IDs for cancellation and supersedes only the same owner",async()=>{
 fixture();const manager=createSelectedArtistPoolManager(),a=manager.start(1,"A",10000,()=>{}),b=manager.start(2,"B",1000,()=>{});
 expect(manager.cancel(2,"A")).toBe(false);expect(manager.cancel(1,"A")).toBe(true);
 expect((await settle(a)).issue).toBe("cancelled");expect((await b).items).toHaveLength(1000);
});
it("normalizes missing and extreme persisted counts",()=>{
 expect(normalizeArtistPoolCount(undefined)).toBe(1000);expect(normalizeArtistPoolCount('')).toBe(1000);expect(normalizeArtistPoolCount(Infinity)).toBe(1000);
 expect(normalizeArtistPoolCount(-3)).toBe(1);expect(normalizeArtistPoolCount(2500.9)).toBe(2500);expect(normalizeArtistPoolCount(999999999)).toBe(1000000);
});

it("rechecks a known non-full boundary in one metadata request",async()=>{
 fixture();const service=createArtistPoolTotalService();await settle(service());m.get.mockClear();fixture(738128);
 expect(await settle(service(true))).toMatchObject({total:738128,lowerBound:false});
 expect(m.get).toHaveBeenCalledTimes(1);expect(m.get.mock.calls[0][1].params.page).toBe(739);
});
it.each([0,1,1000,1001,2000,2001,120050,738106,999999,1000000,1000001])("boundary hints remain exact after catalog growth/shrink to %i",async size=>{
 fixture(size);const previous={total:738106,checkedAt:1,lowerBound:false,issue:null};
 const r=await settle(fetchArtistPoolTotal(previous));expect(r.total).toBe(Math.min(size,1000000));expect(r.lowerBound).toBe(size>=1000000);
});
it("a previously full boundary checks the following page before declaring the total",async()=>{
 fixture(2000);const previous={total:1000,checkedAt:1,lowerBound:false,issue:null};
 expect((await settle(fetchArtistPoolTotal(previous))).total).toBe(2000);
 expect(m.get.mock.calls.map(x=>x[1].params.page).slice(0,2)).toEqual([1,2]);
});
it("out-of-order page responses still produce the correct ranking and selected count",async()=>{
 fixture(20000);const original=m.get.getMockImplementation()!;const completed:number[]=[];
 m.get.mockImplementation(async(...args)=>{
  const page=args[1].params.page;await new Promise(r=>setTimeout(r,page===1?2200:50));
  completed.push(page);return original(...args);
 });
 const r=await settle(loadSelectedArtistPool(2500));expect(completed[0]).toBe(2);
 expect(r.items.map(x=>x.id)).toEqual(Array.from({length:2500},(_,i)=>20000-i));expect(r.pages).toBe(3);
});
it("cancellation aborts in-flight look-ahead and never returns a partial selection",async()=>{
 const signals:AbortSignal[]=[];
 m.get.mockImplementation((_url,{signal})=>new Promise((_resolve,reject)=>{
  signals.push(signal);signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
 }));
 const controller=new AbortController(),request=loadSelectedArtistPool(10000,{signal:controller.signal});
 await vi.runAllTimersAsync();controller.abort();
 expect(await settle(request)).toMatchObject({items:[],complete:false,issue:'cancelled'});
 expect(signals.length).toBe(2);expect(signals.every(x=>x.aborted)).toBe(true);
});
it("parallel failure of a later page is handled even while the earlier page is pending",async()=>{
 fixture();const original=m.get.getMockImplementation()!;
 m.get.mockImplementation(async(...args)=>{
  if(args[1].params.page===2)throw {response:{status:403}};
  await new Promise(r=>setTimeout(r,2000));return original(...args);
 });
 expect(await settle(loadSelectedArtistPool(2500))).toMatchObject({items:[],complete:false,httpStatus:403});
});
it("Retry-After is observed before retry and selected results remain complete",async()=>{
 fixture();const original=m.get.getMockImplementation()!;const times:number[]=[];
 m.get.mockImplementation((...args)=>{
  times.push(Date.now());if(times.length===1)throw {response:{status:429,headers:{'retry-after':'3'}}};return original(...args);
 });
 const r=await settle(loadSelectedArtistPool(1000));expect(r.complete).toBe(true);
 expect(times[1]-times[0]).toBeGreaterThanOrEqual(3000);
});
