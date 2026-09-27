import {test} from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {normalizeCandidates,resolveDecisions,decisionRequest,decidePrompt}=await import(process.env.JEV_MODULE?pathToFileURL(process.env.JEV_MODULE).href:new URL('../plugins/studio-library/jev.js',import.meta.url).href);
const input={description:'白发女孩站在街边',candidates:[
 {tag:'1girl',category:'count',explicit:true,evidence:'女孩'},
 {tag:'white_hair',category:'appearance',explicit:true,evidence:'白发',emphasis:'focal',reason:'明确主体特征'},
 {tag:'street',category:'scene',explicit:true,evidence:'街边'},
 {tag:'coat',category:'clothing',explicit:false,emphasis:'subtle',reason:'补充的服装不应抢过主体的白发'},
 {tag:'backlighting',category:'lighting',explicit:false,emphasis:'subtle',reason:'辅助轮廓光不应压过人物细节'},
 {tag:'smile',category:'expression',explicit:false}
]};
const answer=(c,score=2)=>({answers:Object.fromEntries(c.map(x=>[x.id,{type:'score',score}]))});
test('high-fit secondary details are retained at 0.9, independently from fit score',()=>{
 const c=normalizeCandidates(input),out=resolveDecisions(c,answer(c));
 assert.equal(out.selected.find(x=>x.tag==='coat').weight,.9);
 assert.match(out.positivePrompt,/0\.9::coat::/);assert.match(out.weightPolicy,/semantic-emphasis-v4/);
 assert.equal(out.selected.find(x=>x.tag==='white hair').weight,1.15);
 assert.equal(out.selected.find(x=>x.tag==='smile').weight,1);
 assert.equal(out.styleChanged,false);assert.equal(out.negativeChanged,false);
});
test('weak fit is omitted rather than retained at reduced weight',()=>{
 const c=normalizeCandidates(input),r=answer(c);r.answers.t3.score=.5;
 const out=resolveDecisions(c,r);assert.ok(out.omitted.includes('coat'));assert.ok(!out.selected.some(x=>x.tag==='coat'));
});
test('reason is required for attenuation; explicit details cannot be silently attenuated',()=>{
 assert.doesNotThrow(()=>normalizeCandidates(input));
 for(const patch of [{reason:''},{reason:'x'.repeat(301)},{explicit:true,evidence:'白发'},{category:'identity'},{category:'count'}]){
  assert.throws(()=>normalizeCandidates({...input,candidates:[{...input.candidates[3],...patch}]}));
 }
});
test('default and legacy candidates are not forced to have lower weights',()=>{
 const c=normalizeCandidates({...input,candidates:input.candidates.map(x=>({...x,emphasis:x.emphasis==='subtle'?'normal':x.emphasis}))});
 assert.ok(resolveDecisions(c,answer(c)).selected.every(x=>x.weight>=1));
});
test('attenuation budget is three; overflow remains normal with explanation',()=>{
 const c=normalizeCandidates({...input,candidates:[input.candidates[0],...['clothing','lighting','pose','expression','action'].map((category,i)=>({tag:'detail'+i,category,explicit:false,emphasis:'subtle',reason:'辅助细节不要抢主体'}))]});
 const out=resolveDecisions(c,answer(c));assert.equal(out.selected.filter(x=>x.weight<1).length,3);
 assert.equal(out.selected.filter(x=>!x.explicit&&x.weight===1).length,2);
 assert.ok(out.selected.every(x=>typeof x.weightReason==='string'&&x.weightReason.length));
});
test('conflicting secondary detail is dropped, not softened',()=>{
 const c=normalizeCandidates({...input,candidates:[{...input.candidates[1],group:'hair-color'},{tag:'black_hair',category:'appearance',explicit:false,emphasis:'subtle',reason:'辅助细节',group:'hair-color'}]});
 assert.deepEqual(resolveDecisions(c,answer(c)).omitted,['black hair']);
});
test('Jev request separates relevance from composition emphasis',()=>{
 const c=normalizeCandidates(input),r=decisionRequest(input.description,c,'服装与背光保持次要');
 assert.match(r.state.contract,/subtle/i);assert.equal(r.state.candidates[3].reason,input.candidates[3].reason);
});
test('full module path serializes attenuation without modifying configuration',async()=>{
 const config={enabled:true,apiKey:'test-only'},before=JSON.stringify(config);let calls=0;
 const out=await decidePrompt(input,{config,lookup:async tag=>[{tag}],fetchImpl:async(_url,options)=>{
  calls++;const r=JSON.parse(options.body);assert.equal(r.state.candidates[3].emphasis,'subtle');
  return {ok:true,json:async()=>answer(r.state.candidates)};
 }});
 assert.equal(calls,1);assert.match(out.positivePrompt,/0\.9::backlighting::/);assert.equal(JSON.stringify(config),before);
});
