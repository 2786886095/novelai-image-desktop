import {describe,it,expect} from 'vitest';
import {auditMixedEnvelope,mixedTemplateContract,patchMixedEnvelope,normalizeMixedEnvelope} from './prompt-template-audit';
import explicitFacts from '../tests/fixtures/prompt-explicit-facts.json';
const contract=mixedTemplateContract('有效语义单元 50–150；Tag 65–75%', 'mixed')!;
const sample=()=>({segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:['1girl','white hair','red eyes','full body','from above','rain','night','transparent umbrella'][i]??'distinct tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her left sleeve catches light '+i}))]}]});
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
});
