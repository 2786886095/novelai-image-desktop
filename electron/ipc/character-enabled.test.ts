import {describe, expect, it} from 'vitest';
import {buildPayload} from './nai';
import {DEFAULT_PARAMS, type CharCaptionItem} from '../../src/types';

const paused: CharCaptionItem = {enabled:false,prompt:'paused character',negativePrompt:'paused negative',useCoords:true,x:0,y:1};
const active: CharCaptionItem = {prompt:'active character',negativePrompt:'active negative',useCoords:false,x:.8,y:.2};
describe('per-character temporary enable switch at native request boundary',()=>{
 for(const model of ['nai-diffusion-4-5-full','nai-diffusion-4-5-curated','nai-diffusion-5-full','nai-diffusion-5-curated'] as const){
  it(`${model}: excludes paused positive/negative/positions in normal and pipe transports`,()=>{
   const extras={vibeImages:[],charCaptions:[paused,active]};
   const before=JSON.stringify(extras);
   const params={...DEFAULT_PARAMS,model,stylePrompt:'',positivePrompt:'base scene',negativePrompt:'',qualityPreset:'none' as const,ucPreset:3};
   const p=buildPayload(params,123,extras).parameters as any;
   expect(p.v4_prompt.caption.char_captions).toEqual([{char_caption:'active character',centers:[{x:.5,y:.5}]}]);
   expect(p.v4_negative_prompt.caption.char_captions).toEqual([{char_caption:'active negative',centers:[{x:.5,y:.5}]}]);
   expect(p.use_coords).toBe(false);
   expect(p.v4_prompt.use_coords).toBe(false);
   expect(p.v4_negative_prompt.use_coords).toBe(false);
   expect(buildPayload(params,123,extras,'pipe').input).toBe('base scene | active character');
   expect(JSON.stringify(p)).not.toContain('paused');
   expect(JSON.stringify(p)).not.toContain('enabled');
   expect(JSON.stringify(extras)).toBe(before);
   const restored=buildPayload(params,123,{...extras,charCaptions:[{...paused,enabled:true},active]}).parameters as any;
   expect(restored.v4_prompt.caption.char_captions).toHaveLength(2);
   expect(restored.v4_prompt.caption.char_captions[0]).toEqual({char_caption:'paused character',centers:[{x:0,y:1}]});
   expect(restored.v4_negative_prompt.caption.char_captions[0].char_caption).toBe('paused negative');
  });
 }
 it('all paused means no character conditioning, even with exact metadata replay',()=>{
  const p=buildPayload({...DEFAULT_PARAMS,preservePromptText:true,metadataReplay:{model:DEFAULT_PARAMS.model,parameters:{},keepEmptyNegativeCharacters:true}},123,{vibeImages:[],charCaptions:[paused]}).parameters as any;
  expect(p.v4_prompt.caption.char_captions).toEqual([]);
  expect(p.v4_negative_prompt.caption.char_captions).toEqual([]);
  expect(p.use_coords).toBe(false);
 });
 it('filters before capacity, keeps enabled order and aligned empty negatives',()=>{
  const extras={vibeImages:[],charCaptions:[...Array.from({length:10},()=>({...paused})),{...active,negativePrompt:''},active]};
  const p=buildPayload({...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full'},123,extras).parameters as any;
  expect(p.v4_prompt.caption.char_captions.map((c:any)=>c.char_caption)).toEqual(['active character','active character']);
  expect(p.v4_negative_prompt.caption.char_captions.map((c:any)=>c.char_caption)).toEqual(['','active negative']);
 });
});
