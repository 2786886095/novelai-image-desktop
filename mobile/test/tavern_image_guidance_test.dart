import 'package:novelai_mobile/agent/tavern_image_guidance.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/tavern_builtins.dart';
import 'package:novelai_mobile/agent/tavern_prompt.dart';
import 'package:novelai_mobile/agent/tavern_image_guidance_data.dart';

void main() {
  List<String> ids(String? model, [String text = '只把她的外套改成红色']) =>
      activeTavernLorebookEntries([
        createSoftwareImageLorebook()
      ], [
        AgentMessage(id: 'u', role: 'user', content: text)
      ], imageModel: model)
          .map((e) => e.$2.id)
          .toList();
  test('offline guidance has stable IDs and source hashes', () {
    final entries = moyuImageGuidance['entries'] as List;
    expect(entries.length, 30);
    expect(entries.map((e) => e['id']).toSet().length, entries.length);
    expect(
        (moyuImageGuidance['sources'] as List).every(
            (s) => RegExp(r'^[a-f0-9]{64}$').hasMatch(s['sha256'] as String)),
        isTrue);
  });
  test('V5 and V4.5 select their own guidance, without guessing from chat', () {
    expect(ids('nai-diffusion-5-full'), contains('builtin-moyu-v5-9.7-21'));
    expect(ids('nai-diffusion-5-full'),
        isNot(contains('builtin-moyu-v45-8.31-9')));
    expect(ids('nai-diffusion-4-5-full'), contains('builtin-moyu-v45-8.31-9'));
    expect(ids('nai-diffusion-4-5-full'),
        isNot(contains('builtin-moyu-v5-9.7-21')));
    expect(ids(null, 'V5'), isNot(contains('builtin-moyu-v5-9.7-21')));
    expect(ids('anima'), isNot(contains('builtin-moyu-v5-9.7-21')));
    expect(ids(null).where((id) => id.startsWith('builtin-moyu-')), isEmpty);
    expect(
        ids('nai-diffusion-5-full')
            .where((id) => id.startsWith('builtin-moyu-'))
            .length,
        15);
    expect(
        ids('nai-diffusion-4-5-curated')
            .where((id) => id.startsWith('builtin-moyu-'))
            .length,
        15);
    expect(ids(null), isNot(contains('builtin-moyu-image-expression')));
  });
  test('entry text stays intact while macros render in a request-local scope',
      () {
    final book = createSoftwareImageLorebook();
    final before = jsonEncode(book.toJson());
    final active = activeTavernLorebookEntries([book], [],
        imageModel: 'nai-diffusion-4-5-full');
    final rendered = renderOriginalImageGuidance(active);
    expect(rendered.length, 15);
    expect(rendered.values.join(), contains('faceless male/female'));
    expect(rendered.values.join(), contains('size:1024x1024'));
    expect(jsonEncode(book.toJson()), before);
    expect(renderOriginalImageGuidance([]), isEmpty);
    for (final e
        in book.entries.where((e) => e.id.startsWith('builtin-moyu-'))) {
      final raw = (moyuImageGuidance['entries'] as List)
          .firstWhere((raw) => raw['id'] == e.id);
      expect(e.content, raw['content']);
    }
  });
  test('disabled macro entries do not break sends and V4.5 uses 8.31', () {
    final workspace = AgentWorkspace();
    final book = workspace.lorebooks.first;
    for (final uid in ['0', '8', '17']) {
      book.entries
          .firstWhere((e) => e.id == 'builtin-moyu-v45-8.31-$uid')
          .enabled = false;
    }
    final prompt = buildTavernSystemPrompt(TavernPromptContext(
      conversation: AgentConversation(id: 'c', title: 'V4.5', messages: []),
      characters: workspace.characters,
      activeCharacter: workspace.characters.first,
      persona: null,
      lorebooks: [book],
      preset: workspace.samplerPresets.first,
      imageDefaults:
          const TavernImageParameterDefaults(model: 'nai-diffusion-4-5-full'),
    ));
    expect(prompt, contains('# 锚点系统'));
    expect(prompt, isNot(contains('# 一致性控制')));
    expect(prompt.endsWith(moyuImageGuidance['runtimeContract'] as String),
        isTrue);
  });
  test('empty book list does not receive built-in guidance', () {
    expect(
        activeTavernLorebookEntries([], [], imageModel: 'nai-diffusion-5-full'),
        isEmpty);
  });
  test('recursive scan respects disabled and model-specific entries', () {
    final book = createSoftwareImageLorebook()..recursiveScanning = true;
    book.entries.firstWhere((e) => e.id == 'builtin-moyu-v5-9.7-3').enabled =
        false;
    final selected = activeTavernLorebookEntries([book], [],
            imageModel: 'nai-diffusion-5-full')
        .map((e) => e.$2.id);
    expect(selected, isNot(contains('builtin-moyu-v5-9.7-3')));
    expect(selected, isNot(contains('builtin-moyu-v45-8.31-9')));
    expect(selected, contains('builtin-moyu-v5-9.7-21'));
  });
  test(
      'old workspaces refresh rules without losing settings or disabled entries',
      () {
    final old = AgentWorkspace();
    old.characters.first.visual.stylePrompt = '';
    old.characters.first.visual.negativePrompt = '';
    old.lorebooks.first.entries
        .removeWhere((e) => e.id.startsWith('builtin-moyu-'));
    final disabledId = old.lorebooks.first.entries.first.id;
    old.lorebooks.first.entries.first.enabled = false;
    old.lorebooks.add(TavernLorebook(
        id: 'user-book',
        name: 'User book',
        entries: [
          TavernLorebookEntry(id: 'user-entry', content: 'preserve me')
        ]));
    final restored = AgentWorkspace.fromJson(
        jsonDecode(jsonEncode(old.toJson())) as Map<String, dynamic>);
    final builtin =
        restored.lorebooks.firstWhere((b) => b.id == softwareImageLorebookId);
    expect(
        builtin.entries
            .firstWhere((e) => e.id == 'builtin-moyu-v5-9.7-3')
            .enabled,
        isTrue);
    expect(
        builtin.entries.firstWhere((e) => e.id == disabledId).enabled, isFalse);
    expect(
        restored.lorebooks
            .firstWhere((b) => b.id == 'user-book')
            .entries
            .first
            .content,
        'preserve me');
    expect(restored.characters.first.visual.stylePrompt, '');
    expect(restored.characters.first.visual.negativePrompt, '');
    builtin.entries.firstWhere((e) => e.id == 'builtin-moyu-v5-9.7-3').enabled =
        false;
    final again = AgentWorkspace.fromJson(
        jsonDecode(jsonEncode(restored.toJson())) as Map<String, dynamic>);
    expect(
        again.lorebooks
            .firstWhere((b) => b.id == softwareImageLorebookId)
            .entries
            .firstWhere((e) => e.id == 'builtin-moyu-v5-9.7-3')
            .enabled,
        isFalse);
  });
  test(
      'assembled prompt contains guidance but retains the native image contract',
      () {
    final workspace = AgentWorkspace();
    final prompt = buildTavernSystemPrompt(TavernPromptContext(
      conversation: AgentConversation(id: 'c', title: 'Edit', messages: [
        AgentMessage(id: 'u', role: 'user', content: '只修改蓝外套，保持其余衣服')
      ]),
      characters: workspace.characters,
      activeCharacter: workspace.characters.first,
      persona: null,
      lorebooks: workspace.lorebooks,
      preset: workspace.samplerPresets.first,
      imageDefaults: const TavernImageParameterDefaults(
          model: 'nai-diffusion-5-full',
          count: 1,
          width: 832,
          height: 1216,
          scale: 0),
    ));
    expect(prompt, contains('服装签名'));
    expect(prompt, contains('scenePatch'));
    expect(prompt, contains('promptPatch'));
    expect(prompt, contains('<langbai-image>'));
    final text = (moyuImageGuidance['entries'] as List)
        .map((e) => e['content'])
        .join('\n');
    expect(text, contains('{{setvar::'));
    expect(
        RegExp(r'\{\{(?:setvar|getvar)::(?:图片总数|尺寸|NAI|male|解析格式|Danbooru)')
            .hasMatch(prompt),
        isFalse);
    expect(prompt.endsWith(moyuImageGuidance['runtimeContract'] as String),
        isTrue);
  });
}
