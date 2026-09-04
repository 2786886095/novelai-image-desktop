import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/dsh_image_ai.dart';

void main() {
  group('built-in DSH image AI adapter', () {
    test('supports exactly the three scoped image tasks', () {
      expect(buildDshImageAiSystemAddon(DshImageAiTask.tavernImage),
          contains('<langbai-image>'));
      expect(buildDshImageAiSystemAddon(DshImageAiTask.reverse),
          contains('Inspect the supplied image directly'));
      expect(buildDshImageAiSystemAddon(DshImageAiTask.convert),
          contains('Convert the supplied description directly'));
    });

    test('disabled mode preserves the original system prompt', () {
      expect(
        injectDshImageAiSystemPrompt(
          task: DshImageAiTask.reverse,
          systemPrompt: 'BASE',
          enabled: false,
        ),
        'BASE',
      );
    });

    test('settings persist and normalize the mode', () {
      final strict = AppSettings.fromJson({
        'reverseConvertDshEnabled': false,
        'reverseConvertDshMode': 'strict',
      });
      expect(strict.reverseConvertDshEnabled, isFalse);
      expect(strict.reverseConvertDshMode, 'strict');
      expect(strict.toJson()['reverseConvertDshMode'], 'strict');

      final defaults = AppSettings.fromJson({});
      expect(defaults.reverseConvertDshEnabled, isTrue);
      expect(defaults.reverseConvertDshMode, 'focused');
    });
  });
}
