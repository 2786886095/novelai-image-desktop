import {test} from 'node:test';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {normalizeCandidates,decisionRequest,resolveDecisions}=await import(process.env.JEV_MODULE?pathToFileURL(process.env.JEV_MODULE).href:new URL('../plugins/studio-library/jev.js',import.meta.url).href);
const input={description:'一个白发女孩撑着红伞，站在街边',plan:'主体和街边不变，搭配日常服装、平视中景及柔和光照。',candidates:[
 {tag:'1girl',category:'count',explicit:true,evidence:'一个'},
 {tag:'white_hair',category:'appearance',explicit:true,evidence:'白发',emphasis:'focal',reason:'用户指定的主体识别特征',group:'hair-color'},
 {tag:'red_umbrella',category:'clothing',explicit:true,evidence:'红伞',emphasis:'focal',reason:'用户指定的主要道具颜色'},
 {tag:'standing',category:'pose',explicit:true,evidence:'站在'},
 {tag:'shirt',category:'clothing',explicit:false},
 {tag:'cowboy_shot',category:'camera',facet:'framing',explicit:false,group:'framing'},
 {tag:'eye-level',category:'camera',facet:'viewpoint',explicit:false,group:'viewpoint'},
 {tag:'sunlight',category:'lighting',explicit:false},
 {tag:'smile',category:'expression',explicit:false},
 {tag:'looking_at_viewer',category:'action',explicit:false}
]};
const response=c=>({answers:Object.fromEntries(c.map(x=>[x.id,{type:'score',score:x.explicit?1.99:1.35}]))});
test('moderate expansion keeps coherent outfit/viewpoint/framing/light/expression/action candidates',()=>{
 const c=normalizeCandidates(input),out=resolveDecisions(c,response(c));
 assert.equal(out.selected.filter(x=>!x.explicit).length,6);
});
test('confidence does not uniformly amplify all explicit words',()=>{
 const c=normalizeCandidates(input),out=resolveDecisions(c,response(c));
 assert.equal(out.selected.find(x=>x.tag==='standing').weight,1);
 assert.equal(out.selected.find(x=>x.tag==='white hair').weight,1.15);
 assert.equal(out.selected.find(x=>!x.explicit).weight,1);
});
test('Jev evaluates missing details as authorized completion instead of speculation',()=>{
 const c=normalizeCandidates(input),r=decisionRequest(input.description,c,input.plan);
 assert.equal(r.state.plan,input.plan);assert.match(r.questions.t4.criteria[2],/coherent completion/i);
});
test('all rejected low-score words are reported',()=>{
 const c=normalizeCandidates(input),r=response(c);r.answers.t8.score=0.1;
 assert.ok(resolveDecisions(c,r).omitted.includes('smile'));
});
test('optional matching conflict cannot replace explicit identity',()=>{
 const c=normalizeCandidates({...input,candidates:[...input.candidates,{tag:'black_hair',category:'appearance',explicit:false,group:'hair-color'}]});
 const r=response(c);r.answers[c.at(-1).id].score=2;
 assert.ok(!resolveDecisions(c,r).selected.some(x=>x.tag==='black hair'));
});
test('missing dimensions are reported rather than quietly claiming full coverage',()=>{
 const c=normalizeCandidates({...input,candidates:input.candidates.slice(0,4)}),out=resolveDecisions(c,response(c));
 assert.ok(out.coverage?.missing.includes('lighting'));
});
test('malformed tag values and unsupported emphasis are rejected',()=>{
 assert.throws(()=>normalizeCandidates({...input,candidates:[{category:'scene',explicit:false}]}));
 assert.throws(()=>normalizeCandidates({...input,candidates:[{...input.candidates[1],emphasis:'maximum'}]}));
});
test('completion never adds extra identities, weather or time even with high scores',()=>{
 const c=normalizeCandidates({...input,candidates:[...input.candidates,{tag:'rain',category:'scene',explicit:false},{tag:'night',category:'scene',explicit:false},{tag:'1boy',category:'count',explicit:false}]});
 const r=response(c);for(const x of c)r.answers[x.id].score=2;
 const out=resolveDecisions(c,r);for(const tag of ['rain','night','1boy'])assert.ok(out.omitted.includes(tag));
});
test('boost budget and optional budget stay bounded despite high scores',()=>{
 const candidates=Array.from({length:6},(_,i)=>({tag:'explicit'+i,category:'appearance',explicit:true,evidence:'白发',emphasis:'focal',reason:'主体特征'}));
 candidates.push(...Array.from({length:14},(_,i)=>({tag:'optional'+i,category:['clothing','pose','expression','lighting','action','scene','appearance'][i%7],explicit:false})));
 const c=normalizeCandidates({...input,candidates}),r=response(c);for(const x of c)r.answers[x.id].score=2;
 const out=resolveDecisions(c,r);assert.equal(out.selected.filter(x=>x.weight>1).length,2);assert.equal(out.selected.filter(x=>!x.explicit).length,8);
 assert.equal(out.selected.length+out.omitted.length,c.length);
});
