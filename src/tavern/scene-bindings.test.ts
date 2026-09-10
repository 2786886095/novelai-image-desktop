import {compileSceneForModel} from './scene-generation';
import {describe,it,expect} from 'vitest';
import fixtures from '../../shared/tavern-scene-fixtures.json';
import {readSceneBindings,applyScenePatch,compileSceneBindings,canonicalSceneValue} from './scene-bindings';
import {resolveImagePrompt,imageStateContext,selectImageSwipe} from './image-continuity';
import {buildAgentGenerationInput} from '../agent/generation-input';
import {DEFAULT_PARAMS} from '../types';
import type {TavernImageProposal,AgentMessage} from '../agent/types';
const base = () => readSceneBindings(fixtures.scene)!;
const proposal = ():TavernImageProposal => ({id:'image',status:'completed',positivePrompt:compileSceneBindings(base()).positivePrompt,scene:base(),negativePrompt:'',stylePrompt:'',count:1,createdAt:'2026-09-09'});
describe('owned scene bindings',()=>{
 for(const f of fixtures.cases) it(f.name,()=>{
   const scene=readSceneBindings(f.scene)!;const before=canonicalSceneValue(scene);
   if('error' in f) expect(()=>applyScenePatch(scene,f.patch,'byUser' in f && f.byUser === true)).toThrow(f.error);
   else {
     const changed=applyScenePatch(scene,f.patch,'byUser' in f && f.byUser === true);
     expect(changed.revision).toBe(1);
     const wanted=JSON.parse(JSON.stringify(scene));
     for(const op of f.patch.operations) {const rows=wanted[op.collection];const at=rows.findIndex((r:{id:string})=>r.id===op.id);if(op.after===null)rows.splice(at,1);else if(at<0)rows.push(op.after);else rows[at]=op.after;}
     wanted.revision=1;expect(changed).toEqual(wanted);
   }
   expect(canonicalSceneValue(scene)).toBe(before);
 });
 it('compiles to real independent native character captions, retaining zero coordinates',()=>{
   const changed=applyScenePatch(base(),fixtures.cases[0].patch);const compiled=compileSceneBindings(changed);
   expect(compiled.characterPrompts).toHaveLength(2);
   expect(compiled.characterPrompts[0].prompt).toContain('Wearing coat, black, leather.');
   expect(compiled.characterPrompts[0].prompt).toContain('Wearing shirt, white.');
   expect(compiled.characterPrompts[0].prompt).not.toContain('blonde hair');
   expect(compiled.characterPrompts[1].prompt).toContain('Wearing jacket, blue.');
   expect(compiled.characterPrompts[1].prompt).not.toContain('red hair');
   expect(compiled.positivePrompt).toContain('hat, owned by character 2');
   expect(compiled.characterPrompts[0]).toMatchObject({x:0,y:1,useCoords:true});
   const actual=buildAgentGenerationInput({...compiled,model:'nai-diffusion-5-full',stylePrompt:'',negativePrompt:''},{params:DEFAULT_PARAMS},()=>{throw Error('no images requested');});
   expect(actual.extras.charCaptions).toEqual(compiled.characterPrompts);
   expect(actual.params.stylePrompt).toBe('');expect(actual.params.negativePrompt).toBe('');
 });
 it('cannot silently truncate bound people when switching models',()=>{const s=base();s.entities.push(...Array.from({length:5},(_,i)=>({id:`extra_${i}`,kind:'character' as const,subject:'girl' as const,name:`Extra ${i}`,prompt:'woman'})));expect(()=>compileSceneForModel(s,'nai-diffusion-4-full')).toThrow('SCENE_MODEL_CAPACITY');expect(compileSceneForModel(s,'nai-diffusion-5-full').characterPrompts).toHaveLength(7);});
 it('rejects invalid or unknown data rather than deleting facts',()=>{
   expect(readSceneBindings({...fixtures.scene,unexpected:'extra'})).toBeUndefined();
   expect(readSceneBindings({...fixtures.scene,facts:[...fixtures.scene.facts,{id:'bad',entityId:'missing',slot:'hair',prompt:'pink'}]})).toBeUndefined();
   expect(readSceneBindings({...fixtures.scene,entities:[...fixtures.scene.entities,fixtures.scene.entities[0]]})).toBeUndefined();
 });
 it('holds stale, locked and flat rewrites without changing the bound base',()=>{
   for(const raw of [{scene:base()},{positivePrompt:'a different person'}, {baseImageId:'wrong',scenePatch:fixtures.cases[0].patch},{baseImageId:'image',promptPatch:{replacements:[],append:['something']}}]){
     const result=resolveImagePrompt(raw,proposal());expect(result.continuity.reviewRequired).toBe(true);expect(result.scene).toEqual(base());
   }
 });
 it('binds the first scene and carries it into private context',()=>{
   const result=resolveImagePrompt({scene:fixtures.scene});expect(result.scene).toEqual(base());expect(result.continuity.reviewRequired).toBe(false);
   expect(imageStateContext({...proposal(),...result})).toContain('wearerId');
 });
 it('30 turns plus serialization retain all untouched character and garment facts',()=>{
   let current=proposal();
   for(let i=0;i<30;i++){
     const old=current.scene!.facts.find(f=>f.id==='setting')!;
     const result=resolveImagePrompt({baseImageId:current.id,scenePatch:{revision:current.scene!.revision,operations:[{collection:'facts',id:old.id,before:old,after:{...old,prompt:`street, lighting ${i}`}}]}},current);
     expect(result.continuity.reviewRequired).toBe(false);
     current=JSON.parse(JSON.stringify({...current,...result,id:`image-${i}`}));
     expect(current.scene!.facts.filter(f=>f.id!=='setting')).toEqual(base().facts.filter(f=>f.id!=='setting'));
   }
 });
 it('restores independent scene snapshots for alternate replies',()=>{
   const first=proposal();const second={...proposal(),id:'second',scene:applyScenePatch(base(),fixtures.cases[0].patch)};
   const m={id:'m',role:'assistant',content:'',status:'complete',attachments:[],tools:[],createdAt:'',imageProposal:first,swipes:['a','b'],swipeIndex:0,imageProposalSwipes:[first,second]} as AgentMessage;
   selectImageSwipe(m,1);expect(m.imageProposal!.scene).toEqual(second.scene);selectImageSwipe(m,0);expect(m.imageProposal!.scene).toEqual(first.scene);
 });
});
