import {afterEach,it,expect,vi} from 'vitest';
import http from 'node:http';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
const config=vi.hoisted(()=>({settings:{proxyMode:'auto',proxyForUpdate:true,proxyForAi:true,proxyUrl:''}}));
vi.mock('./store',()=>({getSettings:()=>config.settings}));
import {configureSystemProxyResolver} from './proxy';
import {downloadRequest,updateFetch} from './download-request';
const servers:http.Server[]=[];
afterEach(async()=>{configureSystemProxyResolver(undefined);config.settings.proxyMode='auto';config.settings.proxyForUpdate=true;await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));});
async function serve(handler:http.RequestListener){const s=http.createServer(handler);servers.push(s);s.listen(0,'127.0.0.1');await once(s,'listening');return (s.address() as AddressInfo).port;}
it('real HTTP requests traverse the configured proxy and resolve a redirected CDN separately',async()=>{
 const seen:string[]=[];
 const port=await serve((req,res)=>{seen.push(req.url!);if(req.url!.includes('metadata.invalid')){res.writeHead(302,{Location:'http://cdn.invalid/file'});res.end();}else res.end('fixture-asset');});
 const resolved:string[]=[];configureSystemProxyResolver(async url=>{resolved.push(url);return `PROXY 127.0.0.1:${port}`;});
 const response=await updateFetch('http://metadata.invalid/asset');
 expect(await response.text()).toBe('fixture-asset');
 expect(seen).toEqual(['http://metadata.invalid/asset','http://cdn.invalid/file']);expect(resolved).toEqual(seen);
});
it('manual proxy and disabled category do not depend on environment proxy variables',async()=>{
 const port=await serve((_req,res)=>res.end('via-manual'));
 config.settings.proxyMode='manual';config.settings.proxyUrl=`http://127.0.0.1:${port}`;
 expect(await (await updateFetch('http://no-dns.invalid/file')).text()).toBe('via-manual');
 config.settings.proxyForUpdate=false;
 const direct=await serve((_req,res)=>res.end('direct'));
 expect(await(await updateFetch(`http://127.0.0.1:${direct}/`)).text()).toBe('direct');
});
it('AI model redirects also resolve the actual URL and user abort interrupts a stalled body',async()=>{
 const resolved:string[]=[];
 const port=await serve((req,res)=>{if(req.url!.includes('/first')){res.writeHead(307,{location:'http://model-cdn.invalid/slow'});res.end();}else{res.writeHead(200);res.write('partial');}});
 configureSystemProxyResolver(async url=>{resolved.push(url);return `PROXY 127.0.0.1:${port}`;});
 const stop=new AbortController();
 const response=await downloadRequest('ai','http://model.invalid/first',{signal:stop.signal});
 const body=(async()=>{for await(const _chunk of response.data){/* bounded by cancellation */}})();
 stop.abort();await expect(body).rejects.toThrow();
 expect(resolved).toEqual(['http://model.invalid/first','http://model-cdn.invalid/slow']);
});
