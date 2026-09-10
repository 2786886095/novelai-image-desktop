import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {normalizeCharacterCaptions, normalizeCharacterPresets} from './character-presets';
import {useAppStore} from './store';

const captions = [{id:'alice',prompt:' blue coat, smile ',negativePrompt:'red coat',useCoords:true,x:0,y:1}, {id:'bob',prompt:'',negativePrompt:'',useCoords:false,x:.5,y:.5}];
describe('character persistence and presets (#8 #13)', () => {
 beforeEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
 afterEach(()=>vi.unstubAllGlobals());
 it('preserves blank values, exact text, order and zero coordinates',()=>{
  expect(normalizeCharacterCaptions(captions)).toEqual(captions);
 });
 it('repairs corrupted entries and duplicate identifiers without losing valid text',()=>{
  const result=normalizeCharacterCaptions([null, {...captions[0],x:NaN}, {...captions[0],y:-1}]);
  expect(result).toHaveLength(2);expect(result[0].x).toBe(.5);expect(result[1].y).toBe(0);
  expect(result[0].id).not.toBe(result[1].id);
 });
 it('normalizes presets without inventing missing entries',()=>{
  expect(normalizeCharacterPresets([{},null,{id:'a',name:'A',captions}, {id:'a',name:'Duplicate',captions}])).toHaveLength(1);
  expect(normalizeCharacterPresets(null)).toEqual([]);
 });
 it('writes edits, loads a fresh store, and persists removal of the final character',async()=>{
  let settings:any={language:'en-US',persistGenerateParams:true};
  const desktop={setSetting:vi.fn(async(key:string,value:unknown)=>{settings={...settings,[key]:structuredClone(value)};}),getSettings:async()=>settings,
   onGenerationPreview:()=>()=>{},onUpdateEvent:()=>()=>{},accountCached:async()=>({hasToken:false}),isFirstRun:async()=>false,
   getHistoryDates:async()=>[],getHistoryGroups:async()=>[],isPortable:async()=>false,getHistory:async()=>[]};
  vi.stubGlobal('window',{naiDesktop:desktop});
  await useAppStore.getState().load();useAppStore.getState().setCharCaptions(captions);
  useAppStore.getState().updateCharCaption('alice',{prompt:'green coat',x:0});
  useAppStore.setState(useAppStore.getInitialState(),true);await useAppStore.getState().load();
  expect(useAppStore.getState().charCaptions).toEqual([{...captions[0],prompt:'green coat'},captions[1]]);
  useAppStore.getState().clearCharCaptions();
  useAppStore.setState(useAppStore.getInitialState(),true);await useAppStore.getState().load();
  expect(useAppStore.getState().charCaptions).toEqual([]);
  settings={...settings,lastGenerationState:{...settings.lastGenerationState,charCaptions:captions},persistGenerateParams:false};
  useAppStore.setState(useAppStore.getInitialState(),true);await useAppStore.getState().load();
  expect(useAppStore.getState().charCaptions).toEqual([]);
 });
});
