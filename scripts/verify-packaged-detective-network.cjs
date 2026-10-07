// Real packaged code over local TCP only. No official/relay credentials or paid calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto'),{createRequire}=require('node:module');
const listen=s=>new Promise((ok,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',()=>ok(s.address().port));});
const close=s=>new Promise(ok=>s.close(ok));
if(process.argv[2]!=='--child'){
 const root=path.resolve('release/win-unpacked'),out=path.resolve('release/packaged-smoke/detective-network');fs.mkdirSync(out,{recursive:true});
 const p=spawnSync(path.join(root,'Langbai NovelAI Studio.exe'),[__filename,'--child',path.join(root,'resources/app.asar'),path.join(out,'verification.json')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,timeout:60000,encoding:'utf8'});
 fs.writeFileSync(path.join(out,'command.json'),JSON.stringify({status:p.status,stdout:p.stdout,stderr:p.stderr,error:p.error?.message},null,2));process.stdout.write(p.stdout??'');process.stderr.write(p.stderr??'');if(p.error||p.status!==0)process.exit(1);
}else (async()=>{
 const asar=process.argv[3],req=createRequire(path.join(asar,'package.json')),axios=req('axios'),JSZip=req('jszip');
 const zip=new JSZip();zip.file('image.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=','base64'));const bytes=await zip.generateAsync({type:'nodebuffer'});
 const closed=net.createServer(),port=await listen(closed);await close(closed);let posts=0,fail=false,bridge;
 const proxy=http.createServer((r,s)=>{posts++;let body='';r.on('data',b=>body+=b);r.on('end',()=>{assert.equal(r.method,'POST');assert.equal(r.url,`http://127.0.0.1:${port}/relay-prefix/ai/generate-image`);assert.equal(r.headers.authorization,'Bearer FIXTURE_NOT_A_CREDENTIAL');assert.equal(r.headers['x-studio-bridge-key'],undefined);assert.equal(JSON.parse(body).model,'nai-diffusion-4-5-full');s.writeHead(fail?401:200);s.end(fail?'FIXTURE_NOT_A_CREDENTIAL':bytes);});});const pp=await listen(proxy);
 try{
  const settings={proxyMode:'manual',proxyUrl:`http://127.0.0.1:${pp}`,proxyForNai:true};const store=path.join(asar,'dist-electron/electron/ipc/store.js');require.cache[store]={id:store,filename:store,loaded:true,exports:{getSettings:()=>settings}};
  const file=path.join(asar,'dist-electron/electron/ipc/detective-generation-bridge.js');bridge=await require(file).startDetectiveGenerationBridge({imageBaseUrl:`http://127.0.0.1:${port}/relay-prefix`,token:'FIXTURE_NOT_A_CREDENTIAL',settings,budget:2});
  const payload={input:'transport fixture',model:'nai-diffusion-4-5-full',action:'generate',parameters:{n_samples:1,width:832,height:1216,seed:42}};
  const request=(body,headers)=>axios.post(bridge.connection.url,body,{proxy:false,headers,validateStatus:()=>true,responseType:'arraybuffer',timeout:10000});
  assert.equal((await request(payload,{})).status,403);assert.equal(posts,0);
  const headers={'x-studio-bridge-key':bridge.connection.key};const good=await request(payload,headers);assert.equal(good.status,200);assert.deepEqual(Buffer.from(good.data),bytes);assert.equal(posts,1);
  assert.equal((await request(payload,headers)).status,409);assert.equal(posts,1);
  fail=true;const denied=await request({...payload,input:'second transport fixture'},headers);assert.equal(denied.status,401);assert.equal(denied.data.length,0);assert.equal(posts,2);
  assert.equal((await request({...payload,input:'third transport fixture'},headers)).status,409);assert.equal(posts,2);
  const report={pass:true,version:req('./package.json').version,fixtureOnly:true,paidCalls:0,actualPackagedBridge:true,proxyOnlyPath:true,pathPrefixRetained:true,capabilityRequired:true,duplicateSuppressed:true,budgetEnforced:true,remoteErrorRedacted:true,upstreamPosts:posts,bridgeSha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),zipSha256:createHash('sha256').update(bytes).digest('hex')};fs.writeFileSync(process.argv[4],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{if(bridge)await bridge.close();await close(proxy);}
})().catch(e=>{console.error(e);process.exitCode=1;});
