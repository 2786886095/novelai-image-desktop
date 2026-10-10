import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({post:vi.fn(),route:vi.fn(),settings:{
 convertApiUrl:'https://convert.fixture.invalid/v1',convertApiKey:'fixture',convertApiModel:'fixture-text',
 visionApiUrl:'https://vision.fixture.invalid/v2',visionApiKey:'fixture',visionApiModel:'fixture-vision',
 convertPromptTemplates:{tags:'',natural:'Neutral natural caption',mixed:''},
 reversePromptTemplates:{tags:'',natural:'Neutral natural caption',mixed:''},
 reverseConvertDshEnabled:false,proxyMode:'auto',proxyForAi:true,
}}));
vi.mock('axios',()=>({default:{post:fixture.post,get:vi.fn(),isCancel:()=>false}}));
vi.mock('./proxy',()=>({proxyConfig:()=>({}),proxyConfigForUrl:fixture.route}));
vi.mock('./store',()=>({getSettings:()=>fixture.settings,addHistory:vi.fn(),ensureHistoryGroup:vi.fn(),getAccountSummary:()=>({hasToken:false}),getHistoryGroups:()=>[],getToken:()=>'',setAccountSummary:vi.fn(),setToken:vi.fn(),updateHistoryItem:vi.fn()}));
import {clearAiCallLog,convertPromptText,getAiCallLog,reversePromptImage} from './nai';
const caption='A woman in a blue coat stands by a tree.';
const success=()=>({data:{choices:[{message:{content:caption},finish_reason:'stop'}]}});
const call=(kind:'convert'|'reverse')=>kind==='convert'
 ?convertPromptText(caption,'natural',false,'v5')
 :reversePromptImage(Buffer.from('neutral image').toString('base64'),'natural','full','blue coat',false,'v5');
beforeEach(()=>{fixture.post.mockReset();fixture.route.mockReset();clearAiCallLog();fixture.post.mockResolvedValue(success());fixture.route.mockResolvedValue({proxy:false});fixture.settings.convertApiKey='fixture';});
describe('conversion and reverse first request routing',()=>{
 for(const kind of ['convert','reverse'] as const){
  it(`${kind} waits for cold proxy resolution before submitting once`,async()=>{
   let release!:(value:unknown)=>void;
   fixture.route.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
   const pending=call(kind);await vi.waitFor(()=>expect(fixture.route).toHaveBeenCalledTimes(1));
   expect(fixture.post).not.toHaveBeenCalled();
   const url=kind==='convert'?'https://convert.fixture.invalid/v1/chat/completions':'https://vision.fixture.invalid/v2/chat/completions';
   expect(fixture.route).toHaveBeenCalledWith('ai',url,fixture.settings);
   release({proxy:false,httpAgent:'fixture-http',httpsAgent:'fixture-https'});
   expect((await pending).ok).toBe(true);expect(fixture.post).toHaveBeenCalledTimes(1);
   expect(fixture.post.mock.calls[0][2]).toMatchObject({proxy:false,httpAgent:'fixture-http',httpsAgent:'fixture-https'});
   expect(fixture.post.mock.calls[0][1].model).toBe(kind==='convert'?'fixture-text':'fixture-vision');
  });
  it(`${kind} retains a routing failure rather than silently posting direct`,async()=>{
   fixture.route.mockRejectedValue(new Error('Fixture proxy unavailable'));
   expect((await call(kind)).ok).toBe(false);expect(fixture.post).not.toHaveBeenCalled();
   expect(getAiCallLog()[0]).toMatchObject({ok:false,response:'Fixture proxy unavailable'});
  });
  it(`${kind} does not retry authentication or replay a paid request`,async()=>{
   fixture.post.mockRejectedValue({response:{status:401,data:{error:{message:'Fixture unauthorized'}}}});
   const result=await call(kind);expect(result.ok).toBe(false);expect(result.message).toContain('Fixture unauthorized');
   expect(fixture.route).toHaveBeenCalledTimes(1);expect(fixture.post).toHaveBeenCalledTimes(1);
  });
 }
 it('conversion and reverse do not share a host/PAC routing decision',async()=>{
  fixture.route.mockImplementation(async(_category,url:string)=>({proxy:false,httpsAgent:url.includes('convert.')?'convert-route':'vision-route'}));
  expect((await call('convert')).ok).toBe(true);expect((await call('reverse')).ok).toBe(true);
  expect(fixture.post.mock.calls[0][2].httpsAgent).toBe('convert-route');expect(fixture.post.mock.calls[1][2].httpsAgent).toBe('vision-route');
 });
 it('missing credentials fail before routing or submission',async()=>{
  fixture.settings.convertApiKey='';expect((await call('convert')).ok).toBe(false);expect(fixture.route).not.toHaveBeenCalled();expect(fixture.post).not.toHaveBeenCalled();
 });
});
