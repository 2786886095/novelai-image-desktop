// Documented adaptive-thinking models only. Do not infer future or arbitrary
// gateway model capabilities from a broad "claude" prefix.
const ADAPTIVE_MODELS = new Set([
  'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8',
  'claude-opus-5', 'claude-opus-5-5',
  'claude-sonnet-4-6', 'claude-sonnet-5', 'claude-sonnet-5-5',
  'claude-haiku-5-5', 'claude-fable-5', 'claude-fable-5-1',
  'claude-mythos-preview', 'claude-mythos-5', 'claude-mythos-5-1',
]);

export function anthropicThinkingCapabilities(modelId: string) {
  let canonical = modelId.trim().toLowerCase().split('/').at(-1)!.replaceAll('.', '-');
  // Classify familiar aliases without rewriting the model ID sent upstream.
  for (let i = 0; i < 2; i++) {
    const stripped = canonical.replace(/(?:-\d{8}|-latest|-thinking|:thinking)$/, '');
    if (stripped === canonical) break;
    canonical = stripped;
  }
  if (!ADAPTIVE_MODELS.has(canonical)) return undefined;
  return {
    adaptive: true as const,
    // Auto on 4.6 must retain the caller's previously valid sampling setting.
    supportsTemperature: canonical === 'claude-opus-4-6' || canonical === 'claude-sonnet-4-6',
  };
}
