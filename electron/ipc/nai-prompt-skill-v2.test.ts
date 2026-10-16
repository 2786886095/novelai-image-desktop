import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {PNG} from 'pngjs';
import type {AppSettings} from '../../src/types';
import fixtures from '../../src/data/prompt-skill-audit-fixtures.json';
import {PROMPT_CUSTOM_TEMPLATE_V2,PROMPT_OPTIMIZE_TEMPLATE_V2} from '../../src/data/prompt-edit-templates';
const settingsRef=vi.hoisted(()=>({current:{} as Partial<AppSettings>}));
vi.mock('./store',()=>({addHistory:vi.fn(),ensureHistoryGroup:vi.fn(),getAccountSummary:vi.fn(()=>({hasToken:false})),getHistoryGroups:vi.fn(()=>[]),getSettings:()=>settingsRef.current,getToken:vi.fn(()=>''),setAccountSummary:vi.fn(),setToken:vi.fn(),updateHistoryItem:vi.fn()}));
// Real axios and an actual 127.0.0.1 HTTP server exercise the serialized body.
// No real provider, API key, user profile, image generator or clipboard is used.
let server:Server,base:string;const requests:any[]=[];let response:any;
const png=new PNG({width:2,height:2});png.data.fill(255);const image=PNG.sync.write(png).toString('base64');
const tagPrompt=fixtures.find(f=>f.mode==='tags'&&f.name==='still_life')!.prompt;
const answer=(content:string)=>({choices:[{message:{content},finish_reason:'stop'}]});
let nai:typeof import('./nai');
beforeAll(async()=>{
 server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;requests.push({url:req.url,body:JSON.parse(raw)});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(response));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
 nai=await import('./nai');
});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
beforeEach(()=>{
 requests.length=0;response=answer(tagPrompt);
 settingsRef.current={convertApiUrl:base,convertApiKey:'synthetic-local-only',convertApiModel:'fixture-text',visionApiUrl:base,visionApiKey:'synthetic-local-only',visionApiModel:'fixture-vision',proxyForAi:false,loggingEnabled:false,mcpForConvert:false,mcpForReverse:false,reverseConvertDshEnabled:false,reversePromptTemplateVersion:'v5',convertPromptTemplateVersion:'v5',promptAssistantTemplateVersion:'v5',reversePromptSkillVersion:'2.0.0',convertPromptSkillVersion:'2.0.0',promptAssistantSkillVersion:'2.0.0',reversePromptTemplates:{tags:'LEGACY_ONLY',natural:'LEGACY_ONLY',mixed:'LEGACY_ONLY'},convertPromptTemplates:{tags:'LEGACY_ONLY',natural:'LEGACY_ONLY',mixed:'LEGACY_ONLY'},reversePromptTemplatesV2:{tags:'',natural:'',mixed:''},convertPromptTemplatesV2:{tags:'',natural:'',mixed:''}};
 nai.clearAiCallLog();
});
const call=(entry:'reverse'|'convert'|'assistant'|'optimize',known=false)=>entry==='reverse'?nai.reversePromptImage(image,'tags','full','only supplied facts',known,'v5','2.0.0'):nai.convertPromptText('CURRENT_SOURCE $& $1','tags',known,'v5',entry==='assistant'?{kind:'custom',instruction:'CHANGE_ONLY $&'}:entry==='optimize'?{kind:'optimize',instruction:''}:undefined,'2.0.0');
describe('v2 actual loopback AI requests',()=>{
 for(const task of ['reverse','convert'] as const)for(const mode of ['tags','natural','mixed'] as const)it(`${task}/${mode} selects independent v2 body in one ordinary request`,async()=>{
  response=answer(fixtures.find(f=>f.mode===mode&&f.name==='still_life')!.prompt);
  const r=task==='reverse'?await nai.reversePromptImage(image,mode,'object','white vase',false,'v5','2.0.0'):await nai.convertPromptText('user facts $& $1',mode,false,'v5',undefined,'2.0.0');
  expect(r.ok).toBe(true);expect(requests).toHaveLength(1);const {url,body}=requests[0];expect(url).toBe('/v1/chat/completions');
  const system=body.messages[0].content;expect(system).toContain(`NovelAI V5 Full ${task==='reverse'?'图片反推':'文字转换'}｜${mode==='tags'?'纯Tag':mode==='natural'?'纯自然语言':'混合'}`);
  expect(system).toContain('本次普通模型调用没有可用');expect(system).toContain('合成正例只是格式示范');expect(system).not.toContain('LEGACY_ONLY');
  expect(system).not.toContain('软件内部 JSON 输出协议');expect(system).not.toContain('单人全身图不得只写 pointing');expect(system).not.toContain('{{input}}');expect(system).not.toContain('{{image}}');expect(body).not.toHaveProperty('tools');expect(body).not.toHaveProperty('response_format');
  if(task==='reverse')expect(body.messages[1].content[0].image_url.url).toMatch(/^data:image\/png;base64,/);else expect(body.messages[1].content).toBe('user facts $& $1');
 });
 for(const entry of ['assistant','optimize'] as const)it(`${entry} inherits v2 conversion and independent editing overlay without a generation request`,async()=>{
  const r=await call(entry);expect(r.ok).toBe(true);expect(requests).toHaveLength(1);const system=requests[0].body.messages[0].content;
  expect(system).toContain(entry==='assistant'?PROMPT_CUSTOM_TEMPLATE_V2:PROMPT_OPTIMIZE_TEMPLATE_V2);expect(system).not.toContain('提示词编辑模板 v3');expect(JSON.parse(requests[0].body.messages[1].content).currentPrompt).toBe('CURRENT_SOURCE $& $1');
 });
 for(const entry of ['reverse','convert','assistant','optimize'] as const)for(const text of ['信息不足：当前证据无法支持约50个有效单元，请补充目标细节。','模式能力不足：纯Tag无法无损表达所要求的精确关系，请改用混合或自然语言模式。'])it(`${entry} keeps original on controlled failure ${text.slice(0,4)} with no retry`,async()=>{
  response=answer(text);const r=await call(entry);expect(r.ok).toBe(false);expect(r.message).toContain(text);expect(r).not.toHaveProperty('result');expect(r).not.toHaveProperty('prompt');expect(requests).toHaveLength(1);
 });
 for(const entry of ['reverse','convert','assistant','optimize'] as const)it(`${entry} rejects provider refusal once`,async()=>{
  response=answer("I'm sorry, but I can't assist with this request.");const r=await call(entry);expect(r.ok).toBe(false);expect(requests).toHaveLength(1);
 });
 it('uses selected v2 custom modes but never inherits a different mode or v1 override',async()=>{
  settingsRef.current.convertPromptTemplatesV2={tags:'CUSTOM_V2_TAGS {{input}}',natural:'',mixed:'OTHER_MODE_CUSTOM'};expect((await call('convert')).ok).toBe(true);
  const system=requests[0].body.messages[0].content;expect(system).toContain('CUSTOM_V2_TAGS <provided in the user message>');expect(system).not.toContain('OTHER_MODE_CUSTOM');expect(system).not.toContain('LEGACY_ONLY');
 });
 it('preserves explicit v1 request despite v2 setting',async()=>{
  response=answer('1girl, blue hair');const r=await nai.convertPromptText('a girl','tags',false,'v5',undefined,'1.0.0');expect(r.ok).toBe(true);expect(requests).toHaveLength(1);expect(requests[0].body.messages[0].content).toContain('LEGACY_ONLY');expect(requests[0].body.messages[0].content).not.toContain('技能版本 2.0.0');
 });
 it('reads independent assistant edition and overlay setting',async()=>{
  settingsRef.current.convertPromptSkillVersion='1.0.0';settingsRef.current.promptAssistantSkillVersion='2.0.0';settingsRef.current.promptAssistantTemplate='LEGACY_EDIT';settingsRef.current.promptAssistantTemplateV2='V2_EDIT';
  const r=await nai.convertPromptText('source','tags',false,'v5',{kind:'custom',instruction:'edit'});expect(r.ok).toBe(true);expect(requests[0].body.messages[0].content).toContain('V2_EDIT');expect(requests[0].body.messages[0].content).not.toContain('LEGACY_EDIT');
 });
 it('does not send incompatible v2/V4.5 to the model',async()=>{
  expect((await nai.convertPromptText('a girl','tags',false,'v4.5',undefined,'2.0.0')).ok).toBe(false);expect((await nai.reversePromptImage(image,'tags','full','',false,'v4.5','2.0.0')).ok).toBe(false);expect(requests).toHaveLength(0);
 });
 for(const task of ['reverse','convert'] as const)it(`${task} preserves known-character two complete string variants without old envelopes`,async()=>{
  response=answer(JSON.stringify({namePrompt:tagPrompt,featurePrompt:tagPrompt}));const r=await call(task,true);expect(r.ok).toBe(true);expect(r.variants?.namePrompt).toBe(tagPrompt);expect(requests).toHaveLength(1);expect(requests[0].body.messages[0].content).toContain('namePrompt');expect(requests[0].body.messages[0].content).toContain('不返回segments/units');
 });
 it('fails once if either known-character variant is an information failure',async()=>{
  response=answer(JSON.stringify({namePrompt:tagPrompt,featurePrompt:'信息不足：请补充'}));const r=await call('reverse',true);expect(r.ok).toBe(false);expect(requests).toHaveLength(1);expect(r).not.toHaveProperty('prompt');
 });
 for(const entry of ['reverse','convert'] as const)it(`${entry} does not retry empty-length or malformed-density output to fabricate facts`,async()=>{
  response={choices:[{message:{content:''},finish_reason:'length'}]};expect((await call(entry)).ok).toBe(false);expect(requests).toHaveLength(1);
 });
});
