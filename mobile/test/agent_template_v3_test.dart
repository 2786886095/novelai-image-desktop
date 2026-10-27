import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/template_tools.dart';
import 'package:novelai_mobile/agent/template_workflow.dart';
import 'package:novelai_mobile/agent/template_generation.dart';
import 'package:novelai_mobile/prompts/template_library.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late MobileTemplateLibrary library;
  late AppState app;
  late Storage storage;
  late AgentTemplateTools tools;
  const selector = {
    'kind': 'convert',
    'mode': 'mixed',
    'templateVersion': 'v5',
    'skillVersion': '3.0.0'
  };
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('agent-template-v3-');
    SharedPreferences.setMockInitialValues({});
    library = MobileTemplateLibrary(directoryProvider: () async => dir);
    await library.load();
    storage = Storage();
    app = AppState(storage: storage, templateLibrary: library);
    app.settings.convertPromptTemplates = {'mixed': 'legacy-v1-custom'};
    app.settings.convertPromptTemplatesV2 = {'mixed': 'legacy-v2-custom'};
    await storage.setSettings(app.settings);
    tools = AgentTemplateTools(app);
  });
  tearDown(() async {
    app.dispose();
    await dir.delete(recursive: true);
  });
  Future<void> legacyUnchanged() async {
    final s = await storage.getSettings();
    expect(s.convertPromptTemplates['mixed'], 'legacy-v1-custom');
    expect(s.convertPromptTemplatesV2['mixed'], 'legacy-v2-custom');
  }

  test(
      'v3 reads the exact shared library slot and never presents a legacy settings key',
      () async {
    final result = await tools.execute('studio_prompt_template', selector);
    expect(result['body'], library.resolve('image.convert.mixed').body);
    expect(result['key'], 'templateLibrary.image.convert.mixed');
    expect(result['source'], 'builtin');
    expect(result['libraryRevision'], library.revision);
    await legacyUnchanged();
  });
  test(
      'builtin v3 requires a named copy; selected custom updates through CAS and reset retains it',
      () async {
    final read = await tools.execute('studio_prompt_template', selector);
    final builtin = read['body'];
    await expectLater(
        tools.execute('studio_save_prompt_template', {
          ...selector,
          'expectedRevision': read['revision'],
          'body': 'custom'
        }),
        throwsStateError);
    expect(library.custom, isEmpty);
    final saved = await tools.execute('studio_save_prompt_template', {
      ...selector,
      'expectedRevision': read['revision'],
      'body': r'Keep $1 {{input}}',
      'name': 'Named fork'
    });
    expect(saved['body'], r'Keep $1 {{input}}');
    expect(saved['source'], 'custom');
    expect(library.custom, hasLength(1));
    await legacyUnchanged();
    expect((await storage.getSettings()).convertPromptSkillVersion, '3.0.0');
    final updated = await tools.execute('studio_save_prompt_template', {
      ...selector,
      'expectedRevision': saved['revision'],
      'body': 'updated {{input}}',
      'name': 'Renamed'
    });
    expect(updated['name'], 'Renamed');
    expect(library.custom, hasLength(1));
    await legacyUnchanged();
    final reset = await tools.execute('studio_save_prompt_template', {
      ...selector,
      'expectedRevision': updated['revision'],
      'restoreDefault': true,
      'body': ''
    });
    expect(reset['body'], builtin);
    expect(reset['source'], 'builtin');
    expect(library.custom, hasLength(1));
    await legacyUnchanged();
  });
  test('a stale read cannot overwrite a newly selected library record',
      () async {
    final read = await tools.execute('studio_prompt_template', selector);
    final id = await library.create(
        slot: 'image.convert.mixed',
        name: 'Other editor',
        body: 'current',
        activate: true);
    await expectLater(
        tools.execute('studio_save_prompt_template', {
          ...selector,
          'expectedRevision': read['revision'],
          'body': 'stale',
          'name': 'Stale'
        }),
        throwsStateError);
    expect(library.resolve('image.convert.mixed').id, id);
    expect(library.custom, hasLength(1));
    await legacyUnchanged();
  });
  test('V3 helper and V4.5 calls fail explicitly, with no fallback into v1',
      () async {
    for (final kind in ['assistant', 'optimize']) {
      await expectLater(
          tools.execute('studio_prompt_template', {...selector, 'kind': kind}),
          throwsStateError);
    }
    await expectLater(
        tools.execute(
            'studio_prompt_template', {...selector, 'templateVersion': 'v4.5'}),
        throwsA(isA<FormatException>()));
    await legacyUnchanged();
  });
  test(
      'V3 workflow forwards name into backed-up fork and permits restore without deleting custom',
      () async {
    var backups = 0;
    final workflow = AgentTemplateWorkflow(app, backup: () async {
      backups++;
      return '/synthetic/rescue.naisbackup';
    });
    final read = await workflow.execute({...selector, 'action': 'read'});
    final input = {
      ...selector,
      'action': 'save',
      'expectedRevision': read['revision'],
      'body': 'workflow body',
      'name': 'Workflow copy'
    };
    final approval = await workflow.approvalSummary(input);
    expect(approval['name'], 'Workflow copy');
    final saved = await workflow.execute(input);
    expect(saved['body'], 'workflow body');
    expect(backups, 1);
    await workflow.execute({
      ...selector,
      'action': 'restore',
      'expectedRevision': saved['revision']
    });
    expect(backups, 2);
    expect(library.custom, hasLength(1));
    expect(library.resolve('image.convert.mixed').source, 'builtin');
    await legacyUnchanged();
  });
  test(
      'corrupt library is detected on the real agent read without altering original bytes',
      () async {
    final file = await library.file;
    const raw = '{broken';
    await file.writeAsString(raw);
    await expectLater(
        tools.execute('studio_prompt_template', selector), throwsStateError);
    expect(await file.readAsString(), raw);
    await legacyUnchanged();
  });
  test('tool schemas allow image v3 but keep edit helper limited to v1/v2', () {
    final schemas = agentToolSchemas();
    Map properties(String name) => ((schemas.singleWhere(
            (v) => (v['function'] as Map)['name'] == name)['function']
        as Map)['parameters'] as Map)['properties'] as Map;
    for (final name in [
      'studio_prompt_template',
      'langbai_templates',
      'langbai_convert_prompt',
      'langbai_reverse_prompt'
    ]) {
      expect(
          (properties(name)['skillVersion'] as Map)['enum'], contains('3.0.0'));
    }
    expect((properties('langbai_edit_prompt')['skillVersion'] as Map)['enum'],
        isNot(contains('3.0.0')));
    expect(properties('langbai_templates'), contains('name'));
  });
  test('serialized composer and conversation preserve the selected v3 edition',
      () {
    final action = normalizeAgentComposerActions([
      {
        'kind': 'template-read',
        'templateKind': 'convert',
        'mode': 'mixed',
        'templateVersion': 'v5',
        'skillVersion': '3.0.0'
      }
    ]).single;
    expect(action.toJson()['skillVersion'], '3.0.0');
    final conversation = AgentConversation.fromJson({
      'id': 'test',
      'title': 'test',
      'selectedTemplateKind': 'convert',
      'selectedTemplateSkillVersion': '3.0.0'
    });
    expect(conversation.selectedTemplateSkillVersion, '3.0.0');
    expect(
        templateGenerationArgs({
          'text': 'description',
          'templateVersion': 'v5',
          'skillVersion': '3.0.0'
        }),
        isEmpty);
    expect(
        () => templateGenerationArgs({
              'text': 'description',
              'templateVersion': 'v4.5',
              'skillVersion': '3.0.0'
            }),
        throwsStateError);
  });
}
