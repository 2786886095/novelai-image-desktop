import {it,expect} from 'vitest';
import fixture from '../../shared/tavern-scene-fixtures.json';
import {resolveImagePrompt} from '../../src/tavern/image-continuity';
import {compileSceneForModel} from '../../src/tavern/scene-generation';
import {buildAgentGenerationInput} from '../../src/agent/generation-input';
import {DEFAULT_PARAMS} from '../../src/types';
import {buildPayload} from './nai';
it.each(['nai-diffusion-4-full','nai-diffusion-4-5-full','nai-diffusion-5-full'])('scene reaches native char_captions for %s',model=>{
 const resolved=resolveImagePrompt({scene:fixture.scene},undefined,model);expect(resolved.continuity.reviewRequired).toBe(false);
 const compiled=compileSceneForModel(resolved.scene!,model);
 const {params,extras}=buildAgentGenerationInput({...compiled,model,stylePrompt:'',negativePrompt:''},{params:{...DEFAULT_PARAMS,stylePrompt:'MUST_NOT_LEAK',qualityToggle:false,qualityPreset:'none',ucPreset:3}});
 const payload=buildPayload(params,123,extras);const chars=(payload.parameters.v4_prompt as any).caption.char_captions;
 expect(chars).toHaveLength(2);expect(chars[0].char_caption).toContain('red hair');expect(chars[0].char_caption).not.toContain('blonde hair');
 expect(chars[1].char_caption).toContain('blonde hair');expect(chars[1].char_caption).toContain('Wearing jacket, blue.');expect(payload.input).not.toContain('MUST_NOT_LEAK');
 expect(chars[0].centers).toEqual([{x:0,y:1}]);
});
