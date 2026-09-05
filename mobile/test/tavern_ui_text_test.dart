import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/i18n/tavern_ui_text.dart';

void main() {
  test('Tavern AI extra copy covers all supported locales', () {
    const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];
    for (final locale in locales) {
      final text = tavernExtraText(locale);
      expect(text.length, greaterThanOrEqualTo(90));
      for (final key in [
        'starterGenerateTitle',
        'modelSupportHint',
        'promptDialogTitle',
        'detectModels',
        'contextLength',
        'maxOutput',
      ]) {
        expect(text[key], isNotEmpty, reason: '$locale:$key');
      }
    }
    expect(tavernExtraText('en-US')['detectModels'], contains('Detect'));
    expect(tavernExtraText('zh-TW')['contextLength'], contains('長度'));
    expect(tavernExtraText('ja-JP')['promptDialogTitle'], contains('プロンプト'));
    expect(tavernExtraText('ko-KR')['modelSupportHint'], contains('모델'));
  });

  test('runtime Tavern screen has no hard-coded Chinese presentation strings', () {
    final source = File('lib/screens/agent_screen.dart').readAsStringSync();
    final runtime = source.substring(source.indexOf('Widget _emptyChat'))
        .replaceAll("'软件智能生图'", '');
    expect(RegExp(r'[\u4e00-\u9fff]').hasMatch(runtime), isFalse);
  });

  test('formatter replaces all named fields', () {
    expect(
      formatTavernText('{count} entries · {tokens}', {'count': 3, 'tokens': 900}),
      '3 entries · 900',
    );
  });
}
