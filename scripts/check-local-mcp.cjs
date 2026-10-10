// Isolated acceptance fixture. Executes actual TypeScript MCP transport/attachment/lifecycle code.
// Account/provider/agent execution is stubbed: no real credentials or paid requests.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]),req=require('node:module').createRequire(path.join(root,'package.json')),ts=req('typescript'),crypto=require('node:crypto');
const output={fixture:'local loopback; fake account and executor; no paid API calls',mcpAvailable:fs.existsSync(path.join(root,'electron/ipc/mcp-server.ts')),pr64Available:fs.existsSync(path.join(root,'electron/ipc/openai-image-edit.ts')),checks:[]};
if(!output.mcpAvailable){console.log(JSON.stringify(output,null,2));process.exit(1);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'langbai-mcp-check-'));
let settings={mcpServerEnabled:false,mcpServerPort:39280,mcpServerToken:'',mcpMaxAnlasPerCall:0,imageProvider:'novelai',lastGenerationState:{params:{}}},quote={ok:true,amount:0,source:'fixture',balance:20,message:'fixture quote'},calls=0,active=0,maxActive=0,quoteHook=()=>{};
const mock={
 'electron':{app:{getPath:()=>tmp}},
 './store':{getSettings:()=>settings,getHistory:()=>[]},
 './nai':{quoteAnlasCost:async()=>{await quoteHook();return quote;},refreshStoredAccount:async()=>({tierName:'fixture',anlasBalance:20})},
 './agent-tools':{agentGenerationInput:(_r,args)=>({params:{model:'nai-diffusion-4-5-full',...args},extras:{}}),executeAgentTool:async(r)=>{if(r.tool==='langbai_generate_image'){calls++;active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,12));active--;}return{ok:true,title:'fixture executor',data:{items:[]},output:''};}}
};
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;
 const r=(id)=>{if(mock[id])return mock[id];if(id.startsWith('.')){let p=path.resolve(path.dirname(file),id.replace(/\.js$/,'.ts'));if(!path.extname(p))p+='.ts';return load(p);}return req(id);};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module:m,exports:m.exports,require:r,URL,Buffer,AbortController,setInterval,clearInterval,setTimeout,clearTimeout,console,process},{filename:file});return m.exports;}
const att=load(path.join(root,'electron/ipc/mcp-attachments.ts')),server=load(path.join(root,'electron/ipc/mcp-server.ts')),sharp=req('sharp');
sharp.cache(false); let pendingRequest; let h;const check=(s)=>output.checks.push(s);
async function send(message,headers={},method='POST',handle=h){const raw=typeof message==='string'?message:JSON.stringify(message);return new Promise((resolve,reject)=>{const q=http.request({hostname:'127.0.0.1',port:handle.port,path:'/mcp',method,agent:false,headers:{'Content-Type':'application/json','Authorization':'Bearer '+settings.mcpServerToken,...headers}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();let body;try{body=JSON.parse(text);}catch{}resolve({status:res.statusCode,text,body});});});pendingRequest=q;q.on('error',reject);q.end(raw);});}
const rpc=(method,params={})=>({jsonrpc:'2.0',id:1,method,params});
(async()=>{try{
 // Execute the actual main-process lifecycle, without loading Electron/user data.
 const source=ts.createSourceFile('main.ts',fs.readFileSync(path.join(root,'electron/main.ts'),'utf8'),ts.ScriptTarget.Latest,true);
 const code=source.statements.filter(n=>(ts.isFunctionDeclaration(n)&&n.name?.text==='syncMcpServer')||(ts.isVariableStatement(n)&&n.declarationList.declarations.some(x=>['mcpServer','mcpStatus','mcpChain'].includes(x.name.getText(source))))).map(n=>n.getText(source)).join('\n');
 assert(code.includes('syncMcpServer'));
 let starts=0;const lifecycle=vm.runInNewContext(ts.transpileModule(code+'\n({syncMcpServer,status:()=>mcpStatus,handle:()=>mcpServer});',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},crypto,console,getSettings:()=>settings,setSetting:(k,v)=>settings[k]=v,mainWindow:null,startMcpServer:async(o)=>{starts++;return server.startMcpServer({...o,port:0});}});
 await lifecycle.syncMcpServer();assert.equal(starts,0);assert.equal(lifecycle.status().running,false);check('default-disabled: no server created');
 const storeSource=ts.createSourceFile('store.ts',fs.readFileSync(path.join(root,'electron/ipc/store.ts'),'utf8'),ts.ScriptTarget.Latest,true);
 const def=storeSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='defaultSettings').getText(storeSource);
 assert(/mcpServerEnabled:\s*false/.test(def));assert(/mcpMaxAnlasPerCall:\s*0/.test(def));
 const set=storeSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='setSetting').getText(storeSource);
 const validate=vm.runInNewContext(ts.transpileModule(set+'\nsetSetting',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{}});
 for(const [k,v] of [['mcpServerEnabled','true'],['mcpServerPort',80],['mcpServerPort',65536],['mcpServerPort',NaN],['mcpMaxAnlasPerCall',-1],['mcpMaxAnlasPerCall',Infinity]])assert.throws(()=>validate(k,v),/Invalid MCP/);
 const vault=load(path.join(root,'electron/ipc/credential-vault.ts'));assert(vault.SENSITIVE_SETTING_KEYS.includes('mcpServerToken'));assert(vault.SENSITIVE_SETTING_KEYS.includes('openaiImageEditApiKey'));
 let available=true;const v=new vault.CredentialVault({isEncryptionAvailable:()=>available,encryptString:s=>Buffer.from('fixture:'+s),decryptString:b=>b.toString().slice(8)});
 const enc=v.encode('mcpServerToken','fake-token');available=false;assert.equal(v.decode('mcpServerToken',enc),'');assert.equal(v.encode('mcpServerToken',''),enc);check('MCP defaults/settings validation; MCP and OpenAI keys both encrypted; locked ciphertext preserved');
 settings.credentialIssues=['mcpServerToken'];settings.mcpServerEnabled=true;await lifecycle.syncMcpServer();assert.equal(starts,0);assert.equal(settings.mcpServerToken,'');assert(lifecycle.status().error.includes('locked'));settings.credentialIssues=[];check('locked token: startup refused without replacement');
 settings.mcpServerEnabled=true;await lifecycle.syncMcpServer();h=lifecycle.handle();assert(lifecycle.status().running);assert.equal(settings.mcpServerToken.length,48);check('enable: loopback listener and generated token');
 assert.equal((await send(rpc('ping'),{Authorization:'Bearer wrong'})).status,401);
 assert.equal((await send(rpc('ping'),{Origin:'https://untrusted.example'})).status,403);
 assert.equal((await send(rpc('ping'),{Host:'untrusted.example'})).status,403);
 assert.equal((await send(rpc('ping'),{},'GET')).status,405);check('wrong-token 401; foreign Origin/Host 403; GET 405');
 const init=await send(rpc('initialize',{protocolVersion:'2025-06-18'}));assert.equal(init.body.result.protocolVersion,'2025-06-18');
 const list=(await send(rpc('tools/list'))).body.result.tools;assert(list.some(x=>x.name==='generate_image'));assert(list.some(x=>x.name==='make_mask'));check('initialize and tools/list: available');
 for(const bad of ['{',[],{jsonrpc:'1.0',id:1,method:'ping'},{jsonrpc:'2.0',id:null,method:'ping'}])assert.equal((await send(bad)).status,400);
 assert.equal((await send('x'.repeat(4*1024*1024+1))).status,413);check('invalid JSON/RPC/batch 400; oversized body 413');
 const badArgs=await send(rpc('tools/call',{name:'generate_image',arguments:{count:1}}));assert.equal(badArgs.body.error.code,-32602);assert.equal(calls,0);check('invalid tool arguments rejected before executor');
 const gen=()=>rpc('tools/call',{name:'generate_image',arguments:{positivePrompt:'fixture',count:1}});
 for(const q of [{ok:false,message:'unavailable'},{ok:true,amount:5,balance:20,message:'over cap'},{ok:true,amount:30,balance:20,message:'over balance'},{ok:true,amount:NaN,message:'bad'},{ok:true,amount:-1,message:'bad'}]){quote=q;assert.equal((await send(gen())).body.result.isError,true);}assert.equal(calls,0);check('unavailable/over-limit/over-balance/NaN/negative quotes: no generation');
 quote={ok:true,amount:0,balance:20,message:'zero fixture quote'};settings.imageProvider='openai-images';assert.equal((await send(gen())).body.result.isError,true);assert.equal(calls,0);settings.imageProvider='novelai';check('OpenAI provider cannot bypass Anlas guard');
 quoteHook=()=>{settings.lastGenerationState={params:{changed:true}};};assert.equal((await send(gen())).body.result.isError,true);assert.equal(calls,0);quoteHook=()=>{};check('workbench changed during quote: no generation');
 const accounts=load(path.join(root,'electron/ipc/nai-accounts-runtime.ts'));
 quoteHook=async()=>{assert(accounts.naiAccountsBusy());assert.throws(()=>accounts.activateNaiAccount(undefined,()=>{}));pendingRequest.destroy();await new Promise(r=>setTimeout(r,30));};
 await assert.rejects(()=>send(gen()));await new Promise(r=>setTimeout(r,60));assert.equal(calls,0);quoteHook=()=>{};check('account switch blocked; disconnected client never executes after quote');
 const good=await send(gen());assert.equal(good.body.result.isError,undefined);assert.equal(calls,1);
 await Promise.all([send(gen()),send(gen())]);assert.equal(maxActive,1);check('zero-cost fixture executes once; paid queue serialized');
 const sse=await send(gen(),{Accept:'application/json, text/event-stream'});assert(sse.text.includes('event: message'));check('tool response supports SSE');
 const png=path.join(tmp,'source.png');await sharp({create:{width:32,height:24,channels:3,background:'#00ff00'}}).png().toFile(png);
 const imported=await att.importMcpImage(png);assert.equal(imported.width,32);assert.equal(att.mcpAttachment(imported.id).filePath,imported.filePath);assert.equal((await att.importMcpImage(png)).id,imported.id);
 await fs.promises.unlink(png);assert(fs.existsSync(imported.filePath));check('image import: validated immutable copy, content ID, lookup');
 const webp=path.join(tmp,'source.webp');await sharp({create:{width:32,height:24,channels:3,background:'#00ff00'}}).webp().toFile(webp);assert.equal((await att.importMcpImage(webp)).mime,'image/webp');
 const bad=path.join(tmp,'fake.png');fs.writeFileSync(bad,'not an image');await assert.rejects(()=>att.importMcpImage(bad));
 for(const p of ['relative.png','\\\\example.invalid\\image.png','file://example.invalid/image.png'])assert.throws(()=>att.normalizeLocalPath(p));
 const tooLarge=path.join(tmp,'too-large.png');await sharp({create:{width:4097,height:4097,channels:3,background:'#000'}}).png().toFile(tooLarge);await assert.rejects(()=>att.importMcpImage(tooLarge));check('WebP accepted; fake/remote/relative/oversized image rejected');
 const mask=(await send(rpc('tools/call',{name:'make_mask',arguments:{image:imported.id,shapes:[{shape:'rect',x:0,y:0,width:.5,height:1}]}}))).body.result;
 assert(!mask.isError);assert.equal(JSON.parse(mask.content[0].text).coverage,.5);check('make_mask: half-image coverage and preview created');
 await assert.rejects(()=>server.startMcpServer({port:h.port,token:'fixture',window:()=>null}));check('port collision: concrete startup failure');
 const old=settings.mcpServerToken;settings.mcpServerToken='rotated-fixture-token';await lifecycle.syncMcpServer();h=lifecycle.handle();assert.equal((await send(rpc('ping'),{Authorization:'Bearer '+old})).status,401);assert.equal((await send(rpc('ping'))).status,200);check('token rotation invalidates old token');
 settings.mcpServerEnabled=false;await lifecycle.syncMcpServer();assert.equal(lifecycle.status().running,false);await assert.rejects(()=>send(rpc('ping')));h=null;check('disable closes listener');
 await assert.rejects(()=>server.startMcpServer({port:0,token:'',window:()=>null}));check('empty token cannot start');
 console.log(JSON.stringify(output,null,2));
 }finally{if(h)await h.close();assert.equal(path.dirname(path.resolve(tmp)),path.resolve(os.tmpdir())); assert(path.basename(tmp).startsWith('langbai-mcp-check-')); fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:200});}})().catch(e=>{console.error(e.stack);console.log(JSON.stringify(output,null,2));process.exitCode=2;});
