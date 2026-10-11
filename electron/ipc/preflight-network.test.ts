import {readFileSync} from 'node:fs';
import {createServer as httpsServer, Agent} from 'node:https';
import {createServer as tcpServer,connect} from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
import axios from 'axios';
import {describe,it,expect} from 'vitest';
import {compactRemoteErrorText} from '../../src/error-message';
const cert=readFileSync('shared/issue-network-fixtures/public-test-cert.pem');
const key=readFileSync('shared/issue-network-fixtures/public-test-key.pem');
function production(selected=true) {
 const ast=ts.createSourceFile('nai.ts',readFileSync('electron/ipc/nai.ts','utf8'),ts.ScriptTarget.Latest,true);
 const code=['isPreflightNetworkFailure','requestWithRetry'].map(name=>ast.statements.find((n):n is ts.FunctionDeclaration=>ts.isFunctionDeclaration(n)&&n.name?.text===name)!.getText(ast)).join('\n');
 return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText+'\n({requestWithRetry,isPreflightNetworkFailure})',{exports:{},currentNaiAccount:()=>selected?{}:undefined,axios,sleep:async()=>{},Number,Math});
}
async function fixture(dropBeforeTls=1,status=200,dropAfterPost=false){
 let connections=0,posts=0;
 const sockets=new Set<any>();
 const tls=httpsServer({key,cert},(req,res)=>{posts++;req.resume();req.on('end',()=>{if(dropAfterPost)req.socket.destroy();else{res.writeHead(status,{'Content-Type':'application/json'});res.end('{"ok":true}');}});});
 tls.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 tls.on('tlsClientError',()=>{});
 await new Promise<void>(r=>tls.listen(0,'127.0.0.1',r));
 const proxy=tcpServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));connections++;if(connections<=dropBeforeTls){s.once('data',()=>s.end());return;}
  const upstream=connect((tls.address() as any).port,'127.0.0.1');sockets.add(upstream);upstream.on('close',()=>sockets.delete(upstream));s.on('error',()=>upstream.destroy());upstream.on('error',()=>s.destroy());s.pipe(upstream);upstream.pipe(s);
 });
 await new Promise<void>(r=>proxy.listen(0,'127.0.0.1',r));
 return {url:'https://127.0.0.1:'+(proxy.address() as any).port,read:()=>({connections,posts}),
  close:async()=>{sockets.forEach(s=>s.destroy());await Promise.all([new Promise<void>(r=>proxy.close(()=>r())),new Promise<void>(r=>tls.close(()=>r()))]);}};
}
describe('#69 actual TLS transport / selected-account precharge boundary',()=>{
 it('recovers one verified pre-TLS disconnect; exactly one HTTP POST is submitted',async()=>{
  const f=await fixture(),p=production(),agent=new Agent({ca:cert});
  try {const r=await p.requestWithRetry(()=>axios.post(f.url+'/ai/generate-image',{fixture:true},{httpsAgent:agent,proxy:false,timeout:3000}),{retryPreflightNetworkFailures:true});
   console.log('ISSUE69_REAL_TLS',JSON.stringify(f.read()));expect(r.status).toBe(200);expect(f.read()).toEqual({connections:2,posts:1});
  } finally {agent.destroy();await f.close();}
 });
 it.each([500,429])('never replays a selected-account HTTP %i rejection',async status=>{
  const f=await fixture(0,status),p=production(),agent=new Agent({ca:cert});
  try {await expect(p.requestWithRetry(()=>axios.post(f.url,{}, {httpsAgent:agent,proxy:false}),{retryPreflightNetworkFailures:true})).rejects.toBeTruthy();expect(f.read().posts).toBe(1);}
  finally {agent.destroy();await f.close();}
 });
 it('never replays an ambiguous disconnect after a submitted body',async()=>{
  const f=await fixture(0,200,true),p=production(),agent=new Agent({ca:cert});
  try {await expect(p.requestWithRetry(()=>axios.post(f.url,{}, {httpsAgent:agent,proxy:false}),{retryPreflightNetworkFailures:true})).rejects.toBeTruthy();expect(f.read()).toEqual({connections:1,posts:1});}
  finally {agent.destroy();await f.close();}
 });
 it('still rejects untrusted certificates; no HTTP body is received',async()=>{
  const f=await fixture(0),p=production();
  try {await expect(p.requestWithRetry(()=>axios.post(f.url,{}, {proxy:false}),{retryPreflightNetworkFailures:true})).rejects.toBeTruthy();expect(f.read()).toEqual({connections:1,posts:0});}
  finally {await f.close();}
 });
 it('bounds repeated handshake disconnects without ever submitting a body',async()=>{
  const f=await fixture(99),p=production(),agent=new Agent({ca:cert});
  try {await expect(p.requestWithRetry(()=>axios.post(f.url,{}, {httpsAgent:agent,proxy:false}),{retryPreflightNetworkFailures:true,retries:2})).rejects.toBeTruthy();expect(f.read()).toEqual({connections:3,posts:0});}
  finally {agent.destroy();await f.close();}
 });
 it('only the exact ECONNRESET pre-TLS diagnostic is classified safe',()=>{
  const p=production();
  for(const e of [{code:'ECONNRESET',message:'socket hang up'},{code:'ETIMEDOUT',message:'TLS handshake timed out'},{code:'ERR_SSL_HANDSHAKE_FAILURE',message:'TLS handshake failed'},{code:'CERT_HAS_EXPIRED',message:'before secure TLS connection was established'},{code:'ECONNRESET',message:'before secure TLS connection was established',response:{status:500}}])expect(p.isPreflightNetworkFailure(e)).toBe(false);
 });
 it('shows an actionable bounded message without credentials/URLs',()=>{
  const result=compactRemoteErrorText('Client network socket disconnected before secure TLS connection was established; https://user:secret@example.invalid?token=secret');
  expect(result).toContain('安全连接前断开');expect(result).toContain('代理');expect(result).not.toContain('secret');expect(result).not.toContain('example.invalid');
 });
});
