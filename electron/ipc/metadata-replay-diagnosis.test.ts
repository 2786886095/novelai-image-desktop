import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import sample from '../../shared/fixtures/metadata-replay-v5.json';
import {inspectImageMetadata} from '../../src/png-meta';
import {normalizeGenerateParams} from '../../src/types';
import {buildPayload} from './nai';
import {useAppStore} from '../../src/store';
import type {GenerateParams,GenerateExtras} from '../../src/types';

const source=JSON.parse(sample.metadata.Comment);
const report=inspectImageMetadata(sample.metadata);
beforeEach(()=>useAppStore.setState(useAppStore.getInitialState(),true));
afterEach(()=>vi.unstubAllGlobals());
it('preserves exact base and independent character captions and sampling flags from the PNG',()=>{
 const params=normalizeGenerateParams(report.imported);
 const payload=buildPayload(params,params.seed,{vibeImages:[],charCaptions:report.characterCaptions});
 expect.soft(payload.input).toBe(source.v4_prompt.caption.base_caption);
 expect.soft(payload.parameters.uc).toBe(source.uc);
 expect.soft(payload.parameters.straight_alpha).toBe(source.straight_alpha);
 expect.soft(payload.parameters.v4_prompt).toEqual(source.v4_prompt);
 expect.soft(payload.parameters.v4_negative_prompt).toEqual(source.v4_negative_prompt);
 for(const key of ['steps','scale','cfg_rescale','noise_schedule','sampler','seed','width','height',
  'uncond_scale','quality_boost','dynamic_thresholding','prefer_brownian','cfg_sched_eligibility'])
  expect.soft(payload.parameters[key],key).toEqual(source[key]);
});
it.each(['generate','generateI2I'] as const)('preserves uint32 seed through actual %s renderer action to request body',async(action)=>{
 const requests:ReturnType<typeof buildPayload>[]=[];
 const capture=vi.fn(async(params:GenerateParams,extras?:GenerateExtras)=>{
  requests.push(buildPayload(params,params.seed,extras));
  return {ok:true,message:'captured locally; no remote generation',items:[]};
 });
 vi.stubGlobal('window',{naiDesktop:{
  generate:capture,generateI2I:vi.fn(async(params:GenerateParams)=>capture(params)),
  setSetting:vi.fn().mockResolvedValue(undefined),
  hasToken:vi.fn().mockResolvedValue({hasToken:true,anlasBalance:100,tierName:'Opus'}),
  quoteAnlas:vi.fn().mockResolvedValue({ok:true,amount:0,balance:100}),
  loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image:'test-image',width:832,height:1152}),
  getHistoryDates:vi.fn().mockResolvedValue([]),getHistory:vi.fn().mockResolvedValue([]),getHistoryGroups:vi.fn().mockResolvedValue([]),
 }});
 useAppStore.setState({account:{hasToken:true,anlasBalance:100},batchCount:2,batchIntervalSeconds:0,
  workbenchImage:{filePath:'fixture.png',fileUrl:'nai-local://fixture.png',width:832,height:1152},i2iSizeMode:'params'} as any);
 useAppStore.getState().restoreImportedMetadata(report.imported,report.characterCaptions);
 await useAppStore.getState()[action]();
 expect(requests.length).toBe(2);
 expect.soft(requests.map(p=>p.parameters.seed)).toEqual([2707568019,2707568020]);
 expect.soft(requests[0].input).toBe(source.v4_prompt.caption.base_caption);
 expect.soft(requests[0].parameters.uc).toBe(source.uc);
 if(action==='generate')expect.soft(requests[0].parameters.v4_prompt).toEqual(source.v4_prompt);
});
