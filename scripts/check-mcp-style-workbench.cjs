// Run with the workspace's Electron after npm run build. This probe creates its own
// userData, token, image, groups and presets. Never opens the user's account or generates.
const fs=require('node:fs'),p=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {app}=require('electron'),root=p.resolve(__dirname,'..'),src=p.join(root,'dist-electron'),dir=fs.mkdtempSync(p.join(os.tmpdir(),'langbai-mcp-styles-'));
process.env.NAI_UI_CAPTURE_USER_DATA=dir;delete process.env.VITE_DEV_SERVER_URL;
app.setPath('userData',dir);app.commandLine.appendSwitch('disable-background-networking');
const token=crypto.randomBytes(32).toString('hex'),port=Number(process.env.STYLE_MCP_TEST_PORT);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Provide an unused STYLE_MCP_TEST_PORT for the isolated listener.');
let done=false;function stop(code){if(done)return;done=true;app.exit(code);}
setTimeout(()=>{console.error('Timeout: application did not acknowledge test actions');stop(1);},80000).unref();
app.whenReady().then(()=>{
 const {getSettings,setSetting}=require(p.join(src,'electron/ipc/store.js'));
 assert.equal(app.getPath('userData'),dir);
 setSetting('mcpServerToken',token);setSetting('mcpServerPort',port);setSetting('mcpServerEnabled',true);
 setSetting('stylePromptPresets',['one','two'].map(id=>({id,name:id,group:'Default',prompt:'test',createdAt:new Date().toISOString()})));
 setSetting('lastGenerationState',{...getSettings().lastGenerationState,params:{...require(p.join(src,'src/types.js')).DEFAULT_PARAMS,model:'nai-diffusion-4-5-full',positivePrompt:'unchanged'}});
}).catch(e=>{console.error(e.message);stop(1);});
require(p.join(src,'electron/main.js'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(name,args={}){
 const res=await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',headers:{authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
 const {result,error}=await res.json();if(error||result?.isError)throw Error(error?.message??result.content[0].text);
 return JSON.parse(result.content[0].text);
}
app.whenReady().then(async()=>{
 let before,last;for(let n=0;n<60;n++){try{before=await call('list_workbench_references');break;}catch(e){last=e;await sleep(300);}}
 if(!before)throw last??Error('Renderer unavailable');assert.equal(before.model,'nai-diffusion-4-5-full');
 const file=p.join(dir,'swatch.png');await require('sharp')({create:{width:3,height:2,channels:3,background:'navy'}}).png().toFile(file);
 const {attachmentId:image}=await call('import_image',{path:file});await call('create_style_group',{name:'水彩'});
 const move={group:'水彩',presetIds:['one','two']};await call('move_style_presets',{...move,revision:(await call('move_style_presets',move)).revision});
 const items=[{presetId:'one',image,role:'cover'},{presetId:'two',image,role:'example'}];const result=await call('attach_style_images',{items,revision:(await call('attach_style_images',{items})).revision});assert(result.applied);
 assert.equal((await call('list_style_assets',{group:'水彩'})).total,2);assert.deepEqual(await call('list_workbench_references'),before);
 await call('set_style_cover',{presetId:'two',image:result.items[1].handle});
 for(const kind of ['vibe','precise']){
   const mounted=await call('mount_workbench_reference',{kind,image:result.items[0].handle,strength:.7,...(kind==='precise'?{type:'style'}:{})});
   const live=await call('list_workbench_references');assert.equal(live[kind][0].id,mounted.id);assert.equal(live[kind][0].strength,.7);assert.equal(live[kind==='vibe'?'precise':'vibe'].length,0);
   await call('unmount_workbench_reference',{kind,id:mounted.id});assert.deepEqual(await call('list_workbench_references'),before);
 }
 if(process.argv.includes('--resources'))await require('./check-mcp-workspace-resources.cjs')({call,dir,src,port,token,image});
 console.log('ELECTRON_REAL_WORKBENCH_OK: bulk move; attach cover/example; zero implicit references; explicit vibe and precise mount/readback/unmount. No generation.');stop(0);
}).catch(e=>{console.error(e.stack);stop(1);});
