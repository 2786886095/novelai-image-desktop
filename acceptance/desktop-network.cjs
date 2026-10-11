const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {app}=require('electron');
const root=path.resolve(process.argv[2]),report=path.resolve(process.argv[3]),sourceSha=process.argv[4];
fs.mkdirSync(path.dirname(report),{recursive:true});const profile=fs.mkdtempSync(path.join(path.dirname(report),'network-profile-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
const evidence={sourceSha,platform:process.platform,kind:'integration',paidCalls:0,cases:[],pass:false};
let mcp,origin;
const record=(name,features,details={})=>evidence.cases.push({name,features,pass:true,...details});
app.whenReady().then(async()=>{try {
 const req=require('node:module').createRequire(path.join(root,'package.json'));
 const store=req('./dist-electron/electron/ipc/store.js'),network=req('./dist-electron/electron/ipc/gallery-network.js'),server=req('./dist-electron/electron/ipc/mcp-server.js'),sharp=req('sharp');
 store.setSetting('proxyMode','direct');store.setSetting('mcpMaxAnlasPerCall',0);
 const token='neutral-native-mcp-token';mcp=await server.startMcpServer({port:0,token,window:()=>null});
 async function send(body,headers={},method='POST') {
  const data=typeof body==='string'?body:JSON.stringify(body);
  return new Promise((resolve,reject)=>{const request=http.request({hostname:'127.0.0.1',port:mcp.port,path:'/mcp',method,agent:false,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,...headers}},response=>{let text='';response.setEncoding('utf8');response.on('data',x=>text+=x);response.on('end',()=>{let body;try{body=JSON.parse(text);}catch{}resolve({status:response.statusCode,body,text});});});request.on('error',reject);request.end(data);});
 }
 const rpc=(method,params={})=>({jsonrpc:'2.0',id:1,method,params});
 assert.equal((await send(rpc('ping'),{authorization:''})).status,401);record('Real MCP socket rejects missing bearer',['external-mcp-server']);
 assert.equal((await send(rpc('ping'),{origin:'https://example.test'})).status,403);record('Real MCP rejects remote browser origin',['external-mcp-server']);
 assert.equal((await send(rpc('ping'),{host:'example.test:'+mcp.port})).status,403);record('Real MCP rejects rebinding Host',['external-mcp-server']);
 const initialized=await send(rpc('initialize',{protocolVersion:'2025-03-26'}));assert.equal(initialized.status,200);assert.equal(initialized.body.result.protocolVersion,'2025-03-26');assert.equal(initialized.body.result.serverInfo.name,'langbai-novelai-studio');record('Native MCP initialization protocol readback',['external-mcp-server']);
 const listing=await send(rpc('tools/list'));assert.equal(listing.body.result.tools.length,14);const generation=listing.body.result.tools.find(x=>x.name==='generate_image');assert(generation.inputSchema.properties.effort);record('Actual MCP tools list retains effort schema',['external-mcp-server','image-agent']);
 assert.equal((await send('{invalid')).status,400);assert.equal((await send(rpc('ping'),{},'GET')).status,405);record('Native MCP malformed JSON/method boundaries',['external-mcp-server']);
 assert.equal((await send({jsonrpc:'2.0',method:'notifications/initialized'})).status,202);record('Native MCP notifications do not produce phantom results',['external-mcp-server']);
 const unknown=await send(rpc('tools/call',{name:'fixture_nonexistent',arguments:{}}));assert(unknown.body.error);record('Native MCP unknown tool fails without execution',['external-mcp-server']);
 const bytes=await sharp({create:{width:96,height:64,channels:4,background:'#220077'}}).png().toBuffer(),source=path.join(profile,'neutral-image.png');fs.writeFileSync(source,bytes);
 const imported=await send(rpc('tools/call',{name:'import_image',arguments:{path:source}}));assert(!imported.body.result.isError);const item=JSON.parse(imported.body.result.content[0].text);assert.equal(item.width,96);assert.equal(item.height,64);assert(item.attachmentId);assert.deepEqual(fs.readFileSync(source),bytes);record('Native MCP import uses real attachment file without modifying source',['external-mcp-server','agent-components']);
 const view=await send(rpc('tools/call',{name:'view_image',arguments:{image:item.attachmentId,maxSize:128}}));assert(!view.body.result.isError);const pixel=view.body.result.content.find(x=>x.type==='image');assert(pixel);const meta=await sharp(Buffer.from(pixel.data,'base64')).metadata();assert.equal(meta.width,96);assert.equal(meta.height,64);record('Native MCP view decodes actual image attachment',['external-mcp-server','agent-components']);
 const mask=await send(rpc('tools/call',{name:'make_mask',arguments:{image:item.attachmentId,units:'pixel',shapes:[{shape:'rect',x:12,y:12,width:8,height:8}]}}));assert(!mask.body.result.isError);assert.deepEqual(fs.readFileSync(source),bytes);record('Native MCP mask preparation preserves source bytes',['external-mcp-server','inpaint']);
 const port=mcp.port;await mcp.close();mcp=null;await assert.rejects(fetch('http://127.0.0.1:'+port+'/mcp'));record('Native MCP close releases socket',['external-mcp-server']);
 // Real gallery transport, not a mocked axios/proxy module or external site.
 let gets=0;origin=http.createServer((request,response)=>{gets++;if(request.url==='/stall')return;response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({items:['neutral-blue-square']}));});
 await new Promise(resolve=>origin.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+origin.address().port;
 const page=await network.galleryGet(url+'/page');assert.deepEqual(page.data.items,['neutral-blue-square']);assert.equal(gets,1);record('Actual native gallery GET resolves local URL and JSON',['online-gallery']);
 const start=Date.now();await assert.rejects(network.galleryGet(url+'/stall',{timeout:180}));assert(Date.now()-start<2500);record('Native gallery deadline bounds stalled response',['online-gallery']);
 const controller=new AbortController();controller.abort(new Error('neutral cancel'));const before=gets;await assert.rejects(network.galleryGet(url+'/page',{signal:controller.signal}));assert.equal(gets,before);record('Native gallery cancellation avoids starting request',['online-gallery']);
 const optionalStart=Date.now();assert.equal(await network.optionalGalleryValue(new Promise(()=>{}),25),null);assert(Date.now()-optionalStart<1500);record('Optional native gallery metadata cannot block ready list',['online-gallery']);
 let active=0,max=0;await Promise.all(Array.from({length:12},()=>network.galleryImageSlot(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,20));active--;return true;})));assert.equal(max,6);assert.equal(active,0);record('Native gallery image concurrency bounded at six',['online-gallery']);
 await assert.rejects(network.galleryImageSlot(async()=>{throw new Error('neutral decode error');}));assert.equal(await network.galleryImageSlot(async()=>7),7);record('Native gallery failed image releases scheduling slot',['online-gallery']);
 evidence.pass=true;
}catch(error){evidence.error=error.stack;console.error(error.stack);}finally{if(mcp)await mcp.close();if(origin){origin.closeAllConnections();await new Promise(r=>origin.close(r));}fs.writeFileSync(report,JSON.stringify(evidence,null,2));console.log(JSON.stringify({platform:evidence.platform,pass:evidence.pass,cases:evidence.cases.length,error:evidence.error}));app.exit(evidence.pass?0:1);}});
