import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:novelai_mobile/agent/batch_actions.dart';
import 'package:novelai_mobile/agent/batch_generation_actions.dart';
import 'package:novelai_mobile/agent/operation_policy.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'baseline: Android software catalog exposes its shared batch project actions',
      () async {
    final app = AppState();
    addTearDown(app.dispose);
    final actions = SoftwareActions(app);
    final data = await actions.execute('langbai_software_capabilities', {});
    expect((data['actions'] as Map).containsKey('batch.project.read'), isTrue);
  });
  test('baseline: Agent reads and updates the actual software batch project',
      () async {
    final app = AppState();
    addTearDown(app.dispose);
    final actions = SoftwareActions(app);
    final c = app.batchRedraw;
    await c.load();
    c.project.items = [
      BatchRedrawItem(
          id: 'one', name: 'one.png', base64: 'YWJj', prompt: 'forest')
    ];
    final before = await actions
        .execute('langbai_software_action', {'action': 'batch.project.read'});
    final result = await actions.execute('langbai_software_action', {
      'action': 'batch.items.update',
      'expectedRevision': before['revision'],
      'id': 'one',
      'patch': {'prompt': 'ocean'}
    });
    expect(result['saved'], isTrue);
    expect(c.project.items.single.prompt, 'ocean');
  });

  group('batch project transactions', () {
    late AppState app;
    late ActionStorage storage;
    late BatchActions actions;
    setUp(() async {
      storage = ActionStorage();
      app = AppState(storage: storage);
      actions = BatchActions(app);
      await app.batchRedraw.load();
      app.batchRedraw.project.items = [
        for (var i = 0; i < 3; i++)
          BatchRedrawItem(
              id: 'i$i', name: '$i.png', base64: 'YWJj', prompt: 'forest')
      ];
      await app.batchRedraw.flush();
    });
    tearDown(() => app.dispose());
    Map<String, dynamic> args(String action,
            [Map<String, dynamic> fields = const {}]) =>
        {
          'action': action,
          'expectedRevision': app.batchRedraw.revision,
          ...fields
        };
    test(
        'paginated read projects image bodies and ordinary edits need no redundant approval',
        () async {
      final read = await actions
          .execute({'action': 'batch.project.read', 'offset': 1, 'limit': 1});
      expect(read['total'], 3);
      expect(read['nextOffset'], 2);
      expect((read['items'] as List).single['id'], 'i1');
      expect(jsonEncode(read).contains('YWJj'), false);
      for (final action in batchActionCatalog.keys) {
        expect(
            requiresAgentConfirmation(
                'langbai_software_action', {'action': action}),
            false);
      }
    });
    test(
        'global and item params persist and reopen without clearing candidates',
        () async {
      app.batchRedraw.project.items.first.addCandidate(BatchRedrawCandidate(
          id: 'c',
          historyItemId: 'h',
          outputPath: 'saved.png',
          createdAt: 'today'));
      await actions.execute(args('batch.project.update', {
        'patch': {
          'candidateCount': 3,
          'globalStrength': 0.6,
          'groupName': 'batch',
          'globalStyle': 'style',
          'globalParams': {'steps': 30}
        }
      }));
      await actions.execute(args('batch.items.update', {
        'id': 'i0',
        'patch': {
          'prompt': 'ocean',
          'strength': 0.3,
          'overrideParams': true,
          'params': {'steps': 25}
        }
      }));
      final saved = await storage.getBatchRedrawProject(app.params);
      expect(saved.candidateCount, 3);
      expect(saved.globalParams.steps, 30);
      expect(saved.items.first.prompt, 'ocean');
      expect(saved.items.first.params.steps, 25);
      expect(saved.items.first.candidates.single.id, 'c');
    });
    test('candidate selection belongs to item and updates output alias',
        () async {
      final item = app.batchRedraw.project.items.first;
      for (final id in ['a', 'b']) {
        item.addCandidate(BatchRedrawCandidate(
            id: id,
            historyItemId: id,
            outputPath: '$id.png',
            createdAt: 'today'));
      }
      await actions.execute(
          args('batch.candidates.select', {'id': 'i0', 'candidateId': 'b'}));
      expect(app.batchRedraw.project.items.first.outputPath, 'b.png');
      await expectLater(
          actions.execute(args(
              'batch.candidates.select', {'id': 'i1', 'candidateId': 'b'})),
          throwsStateError);
    });
    test('stale revision and unknown fields never change project', () async {
      final before = app.batchRedraw.revision;
      for (final input in [
        {
          ...args('batch.items.update', {
            'id': 'i0',
            'patch': {'prompt': 'changed'}
          }),
          'expectedRevision': 'old'
        },
        args('batch.items.update', {
          'id': 'i0',
          'patch': {'base64': 'YQ=='}
        }),
        args('batch.items.update', {
          'id': 'missing',
          'patch': {'prompt': 'changed'}
        }),
        args('batch.project.update', {
          'patch': {'candidateCount': 9}
        }),
        args('batch.project.update', {
          'patch': {'globalStrength': -1}
        }),
        args('batch.project.update', {
          'patch': {
            'globalParams': {'token': 'hidden'}
          }
        }),
        args('batch.project.update', {
          'patch': {'sizeMode': 'invented'}
        }),
        {'action': 'batch.project.read', 'limit': 0},
        {'action': 'batch.project.read', 'confirmed': true},
      ]) {
        await expectLater(actions.execute(input), throwsStateError);
        expect(app.batchRedraw.revision, before);
      }
    });
    test('disk failure does not publish a successful mutation', () async {
      storage.fail = true;
      final before = app.batchRedraw.revision;
      await expectLater(
          actions.execute(args('batch.items.update', {
            'id': 'i0',
            'patch': {'prompt': 'changed'}
          })),
          throwsStateError);
      expect(app.batchRedraw.revision, before);
      expect(app.batchRedraw.persistenceError, contains('disk full'));
      expect(app.batchRedraw.editing, false);
    });
    test('concurrent UI edit wins while Agent save awaits storage', () async {
      final entered = Completer<void>(), release = Completer<void>();
      storage.hook = () async {
        if (!entered.isCompleted) {
          entered.complete();
          await release.future;
        }
      };
      final write = actions.execute(args('batch.items.update', {
        'id': 'i0',
        'patch': {'prompt': 'agent'}
      }));
      final checked = expectLater(write, throwsStateError);
      await entered.future;
      app.batchRedraw.project.items.first.prompt = 'UI edit';
      app.batchRedraw.changed();
      release.complete();
      await checked;
      await app.batchRedraw.flush();
      expect(app.batchRedraw.project.items.first.prompt, 'UI edit');
      expect(
          (await storage.getBatchRedrawProject(app.params)).items.first.prompt,
          'UI edit');
    });
    test(
        'Agent reservation blocks competing write and UI queue, wrong owner cannot release',
        () async {
      final c = app.batchRedraw;
      c.reserveAgentRun('owner', c.revision);
      c.releaseAgentRun('other');
      expect(c.editing, true);
      await expectLater(
          actions.execute(args('batch.items.update', {
            'id': 'i0',
            'patch': {'prompt': 'new'}
          })),
          throwsStateError);
      await c.startQueue(c.project.items);
      expect(c.queueRunning, false);
      expect(c.runId, null);
      c.releaseAgentRun('owner');
      expect(c.editing, false);
    });
    test('capabilities and function schema match batch action fields and modes',
        () async {
      final data = batchGenerationCapabilities(await SoftwareActions(app)
          .execute('langbai_software_capabilities', {}));
      expect(
          (data['actions'] as Map).keys.toSet().containsAll(
              {...batchActionCatalog.keys, ...batchGenerationCatalog.keys}),
          true);

      final schema = agentToolSchemas().firstWhere((t) =>
              t['function']['name'] == 'langbai_software_action')['function']
          ['parameters']['properties'] as Map;
      expect(schema.containsKey('itemIds'), true);
      expect(schema['mode']['enum'],
          containsAll(['all', 'pending', 'failed', 'additional']));

      final source =
          File('lib/screens/local_agent_screen.dart').readAsStringSync();
      expect(source, contains('_batches?.afterResponse'));
      expect(source, contains('_batches?.cancelOwned(session)'));
      expect(source, contains('await _batches?.close()'));
    });
  });
}

class ActionStorage extends Storage {
  bool fail = false;
  Future<void> Function()? hook;
  @override
  Future<void> setBatchRedrawProject(BatchRedrawProject p) async {
    await hook?.call();
    if (fail) throw StateError('disk full');
    await super.setBatchRedrawProject(p);
  }
}
