const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {app}=require('electron');
const root=path.resolve(process.argv[2]),report=path.resolve(process.argv[3]),sourceSha=process.argv[4];
fs.mkdirSync(path.dirname(report),{recursive:true});const profile=fs.mkdtempSync(path.join(path.dirname(report),'flows-profile-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
const evidence={sourceSha,platform:process.platform,paidCalls:0,cases:[],requests:[],pass:false};let server,restoreAdapter;
const record=(name,features,details={})=>evidence.cases.push({name,features,pass:true,...details});
app.whenReady().then(async()=>{try{
 const req=require('node:module').createRequire(path.join(root,'package.json')),store=req('./dist-electron/electron/ipc/store.js'),nai=req('./dist-electron/electron/ipc/nai.js'),updates=req('./dist-electron/electron/ipc/update.js'),pool=req('./dist-electron/electron/ipc/artist-pool-selected.js'),axios=req('axios');
 const {DEFAULT_PARAMS}=req('./dist-electron/src/types.js'),{PNG}=req('pngjs'),JSZip=req('jszip');
 const image=new PNG({width:832,height:1216});for(let i=0;i<image.data.length;i+=4){image.data[i]=30;image.data[i+1]=100;image.data[i+2]=200;image.data[i+3]=255;}
 const png=PNG.sync.write(image),zip=new JSZip();zip.file('image.png',png);const zipBytes=await zip.generateAsync({type:'nodebuffer'});
 let mode='ok',translations=0,submissions=0,tagRequests=0,updateRequests=0,held;
 server=http.createServer((request,response)=>{let text='';request.on('data',b=>text+=b);request.on('end',()=>{
  try{
   const uri=new URL(request.url,'http://127.0.0.1');evidence.requests.push({method:request.method,path:uri.pathname,mode});
   if(uri.pathname==='/chat/completions'){
    translations++;assert.equal(request.headers.authorization,'Bearer neutral-translate');const body=JSON.parse(text);assert.equal(body.model,'neutral-model');assert.equal(body.messages[1].content,'蓝色方块');
    response.writeHead(mode==='translation-401'?401:200,{'content-type':'application/json'});response.end(JSON.stringify({choices:[{message:{content:mode==='translation-empty'?'':JSON.stringify({text:'blue square',sourceLanguage:'zh-CN'})}}]}));
   }else if(uri.pathname==='/ai/generate-image'){
    submissions++;assert.equal(request.headers.authorization,'Bearer neutral-fixture-token');const body=JSON.parse(text);evidence.requests.at(-1).action=body.action;evidence.requests.at(-1).model=body.model;
    if(mode==='hold'){held=response;return;}
    response.writeHead(mode==='image-503'?503:200,{'content-type':mode==='image-503'?'application/json':'application/zip'});response.end(mode==='image-503'?'{"message":"neutral rejection"}':zipBytes);
   }else if(uri.pathname==='/tags.json'){
    tagRequests++;const rows=mode==='tags-invalid'?{}:[{id:1,name:'neutral_artist',post_count:123,category:1,is_deprecated:false}];response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(rows));
   }else if(uri.pathname.endsWith('/latest.yml')){
    updateRequests++;response.writeHead(mode==='update-fallback'||mode==='update-fail'?503:200,{'content-type':'text/plain'});response.end('version: 99.0.0\n');
   }else if(uri.pathname.endsWith('/releases/latest')){
    updateRequests++;response.writeHead(mode==='update-fail'?503:200,{'content-type':'application/json'});response.end(JSON.stringify({tag_name:'v99.0.1',html_url:'https://github.com/2786886095/novelai-image-desktop/releases/tag/v99.0.1',assets:[]}));
   }else {response.writeHead(404);response.end('unexpected fixture path');}
  }catch(error){evidence.serverError=error.stack;response.writeHead(500);response.end('fixture assertion failure');}
 });});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 // Rewrite only fixed public read URLs to a real loopback server. Delegate to
 // axios' genuine HTTP adapter; never return an invented adapter response.
 const prior=axios.defaults.adapter,transport=axios.getAdapter('http');restoreAdapter=()=>{axios.defaults.adapter=prior;};
 axios.defaults.adapter=config=>{
  const url=new URL(config.url);if(['github.com','api.github.com','danbooru.donmai.us'].includes(url.hostname))config={...config,url:base+url.pathname+url.search,proxy:false};
  else assert.equal(url.hostname,'127.0.0.1','No production or paid endpoint allowed');
  return transport(config);
 };
 for(const [key,value] of Object.entries({proxyMode:'direct',outputDir:path.join(profile,'output'),apiBaseUrl:base,imageBaseUrl:base,allowCustomEndpoint:false,allowCustomEndpointFallback:false,translateProvider:'ai',translateAiApiUrl:base,translateAiApiKey:'neutral-translate',translateAiModel:'neutral-model'}))store.setSetting(key,value);store.setToken('neutral-fixture-token');
 const translated=await nai.translateText('蓝色方块','en','auto');assert.equal(translated.ok,true);assert.equal(translated.text,'blue square');assert.equal(translated.sourceLanguage,'zh-CN');record('Native translation actual HTTP auto language and weighted output',['translation']);
 mode='translation-401';assert.equal((await nai.translateText('蓝色方块','en','auto')).ok,false);assert.equal(translations,2);record('Native translation 401 has no automatic retry',['translation']);
 mode='translation-empty';assert.equal((await nai.translateText('蓝色方块','en','auto')).ok,false);record('Native translation empty response is failure',['translation']);
 const beforeEmpty=translations;assert.equal((await nai.translateText('  ')).ok,false);assert.equal(translations,beforeEmpty);record('Native translation blank input makes no request',['translation']);mode='ok';
 const params={...DEFAULT_PARAMS,positivePrompt:'blue square',negativePrompt:'',width:832,height:1216,seed:123,seedMode:'fixed'};
 const batch={runId:'native-batch',imageBase64:png.toString('base64'),params,strength:.4,groupName:'Neutral batch'};
 let before=store.getHistory().length,posts=submissions;const redraw=await nai.redrawImage(batch);assert.equal(redraw.ok,true,redraw.message);assert.equal(submissions-posts,1);assert.equal(store.getHistory().length-before,1);assert.equal(redraw.items.length,1);assert.equal(PNG.sync.read(fs.readFileSync(redraw.items[0].filePath)).width,832);record('Native batch redraw saves real image and group once',['batch','image-to-image','works']);
 posts=submissions;assert.equal((await nai.redrawImage({...batch,imageBase64:''})).ok,false);assert.equal(submissions,posts);record('Native batch invalid source never submits',['batch']);
 mode='hold';before=store.getHistory().length;posts=submissions;const pending=nai.redrawImage({...batch,runId:'native-cancel'});for(let i=0;i<100&&!held;i++)await new Promise(r=>setTimeout(r,20));assert(held);assert.equal(nai.cancelBatchRedraw('native-cancel').requested,true);const cancelled=await pending;await nai.waitBatchRedraw('native-cancel');assert.equal(cancelled.ok,false);assert.equal(store.getHistory().length,before);assert.equal(submissions-posts,1);held.destroy();held=null;mode='ok';record('Native batch actual in-flight socket cancellation creates no phantom row',['batch']);
 const comic={runId:'native-comic',projectId:'neutral-project',projectTitle:'Neutral comic',panelId:'neutral-panel',panelIndex:1,params,globalStylePrompt:'blue square',panelPrompt:'white background',globalNegativePrompt:'',preciseReferences:[]};
 before=store.getHistory().length;posts=submissions;const panel=await nai.generateTagComicCandidate(comic);assert.equal(panel.ok,true,panel.message);assert.equal(submissions-posts,1);assert.equal(store.getHistory().length-before,1);assert.equal(panel.items[0].feature,'comic');assert.equal(panel.items[0].comicProjectId,'neutral-project');assert.equal(panel.items[0].comicPanelNo,1);record('Native comic panel real request file and durable annotations',['comic','works']);
 mode='image-503';before=store.getHistory().length;posts=submissions;assert.equal((await nai.generateTagComicCandidate({...comic,runId:'native-comic-fail'})).ok,false);assert.equal(submissions-posts,1);assert.equal(store.getHistory().length,before);mode='ok';record('Native comic rejected submission is not retried or persisted',['comic']);
 const extras={vibeImages:[],charCaptions:[],preciseReferences:[]};before=store.getHistory().length;posts=submissions;const target=await nai.generateArtistLabImage({...params,model:'nai-diffusion-4-5-full'},extras,'target');assert.equal(target.ok,true,target.message);assert.equal(submissions-posts,1);assert.equal(target.items[0].feature,'artist-lab');assert.equal(store.getHistory().length-before,1);record('Native artist iteration candidate actual generation and group',['artist-iteration','works']);
 before=store.getHistory().length;const random=await nai.generateArtistLabImage(params,extras,'random');assert.equal(random.ok,true,random.message);assert.equal(store.getHistory().length,before);const temp=random.items[0];assert(fs.existsSync(temp.filePath));const promoted=await nai.promoteArtistLabFavorite(temp);assert.equal(store.getHistory().length,before+1);assert.equal(promoted.feature,'artist-lab');assert(!fs.existsSync(temp.filePath));assert(fs.existsSync(promoted.filePath));record('Native random artist temporary image explicit promotion',['random-artists','favorites']);
 posts=submissions;await assert.rejects(nai.generateArtistLabImage(params,extras,'target'),/4.5/);assert.equal(submissions,posts);record('Native artist iteration unsupported model rejected before submission',['artist-iteration']);
 const selected=await pool.loadSelectedArtistPool(1000);assert.equal(selected.complete,true);assert.equal(selected.items[0].name,'neutral_artist');assert.equal(tagRequests,1);record('Native artist ranking actual HTTP catalog selection',['random-artists','online-gallery']);
 mode='tags-invalid';const invalid=await pool.loadSelectedArtistPool(1000);assert.equal(invalid.complete,false);assert.equal(invalid.issue,'invalid-response');assert.equal(invalid.items.length,0);mode='ok';record('Native artist malformed catalog never invents ranking',['random-artists']);
 const abort=new AbortController();abort.abort();const tagBefore=tagRequests;const stopped=await pool.loadSelectedArtistPool(1000,{signal:abort.signal});assert.equal(stopped.issue,'cancelled');assert.equal(tagRequests,tagBefore);record('Native artist pre-cancel avoids external request',['random-artists']);
 const found=await updates.checkUpdate();assert.equal(found.latestVersion,'99.0.0');assert.equal(found.hasUpdate,true);assert.equal(updateRequests,1);record('Native update actual HTTP manifest read only',['updates']);
 mode='update-fallback';const fallback=await updates.checkUpdate();assert.equal(fallback.latestVersion,'99.0.1');assert.equal(fallback.hasUpdate,true);assert.equal(updateRequests,3);record('Native update API fallback after manifest failure',['updates']);
 mode='update-fail';const failed=await updates.checkUpdate();assert.equal(failed.hasUpdate,false);assert(failed.error);assert.equal(updateRequests,5);record('Native update both sources unavailable gives explicit error',['updates']);
 assert.equal(evidence.serverError,undefined);evidence.pass=true;
 }catch(error){evidence.error=error.stack;console.error(error.stack);}finally{restoreAdapter?.();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}fs.writeFileSync(report,JSON.stringify(evidence,null,2));console.log(JSON.stringify({pass:evidence.pass,cases:evidence.cases.length,error:evidence.error,paidCalls:0}));app.exit(evidence.pass?0:1);}});
