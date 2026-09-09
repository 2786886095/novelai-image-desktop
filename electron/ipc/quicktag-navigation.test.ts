import {createHash} from "node:crypto";
import {beforeEach,describe,it,expect,vi} from "vitest";
import fixture from "../../shared/quicktag-fixtures.json";
const get=vi.hoisted(()=>vi.fn());
vi.mock("axios",()=>({default:{get}}));
vi.mock("./proxy",()=>({proxyConfig:()=>({})}));
import {clearOnlineGalleryDataCache,searchOnlineGallery,getOnlineGalleryDetail} from "./online-gallery";
beforeEach(()=>{
  clearOnlineGalleryDataCache(); get.mockReset();
  const books=Object.fromEntries(Object.entries(fixture.books).map(([id,b])=>[id,Buffer.from(JSON.stringify(b))]));
  get.mockImplementation(async(url:string)=>{
    if(url.endsWith('/data-source.json'))return{data:{baseUrl:'https://assets.quicktagcloud.com/data',pointer:'current.json'}};
    if(url.endsWith('/current.json'))return{data:{release:'r-test',manifest:'releases/r-test/manifest.json'}};
    if(url.endsWith('/codexes.json'))return{data:fixture.codexes};
    if(url.endsWith('/media.json'))return{data:{baseUrl:'https://assets.quicktagcloud.com'}};
    if(url.endsWith('/manifest.json'))return{data:{files:Object.fromEntries(Object.entries(books).map(([id,b])=>[id+'.json',{size:b.length,sha256:createHash('sha256').update(b).digest('hex')}]))}};
    const id=url.split('/').pop()!.replace('.json','');if(books[id])return{data:books[id]};throw Error('Unavailable fixture');
  });
});
describe('native QuickTagCloud navigation',()=>{
  it('lists the complete catalog and filters nested categories',async()=>{
    const root=await searchOnlineGallery({source:'quicktag'});expect(root.navigation?.collections).toHaveLength(3);
    const page=await searchOnlineGallery({source:'quicktag',query:'https://novelai.quicktagcloud.com/?c=artist_nai5_personal&p=zuud7l',pageSize:12});
    expect(page.total).toBe(1);expect(page.navigation?.categoryPath).toEqual(['画风组词典','梦神NAI5F画风合集']);expect(page.items[0].id).toBe('sample-1');
    expect(page.items[0].sourceUrl).toContain('entry=sample-1');
  });
  it('searches entry contents globally and reports partial failures',async()=>{
    const page=await searchOnlineGallery({source:'quicktag',searchAll:true,query:'watercolor',pageSize:12});
    expect(page.items.map((i)=>i.collectionId)).toEqual(['artist_nai5_personal','clothes']);expect(page.navigation?.failedCollections).toEqual(['Unavailable']);
  });
  it('respects per-entry ratings and retains image detail/download paths',async()=>{
    const page=await searchOnlineGallery({source:'quicktag',collectionId:'artist_nai5_personal',safeOnly:true,page:900});expect(page.total).toBe(2);expect(page.page).toBe(1);
    const all=await searchOnlineGallery({source:'quicktag',collectionId:'artist_nai5_personal',safeOnly:false});expect(all.total).toBe(3);
    const detail=await getOnlineGalleryDetail({source:'quicktag',collectionId:'artist_nai5_personal',id:'sample-1'});expect(detail.media[0].downloadUrl).toContain('/originals/artist_nai5_personal/1.png');expect(detail.prompt).toBe('watercolor, blue sky');
  });
  it('retries a transient public GET once but not unauthorized responses',async()=>{
    get.mockRejectedValueOnce({response:{status:503}});
    await searchOnlineGallery({source:'quicktag'});
    expect(get.mock.calls.filter(([url])=>url.endsWith('/data-source.json'))).toHaveLength(2);
    clearOnlineGalleryDataCache(); get.mockClear();
    get.mockRejectedValueOnce({response:{status:401}});
    await expect(searchOnlineGallery({source:'quicktag'})).rejects.toMatchObject({response:{status:401}});
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('rejects obsolete category links rather than opening a different category',async()=>{
    await expect(searchOnlineGallery({source:'quicktag',query:'https://novelai.quicktagcloud.com/?c=artist_nai5_personal&p=missing'})).rejects.toThrow('obsolete');
  });
});
