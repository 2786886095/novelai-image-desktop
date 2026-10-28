// Desired-correct regression: actual production TypeScript modules; all account/backend/attachment authority is fixture-only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=path.resolve(process.argv[2]||process.cwd()),out=path.resolve(process.argv[3]||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'langbai-agent-inpaint-'))),req=require('node:module').createRequire(path.join(source,'package.json')),ts=req('typescript');
fs.mkdirSync(out,{recursive:true});const fixture=path.join(out,'fixture.png');
const {PNG:FixturePNG}=req('pngjs'),fixturePng=new FixturePNG({width:512,height:512});fixturePng.data.fill(255);fs.writeFileSync(fixture,FixturePNG.sync.write(fixturePng));
const resolve=(f)=>path.resolve(source,f),cache=new Map(),readFiles=new Map(),calls=[],quotes=[],checks=[];
let settings;
const clean=(x)=>JSON.parse(JSON.stringify(x));
const withinFixture=(p)=>{if(path.resolve(p)!==fixture)throw Error('Audit denied non-fixture filesystem access: '+p);return p;};
const fixtureFs={statSync:p=>fs.statSync(withinFixture(p)),existsSync:p=>fs.existsSync(withinFixture(p)),readFileSync:(p,...a)=>fs.readFileSync(withinFixture(p),...a)};
const attachment=(id)=>String(id).startsWith('mcp-fixture:')?{id,filePath:fixture,width:512,height:512,kind:'image',mime:'image/png',size:fs.statSync(fixture).size}:undefined;
const store={getSettings:()=>settings,getHistory:()=>[],getHistoryGroups:()=>[]};
const provider={PAID_IMAGE_TOOLS:new Set(['langbai_generate_image','langbai_redraw_image','langbai_inpaint_image']),bindAgentImageProvider:()=>({provider:'novelai',revision:'fixture-binding'}),assertAgentImageProvider:()=>{},assertAgentImageTool:()=>{},agentImageProviderState:()=>({imageProvider:'novelai'})};
const attachments={MCP_ATTACHMENT_PREFIX:'mcp-fixture:',mcpAttachment:attachment,looksLikeLocalPath:()=>false,MAX_MCP_IMAGE_PIXELS:16e6};
const nai={
 loadImageFromPath:async p=>{withinFixture(p);return {ok:true};},
 inpaintImage:async(...args)=>{calls.push({tool:'inpaint',args:clean(args)});return {ok:true,message:'fixture backend only',items:[{id:'mcp-fixture:result',filePath:fixture,width:512,height:512,createdAt:'2026-10-15T00:00:00.000Z'}]};},
 generateImage:async(...args)=>{calls.push({tool:'generate',args:clean(args)});return {ok:true,message:'fixture backend only',items:[{id:'mcp-fixture:result',filePath:fixture,width:512,height:512,createdAt:'2026-10-15T00:00:00.000Z'}]};},
 redrawImage:async(...args)=>{calls.push({tool:'redraw',args:clean(args)});return {ok:true,message:'fixture backend only',items:[{id:'mcp-fixture:result',filePath:fixture,width:512,height:512,createdAt:'2026-10-15T00:00:00.000Z'}]};},
 quoteAnlasCost:async input=>{quotes.push(clean(input));return load(resolve('src/anlas.ts')).calculateFeatureAnlasQuote({...input,account:{hasToken:true,hasActiveSubscription:true,tierLevel:3,anlasBalance:100}});},
 refreshStoredAccount:async()=>({hasToken:true,hasActiveSubscription:true,tierLevel:3,anlasBalance:100}),
};
const mocks=new Map([
 ['electron/ipc/store.ts',store],['electron/ipc/nai.ts',nai],['electron/ipc/agent-image-provider.ts',provider],['electron/ipc/mcp-attachments.ts',attachments],
 ['electron/ipc/nai-accounts-runtime.ts',{withNaiAccountOperation:async fn=>fn()}],
 ...['electron/ipc/danbooru-tags.ts','electron/image-metadata.ts','src/png-meta.ts'].map(f=>[f,{}]),
].map(([f,v])=>[resolve(f),v]));
const allowed=new Set(['src/types.ts','src/metadata-replay.ts','src/nai-dimensions.ts','src/upscale-plan.ts','src/anlas.ts','src/retained-prompts.ts','src/agent/generation-input.ts','electron/ipc/agent-tools.ts','electron/ipc/mcp-server.ts'].map(resolve));
function load(file){
 file=path.resolve(file);if(mocks.has(file))return mocks.get(file);if(cache.has(file))return cache.get(file).exports;
 if(file.endsWith('package.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
 if(!allowed.has(file))throw Error('Audit denied unlisted module: '+file);
 const bytes=fs.readFileSync(file),original=bytes.toString('utf8');readFiles.set(file,{bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 const m={exports:{}};cache.set(file,m);
 // Test-only visibility for a private factory, appended in-memory; frozen source is unchanged.
 const body=original+(file.endsWith('mcp-server.ts')?'\nexport const __auditCreateTools=createTools;\n':'');
 const js=ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const r=id=>{
  if(id==='node:fs')return fixtureFs;
  if(id==='sharp')return Object.assign(()=>{throw Error('unexpected sharp access');},{default:()=>{throw Error('unexpected sharp access');}});
  if(id==='pngjs')return {PNG:class{}};
  if(['node:path','node:crypto'].includes(id))return require(id);
  if(id==='node:http')return {createServer:()=>{throw Error('Audit forbids network listener');}};
  if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id.replace(/\.js$/,'.ts'));if(!path.extname(p))p+='.ts';return load(p);}
  throw Error('Audit denied external dependency: '+id);
 };
 vm.runInNewContext(js,{module:m,exports:m.exports,require:r,URL,Buffer,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,console,process:{env:{}}},{filename:file});return m.exports;
}
const types=load(resolve('src/types.ts')),agent=load(resolve('electron/ipc/agent-tools.ts')),mcp=load(resolve('electron/ipc/mcp-server.ts')),anlas=load(resolve('src/anlas.ts'));
function reset(model='nai-diffusion-4-5-full'){
 settings={imageProvider:'novelai',lastGenerationState:{params:{...types.DEFAULT_PARAMS,model,width:512,height:512,steps:28,positivePrompt:'fixture two people',stylePrompt:'',negativePrompt:''}},generationGroupId:'fixture-group',modelMode:'anime',mcpMaxAnlasPerCall:0};calls.length=0;quotes.length=0;
}
const chars=n=>Array.from({length:n},(_,i)=>({prompt:'character '+(i+1),negativePrompt:'bad face '+(i+1),useCoords:false,x:.5,y:.5}));
const precise=[{attachmentId:'mcp-fixture:ref',type:'character',strength:1,fidelity:1}];
const request=(tool,args)=>({tool,args,sessionId:'',callId:'audit-only',promptLocks:{}});
const runAgent=(args)=>agent.executeAgentTool(request('langbai_inpaint_image',{attachmentId:'mcp-fixture:image',maskAttachmentId:'mcp-fixture:mask',...args}));
const tools=mcp.__auditCreateTools({window:()=>null});
const runMcp=(name,args)=>tools.find(x=>x.name===name).run(args,{signal:new AbortController().signal,progress:()=>{}});
const resultText=r=>r?.content?.[0]?.text;
async function check(name,fn){try{const evidence=await fn();checks.push({name,pass:true,evidence});console.log('PASS '+name+' '+JSON.stringify(evidence));}catch(e){checks.push({name,pass:false,error:e.stack});console.error('FAIL '+name+' '+e.stack);}}
(async()=>{
 await check('mcp-estimate-schema-advertises-explicit-inpaint-model-enum',async()=>{
  const schema=tools.find(x=>x.name==='estimate_cost').inputSchema;assert.deepEqual(clean(schema.properties.inpaintModel?.enum),clean(types.NAI_INPAINT_MODELS.map(x=>x.value)));return {models:clean(schema.properties.inpaintModel.enum)};
 });
 await check('agent-mainV5-targetV45-precise-uses-actual-model-before-validation',async()=>{
  reset('nai-diffusion-5-full');const result=await runAgent({inpaintModel:'nai-diffusion-4-5-full-inpainting',characterPrompts:chars(2),preciseReferences:precise});
  assert.equal(result.ok,true,result.output);assert.equal(calls.length,1);assert.equal(calls[0].args[0].model,'nai-diffusion-4-5-full');assert.equal(calls[0].args[6].preciseReferences.length,1);return {targetModel:calls[0].args[1],paramsModel:calls[0].args[0].model,characters:2,precise:1};
 });
 await check('agent-controlV45-preserves-two-characters-one-reference',async()=>{
  reset();const result=await runAgent({inpaintModel:'nai-diffusion-4-5-full-inpainting',characterPrompts:chars(2),preciseReferences:precise});
  assert.equal(result.ok,true);assert.equal(calls[0].args[6].charCaptions.length,2);assert.equal(calls[0].args[6].preciseReferences.length,1);return {characters:2,precise:1};
 });
 await check('agent-mainV3-targetV45-characters-not-misrejected',async()=>{
  reset('nai-diffusion-3');const result=await runAgent({inpaintModel:'nai-diffusion-4-5-full-inpainting',characterPrompts:chars(2)});
  assert.equal(result.ok,true,result.output);assert.equal(calls[0].args[0].model,'nai-diffusion-4-5-full');assert.equal(calls[0].args[6].charCaptions.length,2);return {paramsModel:calls[0].args[0].model,characters:2};
 });
 await check('agent-mainV45-targetV5-ten-characters-are-preserved',async()=>{
  reset();const result=await runAgent({inpaintModel:'nai-diffusion-5-full-inpainting',characterPrompts:chars(10)});
  assert.equal(result.ok,true);assert.equal(calls[0].args[1],'nai-diffusion-5-full-inpainting');assert.equal(calls[0].args[0].model,'nai-diffusion-5-full');assert.equal(calls[0].args[6].charCaptions.length,10);return {requested:10,forwarded:10,targetCapacity:types.maxNAICharacterPrompts(calls[0].args[1])};
 });
 await check('mcp-precise-budget-cap-blocks-reference-inclusive-cost',async()=>{
  reset();settings.mcpMaxAnlasPerCall=5;let error;try{await runMcp('inpaint',{image:'mcp-fixture:image',mask:'mcp-fixture:mask',positivePrompt:'fixture',inpaintModel:'nai-diffusion-4-5-full-inpainting',preciseReferences:[{image:'mcp-fixture:ref'}]});}catch(e){error=e.message;}
  assert.match(error||'',/10 Anlas/);assert.equal(quotes[0].extras.preciseReferences.length,1);assert.equal(calls.length,0);return {quoteAmount:10,cap:5,backendCalls:0,error};
 });
 await check('mcp-vibe-budget-cap-blocks-reference-inclusive-cost',async()=>{
  reset();settings.mcpMaxAnlasPerCall=5;let error;try{await runMcp('inpaint',{image:'mcp-fixture:image',mask:'mcp-fixture:mask',positivePrompt:'fixture',vibeReferences:[{image:'mcp-fixture:ref'}]});}catch(e){error=e.message;}
  assert.match(error||'',/7 Anlas/);assert.equal(quotes[0].extras.vibeImages.length,1);assert.equal(calls.length,0);return {quoteAmount:7,cap:5,backendCalls:0,error};
 });
 await check('mcp-allowed-inpaint-quote-execution-use-identical-model-params-extras',async()=>{
  reset('nai-diffusion-5-full');settings.mcpMaxAnlasPerCall=10;const result=await runMcp('inpaint',{image:'mcp-fixture:image',mask:'mcp-fixture:mask',positivePrompt:'fixture',inpaintModel:'nai-diffusion-4-5-full-inpainting',characterPrompts:chars(2),preciseReferences:[{image:'mcp-fixture:ref'}]});
  assert.equal(result.isError,undefined);assert.equal(calls.length,1);assert.deepEqual(quotes[0].params,calls[0].args[0]);assert.deepEqual(quotes[0].extras,calls[0].args[6]);assert.equal(quotes[0].inpaintModel,calls[0].args[1]);return {targetModel:calls[0].args[1],paramsModel:calls[0].args[0].model,characters:2,precise:1,quote:JSON.parse(resultText(result)).anlas.amount};
 });
 await check('mcp-estimate-inpaint-honors-explicit-target-model',async()=>{
  reset();const result=await runMcp('estimate_cost',{operation:'inpaint',image:'mcp-fixture:image',positivePrompt:'fixture',inpaintModel:'nai-diffusion-5-full-inpainting'});
  assert.equal(quotes[0].inpaintModel,'nai-diffusion-5-full-inpainting');assert.equal(quotes[0].params.model,'nai-diffusion-5-full');return {quoteModel:quotes[0].inpaintModel,paramsModel:quotes[0].params.model,result:JSON.parse(resultText(result))};
 });
 await check('mcp-estimate-V45-reference-from-mainV5-includes-extras',async()=>{
  reset('nai-diffusion-5-full');const result=await runMcp('estimate_cost',{operation:'inpaint',image:'mcp-fixture:image',positivePrompt:'fixture',inpaintModel:'nai-diffusion-4-5-full-inpainting',preciseReferences:[{image:'mcp-fixture:ref'}]});
  assert.equal(quotes[0].inpaintModel,'nai-diffusion-4-5-full-inpainting');assert.equal(quotes[0].extras.preciseReferences.length,1);assert.equal(JSON.parse(resultText(result)).amount,10);return {quoteModel:quotes[0].inpaintModel,precise:1,quoteAmount:10};
 });
 await check('mcp-normal-generate-keeps-quote-execution-model-and-extras',async()=>{
  reset();settings.mcpMaxAnlasPerCall=100;const result=await runMcp('generate_image',{positivePrompt:'fixture',characterPrompts:chars(2),preciseReferences:[{image:'mcp-fixture:ref'}]});
  assert.equal(result.isError,undefined);assert.equal(calls[0].tool,'generate');assert.deepEqual(quotes[0].params,calls[0].args[0]);assert.deepEqual(quotes[0].extras,calls[0].args[1]);assert.equal(calls[0].args[1].charCaptions.length,2);assert.equal(calls[0].args[1].preciseReferences.length,1);return {characters:2,precise:1};
 });
 await check('mcp-img2img-keeps-quote-execution-model-and-extras',async()=>{
  reset();settings.mcpMaxAnlasPerCall=100;const result=await runMcp('img2img',{image:'mcp-fixture:image',positivePrompt:'fixture',characterPrompts:chars(2),preciseReferences:[{image:'mcp-fixture:ref'}]});
  assert.equal(result.isError,undefined);assert.deepEqual(quotes[0].params,calls[0].args[0].params);assert.deepEqual(quotes[0].extras,calls[0].args[0].extras);return {characters:calls[0].args[0].extras.charCaptions.length,precise:calls[0].args[0].extras.preciseReferences.length};
 });
 await check('empty-precise-and-vibe-arrays-clear-without-model-rejection',async()=>{
  reset('nai-diffusion-5-full');const input=agent.agentGenerationInput(request('langbai_generate_image',{}),{preciseReferences:[],vibeReferences:[]});assert.equal(input.extras.preciseReferences.length,0);assert.equal(input.extras.vibeImages.length,0);return {precise:0,vibes:0};
 });
 await check('nonempty-reference-unsupported-by-actual-target-remains-rejected',async()=>{
  reset();const result=await runAgent({inpaintModel:'nai-diffusion-5-full-inpainting',preciseReferences:precise});assert.equal(result.ok,false);assert.match(result.output,/nai-diffusion-5-full 不支持精准参考图/);assert.equal(calls.length,0);return {backendCalls:0,error:result.output};
 });
 await check('invalid-explicit-inpaint-model-is-rejected-before-backend',async()=>{
  reset();const result=await runAgent({inpaintModel:'fixture-not-a-model'});assert.equal(result.ok,false);assert.equal(calls.length,0);return {backendCalls:0,error:result.output};
 });
 const identities=[...readFiles].map(([file,before])=>{const bytes=fs.readFileSync(file),after={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};assert.deepEqual(after,before);return {file,before,after,unchanged:true};});
 const report={scope:'host-only desired-correct actual production TypeScript parameter/control-flow regression; fixture backend, account and attachment authority; no network or paid API calls',source,sourceModulesUnchanged:true,checks,identities,allPass:checks.every(x=>x.pass)};
 fs.writeFileSync(path.join(out,'RESULTS.json'),JSON.stringify(report,null,2)+'\n');
 console.log('SUMMARY '+checks.filter(x=>x.pass).length+'/'+checks.length+' audit assertions; source modules unchanged='+identities.length);if(!report.allPass)process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=2;});
