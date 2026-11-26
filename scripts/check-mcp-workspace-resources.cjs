// Called by the isolated Electron smoke, never from the installed application.
const os=require('node:os');const assert=require('node:assert/strict'),p=require('node:path'),fs=require('node:fs'),cp=require('node:child_process');
module.exports=async function({call,dir,src,port,token,image}){
 const {app,dialog}=require('electron'),store=require(p.join(src,'electron/ipc/store.js')),types=require(p.join(src,'src/types.js'));
 assert.equal(app.getPath('userData'),dir);const root=p.join(dir,'output');fs.mkdirSync(root,{recursive:true});store.setSetting('outputDir',root);await require(p.join(src,'electron/ipc/image-favorites-ipc.js')).imageFavoritesService().setDirectory(p.join(dir,'favorites'));
 const names=(await(await fetch('http://127.0.0.1:'+port+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:12,method:'tools/list'})})).json()).result.tools.map(t=>t.name).sort();
 const doc=fs.readFileSync(p.join(__dirname,'../docs/MCP_GALLERY_AND_PROMPTS.md'),'utf8');const table=[...doc.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map(m=>m[1]).sort();assert.deepEqual(names,table);
 console.log('REGISTERED '+names.length+' '+names.join(' '));
 const commit=async(n,a)=>{const pre=await call(n,a);assert.equal(pre.preview,true,n);return call(n,{...a,revision:pre.revision});};
 for(const kind of ['chunk','negative','positive','style']){
  const items=[{name:'A',text:'red flower'},{name:'B',text:'blue bird'}],edit={kind,items};
  const pr=await call('edit_prompt_library',edit);await assert.rejects(call('edit_prompt_library',{...edit,items:[items[0],{...items[1],text:'different'}],revision:pr.revision}));
  const v=await call('edit_prompt_library',{...edit,revision:pr.revision});assert.equal(v.items.length,2);
  const ids=v.items.map(i=>i.id);await commit('edit_prompt_library',{kind,items:[{id:ids[0],name:'resource A',...(kind==='style'?{rating:5}:{})},{id:ids[1],text:'changed'}]});
  const found=await call('browse_prompt_library',{kind,query:'resource A'});assert.equal(found.items[0].id,ids[0]);if(kind==='style')assert.equal(found.items[0].rating,5);
  const arg={kind,id:ids[0],mode:'replace'};const preview=await call('apply_prompt_library_entry',arg);assert.equal(preview.slot,kind==='negative'?'negativePrompt':kind==='style'?'stylePrompt':'positivePrompt');if(kind==='chunk')assert.equal(preview.before,'unchanged');await commit('apply_prompt_library_entry',arg);assert.equal((await call('apply_prompt_library_entry',arg)).before,'red flower');
  if(kind==='style'){
   await commit('edit_prompt_library',{kind,items:[{id:ids[1],text:', blue bird,'}]});
   const append={kind,id:ids[1],mode:'append'};
   for(const expected of ['red flower, blue bird,','red flower, blue bird, blue bird,']){
    assert.equal((await call('apply_prompt_library_entry',append)).after,expected);
    await commit('apply_prompt_library_entry',append);
    assert.equal((await call('apply_prompt_library_entry',arg)).before,expected);
   }
  }
 }
 console.log('PASS 4 text libraries: create, rename, edit, page, stale refusal, live prompt preview / apply / readback');
 const refs=await call('list_workbench_references');const one=await call('save_reference_preset',{kind:'vibe',name:'ref-A',image}),two=await call('save_reference_preset',{kind:'precise',name:'ref-B',image});assert.deepEqual(await call('list_workbench_references'),refs);
 const ids=[one.id,two.id];await commit('organize_reference_presets',{items:ids.map((id,i)=>({id,name:'reference '+i,group:'lab'}))});
 assert.equal((await call('list_reference_presets',{group:'lab'})).total,2);
 for(const kind of ['vibe','precise']){
  const r=await call('mount_workbench_references',{kind,images:[one.image,two.image]});assert.equal(r.ids.length,2);
  const items=r.ids.map(id=>({id,strength:.23,...(kind==='precise'?{type:'style',fidelity:.57}:{information:.57})}));
  await assert.rejects(call('update_workbench_references',{kind,items:[items[0],{id:'unknown',strength:.1}]}));assert.equal((await call('list_workbench_references'))[kind][0].strength,1);
  await call('update_workbench_references',{kind,items});const after=await call('list_workbench_references');assert(after[kind].every(x=>x.strength===.23&&(x.fidelity??x.infoExtracted)===.57));
  await call('unmount_workbench_references',{kind,ids:r.ids});assert.deepEqual(await call('list_workbench_references'),refs);
 }
 console.log('PASS reference library save/batch rename/move; zero implicit mounts; vibe and precise multi-mount/edit/unmount');
 const date='2025-01-05',dateDir=p.join(root,date);fs.mkdirSync(dateDir,{recursive:true});
 const group=store.ensureHistoryGroup('old group'),hids=['work-one','work-two'];const rows=hids.map((id,i)=>{const filePath=p.join(dateDir,id+'.png');fs.copyFileSync(p.join(__dirname,'../shared/official-image-metadata-fixtures/gray-alpha-16-adam7.png'),filePath);return {id,filePath,date,fileUrl:require('node:url').pathToFileURL(filePath).href,groupId:group.id,createdAt:date+'T12:00:00Z',params:types.DEFAULT_PARAMS,model:types.DEFAULT_PARAMS.model,actualSeed:i,width:3,height:2};});store.addHistory(rows);
 await commit('rename_history_group',{id:group.id,name:'new group'});assert((await call('list_history_groups')).groups.some(x=>x.name==='new group'));
 const rn=await commit('rename_history_images',{items:hids.map((id,i)=>({id,name:'renamed-'+i}))});assert(rn.applied);for(const row of rn.items)assert(fs.existsSync(p.join(dateDir,row.name)));
 const md=await call('read_image_metadata_batch',{images:[hids[0],'not-a-real-image']});assert.equal(md.items.length,2);assert(md.items[0].ok&&md.items[0].data.found);assert.equal(md.items[0].data.parameters.seed,424242);assert(!md.items[1].ok);
 const fav=await commit('favorite_history_images',{ids:hids});assert(fav.applied);assert.equal((await call('list_local_favorites')).total,1);
 const fid=(await call('list_local_favorites')).items[0].id;assert((await commit('manage_local_favorites',{action:'rename',items:[{id:fid,name:'library-copy'}]})).applied);
 const zip=p.join(dir,'sample.zip'),save=dialog.showSaveDialog;dialog.showSaveDialog=async()=>({canceled:false,filePath:zip});try{const r=await call('export_history_zip',{ids:hids});assert.equal(r.count,2);assert.equal(Object.keys((await require('jszip').loadAsync(fs.readFileSync(zip))).files).length,2);}finally{dialog.showSaveDialog=save;}
 console.log('PASS history group rename, batch physical rename, metadata/missing ID, favorites dedup, ZIP with two members (test save destination)');
 // Test the default-cancel and approval branches without giving an MCP caller the ability to approve.
 const show=dialog.showMessageBox;let response=0,dialogCount=0,change=null;
 dialog.showMessageBox=async(w,opts)=>{assert(w&&!w.isDestroyed());assert.equal(opts.defaultId,0);assert.equal(opts.cancelId,0);assert(opts.detail.includes('['));dialogCount++;if(change)change();return {response,checkboxChecked:false};};
 try{
   const del={kind:'history',ids:hids},pre=await call('delete_workspace_resources',del);assert.equal(dialogCount,0);
   await assert.rejects(call('delete_workspace_resources',{...del,confirmed:true,revision:pre.revision}));assert.equal(dialogCount,0);
   const a={...del,revision:pre.revision};assert((await call('delete_workspace_resources',a)).cancelled);assert(fs.existsSync(p.join(dateDir,rn.items[0].name)));
   response=1;change=()=>fs.appendFileSync(p.join(dateDir,rn.items[0].name),Buffer.from([0]));await assert.rejects(call('delete_workspace_resources',a));change=null;
   const removed=await commit('delete_workspace_resources',del);assert.deepEqual(removed.deletedIds.sort(),hids.slice().sort());assert(!fs.existsSync(p.join(dateDir,rn.items[0].name)));
   const d=await commit('delete_reference_presets',{ids});assert(d.applied);assert.equal((await call('list_reference_presets',{group:'lab'})).total,0);
   assert((await commit('manage_local_favorites',{action:'unlist',items:[{id:fid}]})).filesRetained);assert.equal((await call('list_local_favorites')).total,0);assert(fs.readdirSync(p.join(dir,'favorites')).some(x=>x.endsWith('.png')));
   assert((await commit('delete_workspace_resources',{kind:'style',ids:['one']})).applied);assert(!(await call('list_style_assets')).items.some(r=>r.id==='one'));
   const chunks=await call('browse_prompt_library',{kind:'chunk',query:'resource A'});assert((await commit('delete_workspace_resources',{kind:'chunk',ids:[chunks.items[0].id]})).applied);
 }finally{dialog.showMessageBox=show;}
 if(process.platform==='win32'&&process.argv.includes('--native-delete')){
   require("electron").BrowserWindow.getAllWindows()[0].show();assert(dir.startsWith(os.tmpdir())&&app.getPath('userData')===dir);
   const fixture=await commit('edit_prompt_library',{kind:'chunk',items:[{name:'isolated-native-dialog',text:'test'}]});
   const args={kind:'chunk',ids:[fixture.items[0].id]};const pre=await call('delete_workspace_resources',args);
   for(const choice of ['取消','永久删除']){
     const script=fs.readFileSync(p.join(__dirname,'check-mcp-delete-dialog.ps1'),'utf8').replace(/^param.*$/m,'');
     const code='$OwnerPid='+process.pid+';$Choice="'+choice+'";'+script;
     const answer=new Promise((resolve,reject)=>cp.execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,timeout:18000},(e,out,err)=>e?reject(new Error(err)):resolve(out)));
     const [r]=await Promise.all([call('delete_workspace_resources',{...args,revision:pre.revision}),answer]);assert(choice==='取消'?r.cancelled:r.applied);
   }
   assert.equal((await call('browse_prompt_library',{kind:'chunk',query:'isolated-native-dialog'})).total,0);console.log('PASS Windows native confirmation window: Cancel then Delete, isolated fixture only');
 }
 console.log('PASS permanent delete: preview only, client cannot confirm, cancel retained files, changed-during-confirmation rejected, approved fixture resources removed (scripted dialog answers)');
};
