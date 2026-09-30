import {afterEach,expect,it} from 'vitest';
import http from 'node:http';
import sharp from 'sharp';
import {generateCompatibleImages} from './openai-images';
import {buildCompatibleImageRequest,imageGenerationEndpoint} from '../../src/image-provider-contract';
const servers:http.Server[]=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));});
async function server(handle:http.RequestListener){const s=http.createServer(handle);servers.push(s);await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(s.address() as import('node:net').AddressInfo).port}`;}
const key='fixture-private-key';
const request={prompt:'a quiet forest',size:'1024x1024',n:1};
const png=()=>sharp({create:{width:4,height:5,channels:3,background:'#abc'}}).withMetadata({exif:{IFD0:{ImageDescription:key}}}).png().toBuffer();
it('normalizes base/full routes and keeps response_format optional for providers that reject it',()=>{
 expect(imageGenerationEndpoint('https://gateway.example/v1/')).toBe('https://gateway.example/v1/images/generations');
 expect(imageGenerationEndpoint('https://gateway.example/v1/images/generations')).toBe('https://gateway.example/v1/images/generations');
 expect(buildCompatibleImageRequest({model:'custom-model'},request)).toEqual({model:'custom-model',...request});
 expect(()=>imageGenerationEndpoint('https://key:secret@example.com/v1')).toThrow();expect(()=>imageGenerationEndpoint('https://example.com/v1?key=secret')).toThrow();
 expect(()=>buildCompatibleImageRequest({model:'x'},{...request,extensions:{api_key:key}})).toThrow();
});
it('sends exactly one POST using the dedicated key and decodes actual base64 pixels',async()=>{
 const bytes=await png();let calls=0;const base=await server(async(req,res)=>{calls++;expect(req.url).toBe('/v1/images/generations');expect(req.headers.authorization).toBe('Bearer '+key);const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks).toString());expect(body).toEqual({model:'custom',...request,response_format:'b64_json'});res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{b64_json:bytes.toString('base64')}]}));});
 const result=await generateCompatibleImages({baseUrl:base+'/v1',model:'custom',apiKey:key,responseFormat:'b64_json'},request);
 expect(result.complete).toBe(true);expect(result.submitted).toBe(true);expect(calls).toBe(1);expect((await sharp(result.images[0]).metadata()).width).toBe(4);expect(JSON.stringify({...result,images:[]})).not.toContain(key);expect(result.images[0].includes(Buffer.from(key))).toBe(false);
});
it('downloads URL results without authorization and never follows a POST redirect',async()=>{
 const bytes=await png();let images=0,post=0;
 const base=await server((req,res)=>{if(req.url==='/image'){images++;expect(req.headers.authorization).toBeUndefined();res.end(bytes);}else{post++;res.end(JSON.stringify({data:[{url:base+'/image'}]}));}});
 expect((await generateCompatibleImages({baseUrl:base,apiKey:key,model:'custom'},request)).complete).toBe(true);expect(images).toBe(1);expect(post).toBe(1);
 let redirected=0;const second=await server((_req,res)=>{redirected++;res.end('{}');});const redirect=await server((_req,res)=>{res.writeHead(307,{location:second});res.end();});
 const failure=await generateCompatibleImages({baseUrl:redirect,apiKey:key,model:'custom'},request);expect(failure.complete).toBe(false);expect(failure.error?.status).toBe(307);expect(redirected).toBe(0);
});
it('upstream errors and network exceptions cannot leak headers, body or keys or trigger retries',async()=>{
 let calls=0;const base=await server((_req,res)=>{calls++;res.writeHead(429);res.end(JSON.stringify({error:{message:'Authorization: Bearer '+key}}));});
 const result=await generateCompatibleImages({baseUrl:base,apiKey:key,model:'custom'},request);expect(calls).toBe(1);expect(result.error?.status).toBe(429);expect(result.error?.message).toContain('429');expect(JSON.stringify(result)).not.toContain(key);
});
it('retains valid earlier images on malformed later data without regenerating',async()=>{
 const bytes=await png();let calls=0;const base=await server((_req,res)=>{calls++;res.end(JSON.stringify({data:[{b64_json:bytes.toString('base64')},{b64_json:'not base64'}]}));});
 const result=await generateCompatibleImages({baseUrl:base,apiKey:key,model:'x'},{...request,n:2});expect(result.complete).toBe(false);expect(result.images).toHaveLength(1);expect(result.error?.phase).toBe('decode');expect(calls).toBe(1);
});
it('pre-abort sends nothing; in-flight cancellation closes request without retry',async()=>{
 let calls=0;const base=await server(()=>{calls++;});const abort=new AbortController();abort.abort();
 const pre=await generateCompatibleImages({baseUrl:base,apiKey:key,model:'x'},request,{signal:abort.signal});expect(pre.submitted).toBe(false);expect(calls).toBe(0);
 const later=new AbortController();const pending=generateCompatibleImages({baseUrl:base,apiKey:key,model:'x'},request,{signal:later.signal});while(!calls)await new Promise(r=>setTimeout(r,5));later.abort();const r=await pending;expect(r.cancelled).toBe(true);expect(r.submitted).toBe(true);expect(calls).toBe(1);
});
it('enforces byte/time limits and reports ambiguous completion without retry',async()=>{
 let calls=0;const base=await server((_req,res)=>{calls++;res.end('x'.repeat(4096));});const result=await generateCompatibleImages({baseUrl:base,apiKey:key,model:'x'},request,{maxBytes:32});expect(result.complete).toBe(false);expect(result.submitted).toBe(false);expect(calls).toBe(0);const oversized=await generateCompatibleImages({baseUrl:base,apiKey:key,model:'x'},request,{maxBytes:1024});expect(oversized.complete).toBe(false);expect(calls).toBe(1);
 const timeout=await server(()=>{});const timed=await generateCompatibleImages({baseUrl:timeout,apiKey:key,model:'x'},request,{timeoutMs:40});expect(timed.complete).toBe(false);expect(timed.submitted).toBe(true);expect(timed.timedOut).toBe(true);expect(timed.cancelled).toBe(false);
});
