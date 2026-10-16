// A separate native app process, launched only after verified text15 completion.
// The host force-stops the predecessor without clearing its disposable app data.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/screens/prompt_skill_selector.dart';
import 'package:novelai_mobile/screens/prompt_assistant_dialog.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'native_scenario_support.dart';
import 'native_skill_checkpoint.dart';

final suite = NativeScenarios(1);
Future<void> main() => suite.run(() async {
      require(
          testEntry == 'skill_reopen1' &&
              const bool.fromEnvironment('FEATURE_PREDECESSOR_VERIFIED'),
          'Cold process entry must be explicitly qualified');
      final raw = (await SharedPreferences.getInstance())
          .getString(nativeSkillCheckpointKey);
      require(raw != null,
          'No predecessor native checkpoint; refusing to invent cold success');
      final checkpoint = jsonDecode(raw!) as Map;
      require(
          checkpoint['sourceSha'] == sourceSha &&
              checkpoint['profileSha'] == profileSha &&
              checkpoint['producerEntry'] == 'text15',
          'Predecessor identity differs');
      final storage = Storage(),
          settings = await storage.getSettings(),
          app = AppState(storage: storage)
            ..settings = settings
            ..promptTemplates = await PromptTemplateLibrary.load();
      try {
        require(
            nativeSkillSettingsDigest(settings) == checkpoint['settingsDigest'],
            'Cold native settings/custom digest differs');
        require(
            settings.reversePromptSkillVersion == '1.0.0' &&
                settings.reversePromptTemplateVersion == 'v4.5' &&
                settings.convertPromptSkillVersion == '2.0.0' &&
                settings.convertPromptTemplateVersion == 'v5' &&
                settings.promptAssistantSkillVersion == '2.0.0' &&
                settings.promptAssistantTemplateVersion == 'v5',
            'Independent axes not retained across process boundary');
        require(
            settings.convertPromptTemplates['tags'] ==
                    'NATIVE_KEEP_LEGACY_CUSTOM' &&
                settings.reversePromptTemplatesV2.length == 3 &&
                settings.convertPromptTemplatesV2.length == 3 &&
                settings.promptOptimizeTemplateV2 ==
                    'NATIVE_OPTIMIZE_OVERLAY' &&
                settings.promptAssistantTemplateV2 == 'NATIVE_CUSTOM_OVERLAY',
            'Custom slots not retained');
        for (final kind in InspectPageKind.values) {
          await mount(app, InspectScreen(kind: kind));
          final model = kind == InspectPageKind.reverse ? 'v4.5' : 'v5',
              edition = kind == InspectPageKind.reverse ? '1.0.0' : '2.0.0';
          require(
              elements((w) =>
                  w is PromptSkillSelector &&
                  w.model == model &&
                  w.edition == edition).isNotEmpty,
              'Cold real entry selector differs');
        }
        await mount(
            app,
            PromptAssistantDialog(
                kind: 'custom',
                source: 'cold reopen source',
                isCurrent: (_) => true));
        require(
            elements((w) =>
                w is PromptSkillSelector &&
                w.model == 'v5' &&
                w.edition == '2.0.0').isNotEmpty,
            'Cold assistant axis differs');
        suite.check('settings', 'skill-selection-custom-cold-reopen', {
          'separateNativeProcessWithHostVerifiedPredecessor': true,
          'sourceShaMatched': true,
          'profileShaMatched': true,
          'nativeSettingsCustomDigest': checkpoint['settingsDigest'],
          'reverseConvertAssistantUiReadback': true,
          'legacyAndV2CustomSlotsRetained': true
        });
      } finally {
        await mount(
            app, const Scaffold(body: Text('Cold skill process verified')));
        app.dispose();
      }
    });
