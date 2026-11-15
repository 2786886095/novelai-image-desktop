import {expect,it} from "vitest";
import {NAX_ATTRIBUTION,NAX_COLLECTIONS} from "./nax-gallery";
import {ONLINE_GALLERY_SOURCES} from "./online-gallery";
it("offers 15 NAX collections under real V5, V4.5 and V4 URLs with attribution",()=>{
 expect(NAX_ATTRIBUTION.author).toBe("u/Carlyone");
 expect(ONLINE_GALLERY_SOURCES.find(x=>x.id==="nax")?.siteUrl).toBe("https://nax.moe/");
 expect(new Set(NAX_COLLECTIONS.map(x=>x.url)).size).toBe(15);
 for(const row of NAX_COLLECTIONS){
  const url=new URL(row.url);
  expect(url.origin).toBe("https://nax.moe");
  expect(url.searchParams.get("gallery")).toBe(row.id);
 }
});
