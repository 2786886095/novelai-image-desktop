const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(process.argv[2]);const load=createRequire(path.join(root,'package.json'));
(async()=>{
 const metadata=load('./package.json');if(metadata.version!=='2.5.1')throw Error('Wrong packaged version');
 for(const name of ['agent-runtime.js','pi-agent-core.js','pi-studio-tools.js','nai-accounts-vault.js','nai-accounts-login.js','nai-accounts-runtime.js','nai-accounts.js']){
  const rel=path.join('dist-electron','electron','ipc',name);
  const packed=fs.readFileSync(path.join(root,rel));
  // Intel CI verifies the immutable universal artifact without a second source build.
  if(fs.existsSync(path.resolve(rel))&&!packed.equals(fs.readFileSync(path.resolve(rel))))throw Error('Stale packaged module '+name);
 }
 const {pathToFileURL}=require('node:url');
 const piMeta=load('@earendil-works/pi-agent-core/package.json');
 const pi=await import(pathToFileURL(path.join(root,'node_modules/@earendil-works/pi-agent-core',piMeta.main)).href);
 if(typeof pi.Agent!=='function')throw Error('Pi Agent dependency missing');
 const aiMeta=JSON.parse(fs.readFileSync(path.join(root,'node_modules/@earendil-works/pi-ai/package.json'),'utf8'));
 const ai=await import(pathToFileURL(path.join(root,'node_modules/@earendil-works/pi-ai',aiMeta.main)).href);
 const model={id:'fixture',name:'Synthetic fixture',provider:'fixture',api:'openai-completions',baseUrl:'https://example.invalid',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:4096,maxTokens:1024};
 const reply=(content,stopReason)=>({role:'assistant',content,stopReason,api:model.api,provider:model.provider,model:model.id,timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}});
 const turns=[reply([{type:'toolCall',id:'fixture-read',name:'langbai_get_generation_state',arguments:{args:{}}}],'toolUse'),reply([{type:'text',text:'SYNTHETIC_SETTINGS_READ'}],'stop')];
 let readCount=0;
 const result=await load('./dist-electron/electron/ipc/pi-agent-core.js').runStudioPiAgent({model,history:[],systemPrompt:'Synthetic offline packaged tool check.',text:'Read synthetic settings',tools:[{name:'langbai_get_generation_state',description:'Synthetic fixture only',readonly:true,parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{readCount++;return{ok:true,output:'synthetic settings'};}}],authorize:async()=>false,streamFn:()=>{const stream=ai.createAssistantMessageEventStream();const message=turns.shift();if(!message)throw Error('Unexpected additional model turn');queueMicrotask(()=>{stream.push({type:'start',partial:message});stream.push({type:'done',reason:message.stopReason,message});});return stream;}});
 if(readCount!==1||result.text!=='SYNTHETIC_SETTINGS_READ')throw Error('Packaged Pi read tool loop failed');
 const wasm=load('hash-wasm');const salt=new Uint8Array(16).fill(7);
 const output=await wasm.argon2id({password:'synthetic-package-fixture',salt,iterations:2,parallelism:1,memorySize:1953,hashLength:64,outputType:'binary'});
 if(output.byteLength!==64)throw Error('Packaged login WASM failed');output.fill(0);
 const vault=load('./dist-electron/electron/ipc/nai-accounts-vault.js');if(typeof vault.accountCipherAvailable!=='function')throw Error('Final vault guard missing');
 if(vault.accountCipherAvailable({isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>'basic_text'}))throw Error('Weak storage allowed');
 console.log(JSON.stringify({version:metadata.version,packagedModulesMatchBuild:true,piAgentLoaded:true,packagedPiReadToolLoop:true,modelResponses:'synthetic offline fixture',argon2idWasmExecuted:true,weakStorageRejected:true,asarSha256:crypto.createHash('sha256').update(require('original-fs').readFileSync(root)).digest('hex')}));
})().catch(error=>{console.error(error.stack??String(error));process.exitCode=1;});
