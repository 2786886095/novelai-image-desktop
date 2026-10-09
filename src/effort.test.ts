import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EffortControl} from './components/EffortControl';
import { describe, it, expect } from 'vitest';
import {DEFAULT_PARAMS,normalizeGenerateParams,effectiveNAIEffortParams,isNAIMediumEffort} from './types';
import {calculateImageGenerationAnlas,estimateOpusImages} from './anlas';
import {buildAgentGenerationInput} from './agent/generation-input';
import {resolveTavernImageProposalParameters} from './tavern/prompt';

const paid={hasToken:true,tierLevel:1,hasActiveSubscription:true,anlasBalance:1000};
describe('NovelAI Effort / immutable batch contract',()=>{
  it.each(['medium','high'] as const)('renders %s title and options without explanatory small text',effort=>{
    const html=renderToStaticMarkup(createElement(EffortControl,{model:'nai-diffusion-5-full',value:effort,language:'zh-CN',onChange:()=>{}}));
    expect(html).toContain('生成档位（Effort）');
    expect(html).toContain('Medium'); expect(html).toContain('High');
    expect(html).not.toContain('<small'); expect(html).not.toContain('effort-explanation');
    expect(html).not.toContain('Euler Ancestral'); expect(html).not.toContain('批量张数');
  });
  it('defaults old saves to High and keeps quality tags independent',()=>{
    expect(normalizeGenerateParams({}).effort).toBe('high');
    expect(normalizeGenerateParams({...DEFAULT_PARAMS,effort:'medium',qualityPreset:'light'}).qualityPreset).toBe('light');
  });
  it('projects Medium without destroying High settings or the input object',()=>{
    const input={...DEFAULT_PARAMS,effort:'medium' as const,steps:37,sampler:'k_euler' as const,negativePrompt:'keep my UC',cfgRescale:.45};
    const before=JSON.stringify(input);
    expect(effectiveNAIEffortParams(input)).toMatchObject({model:'nai-diffusion-5-full-medium',steps:14,sampler:'k_euler_ancestral',cfgRescale:0,negativePrompt:'',ucPreset:0});
    expect(JSON.stringify(input)).toBe(before);
    expect(effectiveNAIEffortParams({...input,effort:'high'})).toMatchObject({steps:37,sampler:'k_euler',cfgRescale:.45,negativePrompt:'keep my UC'});
  });
  it.each(['nai-diffusion-5-curated','nai-diffusion-4-5-full'])('does not send Medium to unsupported %s',model=>{
    const params={...DEFAULT_PARAMS,model,effort:'medium' as const};
    expect(isNAIMediumEffort(params)).toBe(false);
    expect(effectiveNAIEffortParams(params).model).toBe(model);
  });
  it('uses the exact public frontend rounding, V5 factor and Medium step factor',()=>{
    const params={...DEFAULT_PARAMS,width:1024,height:1024,steps:23};
    const batchCount=3;
    expect(calculateImageGenerationAnlas({params,account:paid,batchCount}).amount).toBe(78);
    expect(calculateImageGenerationAnlas({params:{...params,effort:'medium'},account:paid,batchCount}).amount).toBe(54);
    expect(batchCount).toBe(3);
    expect(estimateOpusImages(params,50)).toBe(865);
    expect(estimateOpusImages({...params,effort:'medium'},50)).toBe(1249);
    expect(estimateOpusImages({...params,width:1536},50)).toBe(0);
  });
  it('prices exhausted V5 allowance with Anlas instead of claiming free',()=>{
    const opus={...paid,tierLevel:3,opusUsage:{percent:0,isNegative:true,timeUntilNextPercent:6000}};
    expect(calculateImageGenerationAnlas({params:DEFAULT_PARAMS,account:opus}).amount).toBeGreaterThan(0);
    expect(estimateOpusImages(DEFAULT_PARAMS,0)).toBe(0);
  });
  it('accepts Agent explicit Effort and retains authoritative count',()=>{
    const input=buildAgentGenerationInput({effort:'medium',positivePrompt:'1girl'},{params:DEFAULT_PARAMS});
    expect(input.params.effort).toBe('medium');
    expect(effectiveNAIEffortParams(input.params).steps).toBe(14);
    const defaults={model:'nai-diffusion-5-full',effort:'high' as const,count:4,steps:30};
    const proposal=resolveTavernImageProposalParameters({effort:'medium',count:8,explicitParameters:['effort']},defaults);
    expect(proposal).toMatchObject({effort:'medium',count:4,steps:30});
    expect(resolveTavernImageProposalParameters({effort:'high',explicitParameters:[]},{...defaults,effort:'medium'}).effort).toBe('medium');
  });
  it('restores actual Medium wire models from image metadata',()=>{
    expect(normalizeGenerateParams({...DEFAULT_PARAMS,model:'nai-diffusion-5-full-medium' as never})).toMatchObject({model:'nai-diffusion-5-full',effort:'medium'});
    expect(effectiveNAIEffortParams({...DEFAULT_PARAMS,effort:'medium',model:'nai-diffusion-5-full-inpainting'}).model).toBe('nai-diffusion-5-full-medium-inpainting');
  });
});
