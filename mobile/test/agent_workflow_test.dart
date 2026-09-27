import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/backup_tools.dart';
import 'package:novelai_mobile/agent/library_tools.dart';
import 'package:novelai_mobile/agent/library_fields.dart';
import 'package:novelai_mobile/agent/task_tools.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _BackupPathProvider extends PathProviderPlatform {
  final String root;
  _BackupPathProvider(this.root);

  @override
  Future<String?> getApplicationDocumentsPath() async => root;

  @override
  Future<String?> getTemporaryPath() async => root;
}

class _BackupStorage extends Storage {
  @override
  Future<String?> getToken() async => '';
  @override
  Future<String?> getVisionKey() async => '';
  @override
  Future<String?> getConvertKey() async => '';
  @override
  Future<String?> getAgentApiKey() async => '';
  @override
  Future<String?> getTagKey() async => '';
  @override
  Future<String?> getBaiduSecret() async => '';

  @override
  Future<void> setToken(String value) async {}
  @override
  Future<void> setVisionKey(String value) async {}
  @override
  Future<void> setConvertKey(String value) async {}
  @override
  Future<void> setAgentApiKey(String value) async {}
  @override
  Future<void> setTagKey(String value) async {}
  @override
  Future<void> setBaiduSecret(String value) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late _BackupStorage storage;
  late AppState app;
  late AgentBackupTools tools;
  setUp(() {
    root = Directory.systemTemp.createTempSync('agent-workflow-');
    PathProviderPlatform.instance = _BackupPathProvider(root.path);
    SharedPreferences.setMockInitialValues({});
    storage = _BackupStorage();
    app = AppState(storage: storage);
    tools = AgentBackupTools(app, refresh: () async {});
  });
  tearDown(() {
    app.dispose();
    root.deleteSync(recursive: true);
  });
  Future<Map<String, dynamic>> call(Map<String, dynamic> args,
          [String session = 'one']) =>
      tools.execute(args, session);
  test(
      'real local archive create, inspect, restore, rescue and single-use receipt',
      () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('langbai.workflow', '{"saved":true}');
    final made = await call({
      'action': 'create',
      'categories': ['workspaceData']
    });
    expect(await File(made['path']).exists(), true);
    await prefs.remove('langbai.workflow');
    final listed = await call({'action': 'list'}),
        check = await call(
            {'action': 'inspect', 'backupId': listed['items'][0]['id']});
    final summary = tools.approvalSummary(
        {'action': 'restore', 'inspectionId': check['inspectionId']}, 'one');
    expect(summary['categories'], ['workspaceData']);
    final result = await call(
        {'action': 'restore', 'inspectionId': check['inspectionId']});
    expect(result['restored'], true);
    expect(await File(result['rescueBackupPath']).exists(), true);
    expect(
        (await SharedPreferences.getInstance()).getString('langbai.workflow'),
        '{"saved":true}');
    expect(jsonEncode(result), isNot(contains('"saved"')));
    await expectLater(
        call({'action': 'restore', 'inspectionId': check['inspectionId']}),
        throwsStateError);
  });
  test(
      'reject cross-session, stale local data, archive changes and injected args before restoring',
      () async {
    await call({
      'action': 'create',
      'categories': ['workspaceData']
    });
    var listed = await call({'action': 'list'});
    var check =
        await call({'action': 'inspect', 'backupId': listed['items'][0]['id']});
    await expectLater(
        call({'action': 'restore', 'inspectionId': check['inspectionId']},
            'two'),
        throwsStateError);
    app.params.steps += 1;
    await expectLater(
        call({'action': 'restore', 'inspectionId': check['inspectionId']}),
        throwsStateError);
    check =
        await call({'action': 'inspect', 'backupId': listed['items'][0]['id']});
    await File('${listed['directory']}/${listed['items'][0]['name']}')
        .writeAsString('corrupt');
    await expectLater(
        call({'action': 'restore', 'inspectionId': check['inspectionId']}),
        throwsStateError);
    await expectLater(
        call({'action': 'create', 'confirmed': true}), throwsStateError);
    await expectLater(
        call({'action': 'inspect', 'path': '/anything'}), throwsStateError);
  });
  test(
      'queue pause/resume/remove/clear use live app state and reject stale tasks',
      () async {
    final task = AgentTaskTools(app);
    app.busy = true;
    app.generationQueueRunning = true;
    app.generationQueue.add(GenerationQueueJob(
        id: 'queued',
        params: GenerateParams(),
        extras: GenerateExtras(),
        quotedAnlas: 3,
        addedAt: DateTime.now()));
    var state = await task.execute({'action': 'list'});
    final old = state['revision'];
    state = await task.execute({'action': 'pause', 'expectedRevision': old});
    expect(state['paused'], true);
    await expectLater(
        task.execute({'action': 'resume', 'expectedRevision': old}),
        throwsStateError);
    state = await task
        .execute({'action': 'resume', 'expectedRevision': state['revision']});
    expect(state['paused'], false);
    state = await task.execute({
      'action': 'remove',
      'id': 'queued',
      'expectedRevision': state['revision']
    });
    expect(app.generationQueue, isEmpty);
    state = await task
        .execute({'action': 'clear', 'expectedRevision': state['revision']});
    expect(state['executed'], true);
    final stopped = await task.execute({'action': 'cancel'});
    expect(stopped['cancellationRequested'], true);
  });
  test(
      'real six-collection library CRUD preserves canonical lorebook fields and backup files',
      () async {
    final lib = AgentLibraryTools(app);
    for (final collection in libraryFields.keys) {
      var result =
          await lib.execute({'action': 'read', 'collection': collection});
      final patch = collection == 'lorebooks'
          ? {
              'name': 'Local book',
              'entries': [
                {
                  'id': 'e',
                  'keys': ['rain'],
                  'content': 'world',
                  'position': 'before-character',
                  'insertionOrder': 42
                }
              ]
            }
          : {
              'name': 'Local item',
              if (['styles', 'positivePresets'].contains(collection))
                'prompt': 'rain',
              if (collection == 'samplerPresets') 'topP': 1
            };
      result = await lib.execute({
        'action': 'create',
        'collection': collection,
        'patch': patch,
        'expectedRevision': result['revision']
      });
      expect(await File(result['backupPath']).exists(), true);
      final id = result['id'];
      result = await lib.execute({
        'action': 'update',
        'collection': collection,
        'id': id,
        'patch': {'name': 'Renamed'},
        'expectedRevision': result['revision']
      });
      expect(result['item']['name'], 'Renamed');
      result = await lib.execute({
        'action': 'delete',
        'collection': collection,
        'id': id,
        'expectedRevision': result['revision']
      });
      expect(result['item'], null);
    }
  });
  test('library rejects protected entries, stale revisions and private fields',
      () async {
    final lib = AgentLibraryTools(app);
    var result =
        await lib.execute({'action': 'read', 'collection': 'characters'});
    await expectLater(
        lib.execute({
          'action': 'delete',
          'collection': 'characters',
          'id': result['items'][0]['id'],
          'expectedRevision': result['revision']
        }),
        throwsStateError);
    await expectLater(
        lib.execute({
          'action': 'create',
          'collection': 'styles',
          'expectedRevision': 'stale',
          'patch': {'name': 'x', 'prompt': 'x'}
        }),
        throwsStateError);
    await expectLater(
        lib.execute({
          'action': 'create',
          'collection': 'styles',
          'expectedRevision': 'x',
          'patch': {'name': 'x', 'prompt': 'x', 'apiKey': 'never'}
        }),
        throwsStateError);
  });
}
