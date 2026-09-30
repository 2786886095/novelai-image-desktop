import {listenBrowserLoopback} from './browser-loopback';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {AgentToolBridgeRequest, AgentToolBridgeResponse} from '../../src/agent/types';

export async function startHarnessBridge(options: {
  journal: string; tools: readonly string[];
  execute: (request: AgentToolBridgeRequest) => Promise<AgentToolBridgeResponse>;
  /** App-owned handoff only; the durable result is written before this runs. */
  afterResponse?: (request:AgentToolBridgeRequest,result:AgentToolBridgeResponse,delivered:boolean)=>void|Promise<void>;
}) {
  const token=crypto.randomBytes(32).toString('hex');
  const tasks=new Map<string,{fingerprint:string;work:Promise<AgentToolBridgeResponse>}>();
  const writeReceipt=async(file:string,value:unknown,flag='w')=>{
    const fd=await fs.open(file,flag);
    try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}
  };
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
      const reply=(result:AgentToolBridgeResponse)=>{
        let notified=false;
        const notify=(delivered:boolean)=>{
          if(notified)return;notified=true;
          // Detach from this handler so stopping the Agent/bridge cannot deadlock.
          setImmediate(()=>{void Promise.resolve().then(()=>options.afterResponse?.(request,result,delivered)).catch(()=>{});});
        };
        res.once('finish',()=>notify(true));res.once('close',()=>notify(res.writableFinished));
        if(res.destroyed){notify(false);return;}
        send(200,result);
      };
      const id=crypto.createHash('sha256').update(`${request.sessionId}\n${request.callId}`).digest('hex');
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const file=path.join(options.journal,`${id}.json`);
      let saved: {fingerprint:string;result?:AgentToolBridgeResponse} | null=null;
      try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      if(saved && saved.fingerprint!==fingerprint){send(409,{error:'Call ID already used with different input'});return;}
      if(saved?.result){reply(saved.result);return;}
      const active=tasks.get(id);
      // Two first requests can both finish reading before the pending receipt
      // reaches disk. Bind the in-flight promise to its input as well.
      if(active && active.fingerprint!==fingerprint){send(409,{error:'Call ID already used with different input'});return;}
      let work=active?.work;
      if(!work){
        if(saved){send(409,{error:'Previous call outcome uncertain. Inspect history; do not resubmit a paid job.'});return;}
        work=(async()=>{
          await writeReceipt(file,{fingerprint,state:'pending'},'wx');
          const result=await options.execute(request);
          await writeReceipt(file+'.tmp',{fingerprint,state:'complete',result});
          await fs.rename(file+'.tmp',file);return result;
        })();
        tasks.set(id,{fingerprint,work});void work.finally(()=>tasks.delete(id)).catch(()=>{});
      }
      reply(await work);
    }catch(error){send(500,{error:error instanceof Error?error.message:'Bridge error'});}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  const port=await listenBrowserLoopback(server);
  return {
    env:{STUDIO_BRIDGE_URL:`http://127.0.0.1:${port}`,STUDIO_BRIDGE_TOKEN:token},
    close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));},
  };
}
