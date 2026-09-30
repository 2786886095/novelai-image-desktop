import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/studio_data_service.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _Storage extends Storage {
  final temp = Directory.systemTemp.createTempSync("studio-import-test-");
  @override
  Future<Directory> agentWorkspaceDirectory() async => temp;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace next) async {
    workspace = next;
  }

  GenerateParams? saved;
  AppSettings? settings;
  AgentWorkspace workspace =
      AgentWorkspace(characters: [TavernCharacter(name: '本机角色')]);
  @override
  Future<void> setParams(GenerateParams p) async {
    saved = p.copy();
  }

  @override
  Future<void> setSettings(AppSettings p) async {
    settings = AppSettings.fromJson(p.toJson());
  }

  @override
  Future<AgentWorkspace> getAgentWorkspace() async => workspace;
  @override
  Future<AgentWorkspace> getAgentWorkspaceStrict() async => workspace;
}

class _App extends AppState {
  _App(Storage storage) : super(storage: storage);
  @override
  void markChanged() {}
  @override
  Future<void> persistToolState() async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;
  late _Storage storage;
  late _App app;
  late StudioDataService service;
  setUp(() {
    storage = _Storage();
    app = _App(storage);
    service = StudioDataService(app);
  });
  tearDown(() async {
    app.dispose();
    await storage.temp.delete(recursive: true);
  });
  test('reads live values, supported schema and saved local characters',
      () async {
    app.params.steps = 31;
    final data = await service.read({});
    expect(data['generation']['params']['steps'], 31);
    expect(data['writableSchema']['params']['sampler']['enum'],
        contains('k_euler'));
    final cards = await service.list({'collection': 'characters'});
    expect(cards['items'][0]['name'], '本机角色');
    expect(cards['total'], 1);
    expect(
        (await service
            .list({'collection': 'characters', 'query': 'missing'}))['total'],
        0);
  });
  test('parameter update persists and rejects stale or unlisted changes',
      () async {
    final before = service.revision;
    final result = await service.mutate({
      'expectedRevision': before,
      'target': 'params',
      'patch': {'steps': 32}
    });
    expect(result['persisted'], true);
    expect(app.params.steps, 32);
    expect(storage.saved!.steps, 32);
    await expectLater(
        service.mutate({
          'expectedRevision': before,
          'target': 'params',
          'patch': {'steps': 33}
        }),
        throwsStateError);
    await expectLater(
        service.mutate({
          'expectedRevision': service.revision,
          'target': 'settings',
          'patch': {'agentApiBaseUrl': 'http://other'}
        }),
        throwsStateError);
  });
  test('explicit prompt edits ignore legacy locks; running tasks and invalid steps are blocked',
      () async {
    app.settings.lockStylePrompt = true;
    await service.mutate({
      'expectedRevision': service.revision,
      'target': 'params',
      'patch': {'stylePrompt': 'changed'}
    });
    expect(app.params.stylePrompt, 'changed');
    storage.saved = null;
    await expectLater(
        service.mutate({
          'expectedRevision': service.revision,
          'target': 'params',
          'patch': {'width': 833}
        }),
        throwsStateError);
    app.busy = true;
    await expectLater(
        service.mutate({
          'expectedRevision': service.revision,
          'target': 'params',
          'patch': {'steps': 33}
        }),
        throwsStateError);
    expect(storage.saved, isNull);
  });
  test('projects credentials and binary images, paginates local data',
      () async {
    expect(
        StudioDataService.project({
          'apiKey': 'private',
          'avatarDataUrl': 'data:private',
          'imageBaseUrl': 'https://name:pass@example.com/x?token=secret'
        })['apiKey'],
        {'configured': true});
    expect(
        jsonEncode(StudioDataService.project({
          'apiKey': 'private',
          'avatarDataUrl': 'data:private',
          'imageBaseUrl': 'https://name:pass@example.com/x?token=secret'
        })),
        isNot(contains('private')));
    expect(
        (await service.list(
            {'collection': 'characters', 'offset': 1, 'limit': 1}))['items'],
        isEmpty);
  });
  test(
      'imports append new identities and back up without replacing existing characters',
      () async {
    final old = storage.workspace.characters.first;
    final before = jsonEncode(old.toJson());
    final result = await service.importData({
      'collection': 'characters',
      'items': [
        {
          'id': old.id,
          'name': '新副本',
          'description': 'test',
          'avatarPath': 'C:/private.png',
          'apiKey': 'secret'
        }
      ]
    });
    expect(result['imported'], 1);
    expect(await File(result['backupPath']).exists(), true);
    expect(
        jsonEncode(storage.workspace.characters
            .firstWhere((x) => x.id == old.id)
            .toJson()),
        before);
    final added =
        storage.workspace.characters.firstWhere((x) => x.name == '新副本');
    expect(added.id, isNot(old.id));
    expect(jsonEncode(added.toJson()), isNot(contains('C:/private.png')));
    expect(
        jsonDecode(
                await File(result['backupPath']).readAsString())['characters']
            .first['id'],
        old.id);
  });
  test('rejects unsupported and truncated imports without changing storage',
      () async {
    final before = jsonEncode(storage.workspace.toJson());
    await expectLater(
        service.importData({
          'collection': 'conversations',
          'items': [
            {'name': 'bad'}
          ]
        }),
        throwsStateError);
    await expectLater(
        service.importData({
          'collection': 'characters',
          'items': [
            {
              'name': 'bad',
              'description': {'truncated': true}
            }
          ]
        }),
        throwsStateError);
    expect(jsonEncode(storage.workspace.toJson()), before);
  });
  test('HTTP bridge returns data envelope consumed by desktop/web library UI',
      () async {
    final dir = await Directory.systemTemp.createTemp('studio-data-bridge');
    final executor = AgentToolExecutor(
        app: app,
        listMemories: () => [],
        upsertMemory: (_) async => {},
        deleteMemory: (_) async => false);
    final bridge = LocalAgentBridge(
        journal: dir,
        execute: (t, a) => executor.execute(t, a, []));
    await bridge.start();
    final client = HttpClient();
    try {
      for (final tool in [
        'langbai_read_studio_state',
        'langbai_list_studio_data'
      ]) {
        final r = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
        r.headers.set('Authorization', 'Bearer ${bridge.token}');
        r.write(jsonEncode({
          'tool': tool,
          'args': tool.endsWith('list_studio_data')
              ? {'collection': 'characters'}
              : {},
          'sessionId': 'test',
          'callId': tool
        }));
        final response = await r.close();
        final body = jsonDecode(await utf8.decoder.bind(response).join());
        expect(response.statusCode, 200);
        expect(body['ok'], true);
        expect(body['data'], isA<Map>());
        if (tool.endsWith('list_studio_data')) expect(body['data']['total'], 1);
      }
    } finally {
      client.close(force: true);
      await bridge.close();
      await dir.delete(recursive: true);
    }
  });
}
