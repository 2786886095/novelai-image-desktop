import {expect,it} from "vitest";
import {NAX_ATTRIBUTION,NAX_COLLECTIONS,naxCollectionUrl,naxMediaUrl,parseNaxAlbumPage} from "./nax-gallery";
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

it("extracts allowed still images and original chapter navigation without rendering HTML",()=>{
 const id="danbooru-hair-tags-v5", image="https://cdn.zele.st/data/NAX/Images/"+id+"/hair%2520bun.webp";
 const html='<script>not rendered</script><img src="'+image+'" alt="An image depicting hair &amp; bun"><img alt="duplicate" src="'+image+'">'
  +'<img src="https://cdn.zele.st/data/NAX/Images/danbooru-character-tags-v5/mismatch.webp" alt="unknown">'
  +'<img src="https://elsewhere.invalid/data/NAX/Images/'+id+'/foreign.webp" alt="foreign">'
  +'<a class="page-link" href="?gallery='+id+'&amp;sort=date&amp;page=2">B–D</a>';
 expect(parseNaxAlbumPage(html,id,1)).toEqual({collection:id,page:1,images:[{url:image,tag:"hair & bun"}],chapters:[{label:"B–D",page:2}]});
 expect(naxCollectionUrl(id,2).searchParams.get("page")).toBe("2");
 expect(()=>naxCollectionUrl("https://elsewhere.invalid",1)).toThrow("Unknown NAX collection");
 expect(naxMediaUrl(image+"?redirect=https://elsewhere.invalid")).toBeNull();
 expect(naxMediaUrl(image.replace("hair%2520bun", "%252E%252E%252Fbad"))).toBeNull();
});
