import {describe,it,expect} from 'vitest';
import {auditMixedEnvelope,mixedTemplateContract,patchMixedEnvelope,normalizeMixedEnvelope} from './prompt-template-audit';
import explicitFacts from '../tests/fixtures/prompt-explicit-facts.json';
const contract=mixedTemplateContract('有效语义单元 50–150；Tag 65–75%', 'mixed')!;
const sample=()=>({segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:['1girl','white hair','red eyes','full body','from above','rain','night','transparent umbrella'][i]??'distinct tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her left sleeve catches light '+i}))]}]});
const pair=()=>({segments:Array.from({length:3},(_,s)=>({units:[
 ...Array.from({length:14},(_,i)=>({kind:'tag',text:i===0?(s===0?'2girls':'girl'):`segment ${s} fact ${i}`})),
 ...Array.from({length:6},(_,i)=>({kind:'natural',text:`her sleeve catches the light in position ${s} ${i}`}))
]}))});
describe('selected mixed template audit',()=>{
 for(const fixture of explicitFacts)it('shared explicit facts: '+fixture.name,()=>{
  const e=sample();
  for(let i=0;i<42;i++)e.segments[0].units[i].text=fixture.tags[i]??'fixture tag '+i;
  expect(auditMixedEnvelope(JSON.stringify(e),fixture.source,contract).issues.length===0).toBe(fixture.ok);
 });
 it('rejects unrequested full-figure cues in an explicit upper-body crop while preserving clothing',()=>{
  const e=sample();e.segments[0].units[3].text='upper body';e.segments[0].units[10].text='long blue skirt';e.segments[0].units[44].text='standing with both feet planted near the railing';
  const source='一位白发女性穿蓝色长裙，上半身侧面构图';
  expect(auditMixedEnvelope(JSON.stringify(e),source,contract).issues.some(x=>x.includes('展示双脚'))).toBe(true);
  e.segments[0].units[44].text='her sleeve rests beside the railing';expect(auditMixedEnvelope(JSON.stringify(e),source,contract).issues).toEqual([]);
 });
 it('removes exact duplicates before recounting but never changes weights or invents missing units',()=>{
  const e=sample();e.segments[0].units.push({kind:'tag',text:'WHITE_HAIR'});
  const r=auditMixedEnvelope(normalizeMixedEnvelope(JSON.stringify(e)),'',contract);expect(r.stats.total).toBe(60);expect(r.issues).toEqual([]);
  e.segments[0].units.push({kind:'tag',text:'1.5::white hair::'});
  expect(auditMixedEnvelope(normalizeMixedEnvelope(JSON.stringify(e)),'',contract).issues.some(x=>x.includes('重复单元'))).toBe(true);
  const short={segments:[{units:Array.from({length:60},()=>({kind:'tag',text:'1girl'}))}]};
  expect(auditMixedEnvelope(normalizeMixedEnvelope(JSON.stringify(short)),'',contract).stats.total).toBe(1);
 });
 it('pinpoints malformed and duplicate units so a delta repair can target the actual index',()=>{const e=sample();e.segments[0].units[10]={kind:'tag',text:'white hair'};e.segments[0].units[44]={kind:'natural',text:'her sleeve catches light, near the railing'};const r=auditMixedEnvelope(JSON.stringify(e),'',contract);expect(r.issues.some(x=>x.includes('segments[0].units[10] 重复单元'))).toBe(true);expect(r.issues.some(x=>x.includes('segments[0].units[44] 每个单元'))).toBe(true);});
 it('counts typed units and serializes only the validated final prompt',()=>{const r=auditMixedEnvelope(JSON.stringify(sample()),'单人白发红眼，雨夜透明伞，俯视机位全身',contract);expect(r.issues).toEqual([]);expect(r.stats).toEqual({total:60,tags:42,natural:18,tagPercent:70});expect(r.prompt).not.toContain('"kind"');});
 it('rejects wrong ratios, duplicates and dishonest natural/tag labels',()=>{const e=sample();e.segments[0].units[0].kind='natural';e.segments[0].units[1].text='white hair';e.segments[0].units[2].text='white_hair';e.segments[0].units[3].text='her hand rests on the railing';for(let i=10;i<35;i++)e.segments[0].units[i]={kind:'natural',text:'her right sleeve casts shadows '+i};expect(auditMixedEnvelope(JSON.stringify(e),'',contract).issues.join(' ')).toMatch(/重复.*自然关系.*Tag|自然/);expect(auditMixedEnvelope(JSON.stringify(e),'',contract).issues.some(x=>x.includes('65–75'))).toBe(true);});
 it('blocks the reported white-to-black hair change and lost camera intent',()=>{const e=sample();e.segments[0].units[1].text='black hair';e.segments[0].units[3].text='upper body';const r=auditMixedEnvelope(JSON.stringify(e),'一位白发红眼女性，全身构图',contract);expect(r.issues.join(' ')).toContain('white hair');expect(r.issues.join(' ')).toContain('全身');});
 it('applies latest explicit hair requirement, not old choices',()=>{const e=sample();e.segments[0].units[1].text='black hair';expect(auditMixedEnvelope(JSON.stringify(e),'之前白发。现在改成黑发。',contract).issues).toEqual([]);});
 it('does not impose the default range on unrelated custom templates',()=>{expect(mixedTemplateContract('use ten units','mixed')).toBeNull();});
 it('patches only indexed defects and appends missing units without rewriting correct facts',()=>{const s=sample(),before=s.segments[0].units[1];const merged=JSON.parse(patchMixedEnvelope(JSON.stringify(s),JSON.stringify({replace:[{segment:0,index:3,unit:{kind:'tag',text:'upper body'}}],append:[{segment:0,units:[{kind:'natural',text:'her other hand touches the railing'}]}]})));expect(merged.segments[0].units[1]).toEqual(before);expect(merged.segments[0].units.length).toBe(61);expect(()=>patchMixedEnvelope(JSON.stringify(s),JSON.stringify({segments:[]}))).toThrow(/增量/);});
 it('lets explicit new time and framing override old context',()=>{const e=sample();e.segments[0].units[3].text='upper body';e.segments[0].units[6].text='sunset';expect(auditMixedEnvelope(JSON.stringify(e),'之前雨夜全身。现在改成傍晚上半身。',contract).issues).toEqual([]);});
 it('repairs obvious relation metadata and cross-kind duplicates without rewriting the pictured phrase',()=>{
  const e=pair(),phrase='the deliverywoman hands over the paper bag at the doorway in the left panel';
  e.segments[0].units[14].text=phrase;e.segments[0].units.push({kind:'tag',text:phrase});
  const fixed=normalizeMixedEnvelope(JSON.stringify(e),{repairMetadata:true}),r=auditMixedEnvelope(fixed,'两人交接纸袋',contract);
  expect(r.issues).toEqual([]);expect(r.stats).toEqual({total:60,tags:42,natural:18,tagPercent:70});
  expect(JSON.parse(fixed).segments[0].units.filter((u:{text:string})=>u.text===phrase)).toEqual([{kind:'natural',text:phrase}]);
 });
 it.each(['一个女孩把纸袋交给另一个女孩','两人交接纸袋：一位女孩递出，一位女孩接住','1girl, 1boy 交接纸袋'])(
  'does not infer global solo from individual introductions: %s',source=>{
   const e=pair();e.segments[0].units[0].text='2Girls';e.segments[1].units[0].text='1Girl';e.segments[2].units[0].text='1girl';
   const raw=normalizeMixedEnvelope(JSON.stringify(e),{repairMetadata:true});expect(auditMixedEnvelope(raw,source,contract).issues).toEqual([]);
   expect(JSON.parse(raw).segments[1].units[0]).toEqual({kind:'tag',text:'girl'});
  });
 it('keeps explicit global counts binding despite later incidental introductions',()=>{
  expect(auditMixedEnvelope(JSON.stringify(pair()),'单人：一个女孩想起另一位女孩',contract).issues).toContain('保留用户指定的单人数量');
  expect(auditMixedEnvelope(JSON.stringify(pair()),'之前单人，现在两人：一位女孩递出纸袋',contract).issues).toEqual([]);
  expect(auditMixedEnvelope(JSON.stringify(pair()),'三人，一位女孩递出纸袋',contract).issues).toContain('保留用户指定的人物数量');
 });
 it('counts only complete positive count Tags, case-insensitively',()=>{
  for(const text of ['2Girls','1.2::2girls::']){const e=pair();e.segments[0].units[0].text=text;expect(auditMixedEnvelope(JSON.stringify(e),'',contract).issues).toEqual([]);}
  for(const [kind,text] of [['natural','2girls stand beside the counter'],['tag','Text: "2girls"'],['tag','-1.2::2girls::'],['tag','3girls']]){
   const e=pair();e.segments[0].units[0]={kind,text};expect(auditMixedEnvelope(JSON.stringify(e),'',contract).issues).toContain('base 人数必须等于角色段数量');
  }
 });
 it('accepts clear short positional prose without accepting short clothing Tags as natural',()=>{
  const e=sample();e.segments[0].units[42].text='to her left';expect(auditMixedEnvelope(JSON.stringify(e),'',contract).issues).toEqual([]);
  e.segments[0].units[42].text='blue shirt';expect(auditMixedEnvelope(JSON.stringify(e),'',contract).issues.join(' ')).toContain('短 Tag 被标成自然语言');
 });
 it('never guesses a missing role or rewrites differently weighted or visible-text facts',()=>{
  const e=pair();e.segments[1].units[0].text='woman';e.segments[2].units[0].text='1.2::girl::';
  const fixed=normalizeMixedEnvelope(JSON.stringify(e));expect(JSON.parse(fixed)).toEqual(e);
  expect(auditMixedEnvelope(fixed,'',contract).issues.filter(x=>x.includes('角色段')).length).toBe(2);
  const literal=sample();literal.segments[0].units[10].text='Text: "her paper bag"';
  expect(JSON.parse(normalizeMixedEnvelope(JSON.stringify(literal)))).toEqual(literal);
 });
 it('preflights duplicate/conflicting delta indices before any splice or replacement',()=>{
  const raw=JSON.stringify(sample());
  for(const patch of [{remove:[{segment:0,index:1},{segment:0,index:1}]},{replace:[{segment:0,index:1,unit:{kind:'tag',text:'black hair'}}],remove:[{segment:0,index:1}]}])expect(()=>patchMixedEnvelope(raw,JSON.stringify(patch))).toThrow(/重复或冲突/);
  expect(()=>patchMixedEnvelope(raw,JSON.stringify({replace:[{segment:0,index:1,unit:{kind:'tag',text:''}}]}))).toThrow(/格式/);
  const out=JSON.parse(patchMixedEnvelope(raw,JSON.stringify({remove:[{segment:0,index:1},{segment:0,index:3}]})));
  expect(out.segments[0].units[1].text).toBe('red eyes');expect(out.segments[0].units[2].text).toBe('from above');
 });
});
