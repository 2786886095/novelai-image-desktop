import { describe, expect, it } from 'vitest';
import { StudioGenerationPreparations, type StudioGenerationPreview } from './pi-generation-preparation';

const preview: StudioGenerationPreview = {
  positivePrompt: '1girl, rain', model: 'nai-diffusion-5-full',
  width: 832, height: 1216, steps: 28, count: 1,
  imageProvider: 'novelai', estimatedAnlas: 22,
  estimateSource: 'local-estimate', warning: 'estimate only',
};

describe('Studio generation preparation', () => {
  it('is scoped to a session and consumed only once', () => {
    const plans = new StudioGenerationPreparations();
    const args = { positivePrompt: '1girl, rain', count: 1 };
    const prepared = plans.prepare('session-a', args, 'settings-a', preview);
    args.positivePrompt = 'changed after prepare';
    expect(() => plans.inspect('session-b', prepared.preparationId, 'settings-a')).toThrow();
    expect(plans.consume('session-a', prepared.preparationId, 'settings-a')).toEqual({ positivePrompt: '1girl, rain', count: 1 });
    expect(() => plans.consume('session-a', prepared.preparationId, 'settings-a')).toThrow();
  });

  it('rejects setting drift and expiration before execution', () => {
    let time = 0;
    const plans = new StudioGenerationPreparations(() => time);
    const first = plans.prepare('session', { positivePrompt: 'cat' }, 'old', preview);
    expect(() => plans.consume('session', first.preparationId, 'new')).toThrow('设置已变化');
    time = 600_000;
    expect(() => plans.consume('session', first.preparationId, 'old')).toThrow('已过期');
  });

  it('rejects an empty prompt or oversized plan', () => {
    const plans = new StudioGenerationPreparations();
    expect(() => plans.prepare('session', { positivePrompt: '' }, 'settings', preview)).toThrow();
    expect(() => plans.prepare('session', { positivePrompt: 'x'.repeat(20_001) }, 'settings', preview)).toThrow();
  });
});
