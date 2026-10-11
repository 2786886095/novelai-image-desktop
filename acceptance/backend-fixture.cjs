const fs=require('fs'),path=require('path'),http=require('http'),{app}=require('electron');
const S=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
app.setPath('userData',fs.mkdtempSync(path.join(path.dirname(out),'backend-profile-')));
const evidence={source:S,paidCalls:0,fixture:'loopback HTTP proxy; neutral prompts; no upstream model',cases:[],requests:[],resolverTargets:[],pass:false};
const pause=ms=>new Promise(r=>setTimeout(r,ms));let server;
app.whenReady().then(async()=>{try{
 const req=require('module').createRequire(path.join(S,'package.json'));
 const store=req('./dist-electron/electron/ipc/store.js'),proxy=req('./dist-electron/electron/ipc/proxy.js'),nai=req('./dist-electron/electron/ipc/nai.js');
 server=http.createServer((request,response)=>{let text='';request.on('data',b=>text+=b);request.on('end',()=>{
  const proxied=/^http:\/\//.test(request.url),target=new URL(request.url,'http://127.0.0.1');
  evidence.requests.push({path:target.pathname,proxied});
  response.setHeader('Content-Type','application/json');
  if(target.pathname==='/generate-check'){
   const body=JSON.parse(text);response.statusCode=Object.hasOwn(body.parameters,'controlnet_strength')?422:200;
   response.end(JSON.stringify({message:response.statusCode===422?'Unsupported ControlNet parameter':'Accepted neutral generation payload'}));return;
  }
  if(target.pathname.includes('/auth/')){response.statusCode=401;response.end(JSON.stringify({error:{message:'Fixture unauthorized'}}));return;}
  if(!proxied&&!target.pathname.includes('/direct/')){response.statusCode=503;response.end(JSON.stringify({error:{message:'Fixture first request bypassed required proxy'}}));return;}
  const body=JSON.parse(text);if(body.model!=='fixture-model')throw Error('Changed model');
  response.end(JSON.stringify({choices:[{message:{content:'A woman wearing a blue coat stands by a tree.'},finish_reason:'stop'}]}));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port,base='http://127.0.0.1:'+port;
 const settings={convertApiUrl:base+'/convert',visionApiUrl:base+'/vision',convertApiKey:'fixture',visionApiKey:'fixture',convertApiModel:'fixture-model',visionApiModel:'fixture-model',convertPromptTemplates:{tags:'',natural:'Neutral natural-language caption',mixed:''},reversePromptTemplates:{tags:'',natural:'Neutral natural-language caption',mixed:''},reverseConvertDshEnabled:false,proxyMode:'auto',proxyForAi:true};
 for(const [k,v] of Object.entries(settings))store.setSetting(k,v);
 const both=async(kind)=>kind==='convert'?nai.convertPromptText('A woman in a blue coat by a tree.','natural',false,'v5'):nai.reversePromptImage(Buffer.from('neutral image fixture').toString('base64'),'natural','full','blue coat',false,'v5');
 const resolver=async url=>{evidence.resolverTargets.push(url);await pause(25);return 'PROXY 127.0.0.1:'+port;};
 for(const kind of ['convert','reverse']){
  proxy.configureSystemProxyResolver(resolver,async()=>true);nai.clearAiCallLog();const result=await both(kind);
  evidence.cases.push({name:kind+' cold auto proxy',expected:true,actual:result.ok,message:result.message,log:nai.getAiCallLog().map(e=>({api:e.api,ok:e.ok,response:e.response}))});
 }
 proxy.configureSystemProxyResolver(async url=>{evidence.resolverTargets.push(url);return url.includes('/convert')?'PROXY 127.0.0.1:'+port:'DIRECT';},async()=>true);
 await proxy.refreshSystemProxy();let result=await both('convert');
 evidence.cases.push({name:'conversion uses its own PAC URL, not vision cached DIRECT',expected:true,actual:result.ok,message:result.message});
 store.setSetting('proxyMode','manual');store.setSetting('proxyUrl',base);result=await both('convert');
 evidence.cases.push({name:'manual proxy unchanged',expected:true,actual:result.ok,message:result.message});
 const old={HTTP_PROXY:process.env.HTTP_PROXY,HTTPS_PROXY:process.env.HTTPS_PROXY,ALL_PROXY:process.env.ALL_PROXY,NO_PROXY:process.env.NO_PROXY};
 process.env.HTTP_PROXY='http://127.0.0.1:1';process.env.HTTPS_PROXY='http://127.0.0.1:1';process.env.ALL_PROXY='http://127.0.0.1:1';process.env.NO_PROXY='';
 store.setSetting('convertApiUrl',base+'/direct');store.setSetting('proxyMode','direct');result=await both('convert');
 evidence.cases.push({name:'explicit direct ignores environment proxy',expected:true,actual:result.ok,message:result.message});
 store.setSetting('proxyMode','auto');store.setSetting('proxyForAi',false);result=await both('convert');
 evidence.cases.push({name:'AI proxy off ignores environment proxy',expected:true,actual:result.ok,message:result.message});
 for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
 store.setSetting('convertApiUrl',base+'/auth');store.setSetting('proxyMode','direct');const before=evidence.requests.length;result=await both('convert');
 evidence.cases.push({name:'401 remains failure without billed retry',expected:false,actual:result.ok,message:result.message,attempts:evidence.requests.length-before});
 const authAttempts=evidence.cases.at(-1).attempts;
 const types=req('./dist-electron/src/types.js');
 const payload=nai.buildPayload({...types.DEFAULT_PARAMS,model:'nai-diffusion-4-5-full',effort:'high',positivePrompt:'A woman in a blue coat by a tree.',metadataReplay:{model:'nai-diffusion-4-5-full',parameters:{controlnet_strength:1,uncond_scale:1}}},123);
 const checked=await fetch(base+'/generate-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
 evidence.cases.push({name:'inactive imported ControlNet field is not forwarded',expected:true,actual:checked.status===200&&payload.parameters.uncond_scale===1,status:checked.status,fields:Object.keys(payload.parameters)});
 evidence.pass=evidence.cases.every(c=>c.actual===c.expected)&&authAttempts===1;
 console.log(JSON.stringify({pass:evidence.pass,cases:evidence.cases,paidCalls:0}));
}catch(error){evidence.error=error.stack;console.error(error.stack);}finally{if(server)await new Promise(r=>server.close(r));fs.writeFileSync(out,JSON.stringify(evidence,null,2));app.exit(evidence.pass?0:1);}});
