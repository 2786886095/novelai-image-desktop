import {expect,it} from 'vitest';
import {parseComicPromptPages} from './comic-prompt';
import {parseV5Storyboard,layoutIds,approvedLayoutHint} from './v5-storyboard';
import {requestV5Prompt} from '../../electron/ipc/v5-prompt-transport';
import images from '../../shared/prompt-skill-catalog-v3.json';
import comics from '../../shared/comic-template-catalog.json';

const panel={position:'right',camera:'medium',scene:'roof',actors:'left',action:'turns',dialogue:['回来了。'],balloon:'right',sfx:'',transition:''};
const cards=[{name:'A',color:'red ribbon',bw:'dark ribbon'}];
const draft=(characters:unknown=cards)=>({nodes:'a',pacing:'b',cuts:'',characters,pages:[{purpose:'arrival',layout:'L3',ending:'a',turn:'b',cuts:'',panels:[panel,panel,panel,panel]}]});
const base='comic, table with two cups | girl, black hair, Text: "久等了。"';
it.each([' PAGES>>>',' >>>',' |||','>>>','|||','\r\nPAGES>>>'])('accepts only terminal envelope punctuation: %j',ending=>{const r=parseComicPromptPages('<<<PAGES '+base+ending,1,true);expect(r.countStatus).toBe('exact');expect(r.lines).toEqual([base]);});
it('keeps raw prompts, character separators and literal markers in dialogue intact',()=>{
 const text='comic | girl, Text: "a ||| b >>>"';expect(parseComicPromptPages('<<<PAGES '+text+' >>>',1).lines).toEqual([text]);expect(parseComicPromptPages(text,1).lines).toEqual([text]);expect(parseComicPromptPages('<<<PAGES '+base,1).countStatus).toBe('truncated');expect(parseComicPromptPages('<<<PAGES comic | girl, Text: "unfinished |||',1).countStatus).toBe('truncated');expect(parseComicPromptPages('<<<PAGES '+base+' >>>',2).countStatus).toBe('mismatch');
});
it('does not request continuation of complete inline response but continues genuinely open output',async()=>{
 const run=async(parts:string[],finish:string)=>{let n=0;const r=await requestV5Prompt({model:'fixture',budget:20,messages:[],pages:1},async()=>({data:{choices:[{message:{content:parts[n++]},finish_reason:finish}]}}));return {n,text:r.data.choices[0].message.content};};
 expect((await run(['<<<PAGES '+base+' |||'],'length')).n).toBe(1);
 const r=await run(['<<<PAGES comic, ','roof | girl, waves PAGES>>>'],'stop');expect(r.n).toBe(2);expect(parseComicPromptPages(r.text,1).lines).toEqual(['comic, roof | girl, waves']);
});
it.each([cards,cards[0],{hero:cards[0]},'A: red ribbon'])('preserves editable card data',data=>{const r=parseV5Storyboard(JSON.stringify(draft(data)),1,false);expect(r.characters).toContain('red ribbon');expect(r.pages[0].panels).toHaveLength(4);});
it('does not use card normalization to bypass limits or accept four panels in single mode',()=>{expect(()=>parseV5Storyboard(JSON.stringify(draft()),1,true)).toThrow();for(const c of [false,null,42,{name:'x'.repeat(20001)}])expect(()=>parseV5Storyboard(JSON.stringify(draft(c)),1,false)).toThrow();});
it('maps 26 reviewed layouts into different English geometries, not raw IDs',()=>{const hints=layoutIds.map(layout=>approvedLayoutHint(JSON.stringify({page:{layout}})));expect(hints.every(s=>s.startsWith('\n'))).toBe(true);expect(new Set(hints).size).toBe(26);expect(hints.every(s=>s&&!/\b[LS]\d+\b/.test(s))).toBe(true);expect(hints[0]).toContain('one full-width panel; then two side-by-side panels');expect(hints[22]).toContain('diagonal');expect(approvedLayoutHint('manually reviewed text')).toBe('');});
it('ships segmentation and mono rules in all six image slots and concrete balloon and border rules in the full page slot',()=>{expect(images.templates).toHaveLength(6);for(const t of images.templates){expect(t.body).toContain('仅一个 |');expect(t.body).toContain('warm / cool / golden');expect(Buffer.byteLength(t.body)).toBeLessThanOrEqual(3500);}const p=comics.templates.find(x=>x.comicFormat==='jp-page')!.body;for(const key of ['speech bubble in the upper right','tail pointing','不抄汉字拟声词','-1::white border, page margin, frame ::'])expect(p).toContain(key);expect(Buffer.byteLength(p)).toBeLessThanOrEqual(3500);});
