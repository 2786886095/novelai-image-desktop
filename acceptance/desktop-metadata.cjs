const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {app}=require('electron');const root=path.resolve(process.argv[2]),report=path.resolve(process.argv[3]),sourceSha=process.argv[4];
const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'native-metadata-'));app.setPath('userData',profile);app.setPath('documents',profile);app.disableHardwareAcceleration();
const evidence={sourceSha,platform:process.platform,pass:false,paidCalls:0,cases:[]};
app.whenReady().then(async()=>{try{
 const nai=require(path.join(root,'dist-electron/electron/ipc/nai.js'));const native=require(path.join(root,'dist-electron/electron/image-metadata.js'));
 const fixtures=JSON.parse(fs.readFileSync(path.join(root,'shared/official-image-metadata-fixtures/manifest.json'),'utf8'));
 for(const f of fixtures){const file=path.join(root,'shared/official-image-metadata-fixtures',f.name),bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);
  const loaded=await nai.loadImageFromPath(file);assert.equal(loaded.ok,true,loaded.message);const embedded=await native.extractEmbeddedImageMetadata(bytes);
  for(const metadata of [loaded.metadata,embedded]){const actual={...metadata?.imported,characters:metadata?.characterCaptions.length};for(const [key,value]of Object.entries(f.expected))assert.deepEqual(actual[key],value,f.name+':'+key);}
  assert.deepEqual(fs.readFileSync(file),bytes);evidence.cases.push({name:'Native official metadata '+f.name,pass:true,features:['metadata-import','tools'],fileSha256:f.sha256});}
 assert.equal(evidence.cases.length,24);evidence.pass=true;
}catch(error){evidence.error=error.stack;console.error(error.stack);}finally{fs.writeFileSync(report,JSON.stringify(evidence,null,2));app.exit(evidence.pass?0:1);}});
