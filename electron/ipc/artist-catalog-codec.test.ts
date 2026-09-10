import { expect, it } from "vitest";
import { gzipSync, gunzipSync } from "node:zlib";
import { ArtistCatalog, encodeArtistCatalog, decodeArtistCatalog, sampleArtistIndices } from "./artist-catalog-codec";
const row=(id:number,postCount=id,name=`artist_${id}`)=>({id,postCount,name,deprecated:false});
it("round-trips tags, IDs, counts and date in stable ranking order",()=>{
 const c=decodeArtistCatalog(encodeArtistCatalog([row(2,5,"中文名称"),row(3,0),row(1,5)],123456));
 expect(c.total).toBe(3);expect(c.savedAt).toBe(123456);expect([c.row(0),c.row(1),c.row(2)]).toEqual([row(1,5),row(2,5,"中文名称"),row(3,0)]);
});
it("deduplicates tag names, not sampling chances, and retains zero-post tags",()=>{
 const c=decodeArtistCatalog(encodeArtistCatalog([row(1,100,"same"),row(2,50,"same"),row(3,0)],1));
 expect(c.total).toBe(2);expect(c.row(0).id).toBe(1);expect(c.row(1).postCount).toBe(0);
});
it.each([[],[row(0)],[row(1),row(1)],[row(1,-1)],[row(1,1,"")],[row(1,0xffffffff+1)]])("rejects invalid source rows %j",rows=>{
 expect(()=>encodeArtistCatalog(rows,1)).toThrow();
});
it("rejects truncated, corrupt and tampered archives",()=>{
 const packed=encodeArtistCatalog([row(1)],1);expect(()=>decodeArtistCatalog(packed.subarray(0,10))).toThrow();
 const body=gunzipSync(packed);body[24]^=1;expect(()=>decodeArtistCatalog(gzipSync(body))).toThrow("checksum");
 expect(()=>new ArtistCatalog(Buffer.alloc(40))).toThrow();
});
it("rejects invalid random access",()=>{
 const c=decodeArtistCatalog(encodeArtistCatalog([row(1)],1));expect(()=>c.row(-1)).toThrow();expect(()=>c.row(1)).toThrow();
});
it.each([0,1,10,1000,10000])("draws %i indices across the entire738103-entry catalog without duplicates",count=>{
 const indices=sampleArtistIndices(738103,count,12345);expect(indices).toHaveLength(count);expect(new Set(indices).size).toBe(count);
 expect(indices.every(i=>i>=0&&i<738103)).toBe(true);
 if(count>=1000){for(let quarter=0;quarter<4;quarter++)expect(indices.filter(i=>Math.floor(i/738103*4)===quarter).length).toBeGreaterThan(count*.18);}
});
it("same seed is reproducible; another seed changes the candidate set",()=>{
 expect(sampleArtistIndices(10000,100,42)).toEqual(sampleArtistIndices(10000,100,42));
 expect(sampleArtistIndices(10000,100,42)).not.toEqual(sampleArtistIndices(10000,100,43));
});
it("selecting more than the catalog returns every index once",()=>{
 expect(sampleArtistIndices(100,1000,1).sort((a,b)=>a-b)).toEqual(Array.from({length:100},(_,i)=>i));
});
it("repeated independent seeds do not favor the leading ranks",()=>{
 const hits=Array(100).fill(0);for(let seed=0;seed<10000;seed++)hits[sampleArtistIndices(100,1,seed)[0]]++;
 expect(Math.min(...hits)).toBeGreaterThan(55);expect(Math.max(...hits)).toBeLessThan(145);
});
