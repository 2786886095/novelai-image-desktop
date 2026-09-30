import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.flutter.io/shared_preferences');
  late Directory root;
  late File disk;
  late AppState app;
  late SoftwareActions actions;
  String failKey = '';
  var projectWrites = 0, backupWrites = 0;
  setUp(() async {
    HttpOverrides.global = null;
    SharedPreferences.resetStatic();
    failKey = '';
    projectWrites = 0;
    backupWrites = 0;
    root = await Directory.systemTemp.createTemp('agent-comic-bridge-');
    disk = File('${root.path}/prefs.json');
    await disk.writeAsString(jsonEncode({'flutter.unrelated': 'retained'}));
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      final values =
          Map<String, dynamic>.from(jsonDecode(await disk.readAsString()));
      if (call.method.startsWith('getAll')) return values;
      if (call.method == 'setString') {
        final key = call.arguments['key'] as String;
        if (key == failKey) return false;
        if (key == 'flutter.comic_project_v2') projectWrites++;
        if (key == 'flutter.comic_project_agent_backup_v1') backupWrites++;
        values[key] = call.arguments['value'];
        await disk.writeAsString(jsonEncode(values), flush: true);
        return true;
      }
      throw StateError('Unexpected ${call.method}');
    });
    app = AppState();
    actions = SoftwareActions(app);
    await app.comic.load();
  });
  tearDown(() async {
    app.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    SharedPreferences.resetStatic();
    await root.delete(recursive: true);
  });
  Future<Map<String, dynamic>> execute(String action,
          [Map<String, dynamic> data = const {}]) =>
      actions.execute('langbai_software_action',
          {'action': action, 'expectedRevision': app.comic.revision, ...data});
  test(
      'failed preferences write never appears saved in current or restarted app',
      () async {
    await execute('comic.panels.append', {'text': 'forest'});
    final rev = app.comic.revision;
    failKey = 'flutter.comic_project_v2';
    await expectLater(
        execute('comic.panels.append', {'text': 'sea'}), throwsStateError);
    expect(app.comic.revision, rev);
    final reopened = AppState();
    await reopened.comic.load();
    expect(reopened.comic.project.panels.map((p) => p.prompt), ['forest']);
    reopened.dispose();
    expect(await disk.readAsString(), isNot(contains('sea')));
    failKey = 'flutter.comic_project_agent_backup_v1';
    await expectLater(execute('comic.project.new'), throwsStateError);
    expect(app.comic.revision, rev);
    expect(backupWrites, 0);
  });
  test(
      'actual HTTP direct writes, one approval, denial, stale edit, durable replay and restart',
      () async {
    var executions = 0;
    LocalAgentBridge makeBridge() => LocalAgentBridge(
        journal: Directory('${root.path}/journal'),
        execute: (tool, args) async {
          executions++;
          return AgentToolResult(
              ok: true,
              title: 'comic',
              output: jsonEncode(await actions.execute(tool, args)));
        });
    var bridge = makeBridge();
    final client = HttpClient();
    await bridge.start();
    Future<Map<String, dynamic>> call(
        String tool, Map<String, dynamic> args, String id,
        {int status = 200}) async {
      final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      req.headers.set('Authorization', 'Bearer ${bridge.token}');
      req.write(jsonEncode(
          {'tool': tool, 'args': args, 'sessionId': 'comic', 'callId': id}));
      final res = await req.close();
      expect(res.statusCode, status);
      return Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(res).join()));
    }

    Future<Map<String, dynamic>> approval(String id) async {
      for (var i = 0; i < 100; i++) {
        final r = await call('studio_image_approval', {}, '$id-$i');
        if (r['data'] is Map) return Map<String, dynamic>.from(r['data']);
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
      throw StateError('Missing approval');
    }

    try {
      final read = await call(
          'langbai_software_action', {'action': 'comic.project.read'}, 'read');
      final added = await call(
          'langbai_software_action',
          {
            'action': 'comic.panels.append',
            'text': 'forest\nsea',
            'expectedRevision': read['data']['revision']
          },
          'append');
      expect(added['ok'], true);
      expect(projectWrites, 1);
      expect(backupWrites, 0);
      expect((await call('studio_image_approval', {}, 'none'))['data'], null);
      final args = {
        'action': 'comic.panels.remove',
        'id': app.comic.project.panels.first.id,
        'expectedRevision': added['data']['revision']
      };
      var pending = call('langbai_software_action', args, 'denied');
      var request = await approval('deny');
      await call('studio_resolve_image_approval',
          {'id': request['id'], 'approved': false}, 'deny-resolve');
      expect((await pending)['ok'], false);
      expect(app.comic.project.panels, hasLength(2));
      expect(backupWrites, 0);
      pending = call('langbai_software_action', args, 'stale', status: 500);
      request = await approval('stale');
      app.comic.project.title = 'UI edit';
      await app.comic.flush();
      await call('studio_resolve_image_approval',
          {'id': request['id'], 'approved': true}, 'stale-resolve');
      expect((await pending)['ok'], false);
      expect(app.comic.project.panels, hasLength(2));
      expect(backupWrites, 0);
      final fresh = {...args, 'expectedRevision': app.comic.revision};
      pending = call('langbai_software_action', fresh, 'remove');
      request = await approval('remove');
      await call('studio_resolve_image_approval',
          {'id': request['id'], 'approved': true}, 'remove-resolve');
      final removed = await pending;
      expect(removed['ok'], true);
      expect(app.comic.project.panels, hasLength(1));
      expect(backupWrites, 1);
      final before = executions;
      expect(await call('langbai_software_action', fresh, 'remove'), removed);
      expect(executions, before);
      expect(backupWrites, 1);
      await bridge.close();
      bridge = makeBridge();
      await bridge.start();
      expect(await call('langbai_software_action', fresh, 'remove'), removed);
      expect(executions, before);
      expect(
          (await call('studio_image_approval', {}, 'no-replay'))['data'], null);
      final reopened = AppState();
      await reopened.comic.load();
      expect(reopened.comic.project.panels.single.prompt, 'sea');
      expect(reopened.comic.project.title, 'UI edit');
      reopened.dispose();
      expect(jsonDecode(await disk.readAsString())['flutter.unrelated'],
          'retained');
    } finally {
      client.close(force: true);
      await bridge.close();
    }
  });
}
