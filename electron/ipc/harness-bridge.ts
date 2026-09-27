import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {AgentToolBridgeRequest, AgentToolBridgeResponse} from '../../src/agent/types';

export async function startHarnessBridge(options: {
  journal: string; tools: readonly string[];
  execute: (request: AgentToolBridgeRequest) => Promise<AgentToolBridgeResponse>;
}) {
  const token=crypto.randomBytes(32).toString('hex');
  const tasks=new Map<string,Promise<AgentToolBridgeResponse>>();
  await fs.mkdir(options.journal,{recursive:true});
  const server=http.createServer(async (req,res)=>{
    const send=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    // This API is for the child process, not cross-origin web pages.
    if(req.headers.origin || req.headers.authorization!==`Bearer ${token}`) {send(403,{error:'Forbidden'});return;}
    if(req.method!=='POST' || req.url!=='/v1/tool') {send(404,{error:'Not found'});return;}
    try {
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>512*1024){send(413,{error:'Request too large'});return;}}
      const raw=JSON.parse(body);
      if(!options.tools.includes(raw.tool) || !raw.args || typeof raw.args!=='object' || Array.isArray(raw.args) ||
         typeof raw.callId!=='string' || !raw.callId || raw.callId.length>200 || typeof raw.sessionId!=='string' || raw.sessionId.length>200) {
        send(400,{error:'Invalid tool request'});return;
      }
      // Never accept caller-supplied promptLocks. Studio owns locked style/negative prompt state.
      const request:AgentToolBridgeRequest={tool:raw.tool,args:raw.args,callId:raw.callId,sessionId:raw.sessionId};
      const id=crypto.createHash('sha256').update(`${request.sessionId}\n${request.callId}`).digest('hex');
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const file=path.join(options.journal,`${id}.json`);
      let saved: {fingerprint:string;result?:AgentToolBridgeResponse} | null=null;
      try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(saved && saved.fingerprint!==fingerprint){send(409,{error:'Call ID already used with different input'});return;}
      if(saved?.result){send(200,saved.result);return;}
      let work=tasks.get(id);
      if(!work){
        if(saved){send(409,{error:'Previous call outcome uncertain. Inspect history; do not resubmit a paid job.'});return;}
        work=(async()=>{
          await fs.writeFile(file,JSON.stringify({fingerprint,state:'pending'}),{flag:'wx'});
          const result=await options.execute(request);
          await fs.writeFile(file+'.tmp',JSON.stringify({fingerprint,state:'complete',result}));
          await fs.rename(file+'.tmp',file);return result;
        })();
        tasks.set(id,work);void work.finally(()=>tasks.delete(id)).catch(()=>{});
      }
      send(200,await work);
    }catch(error){send(500,{error:error instanceof Error?error.message:'Bridge error'});}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=(server.address() as import('node:net').AddressInfo).port;
  return {
    env:{STUDIO_BRIDGE_URL:`http://127.0.0.1:${port}`,STUDIO_BRIDGE_TOKEN:token},
    close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));},
  };
}
