import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  AppState state() {
    final a = AppState(api: NaiApi(), storage: Storage());
    addTearDown(a.dispose);
    return a;
  }

  for (final kind in ['reverse', 'convert']) {
    test(
        '$kind true fresh V2 default writes V5 slot and implicit V45 writes V1 slot',
        () async {
      final a = state();
      a.promptTemplates = await PromptTemplateLibrary.load();
      expect(a.settings.reversePromptSkillVersion, '2.0.0');
      expect(a.settings.convertPromptSkillVersion, '2.0.0');
      await a.setPromptTemplate(
          kind, ReversePromptMode.mixed, 'V2 independent');
      await a.setPromptTemplate(kind, ReversePromptMode.mixed, 'V45 compatible',
          templateVersion: 'v4.5');
      expect(
          a.promptOverrides(kind,
              templateVersion: 'v5', skillVersion: '2.0.0')['mixed'],
          'V2 independent');
      expect(
          a.promptOverrides(kind,
              templateVersion: 'v4.5', skillVersion: '1.0.0')['mixed'],
          'V45 compatible');
      expect(
          a.resolvedPromptTemplate(kind, ReversePromptMode.mixed,
              templateVersion: 'v4.5'),
          'V45 compatible');
      expect(a.resolvedPromptTemplate(kind, ReversePromptMode.mixed),
          'V2 independent');
      await a.resetPromptTemplate(kind, ReversePromptMode.mixed,
          templateVersion: 'v4.5');
      expect(
          a.promptOverrides(kind,
              templateVersion: 'v4.5', skillVersion: '1.0.0'),
          isEmpty);
      expect(a.resolvedPromptTemplate(kind, ReversePromptMode.mixed),
          'V2 independent');
      final saved = await Storage().getSettings();
      expect(
          kind == 'reverse'
              ? saved.reversePromptTemplatesV2['mixed']
              : saved.convertPromptTemplatesV2['mixed'],
          'V2 independent');
    });
    test(
        '$kind current V45 model without explicit edition edits and resets compatible legacy slot',
        () async {
      final a = state();
      a.promptTemplates = await PromptTemplateLibrary.load();
      if (kind == 'reverse') {
        a.settings.reversePromptTemplateVersion = 'v4.5';
      } else {
        a.settings.convertPromptTemplateVersion = 'v4.5';
      }
      // The raw current edition may still be V2 until UI/persistence normalizes it.
      await a.setPromptTemplate(
          kind, ReversePromptMode.tags, 'Current V45 custom');
      expect(a.resolvedPromptTemplate(kind, ReversePromptMode.tags),
          'Current V45 custom');
      expect(
          a.promptOverrides(kind, templateVersion: 'v5', skillVersion: '2.0.0'),
          isEmpty);
      await a.resetPromptTemplate(kind, ReversePromptMode.tags);
      expect(
          a.promptOverrides(kind,
              templateVersion: 'v4.5', skillVersion: '1.0.0'),
          isEmpty);
    });
    test(
        '$kind explicit versions isolate all three slots and invalid selection changes nothing',
        () async {
      final a = state();
      await a.setPromptTemplate(kind, ReversePromptMode.tags, 'Legacy V5',
          templateVersion: 'v5', skillVersion: '1.0.0');
      await a.setPromptTemplate(kind, ReversePromptMode.tags, 'V2 V5',
          templateVersion: 'v5', skillVersion: '2.0.0');
      await a.setPromptTemplate(kind, ReversePromptMode.tags, 'Legacy V45',
          templateVersion: 'v4.5', skillVersion: '1.0.0');
      expect(
          a.resolvedPromptTemplate(kind, ReversePromptMode.tags,
              templateVersion: 'v5', skillVersion: '1.0.0'),
          'Legacy V5');
      expect(
          a.resolvedPromptTemplate(kind, ReversePromptMode.tags,
              templateVersion: 'v5', skillVersion: '2.0.0'),
          'V2 V5');
      expect(
          a.resolvedPromptTemplate(kind, ReversePromptMode.tags,
              templateVersion: 'v4.5', skillVersion: '1.0.0'),
          'Legacy V45');
      final before = a.settings.toJson().toString();
      await expectLater(
          a.setPromptTemplate(kind, ReversePromptMode.tags, 'WRONG',
              templateVersion: 'v4.5', skillVersion: '2.0.0'),
          throwsFormatException);
      await expectLater(
          a.resetPromptTemplate(kind, ReversePromptMode.tags,
              templateVersion: 'v4.5', skillVersion: '2.0.0'),
          throwsFormatException);
      await expectLater(
          a.setPromptTemplate(kind, ReversePromptMode.tags, 'WRONG',
              skillVersion: 'unknown'),
          throwsFormatException);
      await expectLater(
          a.setPromptTemplate(kind, ReversePromptMode.tags, 'WRONG',
              templateVersion: 'unknown'),
          throwsFormatException);
      expect(a.settings.toJson().toString(), before);
    });
  }
  for (final kind in ['reverse', 'convert']) {
    test('$kind empty V2 catalog fails closed even when legacy defaults exist',
        () {
      final a = state();
      a.promptTemplates = const PromptTemplateLibrary(
          reverse: {'mixed': 'LEGACY DEFAULT'},
          convert: {'mixed': 'LEGACY DEFAULT'});
      expect(() => a.resolvedPromptTemplate(kind, ReversePromptMode.mixed),
          throwsFormatException);
      expect(
          a.resolvedPromptTemplate(kind, ReversePromptMode.mixed,
              skillVersion: '1.0.0'),
          'LEGACY DEFAULT');
    });
  }
}
