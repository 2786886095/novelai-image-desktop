import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeGenerationParams } from './RandomArtistLab';
import { DEFAULT_PARAMS, NAI_MODELS } from './types';
import { detectiveParameters } from './artist-detective-contract';

const models = ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-5-full', 'nai-diffusion-5-curated'] as const;

describe('random gacha is independent from target iteration', () => {
  it.each(models)('preserves %s on restore and another persisted reopen', model => {
    const input = { ...DEFAULT_PARAMS, model, width: 1024, height: 1024, steps: 35, negativePrompt: 'kept negative', qualityPreset: 'light' as const, transparentBackground: true };
    const restored = normalizeGenerationParams(input, DEFAULT_PARAMS);
    const reopened = normalizeGenerationParams(JSON.parse(JSON.stringify(restored)), DEFAULT_PARAMS);
    for (const params of [restored, reopened]) {
      expect(params.model).toBe(model);
      expect(params).toMatchObject({ width: 1024, height: 1024, steps: 35, negativePrompt: 'kept negative' });
      expect(params.qualityPreset).toBe(model.startsWith('nai-diffusion-5-') ? 'light' : 'standard');
      expect(params.transparentBackground).toBe(model.startsWith('nai-diffusion-5-'));
      expect(params.qualityToggle).toBe(true);
    }
    expect(input.qualityPreset).toBe('light');
  });

  it.each(models)('preserves %s when syncing generation-page parameters', model => {
    expect(normalizeGenerationParams(undefined, { ...DEFAULT_PARAMS, model }).model).toBe(model);
  });

  it('does not resurrect quality when disabled or erase fixed seed and weighting text', () => {
    expect(normalizeGenerationParams({ model: 'nai-diffusion-5-full', qualityPreset: 'none', seed: 246813579, seedMode: 'fixed', negativePrompt: '1.3::kept tag::' }, DEFAULT_PARAMS)).toMatchObject({model: 'nai-diffusion-5-full', qualityPreset: 'none', qualityToggle: false, seed: 246813579, seedMode: 'fixed', negativePrompt: '1.3::kept tag::'});
  });

  it('only applies the 4.5 restriction to iteration, never the random model menu', () => {
    const ui = readFileSync(new URL('./RandomArtistLab.tsx', import.meta.url), 'utf8');
    expect(ui).toContain('{NAI_MODELS.map((model)');
    expect(ui).not.toContain('NAI_MODELS.filter(model=>model.value === "nai-diffusion-4-5-full")');
    for (const model of models) expect(NAI_MODELS.some(option => option.value === model)).toBe(true);
    expect(detectiveParameters().model).toBe('nai-diffusion-4-5-full');
    for (const model of models.filter(m => m.startsWith('nai-diffusion-5-'))) expect(() => detectiveParameters({model} as never)).toThrow();
    const legacy = readFileSync(new URL('./ArtistLab.tsx', import.meta.url), 'utf8');
    expect(legacy).toContain('model: "nai-diffusion-4-5-full" as const');
  });
});
