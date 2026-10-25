// Keep this allowlist explicit: unknown or future model IDs retain the existing
// request contract rather than being forced into adaptive thinking.
const _adaptiveModels = <String>{
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5',
  'claude-fable-5-1',
  'claude-mythos-preview',
  'claude-mythos-5',
  'claude-mythos-5-1',
};

// These models can still run without thinking when the provider chooses auto.
const _optionalThinkingModels = <String>{
  'claude-opus-4-6',
  'claude-sonnet-4-6',
};

String _canonicalModel(String model) {
  var canonical = model.trim().toLowerCase().split('/').last.replaceAll('.', '-');
  final suffix = RegExp(r'(?:-\d{8}|-latest|-thinking|:thinking)$');
  // Gateways may combine a dated/latest alias with a thinking suffix. Limit
  // normalization so arbitrary unknown model names are not broadly accepted.
  for (var i = 0; i < 2; i++) {
    final stripped = canonical.replaceFirst(suffix, '');
    if (stripped == canonical) break;
    canonical = stripped;
  }
  return canonical;
}

class AnthropicThinkingOptions {
  final Map<String, dynamic> fields;
  final bool omitSampling;

  const AnthropicThinkingOptions({
    this.fields = const {},
    this.omitSampling = false,
  });
}

AnthropicThinkingOptions anthropicThinkingOptions(
  String model,
  Object? reasoningEffort,
) {
  final canonical = _canonicalModel(model);
  if (!_adaptiveModels.contains(canonical)) {
    return const AnthropicThinkingOptions();
  }
  final effort = reasoningEffort?.toString() ?? 'auto';
  final explicitEffort = const {'low', 'medium', 'high'}.contains(effort);
  return AnthropicThinkingOptions(
    fields: explicitEffort
        ? {
            'thinking': {'type': 'adaptive'},
            'output_config': {'effort': effort},
          }
        : const {},
    // Sampling controls are incompatible with explicit adaptive thinking and
    // with the known always-on-thinking models even when effort is automatic.
    omitSampling: explicitEffort || !_optionalThinkingModels.contains(canonical),
  );
}
