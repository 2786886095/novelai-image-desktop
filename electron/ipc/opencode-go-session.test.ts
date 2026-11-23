import { beforeEach, describe, expect, it, vi } from 'vitest';
import {PNG} from 'pngjs';
vi.mock('./template-library',async()=>{const {templates}=await import('../../shared/prompt-skill-catalog-v3.json');return {resolveTemplateLibrarySlot:(slot:string)=>{const v=templates.find(t=>t.slot===slot)!;return {body:v.body,revision:'test',sha256:v.sha256};}};});
const fixture=vi.hoisted(()=>({req:vi.fn(),post:vi.fn(),route:vi.fn(),settings:{
 convertApiUrl:'https://convert.fixture.invalid/v1',convertApiKey:'fixture',convertApiModel:'fixture-text',
 visionApiUrl:'https://vision.fixture.invalid/v2',visionApiKey:'fixture',visionApiModel:'fixture-vision',
 convertPromptTemplates:{tags:'',natural:'Neutral natural caption',mixed:''},
 reversePromptTemplates:{tags:'',natural:'Neutral natural caption',mixed:''},
 reverseConvertDshEnabled:false,proxyMode:'auto',proxyForAi:true,
}}));
vi.mock('axios',()=>({default:{request:fixture.req,post:fixture.post,get:vi.fn(),isCancel:()=>false}}));
vi.mock('./proxy',()=>({proxyConfig:()=>({}),proxyConfigForUrl:fixture.route}));
vi.mock('./store',()=>({getSettings:()=>fixture.settings,addHistory:vi.fn(),ensureHistoryGroup:vi.fn(),getAccountSummary:()=>({hasToken:false}),getHistoryGroups:()=>[],getToken:()=>'',setAccountSummary:vi.fn(),setToken:vi.fn(),updateHistoryItem:vi.fn()}));
import {clearAiCallLog,convertPromptText,getAiCallLog,reversePromptImage} from './nai';
const caption='A woman in a blue coat stands by a tree.';
const success=()=>({data:{choices:[{message:{content:caption},finish_reason:'stop'}]}});
const call=(kind:'convert'|'reverse')=>kind==='convert'
 ?convertPromptText(caption,'natural',false,'v5')
 :reversePromptImage(PNG.sync.write(new PNG({width:2,height:2})).toString('base64'),'natural','full','blue coat',false,'v5');
beforeEach(()=>{fixture.post.mockReset();fixture.route.mockReset();clearAiCallLog();fixture.post.mockResolvedValue(success());fixture.route.mockResolvedValue({proxy:false});fixture.settings.convertApiKey='fixture';});
import { Readable } from 'node:stream';
import { runStudioPiAgent } from './pi-agent-core';
import { studioPiModel, studioPiStream } from './pi-agent-provider';
import type { AppSettings } from '../../src/types';
for(const [provider,url] of Object.entries({go:'https://opencode.ai/inference/go/v1',lookalike:'https://opencode.ai.example.invalid/inference/go/v1',otherPath:'https://opencode.ai/inference/openai/v1',officialBase:'https://api.deepseek.com',control:'https://example.invalid/v1'})) {
 for (const kind of ['convert','reverse','agent'] as const) {
 it(provider+' '+kind+' capture outbound request (no internet)',async()=>{
 let seen:any[]=[];const capture=(url:string,h:any)=>{const headers=new Headers(h);seen.push({url,id:headers.get('x-opencode-session'),ua:headers.get('user-agent')});};
 fixture.settings.convertApiUrl=url;fixture.settings.visionApiUrl=url;fixture.settings.convertApiModel='deepseek-flash';fixture.settings.visionApiModel='deepseek-flash';
 if(kind==='agent'){
 fixture.req.mockImplementation(async(cfg:any)=>{capture(cfg.url,cfg.headers);return {status:200,headers:{'content-type':'text/event-stream'},data:Readable.from(['data: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"ok"},"finish_reason":null}]}\n\ndata: {"id":"test","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'])};});
 const s={agentApiProtocol:'openai-compatible',agentApiBaseUrl:url,agentApiModel:'deepseek-flash',agentApiKey:'fixture',agentMaxOutputTokens:128,agentContextWindow:4096} as AppSettings;
 for(const chat of ['chat-A','chat-A','chat-B']) await runStudioPiAgent({model:studioPiModel(s),streamFn:studioPiStream(s,chat),systemPrompt:'fixture',text:'hello',history:[],tools:[],authorize:async()=>false});
 }else{fixture.post.mockImplementation(async(u:string,b:any,c:any)=>{capture(u,c.headers);if(provider==='go')expect(c.maxRedirects).toBe(0);return seen.length % 2===1 ? {data:{choices:[{message:{content:''},finish_reason:'length'}]}} : success();});for(let task=0;task<2;task++)expect((await call(kind)).ok).toBe(true);}
 expect(seen).toHaveLength(kind==='agent'?3:4);
 if(provider==='go'){
   expect(seen[0].id).toBeTruthy();
   expect(seen[0].id).toBe(seen[1].id);
   expect(seen[2].id).not.toBe(seen[0].id);
   if(kind!=='agent')expect(seen[2].id).toBe(seen[3].id);
   expect(seen.every(x=>x.ua==='Langbai-NovelAI-Studio/desktop')).toBe(true);
 } else {
   expect(seen.every(x=>x.id===null && x.ua!=='Langbai-NovelAI-Studio/desktop')).toBe(true);
 }
 });}}
