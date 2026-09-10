/** Narrow, version-bound metadata replay. Never forward arbitrary Comment JSON. */
export interface MetadataReplay {
  model: string;
  parameters: Record<string, boolean | number | string | null>;
  positive?: { use_order?: boolean; legacy_uc?: boolean };
  negative?: { use_order?: boolean; legacy_uc?: boolean };
  keepEmptyNegativeCharacters?: boolean;
}
const BOOL_FIELDS = new Set(['straight_alpha', 'quality_boost', 'legacy_v3_extend',
  'dynamic_thresholding', 'deliberate_euler_ancestral_bug', 'prefer_brownian',
  'explike_fine_detail', 'minimize_sigma_inf', 'uncond_per_vibe', 'wonky_vibe_correlation']);
const NUMBER_FIELDS: Record<string, [number, number]> = {
  uncond_scale: [0, 10], skip_cfg_below_sigma: [0, 1000],
  dynamic_thresholding_percentile: [0, 1], dynamic_thresholding_mimic_scale: [0, 100],
  controlnet_strength: [0, 2],
};
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function normalizeMetadataReplay(value: unknown): MetadataReplay | undefined {
  const source = object(value);
  if (!source || typeof source.model !== 'string' || !/^nai-diffusion-[a-z0-9-]{1,40}$/.test(source.model)) return;
  const parameters: MetadataReplay['parameters'] = {};
  for (const [key, value] of Object.entries(object(source.parameters) ?? {})) {
    if (BOOL_FIELDS.has(key) && typeof value === 'boolean') parameters[key] = value;
    const range = NUMBER_FIELDS[key];
    if (range && typeof value === 'number' && Number.isFinite(value) && value >= range[0] && value <= range[1]) parameters[key] = value;
    if (key === 'cfg_sched_eligibility' && typeof value === 'string'
      && ['enable_for_post_summer_samplers', 'enable', 'disable'].includes(value)) parameters[key] = value;
  }
  const flags = (value: unknown) => {
    const input = object(value) ?? {};
    return Object.fromEntries(['use_order','legacy_uc'].filter(key => typeof input[key] === 'boolean').map(key => [key, input[key]]));
  };
  return { model: source.model, parameters, positive: flags(source.positive), negative: flags(source.negative),
    keepEmptyNegativeCharacters: source.keepEmptyNegativeCharacters === true };
}

export function metadataReplayFromComment(comment: Record<string, unknown>, model: string | undefined): MetadataReplay | undefined {
  if (!model) return;
  const negative = object(comment.v4_negative_prompt);
  const negativeCaptions = object(negative?.caption)?.char_captions;
  return normalizeMetadataReplay({model, parameters: comment, positive:comment.v4_prompt, negative,
    keepEmptyNegativeCharacters: Array.isArray(negativeCaptions) && negativeCaptions.length > 0});
}
