import {afterEach,expect,it,vi} from 'vitest';
import http from 'node:http';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
vi.mock('./proxy',()=>({proxyConfig:()=>({proxy:false})}));
import * as client from './mcp-client';
const servers:http.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));});
const schemas=[
 {name:'search_tags',description:'Search',inputSchema:{type:'object',properties:{query:{type:'string'},limit:{type:'integer'}}}},
 {name:'get_related_tags',inputSchema:{type:'object',properties:{tags:{type:'array',items:{type:'string'}},limit:{type:'integer'}},required:['tags']}},
 {name:'get_artist_recommendations',inputSchema:{type:'object',properties:{description:{type:'string'},top_k:{type:'integer'}}}},
];
async function fixture(options:{cycle?:boolean;error?:boolean;toolError?:boolean}={}){
 const requests:any[]=[];
 const server=http.createServer(async(req,res)=>{
  const parts:Buffer[]=[];for await(const p of req)parts.push(p);const body=JSON.parse(Buffer.concat(parts).toString());requests.push(body);
  res.setHeader('Content-Type','application/json');res.setHeader('Mcp-Session-Id','owned-session');
  if(body.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
  const result=body.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{tools:{}}}:body.method==='tools/list'?options.error?undefined:{tools:body.params?.cursor?schemas.slice(1):schemas.slice(0,1),...(!body.params?.cursor||options.cycle?{nextCursor:'page-2'}:{})}:{...(options.toolError?{isError:true}:{}),content:[{type:'text',text:JSON.stringify({tags:[{tag:body.params.name}]})}]};
  res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,...(options.error&&body.method==='tools/list'?{error:{code:-32601,message:'owned unsupported discovery'}}:{result})}));
 });servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 return {requests,config:{type:'http' as const,url:`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/mcp`,apiKey:'',tool:'search_tags',command:'',args:''}};
}
const discover=(config:client.McpConfig)=>(client as unknown as {mcpListTools:(c:client.McpConfig)=>Promise<typeof schemas>}).mcpListTools(config);
it('discovers every paginated tool with schema, without tools/call',async()=>{
 const f=await fixture();const tools=await discover(f.config);expect(tools.map(t=>t.name)).toEqual(schemas.map(t=>t.name));expect(tools[1].inputSchema).toEqual(schemas[1].inputSchema);expect(f.requests.map(r=>r.method)).toEqual(['initialize','notifications/initialized','tools/list','tools/list']);expect(f.requests[3].params).toEqual({cursor:'page-2'});
});
it('three tools receive their own schema, including tag arrays, not the first tool schema',async()=>{
 const f=await fixture();for(const tool of schemas)await client.mcpSearch({...f.config,tool:tool.name},'rain, blue eyes',7);
 const calls=f.requests.filter(r=>r.method==='tools/call');expect(calls.map(r=>r.params)).toEqual([
  {name:'search_tags',arguments:{query:'rain, blue eyes',limit:7}},
  {name:'get_related_tags',arguments:{tags:['rain','blue eyes'],limit:7}},
  {name:'get_artist_recommendations',arguments:{description:'rain, blue eyes',top_k:7}},
 ]);
});
it('does not call a different tool when the selected tool disappeared',async()=>{
 const f=await fixture();await expect(client.mcpSearch({...f.config,tool:'missing_tool'},'rain',5)).rejects.toThrow();expect(f.requests.some(r=>r.method==='tools/call')).toBe(false);
});
it('reports discovery failure without calling any tool',async()=>{const f=await fixture({error:true});await expect(discover(f.config)).rejects.toThrow();expect(f.requests.some(r=>r.method==='tools/call')).toBe(false);});
it('stops cyclic pagination instead of looping or silently truncating',async()=>{const f=await fixture({cycle:true});await expect(discover(f.config)).rejects.toThrow();expect(f.requests.length).toBeLessThan(8);});
it('tool isError cannot be shown as successful tags',async()=>{const f=await fixture({toolError:true});await expect(client.mcpSearch(f.config,'rain',5)).rejects.toThrow();});
it('legacy SSE discovery lists paginated tools without calling any, then invokes the selected schema',async()=>{
 let stream:http.ServerResponse|undefined;const requests:any[]=[];
 const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'){stream=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('event: endpoint\ndata: /rpc\n\n');return;}
  const parts:Buffer[]=[];for await(const p of req)parts.push(p);const body=JSON.parse(Buffer.concat(parts).toString());requests.push(body);
  if(body.id!==undefined){const result=body.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{}}:body.method==='tools/list'?{tools:body.params?.cursor?schemas.slice(1):schemas.slice(0,1),...(!body.params?.cursor?{nextCursor:'page-2'}:{})}:{content:[{type:'text',text:'rain'}]};stream!.write('data: '+JSON.stringify({jsonrpc:'2.0',id:body.id,result})+'\n\n');}res.writeHead(202);res.end();
 });servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const config={type:'sse' as const,url:`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/sse`,tool:'get_related_tags',apiKey:'',command:'',args:''};
 expect((await discover(config)).map(t=>t.name)).toEqual(schemas.map(t=>t.name));expect(requests.some(r=>r.method==='tools/call')).toBe(false);await client.mcpSearch(config,'rain, blue eyes',4);expect(requests.at(-1).params).toEqual({name:'get_related_tags',arguments:{tags:['rain','blue eyes'],limit:4}});
});
it('real owned stdio process discovers multiple pages without tools/call and uses selected schema',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-stdio-owned-')),file=path.join(dir,'server.cjs'),log=path.join(dir,'calls.jsonl');
 fs.writeFileSync(file,`const fs=require('fs'),rl=require('readline').createInterface({input:process.stdin});const schemas=${JSON.stringify(schemas)};rl.on('line',line=>{const b=JSON.parse(line);fs.appendFileSync(${JSON.stringify(log)},line+'\\n');if(b.id===undefined)return;const result=b.method==='initialize'?{protocolVersion:'2024-11-05',capabilities:{}}:b.method==='tools/list'?{tools:b.params?.cursor?schemas.slice(1):schemas.slice(0,1),...(!b.params?.cursor?{nextCursor:'page2'}:{})}:{content:[{type:'text',text:'rain'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:b.id,result})+'\\n');});`);
 try{const config={type:'stdio' as const,url:'',apiKey:'',command:process.execPath,args:file,tool:'get_artist_recommendations'};expect(await discover(config)).toHaveLength(3);expect(fs.readFileSync(log,'utf8')).not.toContain('tools/call');await client.mcpSearch(config,'rain',3);const calls=fs.readFileSync(log,'utf8').trim().split('\n').map(s=>JSON.parse(s));expect(calls.at(-1).params).toEqual({name:'get_artist_recommendations',arguments:{description:'rain',top_k:3}});}finally{fs.rmSync(dir,{force:true,recursive:true});}
});
