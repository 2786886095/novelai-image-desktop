import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/google_prompt_translation.dart';

void main() {
  final fixtures = jsonDecode(
      File('../shared/google-prompt-translation-fixtures.json')
          .readAsStringSync()) as List;
  for (var i = 0; i < fixtures.length; i++) {
    final row = fixtures[i] as Map<String, dynamic>;
    test('Google labels shared case $i', () async {
      final categories = row['categories'] as Map<String, dynamic>?;
      final plan = await prepareGooglePromptTranslation(row['input'] as String,
          lookupCategory: (tag) async => categories?[tag] as int?);
      expect(plan.queries, row['queries']);
      expect(plan.restore((row['responses'] as List).cast<String>()),
          row['output']);
    });
  }
  test('fails closed on malformed provider output', () async {
    final plan = await prepareGooglePromptTranslation('black_hat, blonde_hair');
    for (final responses in <List<String>>[
      [],
      ['merged'],
      ['黑帽\n'],
      ['黑帽\n金发\nextra'],
      ['黑帽\n金发|other'],
      ['黑帽\n1.2::金发']
    ]) {
      expect(() => plan.restore(responses), throwsFormatException);
    }
  });
  test('deduplicates and bounds batches without dropping labels', () async {
    final tags = List.generate(
        300, (i) => 'descriptive_${i.toString().padLeft(3, '0')}_longer_label');
    final plan = await prepareGooglePromptTranslation(tags.join(', '),
        lookupCategory: (_) async => 0);
    expect(plan.queries.length, greaterThan(1));
    expect(plan.queries.every((q) => q.length <= 1200), isTrue);
    expect(plan.restore(plan.queries),
        tags.map((t) => t.replaceAll('_', ' ')).join(', '));
  });
  test('index failure must not suppress unlisted descriptions', () async {
    final plan = await prepareGooglePromptTranslation(
        'character:misumi_uika, unlisted_description, black_hat',
        lookupCategory: (_) async => throw StateError('missing index'));
    expect(plan.queries, ['unlisted description\nblack hat']);
    expect(
        plan.restore(['未列出的描述\n黑色帽子']), 'character:misumi_uika, 未列出的描述, 黑色帽子');
  });
  test('oversized input rejected before any lookup', () async {
    var calls = 0;
    await expectLater(
        prepareGooglePromptTranslation('{${List.filled(20001, 'a').join()}}',
            lookupCategory: (_) async {
          calls++;
          return 0;
        }),
        throwsFormatException);
    expect(calls, 0);
  });
}
