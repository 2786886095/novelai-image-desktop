const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {app}=require('electron');
const root=path.resolve(process.argv[2]),report=path.resolve(process.argv[3]),sourceSha=process.argv[4];
fs.mkdirSync(path.dirname(report),{recursive:true});
const profile=fs.mkdtempSync(path.join(path.dirname(report),'storage-profile-'));app.setPath('userData',profile);app.disableHardwareAcceleration();
const evidence={sourceSha,platform:process.platform,kind:'integration',paidCalls:0,cases:[],pass:false};
app.whenReady().then(async()=>{try {
 const req=require('node:module').createRequire(path.join(root,'package.json'));
 const store=req('./dist-electron/electron/ipc/store.js'),nai=req('./dist-electron/electron/ipc/nai.js'),refs=req('./dist-electron/electron/ipc/reference-presets.js');
 const {createImageFavorites}=req('./dist-electron/electron/ipc/image-favorites.js');
 const sharp=req('sharp');
 const bytes=await sharp({create:{width:96,height:64,channels:4,background:'#7367aa'}}).png().toBuffer();
 const source=path.join(profile,'neutral-source.png');fs.writeFileSync(source,bytes);
 const record=(name,features,details)=>evidence.cases.push({name,features,pass:true,...details});
 store.setSetting('uiTypography',{font:'serif',scale:150});store.setSetting('language','zh-CN');
 const disk=JSON.parse(fs.readFileSync(path.join(profile,'novelai-image-desktop.json'),'utf8'));
 assert.deepEqual(disk.settings.uiTypography,store.getSettings().uiTypography);assert.equal(store.getSettings().uiTypography.scale,150);
 record('Native settings/font-size JSON persists and reads back',['settings','typography']);
 const now=new Date().toISOString();
 const negative={id:'neutral-negative',name:'Neutral negative',prompt:'lowres, blurry',createdAt:now,updatedAt:now};
 store.setSetting('negativePromptPresets',[negative]);assert.equal(store.getSettings().negativePromptPresets.find(x=>x.id===negative.id).prompt,negative.prompt);
 store.setSetting('negativePromptPresets',[{...negative,name:'Renamed negative',prompt:'lowres, text'}]);assert.equal(store.getSettings().negativePromptPresets.find(x=>x.id===negative.id).name,'Renamed negative');
 store.setSetting('negativePromptPresets',[]);assert(!store.getSettings().negativePromptPresets.some(x=>x.id===negative.id));
 record('Negative preset create/edit/delete uses real settings store',['negative-prompts']);
 const positive={id:'neutral-positive',name:'Blue square',prompt:'blue square',createdAt:now};
 store.setSetting('positivePromptPresets',[positive]);assert.equal(store.getSettings().positivePromptPresets[0].prompt,'blue square');
 store.setSetting('stylePromptPresets',[{id:'neutral-style',name:'Soft light',prompt:'soft lighting',group:'Neutral',createdAt:now,previewImages:[]}]);
 assert.equal(store.getSettings().stylePromptPresets[0].prompt,'soft lighting');
 record('Positive/style preset exact prompt disk roundtrip',['styles']);
 for(const kind of ['precise','vibe']) {
  const saved=await refs.saveReferencePreset({name:'Neutral '+kind,group:'Native',kind,base64:bytes.toString('base64'),extension:'png',width:96,height:64,strength:.8,fidelity:.9,informationExtracted:.75},profile);
  assert.equal(saved.ok,true);assert(saved.preset?.id);const id=saved.preset.id;
  const read=await refs.readReferencePreset(id,profile);assert.equal(read.ok,true);assert.deepEqual(Buffer.from(read.base64,'base64'),bytes);
  await refs.createReferencePresetGroup('Moved',profile);const moved=await refs.moveReferencePresetToGroup(id,'Moved',profile);assert.equal(moved.ok,true);assert.equal(moved.preset.group,'Moved');
  assert.equal((await refs.listReferencePresets(profile)).presets.find(x=>x.id===id).group,'Moved');
  assert.equal((await refs.deleteReferencePreset(id,profile)).ok,true);assert.equal((await refs.listReferencePresets(profile)).presets.some(x=>x.id===id),false);
  assert.deepEqual(fs.readFileSync(source),bytes);
  record('Actual '+kind+' reference create/read/move/delete preserves source',['reference-presets',kind==='precise'?'precise-reference':'vibe-transfer']);
 }
 const favorite=()=>createImageFavorites({indexPath:path.join(profile,'favorites-index.json'),defaultDirectory:path.join(profile,'favorites')});
 const api=favorite();const added=await api.add(source);assert.equal(added.duplicate,false);assert.deepEqual(fs.readFileSync(added.item.filePath),bytes);
 assert.equal((await api.add(source)).duplicate,true);assert.equal((await favorite().list()).items.length,1);
 const renamed=await api.rename(added.item.id,'Neutral archive');assert.deepEqual(fs.readFileSync(renamed.filePath),bytes);
 await assert.rejects(api.rename(added.item.id,'../outside'));await api.remove(added.item.id);assert.equal((await favorite().list()).items.length,0);
 assert.deepEqual(fs.readFileSync(renamed.filePath),bytes);assert.deepEqual(fs.readFileSync(source),bytes);
 record('Native favorite add/deduplicate/rename/remove retains original and archive',['favorites']);
 for(const name of ['lossy','lossless','alpha','animated']) {
  const file=path.join(root,'shared/image-input-fixtures',name+'.webp');const before=fs.readFileSync(file);const hash=crypto.createHash('sha256').update(before).digest('hex');
  const loaded=await nai.loadImageFromPath(file);assert.equal(loaded.ok,true,loaded.message);assert.equal(loaded.image.width,96);assert.equal(loaded.image.height,64);
  const pixels=await sharp(before,{animated:false}).png().toBuffer();const metadata=await sharp(pixels).metadata();assert.equal(metadata.width,96);assert.equal(metadata.height,64);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
  record('Native workbench '+name+' WebP load and decode without changing source',['metadata-import','tools'],{fileSha256:hash});
 }
 evidence.pass=true;
} catch(error) {evidence.error=error.stack;console.error(error.stack);} finally {fs.writeFileSync(report,JSON.stringify(evidence,null,2));console.log(JSON.stringify({platform:evidence.platform,pass:evidence.pass,cases:evidence.cases.length,error:evidence.error}));app.exit(evidence.pass?0:1);}});
