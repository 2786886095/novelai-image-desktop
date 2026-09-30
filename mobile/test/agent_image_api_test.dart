import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/agent/api_tools.dart';
import 'package:novelai_mobile/agent/api_catalog.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/screens/compatible_images.dart';
import 'package:http/http.dart' as http;

class GateStorage extends Storage {
  bool fail = false;
  bool failAfterCommit = false;
  Completer<void>? entered, release;
  @override
  Future<void> setSettings(AppSettings value) async {
    if (fail) throw StateError('fixture private storage failure');
    if (entered != null) {
      final signal = entered!;
      entered = null;
      signal.complete();
      await release!.future;
    }
    await super.setSettings(value);
    if (failAfterCommit) throw StateError('fixture uncertain commit');
  }
}

class DelayedClient extends http.BaseClient {
  bool closed = false;
  int sends = 0;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    sends++;
    return http.StreamedResponse(
        Stream<List<int>>.periodic(const Duration(milliseconds: 5), (_) => [32])
            .take(30),
        200);
  }

  @override
  void close() {
    closed = true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // The public mobile catalog no longer exposes a second image model. Keep
  // exercising the legacy credential transaction in this isolated test only,
  // so older backups can still be read without re-enabling it in production.
  setUpAll(() {
    apiProfiles['compatible-image'] = {
      'title': 'Legacy image API', 'secret': 'imageApiKey', 'mobile': true,
      'fields': {
        'enabled': {'key': 'imageProvider', 'title': 'Enabled', 'type': 'boolean'},
        'baseUrl': {'key': 'baseUrl', 'title': 'URL', 'type': 'url'},
        'model': {'key': 'model', 'title': 'Model', 'type': 'text'},
        'size': {'key': 'size', 'title': 'Size', 'type': 'text'},
        'responseFormat': {'key': 'responseFormat', 'title': 'Format', 'type': 'choice', 'values': ['auto', 'b64_json', 'url']},
        'extensions': {'key': 'extensions', 'title': 'Extensions', 'type': 'json'},
      },
    };
  });
  tearDownAll(() => apiProfiles.remove('compatible-image'));
  late GateStorage storage;
  late AppState app;
  late AgentApiTools tools;
  const key = 'fixture-mobile-image-key';
  final config = <String, dynamic>{
    'baseUrl': 'https://images.example.test/v1',
    'model': 'image-fixture',
    'size': 'auto',
    'responseFormat': 'auto',
    'extensions': <String, dynamic>{'steps': 28}
  };
  setUp(() async {
    HttpOverrides.global = null;
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    storage = GateStorage();
    app = AppState(storage: storage)
      ..settings = AppSettings(proxyMode: 'direct');
    await storage.setSettings(app.settings);
    await app.saveCompatibleSettings(config, key);
    tools = AgentApiTools(app);
  });
  tearDown(() => app.dispose());
  Future<dynamic> call(Map<String, dynamic> args) => tools.execute(
      'langbai_api', {'profile': 'compatible-image', ...args}, 'image-api');
  Future<dynamic> read() => call({'action': 'read'});
  Future<dynamic> configure(Map<String, dynamic> patch) async {
    final before = await read();
    return call({
      'action': 'configure',
      'expectedRevision': before['revision'],
      'patch': patch
    });
  }

  Future<dynamic> privateInput(String value) async {
    final before = await read();
    await call(
        {'action': 'credential', 'expectedRevision': before['revision']});
    final pending = await tools.execute('studio_api_input', {}, 'image-api');
    return tools.execute('studio_resolve_api_input',
        {'id': pending['id'], 'value': value}, 'image-api');
  }

  Future<String> serve(FutureOr<void> Function(HttpRequest) handler) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen(handler);
    addTearDown(() => server.close(force: true));
    return 'http://127.0.0.1:${server.port}';
  }

  test(
      'compatible-image profile reads actual nested configuration with no key or binding leakage',
      () async {
    final read = await call({'action': 'read'});
    expect(read['config'], {...config, 'enabled': true});
    expect(read['credentialConfigured'], true);
    expect(jsonEncode(read), isNot(contains(key)));
    expect(
        jsonEncode(read),
        isNot(
            contains(app.settings.compatibleImage['credentialId'] as String)));
  });
  test(
      'profile config saves all fields and refreshes app without overwriting unrelated drafts',
      () async {
    await storage.setConvertKey('fixture-convert-key');
    app.settings.agentApiModel = 'unsaved-draft';
    final result = await configure({
      'model': 'different',
      'size': '832x1216',
      'responseFormat': 'b64_json',
      'extensions': {'scale': 5.5, 'negative_prompt': 'blur'}
    });
    expect(result['saved'], true);
    expect(app.settings.compatibleImage['model'], 'different');
    expect(app.settings.agentApiModel, 'unsaved-draft');
    expect((await storage.getSettings()).compatibleImage,
        app.settings.compatibleImage);
    expect(await storage.getConvertKey(), 'fixture-convert-key');
    expect(jsonEncode(result), isNot(contains(key)));
  });
  test(
      'private key rotation survives reopened storage without key in preferences or public state',
      () async {
    final oldId = app.settings.compatibleImage['credentialId'] as String;
    final result = await privateInput('fixture-replacement-image-key');
    expect(result['saved'], true);
    final fresh = Storage(), saved = await fresh.getSettings();
    expect(
        await fresh
            .getCompatibleImageKey(saved.compatibleImage['credentialId']),
        'fixture-replacement-image-key');
    expect(await fresh.getCompatibleImageKey(oldId), key);
    expect(jsonEncode((await read())),
        isNot(contains('fixture-replacement-image-key')));
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('app_settings'),
        isNot(contains('fixture-replacement-image-key')));
  });
  test(
      'clear removes current and retired key versions but preserves provider/config and other credentials',
      () async {
    await storage.setConvertKey('other-api');
    await privateInput('retired-image-key');
    await privateInput('latest-image-key');
    final before = await read();
    final result = await call(
        {'action': 'clearCredential', 'expectedRevision': before['revision']});
    expect(result['credentialConfigured'], false);
    expect(app.settings.imageProvider, 'openai-images');
    expect(app.settings.compatibleImage['model'], 'image-fixture');
    expect(
        (await const FlutterSecureStorage().readAll())
            .keys
            .where((k) => k.startsWith('compatible_image_key_')),
        isEmpty);
    expect(await storage.getConvertKey(), 'other-api');
    await expectLater(call({'action': 'test'}), throwsStateError);
  });
  test(
      'initial inactive configuration can be saved without a key, then privately keyed and enabled',
      () async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    app.settings = AppSettings(proxyMode:'direct');
    await storage.setSettings(app.settings);
    expect((await read())['credentialConfigured'], false);
    await configure({
      'baseUrl': 'https://fresh.example.test/images/generations',
      'model': 'fresh'
    });
    await expectLater(configure({'enabled': true}), throwsStateError);
    expect(app.settings.imageProvider, 'novelai');
    await privateInput('new-image-key');
    await configure({'enabled': true});
    expect(app.settings.imageProvider, 'openai-images');
  });
  test(
      'stale revision and private input reject changes made through the software',
      () async {
    final before = await read();
    await call(
        {'action': 'credential', 'expectedRevision': before['revision']});
    final pending = await tools.execute('studio_api_input', {}, 'image-api');
    await app.saveCompatibleSettings(
        {...config, 'baseUrl': 'https://updated.example.test/v1'},
        'software-key');
    await expectLater(
        call({
          'action': 'configure',
          'expectedRevision': before['revision'],
          'patch': {'model': 'stale'}
        }),
        throwsStateError);
    await expectLater(
        tools.execute('studio_resolve_api_input',
            {'id': pending['id'], 'value': 'stale-private-key'}, 'image-api'),
        throwsStateError);
    expect(
        await storage.getCompatibleImageKey(
            app.settings.compatibleImage['credentialId']),
        'software-key');
  });
  for (final patch in <Map<String, dynamic>>[
    {'size': 'big'},
    {
      'extensions': {'Authorization': 'injected'}
    },
    {
      'extensions': {'steps': 1.5}
    },
    {'baseUrl': 'https://user:pass@example.test'},
    {'apiKey': 'chat-secret'}
  ]) {
    test('reject invalid image patch ${patch.keys.first} ${jsonEncode(patch)}',
        () async {
      final before = await read();
      await expectLater(configure(patch), throwsStateError);
      expect((await read())['revision'], before['revision']);
    });
  }
  test(
      'settings write failure preserves endpoint/key pair and removes the uncommitted secret',
      () async {
    final before = await read(),
        keys = await const FlutterSecureStorage().readAll();
    storage.fail = true;
    await expectLater(privateInput('not-committed-key'), throwsStateError);
    storage.fail = false;
    expect((await read())['revision'], before['revision']);
    expect(await const FlutterSecureStorage().readAll(), keys);
    await configure({'model': 'after-failure'});
    expect(app.settings.compatibleImage['model'], 'after-failure');
  });
  test('uncertain persistence never deletes a key already referenced by the saved configuration', () async {
    storage.failAfterCommit = true;
    await expectLater(privateInput('uncertain-commit-key'), throwsStateError);
    storage.failAfterCommit = false;
    final saved = await storage.getSettings();
    expect(await storage.getCompatibleImageKey(saved.compatibleImage['credentialId']), 'uncertain-commit-key');
    expect((await read())['credentialConfigured'], true);
  });
  test(
      'queued unrelated settings write retains newly committed image binding and its own edit',
      () async {
    final stale = await storage.getSettings();
    stale.agentApiModel = 'queued-unrelated';
    final before = await storage.readCompatibleApiState();
    final entered = storage.entered = Completer<void>();
    storage.release = Completer<void>();
    final writing = storage.writeCompatibleApiState(
        before,
        {
          ...Map<String, dynamic>.from(before['config']),
          'model': 'newly-committed'
        },
        'newly-committed-key');
    await entered.future;
    final unrelated = storage.setSettings(stale);
    storage.release!.complete();
    await writing;
    await unrelated;
    final saved = await storage.getSettings();
    expect(saved.agentApiModel, 'queued-unrelated');
    expect(saved.compatibleImage['model'], 'newly-committed');
    expect(
        await storage
            .getCompatibleImageKey(saved.compatibleImage['credentialId']),
        'newly-committed-key');
    expect(stale.compatibleImage, saved.compatibleImage);
  });
  test(
      'concurrent Agent and software commits reject the stale operation instead of mixing endpoints and keys',
      () async {
    final before = await storage.readCompatibleApiState(),
        oldId = app.settings.compatibleImage['credentialId'] as String;
    final entered = storage.entered = Completer<void>();
    storage.release = Completer<void>();
    final writing = storage.writeCompatibleApiState(
        before,
        {
          ...Map<String, dynamic>.from(before['config']),
          'baseUrl': 'https://winner.example.test'
        },
        'winner-key');
    await entered.future;
    final next = AppSettings.fromJson(app.settings.toJson())
      ..compatibleImage = {...config, 'baseUrl': 'https://stale.example.test'};
    final stale = expectLater(
        storage.saveCompatibleConfiguration(next, 'stale-key',
            expectedCredentialId: oldId),
        throwsStateError);
    storage.release!.complete();
    await writing;
    await stale;
    final actual = await storage.getSettings();
    expect(actual.compatibleImage['baseUrl'], 'https://winner.example.test');
    expect(
        await storage
            .getCompatibleImageKey(actual.compatibleImage['credentialId']),
        'winner-key');
    expect((await const FlutterSecureStorage().readAll()).values,
        isNot(contains('stale-key')));
  });
  for (final suffix in ['/v1', '/custom/images/generations']) {
    test(
        'GET models checks full or base endpoint $suffix without generation or key echo',
        () async {
      final requests = <String>[];
      final base = await serve((req) async {
        requests.add('${req.method} ${req.uri.path}');
        expect(req.headers.value('Authorization'), 'Bearer $key');
        req.response.write(jsonEncode({
          'data': [
            {'id': 'image-fixture'},
            {'id': key}
          ]
        }));
        await req.response.close();
      });
      await configure({'baseUrl': base + suffix});
      final result = await call({'action': 'test'});
      expect(result['models'], ['image-fixture']);
      expect(requests,
          ['GET ${suffix == '/v1' ? '/v1/models' : '/custom/models'}']);
    });
  }
  for (final mode in ['redirect', 'html', 'shape', 'large', 'unauthorized']) {
    test('connection rejects $mode and never follows or retries', () async {
      var requests = 0;
      final base = await serve((req) async {
        requests++;
        if (mode == 'redirect') {
          req.response.statusCode = 302;
          req.response.headers.set('Location', '/leak');
        }
        if (mode == 'unauthorized') req.response.statusCode = 401;
        req.response.write(mode == 'large'
            ? 'x' * (1024 * 1024 + 1)
            : mode == 'shape'
                ? jsonEncode({'message': key})
                : '<html>$key</html>');
        await req.response.close();
      });
      await configure({'baseUrl': base});
      await expectLater(
          call({'action': 'test'}),
          throwsA(isA<StateError>()
              .having((e) => e.message, 'controlled', isNot(contains(key)))));
      expect(requests, 1);
    });
  }
  test(
      'connection total timeout includes a delayed factory and closes its late client without sending',
      () async {
    final gate = Completer<http.Client>(), client = DelayedClient();
    tools = AgentApiTools(app,
        connectionTimeout: const Duration(milliseconds: 20),
        clientFactory: (_) => gate.future);
    await expectLater(call({'action': 'test'}), throwsStateError);
    gate.complete(client);
    await Future<void>.delayed(const Duration(milliseconds: 10));
    expect(client.closed, true);
    expect(client.sends, 0);
  });
  test('connection total timeout also bounds a slow continuous response body',
      () async {
    final client = DelayedClient();
    tools = AgentApiTools(app,
        connectionTimeout: const Duration(milliseconds: 25),
        clientFactory: (_) async => client);
    await expectLater(call({'action': 'test'}), throwsStateError);
    expect(client.closed, true);
    expect(client.sends, 1);
    await Future<void>.delayed(const Duration(milliseconds: 10));
  });
  testWidgets(
      'open settings detects Agent changes, preserves draft and reloads the new endpoint and key explicitly',
      (tester) async {
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: app,
      child: const MaterialApp(
          home: Scaffold(
              body:
                  SingleChildScrollView(child: CompatibleImageSettingsCard()))),
    ));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('compatible-model')), 'unsaved-local-draft');
    await configure({
      'model': 'agent-updated',
      'baseUrl': 'https://agent-updated.example.test/v1'
    });
    await privateInput('agent-new-private-key');
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('compatible-config-changed')),
        findsOneWidget);
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('compatible-model')))
            .controller!
            .text,
        'unsaved-local-draft');
    final save = find.widgetWithText(FilledButton, '保存并使用兼容图片服务');
    expect(tester.widget<FilledButton>(save).onPressed, isNull);
    await tester.ensureVisible(find.byKey(const ValueKey('compatible-reload')));
    await tester.tap(find.byKey(const ValueKey('compatible-reload')));
    await tester.pumpAndSettle();
    expect(
        find.byKey(const ValueKey('compatible-config-changed')), findsNothing);
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('compatible-model')))
            .controller!
            .text,
        'agent-updated');
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('compatible-key')))
            .controller!
            .text,
        'agent-new-private-key');
    expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('compatible-url')))
            .controller!
            .text,
        'https://agent-updated.example.test/v1');
    expect(tester.widget<FilledButton>(save).onPressed, isNotNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  test(
      'authenticated bridge confirms config once, cancels without changes, and journals no private key',
      () async {
    final dir = Directory.systemTemp.createTempSync('image-api-bridge-'),
        client = HttpClient();
    final executor = AgentToolExecutor(
        app: app,
        listMemories: () => [],
        upsertMemory: (_) async => throw UnimplementedError(),
        deleteMemory: (_) async => false);
    final bridge = LocalAgentBridge(
        journal: dir,
        execute: (t, a) => executor.execute(t, a, []),
        executeScoped: (t, a, s) => executor.execute(t, a, [], sessionId: s),
        describeApproval: (t, a, s) => executor.approvalSummary(t, a, s));
    await bridge.start();
    addTearDown(() async {
      await bridge.close();
      client.close(force: true);
      final p = dir.absolute.path;
      if (!p.startsWith(
          '${Directory.systemTemp.absolute.path}${Platform.pathSeparator}image-api-bridge-')) {
        throw StateError('invalid fixture');
      }
      await dir.delete(recursive: true);
    });
    var n = 0;
    Future<Map> request(String tool, Map<String, dynamic> args) async {
      final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      req.headers.set('Authorization', 'Bearer ${bridge.token}');
      req.write(jsonEncode({
        'tool': tool,
        'args': args,
        'sessionId': 'bridge-image',
        'callId': 'image-api-${n++}'
      }));
      final res = await req.close();
      expect(res.statusCode, 200);
      return jsonDecode(await utf8.decoder.bind(res).join()) as Map;
    }

    for (final accepted in [false, true]) {
      final before = await request(
          'langbai_api', {'action': 'read', 'profile': 'compatible-image'});
      final task = request('langbai_api', {
        'action': 'configure',
        'profile': 'compatible-image',
        'expectedRevision': before['data']['revision'],
        'patch': {'model': 'bridge-model'}
      });
      Map? pending;
      for (var i = 0; i < 100; i++) {
        final value = (await request('studio_image_approval', {}))['data'];
        if (value is Map) {
          pending = value;
          break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(pending, isNotNull);
      await request('studio_resolve_image_approval',
          {'id': pending!['id'], 'approved': accepted});
      expect((await task)['ok'], accepted);
      expect(app.settings.compatibleImage['model'],
          accepted ? 'bridge-model' : 'image-fixture');
      expect((await request('studio_image_approval', {}))['data'], isNull);
    }
    final before = await request(
        'langbai_api', {'action': 'read', 'profile': 'compatible-image'});
    await request('langbai_api', {
      'action': 'credential',
      'profile': 'compatible-image',
      'expectedRevision': before['data']['revision']
    });
    final pending = await request('studio_api_input', {});
    final saved = await request('studio_resolve_api_input',
        {'id': pending['data']['id'], 'value': 'bridge-private-image-key'});
    expect(saved['ok'], true);
    expect(jsonEncode(saved), isNot(contains('bridge-private-image-key')));
    for (final f in dir.listSync().whereType<File>()) {
      expect(f.readAsStringSync(), isNot(contains('bridge-private-image-key')));
    }
  });
}
