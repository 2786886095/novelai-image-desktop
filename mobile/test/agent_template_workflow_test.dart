import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/template_workflow.dart';
import 'package:novelai_mobile/agent/template_tools.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';

class ObserveStorage extends Storage {
  int paramWrites = 0;
  @override
  Future<void> setParams(GenerateParams params) async {
    paramWrites++;
    await super.setParams(params);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;
  late AppState app;
  late AgentTemplateWorkflow workflow;
  late ObserveStorage storage;
  int backups = 0;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    storage = ObserveStorage();
    app = AppState(storage: storage);
    await storage.setSettings(app.settings);
    backups = 0;
    workflow = AgentTemplateWorkflow(app, backup: () async {
      backups++;
      return '/fixture/config.naisbackup';
    });
  });
  tearDown(() => app.dispose());
  test(
      'real shared template settings can select, save and restore with local backup receipt',
      () async {
    final initial = await workflow.execute({'action': 'read'});
    expect(initial['mode'], 'mixed');
    final saved = await workflow.execute({
      'action': 'save',
      'expectedRevision': initial['revision'],
      'body': 'custom {{input}}'
    });
    expect(saved['body'], 'custom {{input}}');
    expect(saved['backupPath'], '/fixture/config.naisbackup');
    expect(backups, 1);
    final editor = AgentTemplateTools(app);
    expect((await editor.execute('studio_prompt_template', {}))['body'],
        'custom {{input}}');
    final restored = await workflow
        .execute({'action': 'restore', 'expectedRevision': saved['revision']});
    expect(restored['body'], initial['body']);
    expect(backups, 2);
    final tags = await workflow.execute({'action': 'read', 'mode': 'tags'});
    await workflow.execute({
      'action': 'select',
      'mode': 'tags',
      'expectedRevision': tags['revision']
    });
    expect((await storage.getSettings()).agentPromptTemplateMode, 'tags');
    expect(backups, 2);
  });
  test(
      'malformed calls and failed backup never change templates; simultaneous editor CAS allows only one',
      () async {
    final old = await workflow.execute({'action': 'read'});
    for (final args in [
      {'action': 'read', 'approved': true},
      {'action': 'save', 'expectedRevision': old['revision'], 'body': ''},
      {
        'action': 'restore',
        'expectedRevision': old['revision'],
        'body': 'injected'
      },
      {
        'action': 'save',
        'expectedRevision': old['revision'],
        'path': 'elsewhere'
      }
    ]) {
      await expectLater(workflow.execute(args), throwsStateError);
    }
    final failing = AgentTemplateWorkflow(app,
        backup: () async => throw StateError('disk full'));
    await expectLater(
        failing.execute({
          'action': 'save',
          'expectedRevision': old['revision'],
          'body': 'changed'
        }),
        throwsStateError);
    expect((await workflow.execute({'action': 'read'}))['body'], old['body']);
    expect(backups, 0);
    Future<bool> write(String body) async {
      try {
        await AgentTemplateTools(app).execute('studio_save_prompt_template',
            {'expectedRevision': old['revision'], 'body': body});
        return true;
      } catch (_) {
        return false;
      }
    }

    expect(
        (await Future.wait([write('one'), write('two')]))
            .where((x) => x)
            .length,
        1);
  });
  test(
      'real loopback Agent confirmation is once, cancellation preserves content, retry does not duplicate',
      () async {
    final dir = Directory.systemTemp.createTempSync('template-workflow-');
    final client = HttpClient();
    final bridge = LocalAgentBridge(
        journal: Directory('${dir.path}/journal'),
        describeApproval: (t, a, s) => workflow.approvalSummary(a),
        execute: (t, a) async => AgentToolResult(
            ok: true,
            title: 'templates',
            output: jsonEncode(await workflow.execute(a))));
    await bridge.start();
    addTearDown(() async {
      await bridge.close();
      client.close(force: true);
      dir.deleteSync(recursive: true);
    });
    int count = 0;
    Future<Map> call(String tool, Map<String, dynamic> args,
        {String? id}) async {
      final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      req.headers.set('Authorization', 'Bearer ${bridge.token}');
      req.write(jsonEncode({
        'tool': tool,
        'args': args,
        'callId': id ?? 'template-${count++}',
        'sessionId': 'one'
      }));
      final res = await req.close();
      return jsonDecode(await utf8.decoder.bind(res).join()) as Map;
    }

    final before = await workflow.execute({'action': 'read'});
    final args = {
      'action': 'save',
      'body': 'bridge saved',
      'expectedRevision': before['revision']
    };
    final task = call('langbai_templates', args, id: 'save-once');
    Map? pending;
    for (var i = 0; i < 100; i++) {
      final result = await call('studio_image_approval', {});
      pending = result['data'] as Map?;
      if (pending != null) break;
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    expect(pending, isNotNull);
    await call('studio_resolve_image_approval',
        {'id': pending!['id'], 'approved': true});
    expect((await task)['ok'], true);
    expect(
        (await call('langbai_templates', args, id: 'save-once'))['ok'], true);
    expect(backups, 1);
    expect(
        (await workflow.execute({'action': 'read'}))['body'], 'bridge saved');
  });
  test(
      'busy image request does not restore or persist unrelated workbench state',
      () async {
    final executor = AgentToolExecutor(
        app: app,
        listMemories: () => [],
        upsertMemory: (_) async => throw UnimplementedError(),
        deleteMemory: (_) async => false);
    app.busy = true;
    app.setBatchCount(5);
    final result = await executor.execute('langbai_redraw_image', {}, [],
        sessionId: 'test');
    expect(result.ok, false);
    expect(storage.paramWrites, 0);
    expect(app.batchCount, 5);
    app.busy = false;
  });
}
