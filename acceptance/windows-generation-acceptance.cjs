const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const assert = require('node:assert/strict');
const { app } = require('electron');
const root = path.resolve(process.argv[2]);
const report = path.resolve(process.argv[3]);
const stage = process.argv[4];
fs.mkdirSync(path.dirname(report), {recursive:true});
const profile = fs.mkdtempSync(path.join(path.dirname(report), 'generation-profile-'));
app.setPath('userData', profile);
app.disableHardwareAcceleration();
const evidence = {stage, source:root, platform:process.platform, paidCalls:0,
  fixture:'Neutral blue square PNG; fixed seed; actual Electron/HTTP/ZIP/PNG/files/history; independent profile; no upstream service',
  fixtureSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  cases:[], requests:[], pass:false};
let server, mode='accept';
app.whenReady().then(async () => {
  try {
    const req = require('node:module').createRequire(path.join(root,'package.json'));
    const store = req('./dist-electron/electron/ipc/store.js');
    const nai = req('./dist-electron/electron/ipc/nai.js');
    const {DEFAULT_PARAMS} = req('./dist-electron/src/types.js');
    const {PNG} = req('pngjs');
    const JSZip = req('jszip');
    const png = new PNG({width:832, height:1216});
    for(let i=0;i<png.data.length;i+=4) {png.data[i]=30;png.data[i+1]=100;png.data[i+2]=200;png.data[i+3]=255;}
    const pngBytes=PNG.sync.write(png);
    const zip=new JSZip();zip.file('image_0.png',pngBytes);
    const zipBytes=await zip.generateAsync({type:'nodebuffer'});
    server=http.createServer((request,response)=> {
      let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=> {
        try {
          const url=new URL(request.url,'http://127.0.0.1');
          if(url.pathname!='/ai/generate-image') {
            evidence.requests.push({method:request.method,path:url.pathname,status:404});
            response.writeHead(404,{'content-type':'application/json'});response.end('{"message":"fixture endpoint unavailable"}');return;
          }
          assert.equal(request.headers.authorization,'Bearer neutral-fixture-token');
          const payload=JSON.parse(body);
          const status=mode==='server-error'?503:mode==='unauthorized'?401:
            Object.hasOwn(payload.parameters,'controlnet_strength')?422:200;
          evidence.requests.push({method:request.method,path:url.pathname,status,mode,
            model:payload.model,action:payload.action,width:payload.parameters.width,
            height:payload.parameters.height,seed:payload.parameters.seed,
            steps:payload.parameters.steps,hasInactiveControlNet:Object.hasOwn(payload.parameters,'controlnet_strength')});
          if(status===200) {response.writeHead(200,{'content-type':'application/zip'});response.end(zipBytes);}
          else {response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify({message:'fixture rejection '+status}));}
        } catch(error) {response.writeHead(500,{'content-type':'application/json'});response.end('{"message":"fixture handler assertion failed"}');evidence.serverError=error.stack;}
      });
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const output=path.join(profile,'neutral-output');
    for(const [key,value] of Object.entries({outputDir:output,imageBaseUrl:base,apiBaseUrl:base,
      proxyMode:'direct',allowCustomEndpoint:false,allowCustomEndpointFallback:false})) store.setSetting(key,value);
    store.setToken('neutral-fixture-token');
    const params={...DEFAULT_PARAMS,model:'nai-diffusion-5-full',effort:'high',
      positivePrompt:'A blue square on a white background.',negativePrompt:'',
      width:832,height:1216,seed:246813579,seedMode:'fixed'};
    async function invoke(name,config,expected,requestMode='accept') {
      mode=requestMode;
      const before=store.getHistory().length;
      const requestsBefore=evidence.requests.filter(r=>r.path==='/ai/generate-image').length;
      const result=await nai.generateImage(config);
      const actualRequests=evidence.requests.filter(r=>r.path==='/ai/generate-image').slice(requestsBefore);
      const after=store.getHistory().length;
      const files=(result.items??[]).map(item=> {
        const bytes=fs.readFileSync(item.filePath),decoded=PNG.sync.read(bytes);
        assert.equal(decoded.width,832);assert.equal(decoded.height,1216);
        assert.equal(decoded.data[0],30);assert.equal(decoded.data[1],100);assert.equal(decoded.data[2],200);
        assert.equal(item.actualSeed,246813579);
        assert.equal(item.params.seed,246813579);
        assert.equal(path.relative(output,item.filePath).startsWith('..'),false);
        return {path:item.filePath,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),width:decoded.width,height:decoded.height};
      });
      assert.equal(result.ok,expected);
      if(expected) assert.equal(result.actualSeed,246813579);
      assert.equal(actualRequests.length,1,'Never repeat a paid-submission-shaped request after ambiguous/rejected result');
      assert.equal(after-before,expected?1:0);assert.equal(files.length,expected?1:0);
      evidence.cases.push({name,ok:result.ok,expected,attempts:actualRequests.length,
        historyBefore:before,historyAfter:after,actualSeed:result.actualSeed,files,message:result.message,
        request:actualRequests[0],pass:true});
    }
    await invoke('High generation returns ZIP, saves one exact image and one history row',params,true);
    await invoke('Medium effort is submitted and saves without changing the chosen seed', {...params,effort:'medium'},true);
    const metadataReplay={model:'nai-diffusion-5-full',parameters:{controlnet_strength:1,uncond_scale:1}};
    await invoke('Disabled imported ControlNet field does not reject actual generation', {...params,metadataReplay},stage==='MODIFIED');
    await invoke('503 is not automatically resubmitted and does not save a phantom row',params,false,'server-error');
    await invoke('401 does not fall back to another host and does not save a phantom row',params,false,'unauthorized');
    assert.equal(evidence.serverError,undefined);
    assert.equal(evidence.cases[1].request.model,'nai-diffusion-5-full-medium');
    evidence.pass=true;
  } catch(error) {evidence.error=error.stack;console.error(error.stack);}
  finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    fs.writeFileSync(report,JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({stage,pass:evidence.pass,paidCalls:0,cases:evidence.cases.map(c=>({name:c.name,ok:c.ok,expected:c.expected,attempts:c.attempts,historyDelta:c.historyAfter-c.historyBefore,model:c.request.model,pass:c.pass}))}));
    app.exit(evidence.pass?0:1);
  }
});
