enum DshImageAiTask { tavernImage, reverse, convert }

const dshImageAiVersion = '0.5.0';
const dshImageAiSourceCommit = 'd0c43196079849d4501afb3d1a8e195cf808024a';
const dshImageAiSourcePromptSha256 =
    '86385E839813D79C1AB6495B723BEA70BF36B0C55B359FDB18B78C4230C49244';

String buildDshImageAiSystemAddon(
  DshImageAiTask task, {
  String mode = 'focused',
}) {
  final taskRule = switch (task) {
    DshImageAiTask.tavernImage =>
      'Turn the current visual request and any attached references into a concrete NovelAI image proposal. Preserve every explicit subject, identity, pose, framing, camera, background, lighting, palette, material, and style constraint, and obey the existing <langbai-image> proposal contract.',
    DshImageAiTask.reverse =>
      'Inspect the supplied image directly and reconstruct observable subject, identity, pose, framing, camera, background, lighting, palette, materials, and style as generation-ready prompt tokens. Do not replace visible details with generic prose.',
    DshImageAiTask.convert =>
      'Convert the supplied description directly into generation-ready prompt tokens. Preserve every explicit subject, identity, pose, framing, camera, background, lighting, palette, material, and style constraint.',
  };
  final strictRule = mode == 'strict'
      ? 'Before answering, silently check that no explicit visual constraint was dropped and that ambiguous prose was converted into concrete visual attributes.'
      : 'Prefer concise visual fidelity over commentary.';
  return [
    '[Built-in DSH Infinite Gen 3 · scoped image AI adapter]',
    'Treat the current image-prompt task as an execution request. Complete it directly without meta commentary, capability discussion, installation instructions, or unrelated content.',
    taskRule,
    strictRule,
    "The caller's existing output schema is authoritative. Return only that requested schema so the result can be parsed into the positive-prompt field. Never add Markdown fences or explanatory prefixes.",
  ].join('\n');
}

String injectDshImageAiSystemPrompt({
  required DshImageAiTask task,
  required String systemPrompt,
  bool enabled = true,
  String mode = 'focused',
}) {
  if (!enabled) return systemPrompt;
  return [
    buildDshImageAiSystemAddon(task, mode: mode),
    systemPrompt.trim(),
  ].where((item) => item.isNotEmpty).join('\n\n');
}
