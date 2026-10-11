const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),sha=process.argv[4];
fs.mkdirSync(out,{recursive:true});
const actual=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();assert.equal(actual,sha);
const req=require('node:module').createRequire(path.join(root,'package.json')),electron=req('electron');
const runs=[];
const groups=[
 ['metadata','desktop-metadata.cjs',[sha],['metadata-import','tools']],
 ['generation','windows-generation-acceptance.cjs',['MODIFIED'],['generation','effort']],
 ['image-actions','current-image-actions-probe.cjs',[sha],['image-to-image','enhance','inpaint','postprocess','openai-inpaint']],
 ['first-request','backend-fixture.cjs',[],['convert','reverse','metadata-import']],
 ['works','works-fixture.cjs',[],['works','works-batch-edit','missing-file-reconciliation']],
 ['records-ui','ui-probe.cjs',[],['ai-records','typography','works-batch-edit']],
 ['network','desktop-network.cjs',[sha],['external-mcp-server','online-gallery','agent-components']],
 ['breadth','desktop-breadth.cjs',[sha],['accounts','characters','image-agent','agent-components','backup','settings','typography']],
 ['storage','desktop-storage.cjs',[sha],['settings','typography','negative-prompts','styles','reference-presets','precise-reference','vibe-transfer','favorites','metadata-import','tools']],
];
for(const [name,fixture,args,features] of groups.filter(x=>process.argv[5]==='all'||(process.argv[5]==='storage'?x[0]==='storage':process.argv[5]==='network'?x[0]==='network':process.argv[5]==='breadth'?x[0]==='breadth':!['storage','network','breadth'].includes(x[0])))) {
 const report=path.join(out,name+'.json');const file=path.join(__dirname,fixture);
 const command=fixture==='ui-probe.cjs'?[process.execPath,file,root,report]:[electron,file,root,report,...args,'--no-error-dialogs'];
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const p=cp.spawnSync(command[0],command.slice(1),{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join(out,name+'-stdout.log'),p.stdout??'');fs.writeFileSync(path.join(out,name+'-stderr.log'),p.stderr??'');
 let data;try{data=JSON.parse(fs.readFileSync(report,'utf8'));}catch{}
 const pass=p.status===0 && data?.pass===true;
 const execution={name,sourceSha:sha,platform:process.platform,command,stdout:p.stdout??'',stderr:p.stderr??'',exitStatus:p.status,signal:p.signal,error:p.error?.message,pass,features,kind:'integration',skipped:false,paidCalls:0,fixtureSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),report,reportSha256:fs.existsSync(report)?crypto.createHash('sha256').update(fs.readFileSync(report)).digest('hex'):null};
 runs.push(execution);console.log('NATIVE_DESKTOP_RESULT',JSON.stringify({name,platform:process.platform,pass,exitStatus:p.status,cases:data?.cases?.length,layouts:data?.layouts?.length,error:data?.error}));
}
const evidence={schema:1,sourceSha:sha,platform:process.platform,runtime:process.versions,checks:runs,pass:runs.every(r=>r.pass),full39FeatureAcceptance:false,paidCalls:0};
fs.writeFileSync(path.join(out,'execution.json'),JSON.stringify(evidence,null,2));process.exitCode=evidence.pass?0:1;
