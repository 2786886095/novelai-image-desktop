import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/image_continuity.dart';
import 'package:novelai_mobile/agent/style_draw.dart';
import 'package:novelai_mobile/agent/tavern_prompt.dart';

void main() {
  final draws = jsonDecode(
          File('../shared/tavern-style-draw-fixtures.json').readAsStringSync())
      as List;
  for (final f in draws) {
    test('shared draw seed ${f['seed']}', () {
      expect(
          drawStyleTags(
              List<String>.from(f['tags']),
              List<String>.from(f['pinned']),
              f['count'] as int,
              (f['min'] as num).toDouble(),
              (f['max'] as num).toDouble(),
              f['seed'] as int),
          f['expected']);
    });
  }

  final fixtures = jsonDecode(
          File('../shared/tavern-continuity-fixtures.json').readAsStringSync())
      as List;
  for (final f in fixtures) {
    test(f['name'] as String, () {
      final result = resolveImagePrompt(
          Map<String, dynamic>.from(f['raw']),
          f['base'] == null
              ? null
              : TavernImageProposal.fromJson(
                  Map<String, dynamic>.from(f['base'])));
      expect(result.positivePrompt, f['expected']);
      expect(result.continuity['reviewRequired'], f['review']);
    });
  }
  test('30 image edits retain clothing across persistence', () {
    var base = TavernImageProposal.fromJson(
        Map<String, dynamic>.from(fixtures.first['base']));
    for (var i = 0; i < 30; i++) {
      final result = resolveImagePrompt({
        'baseImageId': base.id,
        'promptPatch': {
          'replacements': [],
          'append': ['scene detail $i']
        }
      }, base);
      base = TavernImageProposal.fromJson({
        ...base.toJson(),
        'positivePrompt': result.positivePrompt,
        'continuity': result.continuity
      });
      expect(base.positivePrompt, contains('red coat, white shirt'));
    }
    expect(base.continuity?['reviewRequired'], false);
  });
  test('patch-only model responses survive parsing', () {
    final p = parseLangbaiImageProposal(
            '<langbai-image>{"baseImageId":"base","promptPatch":{"replacements":[],"append":["night"]}}</langbai-image>')
        .proposal;
    expect(p, isNotNull);
    expect(p!.promptPatch?['append'], ['night']);
  });
  test(
      'exact image state survives a summary and explicit reset clears only inheritance',
      () {
    final base = TavernImageProposal.fromJson(
        Map<String, dynamic>.from(fixtures.first['base']));
    final m = AgentMessage(id: 'old', role: 'assistant', imageProposal: base);
    expect(imageStateContext(latestImageState([m])),
        contains('red coat, white shirt'));
    expect(latestImageState([m], resetAt: '2026-09-08T01:00:00.000Z'), isNull);
    expect(m.imageProposal?.positivePrompt, 'red coat, white shirt');
  });
  test('style draws are deterministic and preserve pinned tags', () {
    final result = drawStyleTags(['watercolor', 'lineart', 'soft lighting'],
        ['lineart'], 1, .2, 1.2, 42);
    expect(
        result,
        drawStyleTags(['watercolor', 'lineart', 'soft lighting'], ['lineart'],
            1, .2, 1.2, 42));
    expect(result, contains('::lineart::'));
    expect(appendStylePrompt('artist:name', result), 'artist:name, $result');
    expect(drawStyleTags(['lineart'], [], 1, 0, 0, 0), '0::lineart::');
  });
}
