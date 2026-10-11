const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{app,clipboard}=require('electron');
const root=path.resolve(process.argv[2]),report=path.resolve(process.argv[3]),sourceSha=process.argv[4];
fs.mkdirSync(path.dirname(report),{recursive:true});app.setPath('userData',fs.mkdtempSync(path.join(path.dirname(report),'clipboard-profile-')));app.disableHardwareAcceleration();
const evidence={sourceSha,platform:process.platform,cases:[],paidCalls:0,pass:false};
app.whenReady().then(async()=>{try{
 assert.equal(process.env.GITHUB_ACTIONS,'true','Only write the clipboard in a disposable CI desktop, never on the user desktop');
 const req=require('node:module').createRequire(path.join(root,'package.json')),copy=req('./dist-electron/electron/ipc/image-clipboard.js'),media=req('./dist-electron/electron/ipc/local-media-protocol.js'),sharp=req('sharp');
 const bytes=await sharp({create:{width:32,height:32,channels:4,background:'#2050c0'}}).png().toBuffer(),file=path.join(app.getPath('userData'),'neutral.png');fs.writeFileSync(file,bytes);
 const copied=await copy.copyImageWithMetadata(media.toLocalMediaUrl(file,'neutral-clipboard'));assert.equal(copied.status,'copied');
 const format=process.platform==='win32'?'PNG':process.platform==='darwin'?'public.png':'image/png';assert.deepEqual(clipboard.readBuffer(format),bytes);assert.equal(clipboard.readImage().getSize().width,32);assert.deepEqual(fs.readFileSync(file),bytes);
 evidence.cases.push({name:'Native app PNG clipboard exact byte and OS image readback',features:['clipboard','metadata-import'],pass:true});
 const previous=clipboard.readBuffer(format);assert.equal((await copy.copyImageWithMetadata('https://example.test/private.png')).status,'unsupported');assert.deepEqual(clipboard.readBuffer(format),previous);
 evidence.cases.push({name:'Native clipboard remote URL rejected without replacing clipboard',features:['clipboard'],pass:true});evidence.pass=true;
 }catch(error){evidence.error=error.stack;console.error(error.stack);}finally{fs.writeFileSync(report,JSON.stringify(evidence,null,2));app.exit(evidence.pass?0:1);}});
