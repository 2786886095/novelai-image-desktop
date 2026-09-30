import http from 'node:http';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import sharp from 'sharp';
import {DEFAULT_PARAMS} from '../../src/types';
const state=vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),settings:{streamPreviewEnabled:true,imageBaseUrl:'https://image.novelai.net',apiBaseUrl:'https://api.novelai.net',allowCustomEndpointFallback:false,allowCustomEndpoint:false}}));
vi.mock('electron',()=>({app:{getPath:()=>''},nativeImage:{},dialog:{}}));
vi.mock('axios',()=>({default:{post:state.post,get:state.get,isCancel:()=>false}}));
vi.mock('./store',()=>({getToken:()=> 'fixture-native-token',getSettings:()=>state.settings}));
vi.mock('./proxy',()=>({proxyConfig:()=>({proxy:false}),proxyConfigForUrl:async()=>({proxy:false})}));
import {generateImage,prepareExtras} from './nai';
import {cancelAllJobs} from './job-registry';
beforeEach(()=>{state.settings.imageBaseUrl='https://image.novelai.net';state.settings.allowCustomEndpointFallback=false;state.settings.allowCustomEndpoint=false;state.post.mockReset();state.get.mockReset();state.post.mockRejectedValue(Error('fixture transport failure'));});
afterEach(()=>cancelAllJobs());
it('baseline: async authorization completes before any native POST',async()=>{
 let resolve!:()=>void;const gate=new Promise<void>(r=>{resolve=r;});const permission=gate.then(()=>{throw Error('authorization revoked');});permission.catch(()=>{});
 const guard=vi.fn(()=>permission);const running=generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{beforeSubmit:guard});
 await vi.waitFor(()=>expect(guard).toHaveBeenCalled());await new Promise(r=>setTimeout(r,20));const callsWhilePending=state.post.mock.calls.length;
 resolve();const result=await running;expect(callsWhilePending).toBe(0);expect(state.post).not.toHaveBeenCalled();expect(result.ok).toBe(false);expect(result.message).toContain('authorization revoked');
});
it('baseline: revocation after a rejected 429 prevents the retry POST',async()=>{
 let revoked=false;const guard=vi.fn(()=>{if(revoked)throw Error('retry authorization revoked');});
 state.post.mockImplementationOnce(async()=>{revoked=true;throw {response:{status:429,data:'rate limited',headers:{'retry-after':'0.001'}}};});
 const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{beforeSubmit:guard});
 expect(state.post).toHaveBeenCalledOnce();expect(result.ok).toBe(false);expect(result.message).toContain('retry authorization revoked');
});
it('baseline: paid vibe encoding also observes the final submission guard',async()=>{
 const bytes=await sharp({create:{width:8,height:6,channels:3,background:'#abc'}}).png().toBuffer();state.post.mockResolvedValueOnce({data:Buffer.from('fixture-encoding')});
 const guard=vi.fn(()=>{throw Error('encode authorization revoked');});
 await expect(prepareExtras({...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full'},{vibeImages:[{base64:bytes.toString('base64'),infoExtracted:1,strength:1}],charCaptions:[],preciseReferences:[]},undefined,guard)).rejects.toThrow('encode authorization revoked');
 expect(state.post).not.toHaveBeenCalled();
});

it.each([false,true])('rechecks authorization before custom endpoint fallback (stream=%s)',async(stream)=>{
 state.settings.allowCustomEndpoint=true;state.settings.imageBaseUrl='https://fixture.example';state.settings.allowCustomEndpointFallback=true;
 let revoked=false;
 state.post.mockImplementationOnce(async()=>{revoked=true;throw {response:{status:401,data:'unauthorized'}};});
 const guard=vi.fn(async()=>{if(revoked)throw Error('fallback revoked');});
 const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{beforeSubmit:guard,onPreview:stream?()=>{}:undefined});
 expect(state.post).toHaveBeenCalledOnce();expect(state.post.mock.calls[0][0]).toContain('fixture.example');
 expect(result.ok).toBe(false);expect(result.message).toContain('fallback revoked');expect(guard).toHaveBeenCalledTimes(2);
});
it('rechecks authorization before stream-to-ZIP fallback',async()=>{
 let revoked=false;state.post.mockImplementationOnce(async()=>{revoked=true;throw {response:{status:404,data:'stream unsupported'}};});
 const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{onPreview:()=>{},beforeSubmit:async()=>{if(revoked)throw Error('ZIP fallback revoked');}});
 expect(state.post).toHaveBeenCalledOnce();expect(state.post.mock.calls[0][0]).toContain('generate-image-stream');expect(result.message).toContain('ZIP fallback revoked');
});
it('rechecks authorization before a stream 429 retry',async()=>{
 let revoked=false;state.post.mockImplementationOnce(async()=>{revoked=true;throw {response:{status:429,data:'rate limited',headers:{'retry-after':'0.001'}}};});
 const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{onPreview:()=>{},beforeSubmit:async()=>{if(revoked)throw Error('stream retry revoked');}});
 expect(state.post).toHaveBeenCalledOnce();expect(result.message).toContain('stream retry revoked');
});
it.each([false,true])('preserves authorized 429 retry (stream=%s)',async(stream)=>{
 const guard=vi.fn(async()=>{});state.post.mockRejectedValueOnce({response:{status:429,data:'rate limited',headers:{'retry-after':'0.001'}}});
 const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{beforeSubmit:guard,onPreview:stream?()=>{}:undefined});
 expect(state.post).toHaveBeenCalledTimes(2);expect(guard).toHaveBeenCalledTimes(2);expect(result.message).toContain('fixture transport failure');
});
it('aborting during awaited authorization prevents POST and releases the owned job',async()=>{
 const controller=new AbortController();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const guard=vi.fn(()=>gate);
 const running=generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{signal:controller.signal,beforeSubmit:guard});
 await vi.waitFor(()=>expect(guard).toHaveBeenCalled());controller.abort();release();const result=await running;
 expect(result.ok).toBe(false);expect(state.post).not.toHaveBeenCalled();expect(cancelAllJobs()).toBe(false);
});
it('paid vibe 429 retry rechecks authorization',async()=>{
 const bytes=await sharp({create:{width:9,height:6,channels:3,background:'#def'}}).png().toBuffer();let revoked=false;
 state.post.mockImplementationOnce(async()=>{revoked=true;throw {response:{status:429,data:'rate limited',headers:{'retry-after':'0.001'}}};});
 await expect(prepareExtras({...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full'},{vibeImages:[{base64:bytes.toString('base64'),infoExtracted:1,strength:1}],charCaptions:[],preciseReferences:[]},undefined,async()=>{if(revoked)throw Error('vibe retry revoked');})).rejects.toThrow('vibe retry revoked');
 expect(state.post).toHaveBeenCalledOnce();expect(state.post.mock.calls[0][0]).toContain('encode-vibe');
});
it('generation rechecks after paid reference encoding before the image POST',async()=>{
 const bytes=await sharp({create:{width:10,height:6,channels:3,background:'#acd'}}).png().toBuffer();let revoked=false;
 state.post.mockImplementationOnce(async()=>{revoked=true;return {data:Buffer.from('fixture-encoded-reference')};});
 const result=await generateImage({...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full',positivePrompt:'forest'},{vibeImages:[{base64:bytes.toString('base64'),infoExtracted:1,strength:1}],charCaptions:[],preciseReferences:[]},{beforeSubmit:async()=>{if(revoked)throw Error('generation revoked after encoding');}});
 expect(state.post).toHaveBeenCalledOnce();expect(state.post.mock.calls[0][0]).toContain('encode-vibe');expect(result.message).toContain('generation revoked after encoding');
});
it('aborting one waiting job does not prevent a separate authorized job',async()=>{
 const controller=new AbortController();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const guard=vi.fn(()=>gate);
 const waiting=generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{signal:controller.signal,beforeSubmit:guard});
 await vi.waitFor(()=>expect(guard).toHaveBeenCalled());controller.abort();
 const independent=await generateImage({...DEFAULT_PARAMS,positivePrompt:'ocean'},undefined,{beforeSubmit:async()=>{}});
 expect(state.post).toHaveBeenCalledOnce();expect(independent.message).toContain('fixture transport failure');release();await waiting;expect(cancelAllJobs()).toBe(false);
});

it.each([{stream:false,status:429},{stream:true,status:429},{stream:true,status:404}])('real loopback HTTP stops resubmission after revocation ($stream/$status)',async({stream,status})=>{
 const axios=(await vi.importActual<typeof import('axios')>('axios')).default;
 let revoked=false;const received:string[]=[];
 const server=http.createServer((req,res)=>{
  received.push(req.url||'');req.resume();revoked=true;
  res.writeHead(status,{'Content-Type':'text/plain','Retry-After':'0.001'});res.end('fixture rejected before generation');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('fixture port missing');
 state.settings.imageBaseUrl=`http://127.0.0.1:${address.port}`;
 state.post.mockImplementation((...args:Parameters<typeof axios.post>)=>axios.post(...args));
 const guard=vi.fn(async()=>{if(revoked)throw Error('loopback authorization revoked');});
 try {
  const result=await generateImage({...DEFAULT_PARAMS,positivePrompt:'forest'},undefined,{beforeSubmit:guard,onPreview:stream?()=>{}:undefined});
  expect(result.ok).toBe(false);expect(result.message).toContain('loopback authorization revoked');
  expect(received).toEqual([stream?'/ai/generate-image-stream':'/ai/generate-image']);expect(guard).toHaveBeenCalledTimes(2);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
