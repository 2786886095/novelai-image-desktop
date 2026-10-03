const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const target=path.resolve(process.argv[4] || process.argv[2]);
const deps=Module.createRequire(target+'/package.json');const ts=deps('typescript');
const root=__dirname, results=[], sourceRoot=path.resolve(process.argv[2]), runRoot=path.resolve(process.argv[3]);
const candidate={method:'relay',label:'SYNTHETIC QA',token:'SYNTHETIC_TEST_ONLY',apiBaseUrl:'https://relay.invalid',imageBaseUrl:''};
function environment(name){
 const dir=path.join(runRoot,'fixtures',name);fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,'nai-accounts-v1.json'); fs.writeFileSync(file,JSON.stringify({version:1,managed:true,legacyMigrated:true,accounts:[]}));
 const handlers=new Map(),cache=new Map(),requests=[];let renames=0,writes=0,failAt=Infinity,failWriteAt=Infinity,loginOk=true;
 const mockFs={...fs,writeFileSync:(...args)=>{writes++;if(writes===failWriteAt)throw Error('SYNTHETIC_WRITE');return fs.writeFileSync(...args)},renameSync:(a,b)=>{renames++;if(renames===failAt)throw Object.assign(Error('SYNTHETIC_EACCES'),{code:'EACCES'});fs.renameSync(a,b);}};
 const axios={get:async(url,config)=>{requests.push({method:'GET',url,authorization:config.headers.Authorization,maxRedirects:config.maxRedirects});return response(url)},post:async()=>{throw Error('FORBIDDEN_NETWORK_POST')}};
 let response=()=>({status:200,data:{subscription:{tier:0,trainingStepsLeft:0}}});
 const mocks={electron:{app:{getPath:()=>dir},ipcMain:{handle:(n,f)=>handlers.set(n,f)},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('synthetic-encrypted:'+s.split('').reverse().join('')),decryptString:b=>b.toString().slice(20).split('').reverse().join('')}},axios,fs:mockFs};
 function load(relative){const absolute=path.resolve(sourceRoot,relative);if(cache.has(absolute))return cache.get(absolute).exports;
 const mod={exports:{}};cache.set(absolute,mod);
 const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const localRequire=id=>{if(Object.hasOwn(mocks,id))return mocks[id];if(id==='./store')return {getSettings:()=>({}),readStore:()=>({settings:{}})};if(id==='./proxy')return {proxyConfigForUrl:async()=>({proxy:false})};if(id==='./nai-accounts-login')return {officialNovelAiLogin:async()=>loginOk?{ok:true,token:'SYNTHETIC_TEST_ONLY'}:{ok:false,code:'auth'}};if(id.startsWith('.'))return load(path.relative(sourceRoot,path.resolve(path.dirname(absolute),id+'.ts')));if(id.startsWith('node:')||['path','crypto'].includes(id))return require(id);throw Error('Unmocked dependency: '+id);};
 new Function('require','module','exports',code)(localRequire,mod,mod.exports);return mod.exports;}
 const api=load('electron/ipc/nai-accounts.ts');api.registerNaiAccountsIpc();handlers.get('naiAccounts:list')({});
 return {load,requests,file,dir,call:(name,...args)=>handlers.get('naiAccounts:'+name)({},...args),setResponse:fn=>response=fn,setFail:n=>failAt=n,getRenames:()=>renames,getWrites:()=>writes,setWriteFail:n=>failWriteAt=n,setLoginOk:ok=>loginOk=ok,resetCounts:()=>{renames=0;writes=0;}};
}
async function test(name,fn){try{await fn();console.log('PASS '+name);results.push({name,pass:true});}catch(e){console.log('FAIL '+name+' '+e.message);results.push({name,pass:false,error:String(e)});}}
const candidates={token:{...candidate,method:'token',apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net'},relay:candidate,login:{label:'SYNTHETIC LOGIN',email:'qa@example.invalid',password:'NOT_REAL',otp:'000000'}};
async function add(e,method,overrides={}){const input={...candidates[method],...overrides};const result=await e.call(method==='login'?'login':'add',input);if(method==='login'){assert.equal(input.password,'');assert.equal(input.otp,undefined);return result.ok?result.account:result;}return result;}
(async()=>{
for(const method of Object.keys(candidates)){
 for(const fault of ['write','rename'])await test(method+' second '+fault+' must not be attempted',async()=>{
  const e=environment(method+'-second-'+fault);fault==='write'?e.setWriteFail(2):e.setFail(2);let saved,error;
  try{saved=await add(e,method);}catch(err){error=err.message;}
  if(error)assert.equal(e.call('list').length,0,'rejected save left account in memory; diskAccounts='+JSON.parse(fs.readFileSync(e.file)).accounts.length+' error='+error);
  assert.equal(error,undefined,'single atomic commit must not encounter second-write injection');assert.ok(saved.id);assert.equal(e.getWrites(),1);assert.equal(e.getRenames(),1);
 });
 for(const balance of [0,undefined])await test(method+' '+(balance===0?'known0':'unknown')+' single encrypted commit/cache/selection',async()=>{
  const e=environment(method+'-'+String(balance));e.setResponse(()=>({status:200,data:{subscription:{tier:0,...(balance===0?{trainingStepsLeft:0}:{})}}}));e.setFail(2);e.setWriteFail(2);
  const profile=await add(e,method);assert.ok(profile.id);assert.equal(e.getRenames(),1);assert.equal(e.getWrites(),1);const disk=JSON.parse(fs.readFileSync(e.file));assert.equal(disk.accounts.length,1);assert.equal(disk.accounts[0].accountSummary.anlasBalance,balance);assert.equal(disk.accounts[0].token,undefined);assert.ok(disk.accounts[0].encryptedToken);assert.ok(!fs.readFileSync(e.file,'utf8').includes('SYNTHETIC_TEST_ONLY'));assert.equal(e.call('state').selectedId,undefined);
  const runtime=e.load('electron/ipc/nai-accounts-runtime.ts');assert.equal(runtime.currentNaiAccount(),undefined);const summary=runtime.getNaiAccountSummary({...profile,token:'SYNTHETIC_TEST_ONLY'});assert.equal(summary.anlasBalance,balance);assert.equal(summary.stale,balance===undefined);assert.equal(summary.hasToken,true);assert.equal(summary.hasActiveSubscription,false);
 });
 for(const fault of ['write','rename'])await test(method+' '+fault+' failure no disk/memory residue + retry + duplicate',async()=>{
  const e=environment(method+'-'+fault),before=fs.readFileSync(e.file,'utf8');fault==='write'?e.setWriteFail(1):e.setFail(1);await assert.rejects(add(e,method),/SYNTHETIC/);assert.equal(fs.readFileSync(e.file,'utf8'),before);assert.deepEqual(e.call('list'),[]);assert.equal(e.call('state').selectedId,undefined);assert.deepEqual(fs.readdirSync(e.dir),['nai-accounts-v1.json']);
  e.setWriteFail(Infinity);e.setFail(Infinity);e.resetCounts();const saved=await add(e,method);assert.ok(saved.id);assert.equal(e.getRenames(),1);const after=fs.readFileSync(e.file,'utf8');await assert.rejects(add(e,method,{label:'Different display name'}),/NAI_ACCOUNT_DUPLICATE/);assert.equal(fs.readFileSync(e.file,'utf8'),after);assert.equal(e.call('list').length,1);
 });
 await test(method+' failed account auth no save',async()=>{const e=environment(method+'-auth'),before=fs.readFileSync(e.file,'utf8');e.setResponse(()=>({status:401}));if(method==='login')assert.equal((await add(e,method)).ok,false);else await assert.rejects(add(e,method),/NAI_ACCOUNT_VALIDATION/);assert.equal(fs.readFileSync(e.file,'utf8'),before);assert.equal(e.getWrites(),0);assert.equal(e.call('list').length,0);});
}
for(const method of ['token','relay'])await test(method+' empty token no auth or save',async()=>{const e=environment(method+'-empty');await assert.rejects(add(e,method,{token:' '}),/invalid-input/);assert.equal(e.requests.length,0);assert.equal(e.getWrites(),0);assert.equal(e.call('list').length,0);});
await test('login authentication rejected no account validation/save',async()=>{const e=environment('login-reject');e.setLoginOk(false);assert.equal((await add(e,'login')).ok,false);assert.equal(e.requests.length,0);assert.equal(e.getWrites(),0);});
await test('relay models-only unknown balance remains absent',async()=>{const e=environment('relay-models');e.setResponse(url=>url.endsWith('/v1/models')?{status:200,data:{object:'list',data:[{id:'nai-diffusion-5-full'}]}}:{status:404});const p=await add(e,'relay');assert.equal(e.getRenames(),1);assert.equal(JSON.parse(fs.readFileSync(e.file)).accounts[0].accountSummary,undefined);const r=e.load('electron/ipc/nai-accounts-runtime.ts');assert.equal(r.getNaiAccountSummary({...p,token:candidate.token}).anlasBalance,undefined);});
await test('selected account/cache/status unchanged when another added',async()=>{const e=environment('selection');const a=await add(e,'token');e.call('select',a.id);const r=e.load('electron/ipc/nai-accounts-runtime.ts'),before=r.getNaiAccountSummary();e.resetCounts();const b=await add(e,'relay');assert.notEqual(a.id,b.id);assert.equal(e.getRenames(),1);assert.equal(e.call('state').selectedId,a.id);assert.equal(e.call('state').busy,false);assert.deepEqual(r.getNaiAccountSummary(),before);});
await test('duplicate API+Token cross-method; distinct API allowed',async()=>{const e=environment('identity');await add(e,'token');await assert.rejects(add(e,'login'),/NAI_ACCOUNT_DUPLICATE/);await add(e,'relay');assert.equal(e.call('list').length,2);});
const failed=results.filter(r=>!r.pass).length;console.log('TOTAL '+results.length+' PASS '+(results.length-failed)+' FAIL '+failed);fs.mkdirSync(runRoot,{recursive:true});fs.writeFileSync(path.join(runRoot,'results.json'),JSON.stringify(results,null,2));process.exitCode=failed?1:0;
})();
