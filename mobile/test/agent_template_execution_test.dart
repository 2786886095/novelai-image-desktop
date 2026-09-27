import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';

class TemplateVault extends Storage {
  @override
  Future<String?> getConvertKey() async => 'fixture-no-network';
  @override
  Future<String?> getVisionKey() async => 'fixture-no-network';
}

class CaptureTemplateApi extends NaiApi {
  String? body;
  ReversePromptMode? usedMode;
  @override
  Future<AiTextResult> convertPrompt(
      {required AppSettings settings,
      required String apiKey,
      required String text,
      required ReversePromptMode mode,
      required bool knownCharacter,
      required String systemTemplate}) async {
    body = systemTemplate;
    usedMode = mode;
    return const AiTextResult(
        ok: true, message: 'fixture conversion', text: '1girl, rain');
  }

  @override
  Future<AiTextResult> reversePrompt(
      {required AppSettings settings,
      required String apiKey,
      required Uint8List image,
      required ReversePromptMode mode,
      required ReversePromptScope scope,
      required String hint,
      required bool knownCharacter,
      required String systemTemplate,
      String templateVersion = 'v5'}) async {
    throw StateError('No image API request expected');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'Agent conversion selects explicit version without replacing software defaults and restores drafts',
      () async {
    SharedPreferences.setMockInitialValues({});
    final api = CaptureTemplateApi();
    final app = AppState(api: api, storage: TemplateVault());
    addTearDown(app.dispose);
    app.promptTemplates = await PromptTemplateLibrary.load();
    app.settings.convertPromptTemplates = {'mixed': 'V5 MIXED {{input}}'};
    app.settings.convertPromptTemplatesV45 = {'mixed': 'V45 MIXED {{input}}'};
    app.settings.convertPromptTemplateVersion = 'v5';
    app.convertInput = 'user draft';
    app.convertMode = ReversePromptMode.tags;
    final executor = AgentToolExecutor(
        app: app,
        listMemories: () => [],
        upsertMemory: (_) async => throw UnimplementedError(),
        deleteMemory: (_) async => false);
    final result = await executor.execute('langbai_convert_prompt',
        {'text': '女孩在雨中', 'templateVersion': 'v4.5'}, []);
    expect(result.ok, true, reason: result.output);
    expect(result.output, '1girl, rain');
    expect(api.body, 'V45 MIXED {{input}}');
    expect(api.usedMode, ReversePromptMode.mixed);
    expect(app.settings.convertPromptTemplateVersion, 'v5');
    expect(app.convertInput, 'user draft');
    expect(app.convertMode, ReversePromptMode.tags);
    expect(app.convertHistory.first.result, '1girl, rain');
    expect(
        app.resolvedPromptTemplate('reverse', ReversePromptMode.mixed,
            templateVersion: 'v4.5'),
        isNotEmpty);
    final invalid = await executor.execute('langbai_convert_prompt',
        {'text': 'scene', 'templateVersion': 'invalid'}, []);
    expect(invalid.ok, false);
    expect(app.settings.convertPromptTemplateVersion, 'v5');
    expect(app.convertInput, 'user draft');
  });
}
