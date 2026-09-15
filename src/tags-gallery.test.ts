import {expect,it,vi} from 'vitest';
import fixture from '../shared/tags-gallery-fixture.json';
import {parseTagsGalleryPage,parseTagsGalleryDetail,loadTagsGalleryPage,tagsGalleryCategory,tagsGalleryDetailUrl,tagsGalleryUrl,TAGS_GALLERY_CATEGORIES,tagsGalleryLabels} from './tags-gallery';
import {galleryImageHeaders} from './gallery-download';
it('parses escaped labels, intrinsic images and genuinely missing samples',()=>{
 const p=parseTagsGalleryPage(fixture.listing,'hair');expect(p.total).toBe(2);expect(p.items).toHaveLength(2);expect(p.items[0].prompt).toBe('blue & white');expect(p.items[0].cover.width).toBe(480);expect(p.items[0].cover.previewUrl).toBe('https://tags.gallery/images/thumbs/blue.webp');expect(p.items[1].mediaCount).toBe(0);expect(p.items[1].cover.downloadUrl).toBe('');
});
it('keeps detail tag and full example distinct',()=>{const d=parseTagsGalleryDetail(fixture.detail,'hair/blue_hair');expect(d.item.prompt).toBe('blue & white');expect(d.prompt).toBe('blue & white, solo');expect(d.media).toHaveLength(1);});
it('handles empty results but surfaces changed HTML rather than lying about zero results',()=>{expect(parseTagsGalleryPage(fixture.empty,'hair').items).toEqual([]);expect(()=>parseTagsGalleryPage('<html>captcha</html>','hair')).toThrow('LAYOUT_CHANGED');});
it('maps client pages across the upstream 100-item boundary without omissions or repeats',async()=>{
 const html=(start:number,count:number)=>`<main>hits=152${Array.from({length:count},(_,i)=>`<a aria-label="Open detail: tag ${start+i}" href="/hair/tag_${start+i}"></a>`).join('')}</main>`;
 const fetch=vi.fn(async(url:string)=>url.includes('p=2')?html(100,52):html(0,100));const result=await loadTagsGalleryPage(fetch,'hair',9,12,'');expect(result.items.map(i=>i.id)).toEqual(Array.from({length:12},(_,i)=>`hair/tag_${96+i}`));expect(result.total).toBe(152);expect(result.hasMore).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);
});
it('limits URLs to known categories and original image host',()=>{expect(()=>tagsGalleryDetailUrl('hair/../../secret')).toThrow();expect(()=>tagsGalleryDetailUrl('hair/%2e%2e')).toThrow();expect(()=>tagsGalleryCategory('whatever')).toThrow();expect(tagsGalleryUrl('hair',2,'blue & white')).toContain('q=blue+%26+white');const p=parseTagsGalleryPage(fixture.listing.replace('/images/blue.webp','https://evil.test/a.webp'),'hair');expect(p.items[0].cover.downloadUrl).toBe('');expect(galleryImageHeaders('tags-gallery').Referer).toBe('https://tags.gallery/');});
it('has all nine categories in every app language',()=>{expect(TAGS_GALLERY_CATEGORIES).toHaveLength(9);for(const lang of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])expect(tagsGalleryLabels(lang).map(x=>x.value)).toEqual([...TAGS_GALLERY_CATEGORIES]);});
