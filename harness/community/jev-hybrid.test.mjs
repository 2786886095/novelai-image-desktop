import {test} from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {normalizeCandidates,resolveDecisions,decidePrompt}=await import(process.env.JEV_MODULE?pathToFileURL(process.env.JEV_MODULE).href:new URL('../plugins/studio-library/jev.js',import.meta.url).href);
const fixture=()=>({format:'hybrid',mode:'text',description:'白发女孩站在街边撑红伞',plan:'保留原场景，伞面位于女孩头顶；采用侧面取景。',candidates:[
 {tag:'1girl',category:'count',explicit:true,evidence:'女孩'},
 {tag:'white_hair',category:'appearance',explicit:true,evidence:'白发'},
 {tag:'holding_umbrella',category:'action',explicit:true,evidence:'撑红伞'},
 {tag:'street',category:'scene',explicit:true,evidence:'街边'},
 {tag:'from_side',category:'camera',facet:'viewpoint',explicit:false,emphasis:'focal',reason:'侧面取景有助于展示持伞关系'}
],relations:[{text:'the canopy rests above her head',origin:'completion',evidence:'伞面位于女孩头顶',dependsOn:['t0','t2'],after:'t2',scope:'base'}]});
async function run(input,mutate=()=>{}){let request;const output=await decidePrompt(input,{config:{enabled:true,apiKey:'test-only'},lookup:async tag=>[{tag}],fetchImpl:async(_url,o)=>{request=JSON.parse(o.body);const answers=Object.fromEntries(Object.keys(request.questions).map(k=>[k,{type:'score',score:2}]));mutate(answers);return {ok:true,json:async()=>({answers})}}});return {output,request};}
test('mixed prompt embeds English relation directly after anchor with optional boost',async()=>{
 const {output,request}=await run(fixture());assert.match(output.positivePrompt,/holding umbrella, the canopy rests above her head/);
 assert.match(output.positivePrompt,/1\.1::from side::/);assert.equal(request.questions.n0.type,'score');assert.equal(output.format,'hybrid');
 assert.equal(output.styleChanged,false);assert.equal(output.negativeChanged,false);
});
test('mixed mode cannot silently fall back to tags only',async()=>{const x=fixture();x.relations=[];await assert.rejects(run(x));});
test('conflicting or incomplete relation decision fails instead of being appended',async()=>{
 await assert.rejects(run(fixture(),a=>{a.n0={type:'score',score:.1}}));await assert.rejects(run(fixture(),a=>{delete a.n0}));
});
test('removed tag dependencies remove dependent relation and report why',async()=>{
 const x=fixture();x.candidates[4].emphasis='normal';x.relations.push({text:'her shoulder faces the viewer',origin:'completion',evidence:'侧面取景',dependsOn:['t4'],after:'t4'});
 const {output}=await run(x,a=>{a.t4.score=.2});assert.equal(output.naturalLanguage.length,1);assert.equal(output.omittedRelations.length,1);
 assert.ok(!output.positivePrompt.includes('shoulder'));
});
test('reject unsupported origins, forged evidence, unsafe syntax and tag paraphrase duplicates',async()=>{
 for(const patch of [{origin:'anything'},{evidence:'不在描述中'},{text:'foo | bar'},{text:'Text: hello'},{text:'white hair'},{dependsOn:['t999']},{after:'t4'}]){
  const x=fixture();x.relations[0]={...x.relations[0],...patch};await assert.rejects(run(x));
 }
});
const imageFixture=()=>({format:'hybrid',mode:'image',description:'反推图中人物',imageAttachmentId:'existing-image-id',observations:'一个女孩，白发，右手握伞柄，红伞在头顶。',candidates:[
 {tag:'1girl',category:'count',explicit:false,observed:true,visualEvidence:'一个女孩'},
 {tag:'white_hair',category:'appearance',explicit:false,observed:true,visualEvidence:'白发'},
 {tag:'holding_umbrella',category:'action',explicit:false,observed:true,visualEvidence:'右手握伞柄'}
],relations:[{text:'her right hand grips the umbrella handle',origin:'observed',evidence:'右手握伞柄',dependsOn:['t0','t2'],after:'t2'}]});
test('image mode preserves observed identity and sends evidence instead of requesting invention',async()=>{
 const {output,request}=await run(imageFixture());assert.match(output.positivePrompt,/1girl/);assert.match(output.positivePrompt,/right hand grips/);
 assert.equal(output.completion,'evidence-only');assert.equal(request.state.mode,'image');assert.equal(request.state.observations,imageFixture().observations);
});
test('image mode rejects missing visual evidence and all completion phrases before network',async()=>{
 for(const mutate of [x=>{delete x.imageAttachmentId},x=>{delete x.observations},x=>{x.candidates[0].observed=false},x=>{x.candidates[0].visualEvidence='红色头发'},x=>{x.relations[0].origin='completion'}]){
  const x=imageFixture();mutate(x);await assert.rejects(run(x));
 }
});
test('text mode rejects fabricated observed provenance',async()=>{const x=fixture();x.relations[0].origin='observed';await assert.rejects(run(x));});
test('multi-character scoping allows same tags and same conflict groups in different characters',async()=>{
 const x={format:'hybrid',mode:'text',description:'两个白发女孩，一个站在左边，一个站在右边',characters:[{kind:'girl'},{kind:'girl'}],candidates:[
 {tag:'2girls',category:'count',explicit:true,evidence:'两个'},
 ...['c0','c1'].flatMap(scope=>[{tag:'white_hair',category:'appearance',explicit:true,evidence:'白发',scope,group:'hair'},{tag:'standing',category:'pose',explicit:true,evidence:'站在',scope}])
 ],relations:[{text:'on the left',origin:'explicit',evidence:'站在左边',scope:'c0',dependsOn:['t1']},{text:'on the right',origin:'explicit',evidence:'站在右边',scope:'c1',dependsOn:['t3']}]};
 const {output}=await run(x);assert.match(output.positivePrompt,/2girls \| girl, on the left, white hair, standing \| girl, on the right/);
 x.candidates[0].tag='3girls';await assert.rejects(run(x));
});
test('explicit details retain boost priority over optional ones under total budget',()=>{
 const x=fixture();x.candidates[1].emphasis='focal';x.candidates[1].reason='主要特征';const c=normalizeCandidates(x);
 const output=resolveDecisions(c,{answers:Object.fromEntries(c.map(t=>[t.id,{type:'score',score:2}]))});
 assert.equal(output.selected.find(t=>t.tag==='white hair').weight,1.15);assert.equal(output.selected.find(t=>t.tag==='from side').weight,1.1);
});
test('hybrid ratio is measured but not padded with invented phrases',async()=>{
 const x=fixture();x.candidates=x.candidates.slice(0,3);const {output}=await run(x);assert.equal(output.ratio.naturalLanguageUnits,1);assert.equal(output.ratio.tagUnits,3);
});
test('tool entry point enforces hybrid output and describes image evidence',async()=>{
 const fs=await import('node:fs/promises');const tools=await fs.readFile('harness/plugins/studio-tools/index.js','utf8');
 assert.match(tools,/format:'hybrid'/);assert.match(tools,/HYBRID_INSTRUCTIONS/);
});
test('rendered text stays last in base and retains original language',async()=>{
 const x=fixture();x.description+='，牌子写着你好';x.candidates.push({tag:'text',category:'scene',explicit:true,evidence:'写着'},{tag:'chinese_text',category:'scene',explicit:true,evidence:'你好'});
 x.renderedText={text:'你好',origin:'explicit',evidence:'牌子写着你好'};
 const {output}=await run(x);assert.ok(output.positivePrompt.endsWith('Text: 你好'));
 x.renderedText.text='你好 | girl';await assert.rejects(run(x));
});
test('paired mature actions serialize in separate characters and lone anchors fail',async()=>{
 const x={format:'hybrid',mode:'text',description:'两个女孩互相牵手，左边和右边',characters:[{kind:'girl'},{kind:'girl'}],candidates:[{tag:'2girls',category:'count',explicit:true,evidence:'两个女孩'},
 ...['c0','c1'].map(scope=>({tag:'holding_hands',category:'action',explicit:true,evidence:'牵手',scope,anchor:'mutual',interaction:'hands'}))],relations:[{text:'on the left',scope:'c0',origin:'explicit',evidence:'左边',dependsOn:['t1']},{text:'on the right',scope:'c1',origin:'explicit',evidence:'右边',dependsOn:['t2']}]};
 const {output}=await run(x);assert.equal(output.positivePrompt.split('mutual#holding hands').length,3);
 delete x.candidates[2].anchor;await assert.rejects(run(x));
});
test('images retain observed night rather than treating it as invented weather/time',async()=>{
 const x=imageFixture();x.observations+='可见夜空。';x.candidates.push({tag:'night',category:'scene',explicit:false,observed:true,visualEvidence:'可见夜空'});
 assert.ok((await run(x)).output.selected.some(c=>c.tag==='night'));
});
test('wrong mode, foreign scopes and invalid structure are rejected before fetch',async()=>{
 for(const mutate of [x=>{x.mode='anything'},x=>{x.characters=[{kind:'girl'}]},x=>{x.candidates[0].scope='c7'},x=>{x.relations[0].scope='c1'}]){
  const x=fixture();mutate(x);await assert.rejects(run(x));
 }
});
test('optional focal remains normal if fit is marginal but adequate for inclusion',async()=>{
 const {output}=await run(fixture(),a=>{a.t4.score=1.3});assert.equal(output.selected.find(c=>c.tag==='from side').weight,1);
});
test('preflight failure spends no request and does not perform tag lookup',async()=>{
 let calls=0;const x=fixture();x.relations=[];
 await assert.rejects(decidePrompt(x,{config:{enabled:true,apiKey:'test'},lookup:async()=>{calls++;return []},fetchImpl:async()=>{calls++}}));assert.equal(calls,0);
});
test('image evidence overrides an unsupported user-described attribute',async()=>{
 const x=imageFixture();x.description+='红发';x.candidates.push({tag:'red_hair',category:'appearance',explicit:true,evidence:'红发',observed:true,visualEvidence:'白发'});
 const {output}=await run(x,a=>{a.t3.score=.1});assert.ok(output.omitted.includes('red hair'));assert.ok(!output.positivePrompt.includes('red hair'));
});
