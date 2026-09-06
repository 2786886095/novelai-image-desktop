import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/agent/lyra_preset_data.dart';
import 'package:novelai_mobile/agent/tavern_models.dart';
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

    test('every Tavern request uses the shared DSH injection path', () {
      final source = File('lib/agent/agent_controller.dart').readAsStringSync();
      expect(source, contains('task: DshImageAiTask.tavernImage'));
      expect(source, isNot(contains('active.id == softwareImageCharacterId')));
    });

    test('mobile chat menu exposes persisted conversation rename', () {
      final source = File('lib/screens/agent_screen.dart').readAsStringSync();
      expect(source, contains("value: 'rename'"));
      expect(source, contains('controller.renameConversation(chat.id'));
      expect(source, contains("text['conversationName']"));
    });

    test('shares the supplied Lyra preset across all image tasks', () {
      for (final task in DshImageAiTask.values) {
        final value = buildDshImageAiSystemAddon(task);
        expect(value, contains('Shared SillyTavern preset · 夏瑾 天琴座 Beta 3.8'));
        expect(value.length, greaterThan(5000));
      }
      expect(lyraImageTaskSourceSha256,
          '09D89AE4F64E05C06962786BB19A8C7364898E863DCC3FCDE99F661E841EF6A9');
    });

    test('does not duplicate the shared preset already assembled by Tavern',
        () {
      final value = injectDshImageAiSystemPrompt(
        task: DshImageAiTask.tavernImage,
        systemPrompt: lyraPresetSystemPrompt,
      );
      expect(value.split(lyraPresetSystemPrompt), hasLength(2));
      expect(value, contains('NovelAI image proposal'));
    });

    test('uses a selected custom preset for reverse and conversion', () {
      final preset = TavernSamplerPreset(
        id: 'custom-preset',
        name: 'Custom preset',
        systemPrompt: 'CUSTOM_SYSTEM_PROMPT',
        jailbreakPrompt: 'CUSTOM_JAILBREAK_PROMPT',
      );
      for (final task in [DshImageAiTask.reverse, DshImageAiTask.convert]) {
        final value = injectDshImageAiSystemPrompt(
          task: task,
          systemPrompt: 'BASE',
          sharedPreset: preset,
          useDefaultSharedPreset: false,
        );
        expect(value, contains('Shared SillyTavern preset · Custom preset'));
        expect(value, contains('CUSTOM_SYSTEM_PROMPT'));
        expect(value, contains('CUSTOM_JAILBREAK_PROMPT'));
        expect(value, isNot(contains(lyraPresetSystemPrompt)));
      }
    });

    test('settings persist an empty or selected shared preset library', () {
      final custom = TavernSamplerPreset(
        id: 'custom',
        name: 'Custom',
        systemPrompt: 'SYSTEM',
        jailbreakPrompt: 'JAILBREAK',
      );
      final restored = AppSettings.fromJson(AppSettings(
        reverseConvertPromptPresets: [custom],
        reverseConvertPromptPresetId: custom.id,
      ).toJson());
      expect(restored.reverseConvertPromptPresets.single.name, 'Custom');
      expect(restored.reverseConvertPromptPresetId, 'custom');

      final empty = AppSettings.fromJson({
        'reverseConvertPromptPresets': <Object>[],
        'reverseConvertPromptPresetId': '',
      });
      expect(empty.reverseConvertPromptPresets, isEmpty);
    });
  });
}
