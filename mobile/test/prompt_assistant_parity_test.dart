import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/prompt_assistant_dialog.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  test('prompt assistant has localized optimize/custom/apply labels', () {
    for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      final labels = promptAssistantLabels(language);
      for (final key in ['optimize', 'custom', 'instruction', 'preview', 'apply', 'stale']) {
        expect(labels[key], isNotEmpty);
      }
    }
  });

  test('editing request validates source and instructions before network', () async {
    final api = NaiApi();
    Future<AiTextResult> run(String kind, String source, String instruction) =>
        api.assistPrompt(settings: AppSettings(), apiKey: '', currentPrompt: source,
          instruction: instruction, kind: kind,
          mode: ReversePromptMode.tags, templateVersion: 'v5', conversionTemplate: 'template');
    await expectLater(run('optimize', '', ''), throwsFormatException);
    await expectLater(run('custom', 'tag', ''), throwsFormatException);
    await expectLater(run('unexpected', 'tag', 'edit'), throwsArgumentError);
    final missingKey = await run('custom', 'tag', 'edit');
    expect(missingKey.ok, isFalse);
    expect(missingKey.message, contains('Configure'));
  });
}
