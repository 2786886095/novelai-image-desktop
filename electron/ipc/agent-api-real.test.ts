import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import {it,expect,vi,afterAll} from 'vitest';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:(key:string)=>key==='exe'?`${fixture.root}/app/Studio.exe`:`${fixture.root}/${key}`,getAppPath:()=>fixture.root,getVersion:()=> 'test',isPackaged:false},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(v:string)=>Buffer.from(v).map(x=>x^73),decryptString:(b:Buffer)=>Buffer.from(b).map(x=>x^73).toString()},dialog:{showMessageBox:()=>{throw Error('Native confirmation must not be used')}}}));
import {createApiTools,desktopApiAdapter,API_TOOLS} from './agent-api-tools';
import {startHarnessBridge} from './harness-bridge';
import {getSettings,setSetting} from './store';
fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-api-real-'));afterAll(()=>fs.rmSync(fixture.root,{recursive:true,force:true}));
it('real storage, encrypted credential, loopback bridge, no plaintext journal and no redirect',async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/models'){expect(req.headers.authorization).toBe('Bearer fixture-key-only');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'test-model'},{id:'fixture-key-only'}]}));}else{res.writeHead(302,{Location:'/models'});res.end();}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as import('node:net').AddressInfo).port;
 const approve=vi.fn(async()=>true),api=createApiTools(desktopApiAdapter(),approve);const journal=path.join(fixture.root,'journal');const bridge=await startHarnessBridge({journal,tools:API_TOOLS,execute:api.execute});let n=0;
 const call=async(tool:string,args:Record<string,unknown>)=>{const res=await fetch(bridge.env.STUDIO_BRIDGE_URL+'/v1/tool',{method:'POST',headers:{Authorization:'Bearer '+bridge.env.STUDIO_BRIDGE_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({tool,args,sessionId:'one',callId:'api-'+n++})});expect(res.status).toBe(200);return res.json();};
 try{
  setSetting('proxyMode','direct');let read=await call('langbai_api',{action:'read',profile:'convert'});expect(read.ok,read.output).toBe(true);
  const configured=await call('langbai_api',{action:'configure',profile:'convert',expectedRevision:read.data.revision,patch:{baseUrl:`http://127.0.0.1:${port}`,model:'fixture-model'}});expect(configured.ok,configured.output).toBe(true);expect(getSettings().convertApiModel).toBe('fixture-model');
  read=await call('langbai_api',{action:'read',profile:'convert'});await call('langbai_api',{action:'credential',profile:'convert',expectedRevision:read.data.revision});const pending=await call('studio_api_input',{});const saved=await call('studio_resolve_api_input',{id:pending.data.id,value:'fixture-key-only'});expect(saved.ok,saved.output).toBe(true);expect(JSON.stringify(saved)).not.toContain('fixture-key-only');
  const tested=await call('langbai_api',{action:'test',profile:'convert'});expect(tested.ok,tested.output).toBe(true);expect(tested.data.models).toEqual(['test-model']);
  for(const file of fs.readdirSync(journal))expect(fs.readFileSync(path.join(journal,file),'utf8')).not.toContain('fixture-key-only');
  setSetting('convertApiUrl',`http://127.0.0.1:${port}/redirect`);expect((await call('langbai_api',{action:'test',profile:'convert'})).ok).toBe(false);expect(approve).toHaveBeenCalledTimes(1);
 }finally{await bridge.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
