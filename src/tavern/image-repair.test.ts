import {describe,it,expect,vi} from 'vitest';
import {repairImagePrompt,combineImageTurnUsage,recoverInterruptedImageRepairs} from './image-repair';
import {resolveImagePrompt} from './image-continuity';
import type {AgentConversation,TavernImageProposal} from '../agent/types';
const base:TavernImageProposal={id:'base',status:'completed',createdAt:'2026-09-10',positivePrompt:'woman, red coat, white scarf, city street',negativePrompt:'',stylePrompt:'',count:1};
const raw={positivePrompt:'woman, blue coat',promptMode:'new',width:1088,height:1920,scale:0,explicitParameters:['scale']};
const good={baseImageId:'base',promptPatch:{replacements:[{from:'red coat',to:'blue coat'}],append:[]},scale:9,width:1024,stylePrompt:'must not leak'};
const response=(p:unknown)=>({content:`<langbai-image>${JSON.stringify(p)}</langbai-image>`});
describe('bounded image contract repair',()=>{
 it('recovers a interrupted repair without resubmitting or discarding its original prompt',()=>{
  const conversation={status:'running',messages:[{status:'streaming',imageProposal:{...base,status:'pending',continuity:{reviewRequired:true,repairStatus:'repairing',changes:[]}}}]} as unknown as AgentConversation;
  expect(recoverInterruptedImageRepairs(conversation)).toBe(true);expect(conversation.status).toBe('idle');expect(conversation.messages[0].imageProposal?.continuity?.repairStatus).toBe('failed');expect(conversation.messages[0].imageProposal?.positivePrompt).toBe(base.positivePrompt);expect(recoverInterruptedImageRepairs(conversation)).toBe(false);
 });
 it('repairs the video full-rewrite path without losing unrelated clothing or right-panel values',async()=>{
  const request=vi.fn(async()=>response(good));const r=await repairImagePrompt({raw,base,signal:new AbortController().signal,request});
  expect(r.state).toBe('repaired');expect(request).toHaveBeenCalledTimes(1);
  expect(resolveImagePrompt(r.raw,base).positivePrompt).toBe('woman, blue coat, white scarf, city street');
  expect(r.raw).toMatchObject({width:1088,height:1920,scale:0,explicitParameters:['scale']});expect(r.raw.stylePrompt).toBeUndefined();
 });
 it('does not send a second request for a valid patch',async()=>{
  const request=vi.fn();expect((await repairImagePrompt({raw:good,base,signal:new AbortController().signal,request})).state).toBe('unchanged');expect(request).not.toHaveBeenCalled();
 });
 it.each([raw,{baseImageId:'stale',promptPatch:good.promptPatch},{baseImageId:'base',promptPatch:{replacements:[{from:'absent',to:'x'}],append:[]}},null])('retains the original after a rejected retry: %j',async candidate=>{
  const request=vi.fn(async()=>response(candidate));const r=await repairImagePrompt({raw,base,signal:new AbortController().signal,request});
  expect(r.state).toBe('failed');expect(r.raw).toBe(raw);expect(resolveImagePrompt(r.raw,base).positivePrompt).toBe(base.positivePrompt);expect(request).toHaveBeenCalledTimes(1);
 });
 it('times out even when a transport does not reject on abort',async()=>{
  let child:AbortController|undefined;const r=await repairImagePrompt({raw,base,signal:new AbortController().signal,timeoutMs:10,request:async(_,c)=>{child=c;return new Promise(()=>{});}});
  expect(r.state).toBe('failed');expect(child?.signal.aborted).toBe(true);
 });
 it('cancellation stops the repair and never yields an executable candidate',async()=>{
  const controller=new AbortController();const p=repairImagePrompt({raw,base,signal:controller.signal,request:async()=>new Promise(()=>{})});controller.abort();await expect(p).rejects.toThrow();
 });
 it('preserves the original on a network failure',async()=>{
  const r=await repairImagePrompt({raw,base,signal:new AbortController().signal,request:async()=>{throw Error('network');}});expect(r).toEqual({raw,state:'failed'});
 });
 it('counts both requests and marks incomplete usage as estimated',()=>{
  const usage={input:10,output:2,reasoning:0,cacheRead:0,cacheWrite:0,total:12};
  expect(combineImageTurnUsage(usage,usage)?.total).toBe(24);expect(combineImageTurnUsage(usage,undefined)?.estimated).toBe(true);
 });
});
