import {afterAll,beforeAll,beforeEach,it,expect,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {PNG} from 'pngjs';
import type {AppSettings} from '../../src/types';
const ref=vi.hoisted(()=>({settings:{} as Partial<AppSettings>}));
vi.mock('./store',()=>({getSettings:()=>ref.settings,getToken:vi.fn(()=>''),addHistory:vi.fn(),ensureHistoryGroup:vi.fn(),getAccountSummary:vi.fn(()=>({hasToken:false})),getHistoryGroups:vi.fn(()=>[]),setAccountSummary:vi.fn(),setToken:vi.fn(),updateHistoryItem:vi.fn()}));
let server:Server,base:string,nai:typeof import('./nai'),content:string,status=200,finish='stop';const requests:any[]=[];
const png=new PNG({width:2,height:2});png.data.fill(255);const image=PNG.sync.write(png).toString('base64');
beforeAll(async()=>{
 server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;requests.push({url:req.url,body:JSON.parse(body)});res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status===200?{choices:[{message:{content},finish_reason:finish}]}:{error:{message:'synthetic unavailable'}}));});
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;nai=await import('./nai');
});
afterAll(async()=>{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));});
beforeEach(()=>{
 requests.length=0;content='red cup';status=200;finish='stop';
 ref.settings={visionApiUrl:base,visionApiKey:'synthetic-local-only',visionApiModel:'fixture',convertApiUrl:base,convertApiKey:'synthetic-local-only',convertApiModel:'fixture',proxyForAi:false,loggingEnabled:false,mcpForReverse:false,mcpForConvert:false,reverseConvertDshEnabled:false,reversePromptSkillVersion:'2.0.0',convertPromptSkillVersion:'2.0.0',reversePromptTemplateVersion:'v5',convertPromptTemplateVersion:'v5',reversePromptTemplatesV2:{tags:'',natural:'',mixed:''},convertPromptTemplatesV2:{tags:'',natural:'',mixed:''}};
});
for(const mode of ['tags','mixed','natural'] as const)it(`reverse V2 ${mode} delivers rejected draft plus warning in one actual loopback request`,async()=>{
 content=mode==='natural'?'A cat sleeps.':'red cup';
 const r=await nai.reversePromptImage(image,mode,'full','只描述可见物体',false,'v5','2.0.0');
 expect(r.ok).toBe(true);expect(r.prompt).toBe(content);expect(r.warnings?.join('')).toContain('检查未通过');expect(requests).toHaveLength(1);
 expect(requests[0].body.messages[1].content[0].image_url.url).toMatch(/^data:image\/png;base64,/);
});
for(const mode of ['tags','mixed'] as const)it(`reverse legacy ${mode} preserves typed short draft without count repair calls`,async()=>{
 ref.settings.reversePromptTemplates={tags:'有效语义单元 50–150',mixed:'有效语义单元 50–150；Tag 65–75%',natural:''};
 content=JSON.stringify({segments:[{units:[{kind:'tag',text:'red cup'}]}]});
 const r=await nai.reversePromptImage(image,mode,'full','',false,'v5','1.0.0');
 expect(r.ok).toBe(true);expect(r.prompt).toBe('red cup');expect(r.warnings?.join('')).toContain('检查未通过');expect(requests).toHaveLength(1);
});
it('reverse known-character pair keeps both actual short strings with warning',async()=>{
 content=JSON.stringify({namePrompt:'1girl, blue hair',featurePrompt:'girl, blue hair'});
 const r=await nai.reversePromptImage(image,'tags','full','',true,'v5','2.0.0');
 expect(r.ok).toBe(true);expect(r.variants).toEqual({namePrompt:'1girl, blue hair',featurePrompt:'girl, blue hair'});expect(r.warnings?.join('')).toContain('检查未通过');expect(requests).toHaveLength(1);
});
for(const bad of ['',"I'm sorry, but I can't assist with this request.",'信息不足：请补充','模式能力不足：请换模式','```text\nred cup'])it('reverse keeps original on unusable response '+JSON.stringify(bad),async()=>{
 content=bad;const r=await nai.reversePromptImage(image,'tags','full','',false,'v5','2.0.0');expect(r.ok).toBe(false);expect(r).not.toHaveProperty('prompt');expect(requests).toHaveLength(1);
});
it('reverse truncation still fails without a draft or retry',async()=>{finish='length';const r=await nai.reversePromptImage(image,'tags','full','',false,'v5','2.0.0');expect(r.ok).toBe(false);expect(r).not.toHaveProperty('prompt');expect(requests).toHaveLength(1);});
it('reverse HTTP failure is not a warning-only success',async()=>{status=503;const r=await nai.reversePromptImage(image,'tags','full','',false,'v5','2.0.0');expect(r.ok).toBe(false);expect(r).not.toHaveProperty('prompt');expect(requests).toHaveLength(1);});
it('reverse missing variant is not invented',async()=>{content=JSON.stringify({namePrompt:'red cup'});const r=await nai.reversePromptImage(image,'tags','full','',true,'v5','2.0.0');expect(r.ok).toBe(false);expect(r).not.toHaveProperty('prompt');expect(requests).toHaveLength(1);});
for(const mode of ['tags','mixed','natural'] as const)it(`conversion ${mode} retains the already fixed advisory policy`,async()=>{content=mode==='natural'?'A cat sleeps.':'red cup';const r=await nai.convertPromptText('红色杯子',mode,false,'v5',undefined,'2.0.0');expect(r.ok).toBe(true);expect(r.result).toBe(content);expect(r.warnings?.join('')).toContain('检查未通过');expect(requests).toHaveLength(1);});
