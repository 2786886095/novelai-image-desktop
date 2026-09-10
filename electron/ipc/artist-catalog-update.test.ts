import { expect,it,vi } from "vitest";
import { collectArtistCatalog } from "./artist-catalog-update";
const row=(id:number,name=`artist_${id}`)=>({id,name,post_count:id,category:1,is_deprecated:false});
it("scans full cursor data and requires a terminal empty page",async()=>{
 const read=vi.fn().mockResolvedValueOnce([row(3),row(2)]).mockResolvedValueOnce([row(1)]).mockResolvedValueOnce([]);
 const progress=vi.fn(),r=await collectArtistCatalog(read,()=>{},progress,()=>1000);
 expect(read.mock.calls.map(a=>a[0])).toEqual([1,"b2","b1"]);expect(r.catalog.total).toBe(3);expect(progress).toHaveBeenCalledTimes(2);
});
it("deduplicates the completed full scan by name",async()=>{
 const read=vi.fn().mockResolvedValueOnce([row(2,"same"),row(1,"same")]).mockResolvedValueOnce([]);
 const r=await collectArtistCatalog(read,()=>{},()=>{},()=>1000);expect(r.rawCount).toBe(2);expect(r.catalog.total).toBe(1);
});
it.each([null,"html",[null],[{...row(1),category:0}],[]])("rejects malformed/incomplete input %j",async value=>{
 await expect(collectArtistCatalog(async()=>value as any,()=>{},()=>{})).rejects.toThrow();
});
it("rejects repeated cursor pages rather than claiming a full snapshot",async()=>{
 await expect(collectArtistCatalog(async()=>[row(1)],()=>{},()=>{})).rejects.toThrow("Repeated");
});
it("cancel or failure prevents a new snapshot from being returned",async()=>{
 let stopped=false;await expect(collectArtistCatalog(async()=>{stopped=true;return [row(1)];},()=>{if(stopped)throw new Error("cancelled");},()=>{})).rejects.toThrow("cancelled");
 await expect(collectArtistCatalog(async()=>{throw new Error("network");},()=>{},()=>{})).rejects.toThrow("network");
});
