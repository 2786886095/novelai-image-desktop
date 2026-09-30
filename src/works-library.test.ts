import {describe,it,expect} from 'vitest';
import {ACTIVE_TABS,WIDE_WORKSPACE_TABS} from './app/navigation';
import {getLocalizedTabItems} from './i18n';
import {DEFAULT_PARAMS, type HistoryItem} from './types';
import {directoryKey,filterWorks,readWorksPrompt,selectWorksRange,worksDirectory,worksName,WORKS_PAGE_SIZE,type WorksFilter} from './works-library';
import {normalizeTabOrder} from './app/tab-order';
import {worksText} from './works-text';
describe('baseline works workspace',()=>{
 it('has a standalone full-width works route',()=>{expect([...ACTIVE_TABS]).toContain('works');expect([...WIDE_WORKSPACE_TABS]).toContain('works');});
 it('exposes the works entry in all five languages',()=>{for(const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])expect(getLocalizedTabItems(language).some(x=>String(x.value)==='works')).toBe(true);});
});

const defaults:WorksFilter={query:'',date:'',group:'',directory:'',order:'newest'};
const make=(n:number,patch:Partial<HistoryItem>={}):HistoryItem=>({id:String(n),filePath:`D:\\art\\a-${n}.png`,fileUrl:`file:///D:/art/a-${n}.png`,createdAt:`2026-09-${String(n).padStart(2,'0')}T00:00:00Z`,date:`2026-09-${String(n).padStart(2,'0')}`,params:{...DEFAULT_PARAMS,positivePrompt:'white hair, blue sky'},actualSeed:n,model:'nai',width:832,height:1216,...patch});
function pngSnapshot(prompt:string) {
 const text = new TextEncoder().encode('Description\0'+prompt);
 const bytes = new Uint8Array(8+12+text.length+12);
 bytes.set([137,80,78,71,13,10,26,10]);new DataView(bytes.buffer).setUint32(8,text.length);
 bytes.set(new TextEncoder().encode('tEXt'),12);bytes.set(text,16);bytes.set(new TextEncoder().encode('IEND'),24+text.length);
 return {ok:true,snapshot:{name:'image.png',type:'image/png',lastModified:0,base64:btoa(String.fromCharCode(...bytes))}};
}
describe('works query and selection',()=>{
 it('adds the new tab to persisted old custom orders without duplicates',()=>{const tabs=normalizeTabOrder(['favorites','generate']);expect(tabs[0]).toBe('favorites');expect(tabs.filter(t=>t==='works')).toHaveLength(1);});
 it('sorts a copy deterministically',()=>{const items=[make(1),make(2)];expect(filterWorks(items,defaults).map(x=>x.id)).toEqual(['2','1']);expect(items[0].id).toBe('1');expect(filterWorks(items,{...defaults,order:'oldest'})[0].id).toBe('1');});
 it('combines dates, folders, groups, search terms and seeds',()=>{const items=[make(1,{groupId:'good'}),make(2),make(3,{filePath:'D:\\other\\a-3.png',groupId:'good'})];expect(filterWorks(items,{...defaults,group:'good',directory:'d:/art',query:'WHITE 1',date:'2026-09-01'}).map(x=>x.id)).toEqual(['1']);expect(filterWorks(items,{...defaults,group:'__ungrouped'}).map(x=>x.id)).toEqual(['2']);expect(filterWorks(items,{...defaults,query:'not found'})).toEqual([]);});
 it('handles windows and slash paths and unicode names',()=>{expect(worksName('D:\\作品\\图.png')).toBe('图.png');expect(worksDirectory('D:/作品/图.png')).toBe('D:/作品');expect(directoryKey('D:\\ART\\')).toBe('d:/art');});
 it('supports toggling and range selection across page boundaries without mutating prior state',()=>{const ids=Array.from({length:200},(_,n)=>String(n)),old=new Set(['2']);const next=selectWorksRange(ids,old,'59','62',true);expect([...next]).toEqual(['2','59','60','61','62']);expect([...old]).toEqual(['2']);expect(selectWorksRange(ids,next,null,'2',false).has('2')).toBe(false);});
 it('falls back to toggle if the range anchor disappeared',()=>{expect([...selectWorksRange(['a','b'],new Set(),'removed','b',true)]).toEqual(['b']);});
 it('keeps the grid bounded for hundreds of records',()=>{expect(WORKS_PAGE_SIZE).toBeLessThanOrEqual(100);const items=Array.from({length:501},(_,n)=>make(n));expect(filterWorks(items,defaults).length).toBe(501);expect(Math.ceil(items.length/WORKS_PAGE_SIZE)).toBe(9);});
 it('has complete labels for all supported locales',()=>{for(const locale of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){expect(Object.keys(worksText(locale))).toEqual(Object.keys(worksText('en-US')));expect(Object.values(worksText(locale)).every(x=>x.length>0)).toBe(true);}});
});
describe('original image prompt provenance',()=>{
 it('reads authored text from the image rather than a differing workbench/history prompt',async()=>{const prompt='1girl, 1.2::white hair::, repeated, repeated';const result=await readWorksPrompt(make(1),async()=>pngSnapshot(prompt));expect(result.source).toBe('original');expect(result.positive).toBe(prompt);});
 it('explicitly labels record fallback if there is no embedded prompt',async()=>{const result=await readWorksPrompt(make(1),async()=>pngSnapshot(''));expect(result.source).toBe('record');expect(result.positive).toContain('white hair');});
 it('never claims the record is the original when the file is missing',async()=>{await expect(readWorksPrompt(make(1),async()=>({ok:false,message:'ENOENT'}))).rejects.toThrow('ENOENT');});
 it('propagates IPC failure for the UI to show retry',async()=>{await expect(readWorksPrompt(make(1),async()=>{throw Error('bridge closed');})).rejects.toThrow('bridge closed');});
});
