import {describe,it,expect} from 'vitest';
import {sceneCards,sceneEditRequest,sceneEditSnapshot,sceneFlatText,sceneRailSource,sceneRailText} from './scene-rail';
import {readSceneBindings,canonicalSceneValue} from './scene-bindings';
import fs from 'node:fs';
import type {AgentConversation,AgentMessage} from '../agent/types';
const scene=()=>readSceneBindings({version:1,revision:4,entities:[
 {id:'alice',kind:'character',name:'Alice',prompt:'woman',subject:'girl'},
 {id:'bob',kind:'character',name:'Bob',prompt:'man',subject:'boy'},
 {id:'coat',kind:'garment',name:'Coat',prompt:'red coat',ownerId:'bob',wearerId:'alice'},
 {id:'book',kind:'prop',name:'Book',prompt:'book',ownerId:'bob'},
 {id:'tree',kind:'prop',name:'Tree',prompt:'oak tree'}],facts:[
 {id:'a',entityId:'alice',slot:'expression',prompt:'smile',locked:true},
 {id:'b',entityId:'bob',slot:'pose',prompt:'sitting'},
 {id:'c',entityId:'coat',slot:'material',prompt:'silk'},
 {id:'d',entityId:'scene',slot:'light',prompt:'sunlight'}],relations:[{id:'r',actorId:'alice',targetId:'bob',action:'looking at'}]})!;
const message=(id='m1'):AgentMessage=>({id,role:'assistant',characterId:'character',content:'plan',status:'complete',createdAt:'2026-09-10',attachments:[],tools:[],imageProposal:{id:'p-'+id,status:'pending',positivePrompt:'preserved',scene:scene(),negativePrompt:'',stylePrompt:'',count:1,createdAt:'2026-09-10'}});
const chat=(messages:AgentMessage[])=>({messages,status:'idle'} as AgentConversation);
describe('simple scene rail',()=>{
 it('groups worn clothing with the wearer, without changing ownership or duplicating it',()=>{
  const s=scene(),before=canonicalSceneValue(s),cards=sceneCards(s);
  expect(cards[0].lines).toEqual(['woman','red coat','smile','silk','looking at → Bob']);
  expect(cards[1].lines).toEqual(['man','book','sitting']);expect(cards[2].lines).toEqual(['oak tree','sunlight']);
  expect(canonicalSceneValue(s)).toBe(before);
 });
 it('builds a scoped natural-language request without requiring users to supply IDs',()=>{
  const m=message(),before=JSON.stringify(m),request=sceneEditRequest(m,'alice','外套改成蓝色');
  expect(request).toContain('Alice');expect(request).toContain('#1');expect(request).toContain('外套改成蓝色');expect(request).toContain('已锁定');
  expect(JSON.stringify(m)).toBe(before);expect(()=>sceneEditRequest(m,'unknown','test')).toThrow('SCENE_STALE');
 });
 it('rejects empty edits and offers a separately scoped background request',()=>{
  expect(()=>sceneEditRequest(message(),'scene',' ')).toThrow();expect(sceneEditRequest(message(),'scene','夜晚')).toContain('场景与背景');
 });
 it('keeps historical selection read only rather than silently editing the latest message',()=>{
  const c=chat([message(),message('m2')]);const old=sceneRailSource(c,'character','m1');
  expect(old.message?.id).toBe('m1');expect(old.historical).toBe(true);expect(old.canEdit).toBe(false);
  expect(sceneRailSource(c,'character').message?.id).toBe('m2');expect(sceneRailSource(c,'character').canEdit).toBe(true);
 });
 it('never resurrects a reset image or a different character as the latest scene',()=>{
  const c=chat([message()]);c.imageStateResetAt='2026-09-11';expect(sceneRailSource(c,'character').message).toBeUndefined();
  expect(sceneRailSource(c,'other').message).toBeUndefined();expect(sceneRailSource(c,'character','m1').historical).toBe(true);
 });
 it('disables direct edits during generation, review and on completed snapshots',()=>{
  const c=chat([message()]);c.status='running';expect(sceneRailSource(c).canEdit).toBe(false);
  c.status='idle';c.messages[0].imageProposal!.status='completed';expect(sceneRailSource(c).canEdit).toBe(false);
  c.messages[0].imageProposal!.status='pending';c.messages[0].imageProposal!.continuity={reviewRequired:true,changes:[]};expect(sceneRailSource(c).canEdit).toBe(false);
 });
 it('shows legacy plans without fabricating structured entities',()=>{
  const m=message();delete m.imageProposal!.scene;expect(sceneRailSource(chat([m])).message?.imageProposal?.scene).toBeUndefined();
  expect(()=>sceneEditRequest(m,'scene','forest')).toThrow();
  const before=JSON.stringify(m);
  expect(sceneEditRequest(m,'picture','外套改为蓝色')).toContain('请修改当前画面：外套改为蓝色');
  expect(JSON.stringify(m)).toBe(before);
 });
 it('provides five language interfaces and keeps technical editing out of the chat stream',()=>{
  for(const lang of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR'])expect(Object.values(sceneRailText(lang)).every(v=>v.length>0)).toBe(true);
  const page=fs.readFileSync('src/AgentPage.tsx','utf8'),panel=fs.readFileSync('src/tavern/SceneRailPanel.tsx','utf8');
  expect(page).not.toContain('<SceneBindingsEditor');expect(page).toContain('onOpenScene={()=>onOpenScene?.(message.id)}');
  expect(panel).toContain('<details className="tavern-scene-advanced">');expect(page).toContain('sceneRequest === undefined');expect(page).toContain('{attachmentIds: []}');
 });
});

it('detects flat prompt changes even when the message and proposal IDs stay the same',()=>{
 const m=message();delete m.imageProposal!.scene;const before=sceneEditSnapshot(m);
 m.imageProposal!.positivePrompt='a different outfit';expect(sceneEditSnapshot(m)).not.toBe(before);
});

it('rejects missing proposals, empty prompts and unknown flat-plan targets',()=>{
 const m=message();delete m.imageProposal!.scene;
 expect(()=>sceneEditRequest(m,'alice','blue coat')).toThrow('SCENE_STALE');
 expect(()=>sceneEditRequest(m,'picture','  ')).toThrow('SCENE_STALE');
 m.imageProposal!.positivePrompt=' ';expect(()=>sceneEditRequest(m,'picture','blue coat')).toThrow('SCENE_STALE');
 delete m.imageProposal;expect(()=>sceneEditRequest(m,'picture','blue coat')).toThrow('SCENE_STALE');
});

it('offers text-plan changes in each supported language without fabricating character scopes',()=>{
 const m=message();delete m.imageProposal!.scene;
 for(const lang of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']){
  const copy=sceneFlatText(lang),request=sceneEditRequest(m,'picture','blue coat',lang);
  expect(request).toContain(copy.scope);expect(request).toContain('blue coat');expect(request).not.toContain('#1');
  expect(copy.hint).toBeTruthy();expect(copy.failed).toBeTruthy();
 }
});

it('renders an immediately usable editor for flat plans and keeps historical plans read only',async()=>{
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const {SceneRailPanel}=await import('./SceneRailPanel');const m=message();delete m.imageProposal!.scene;
 const render=(source:ReturnType<typeof sceneRailSource>)=>renderToStaticMarkup(createElement(SceneRailPanel,{
  source,language:'zh-CN',onLatest:()=>{},onCreateCopy:()=>{},onChange:()=>{},onRequestEdit:async()=>true,
 }));
 const pending=render(sceneRailSource(chat([m])));
 expect(pending).toContain('<textarea');expect(pending).toContain('应用修改');expect(pending).not.toContain('这是旧版文字方案');
 m.imageProposal!.status='completed';expect(render(sceneRailSource(chat([m])))).toContain('<textarea');
 expect(render(sceneRailSource(chat([m,message('next')]),undefined,m.id))).not.toContain('<textarea');
});

it('creates a pending advanced-edit copy without changing the completed image or its bindings',async()=>{
 const {sceneDraftCopy}=await import('./scene-rail');const old=message();old.imageProposal!.status='completed';const before=JSON.stringify(old);
 const copy=sceneDraftCopy(old,'Editable copy');expect(copy.imageProposal?.status).toBe('pending');expect(copy.id).not.toBe(old.id);
 expect(copy.imageProposal?.scene).toEqual(old.imageProposal?.scene);expect(copy.attachments).toEqual([]);expect(JSON.stringify(old)).toBe(before);
 copy.imageProposal!.scene!.entities[0].name='changed';expect(old.imageProposal!.scene!.entities[0].name).toBe('Alice');
});
