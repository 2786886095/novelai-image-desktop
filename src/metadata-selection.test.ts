import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import sample from '../shared/fixtures/metadata-replay-v5.json';
import {inspectImageMetadata} from './png-meta';
import {metadataApplyKeys,selectedMetadata} from './metadata-selection';
import {useAppStore} from './store';
import {normalizeGenerateParams,seedForBatch} from './types';
import {normalizeMetadataReplay} from './metadata-replay';

const report=inspectImageMetadata(sample.metadata);
beforeEach(()=>{
 useAppStore.setState(useAppStore.getInitialState(),true);
 vi.stubGlobal('window',{naiDesktop:{setSetting:vi.fn().mockResolvedValue(undefined)}});
});
afterEach(()=>vi.unstubAllGlobals());
describe('selective metadata restore',()=>{
 it('defaults include every available field and characters, reference reset, model mode',()=>{
  const keys=metadataApplyKeys(report);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toEqual(expect.arrayContaining(['positivePrompt','negativePrompt','seed','metadataReplay','characterCaptions','referenceImages','modelMode']));
  const all=selectedMetadata(report,new Set(keys));
  expect(all.patch).toEqual(report.imported);
  expect(all.options).toMatchObject({restoreCharacters:true,resetReferences:true,modelMode:'anime'});
  expect(all.captions).toEqual(report.characterCaptions);
 });
 it('unselected seed, negative prompt, characters and references remain unchanged',()=>{
  useAppStore.setState(state=>({params:{...state.params,seed:77,seedMode:'random',negativePrompt:'keep'},
   charCaptions:[{id:'existing',prompt:'existing character',x:.1,y:.2}],
   vibeImages:[{id:'vibe',filePath:'vibe.png'}],preciseReferences:[{id:'precise',filePath:'ref.png'}]} as any));
  const before=useAppStore.getState();
  const selected=selectedMetadata(report,new Set(['positivePrompt','width','height']));
  before.restoreImportedMetadata(selected.patch,selected.captions,selected.options);
  const after=useAppStore.getState();
  expect(after.params.positivePrompt).toBe(report.imported.positivePrompt);
  expect(after.params.seed).toBe(77);expect(after.params.seedMode).toBe('random');
  expect(after.params.negativePrompt).toBe('keep');
  expect(after.charCaptions).toBe(before.charCaptions);
  expect(after.vibeImages).toBe(before.vibeImages);expect(after.preciseReferences).toBe(before.preciseReferences);
 });
 it('all-selected restores independent captions and clears stale reference conditioning',()=>{
  useAppStore.setState({vibeImages:[{}],preciseReferences:[{}],charCaptions:[{id:'old',prompt:'old'}]} as any);
  const all=selectedMetadata(report,new Set(metadataApplyKeys(report)));
  useAppStore.getState().restoreImportedMetadata(all.patch,all.captions,all.options);
  const state=useAppStore.getState();
  expect(state.params.seed).toBe(2707568019);expect(state.params.seedMode).toBe('fixed');
  expect(state.params.stylePrompt).toBe('');expect(state.params.ucPreset).toBe(3);
  expect(state.charCaptions.map(({id,...c})=>c)).toEqual(report.characterCaptions);
  expect(state.vibeImages).toEqual([]);expect(state.preciseReferences).toEqual([]);
 });
 it('preserves empty prompts, fixed zero seed, false flags and zero CFG-rescale',()=>{
  const zero=inspectImageMetadata({Software:'NovelAI',Source:'NovelAI Diffusion V5',Comment:JSON.stringify({prompt:'  tag, tag,\n',uc:'',seed:0,steps:28,scale:5,cfg_rescale:0,straight_alpha:false})});
  expect(zero.imported).toMatchObject({positivePrompt:'  tag, tag,\n',negativePrompt:'',seed:0,seedMode:'fixed',cfgRescale:0});
  const result=selectedMetadata(zero,new Set(metadataApplyKeys(zero)));
  expect(result.patch.negativePrompt).toBe('');expect(result.patch.metadataReplay?.parameters.straight_alpha).toBe(false);
 });
 it('can explicitly clear empty source characters without clearing unselected references',()=>{
  const empty={...report,characterCaptions:[]};
  useAppStore.setState({charCaptions:[{id:'old',prompt:'old'}],vibeImages:[{}]} as any);
  const selected=selectedMetadata(empty,new Set(['characterCaptions']));
  useAppStore.getState().restoreImportedMetadata(selected.patch,selected.captions,selected.options);
  expect(useAppStore.getState().charCaptions).toEqual([]);expect(useAppStore.getState().vibeImages).toHaveLength(1);
 });
 it('empty selection has an empty patch and no destructive resets',()=>{
  expect(selectedMetadata(report,new Set())).toEqual({patch:{},captions:[],options:{preserveMissing:true,restoreCharacters:false,resetReferences:false}});
 });
});
it.each([0,1,2147483647,2147483648,2707568019,4294967295])('preserves first uint32 seed %s',seed=>{
 expect(seedForBatch(seed,0)).toBe(seed);expect(seedForBatch(seed,1)).toBe((seed+1)%4294967296);
 expect(normalizeGenerateParams({seed,seedMode:'fixed'}).seed).toBe(seed);
});
it('drops unknown replay fields and rejects invalid sampler flag values',()=>{
 const result=normalizeMetadataReplay({model:'nai-diffusion-5-full',parameters:{straight_alpha:true,uncond_scale:0,controlnet_strength:999,seed:1,image:'x',url:'https://example.com',dynamic_thresholding:'yes',cfg_sched_eligibility:'unknown'}});
 expect(result?.parameters).toEqual({straight_alpha:true,uncond_scale:0});
 expect(normalizeMetadataReplay({model:'unknown'})).toBeUndefined();
});
