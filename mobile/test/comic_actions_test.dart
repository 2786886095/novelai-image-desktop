import 'package:novelai_mobile/agent/agent_tools.dart';
import 'dart:async';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/agent/comic_actions.dart';
import 'package:novelai_mobile/agent/comic_assets.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/operation_policy.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/state/app_state.dart';

class GateStorage extends Storage {
  Future<void> Function()? onSave, onBackup;
  @override
  Future<void> setComicProject(ComicProject p) async {
    await onSave?.call();
    await super.setComicProject(p);
  }

  @override
  Future<void> setComicBackup(ComicProject p) async {
    await onBackup?.call();
    await super.setComicBackup(p);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('baseline Agent reads the same comic project as the software', () async {
    final app = AppState();
    addTearDown(app.dispose);
    await app.comic.load();
    final read = await SoftwareActions(app)
        .execute('langbai_software_action', {'action': 'comic.project.read'});
    expect((read['project'] as Map)['id'], app.comic.project.id);
  });
  test(
      'baseline Agent appends comic panels and persists them without generating',
      () async {
    final app = AppState();
    addTearDown(app.dispose);
    await app.comic.load();
    final read = await SoftwareActions(app).execute('langbai_software_action', {
      'action': 'comic.panels.append',
      'text': 'forest\nsea',
      'expectedRevision': app.comic.revision
    });
    expect(read['total'], 2);
    expect(app.comic.project.panels.map((p) => p.prompt), ['forest', 'sea']);
    expect(jsonEncode((await app.storage.getComicProject(app.params)).toJson()),
        jsonEncode(app.comic.project.toJson()));
    expect(app.comic.queueRunning, false);
  });
  Future<AppState> fixture({Storage? storage}) async {
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    await app.comic.load();
    return app;
  }

  Future<Map<String, dynamic>> act(AppState app, String action,
          [Map<String, dynamic> data = const {}]) =>
      SoftwareActions(app).execute('langbai_software_action',
          {'action': action, 'expectedRevision': app.comic.revision, ...data});
  test('catalog and confirmation policy expose eighteen actions', () async {
    final app = await fixture();
    final result =
        await SoftwareActions(app).execute('langbai_software_capabilities', {});
    for (final e in comicActionCatalog.entries) {
      expect((result['actions'] as Map).containsKey(e.key), true);
      expect(
          requiresAgentConfirmation(
              'langbai_software_action', {'action': e.key}),
          e.value['effect'] == 'confirm');
    }
  });
  test('global panel settings reorder candidate selection persist', () async {
    final app = await fixture();
    await act(app, 'comic.panels.append', {'text': 'forest\nsea'});
    await act(app, 'comic.project.update', {
      'patch': {
        'title': 'Demo',
        'globalStylePrompt': 'ink',
        'globalNegativePrompt': 'text',
        'initialGenerationCount': 2,
        'sizeMode': 'perPanel',
        'globalParams': {'steps': 30}
      }
    });
    final ids = app.comic.project.panels.map((p) => p.id).toList();
    await act(app, 'comic.panels.update', {
      'id': ids.first,
      'patch': {
        'title': 'First',
        'prompt': 'rain',
        'imageSize': {'width': 832, 'height': 1216},
        'paramsOverride': {
          'enabled': true,
          'params': {'steps': 28}
        }
      }
    });
    await act(app, 'comic.panels.reorder', {'order': ids.reversed.toList()});
    expect(app.comic.project.panels.map((p) => p.index), [1, 2]);
    expect(app.comic.project.panels.last.prompt, 'rain');
    expect(app.comic.project.panels.last.params.steps, 28);
    final panel = app.comic.project.panels.first;
    panel.candidates.addAll([
      for (final id in ['c1', 'c2'])
        ComicCandidate(
            id: id,
            historyItemId: id,
            outputPath: '$id.png',
            createdAt: 'today')
    ]);
    await act(
        app, 'comic.candidates.select', {'id': panel.id, 'candidateId': 'c2'});
    expect(
        (await app.storage.getComicProject(app.params))
            .panels
            .first
            .selectedCandidateId,
        'c2');
  });
  test(
      'portable import strips paths and outputs but preserves overrides with fresh IDs',
      () async {
    final app = await fixture();
    await act(app, 'comic.panels.append', {'text': 'forest'});
    final oldId = app.comic.project.id, panel = app.comic.project.panels.single;
    panel.overrideParams = true;
    panel.params.steps = 31;
    panel.candidates.add(ComicCandidate(
        id: 'c',
        historyItemId: 'private',
        outputPath: 'PRIVATE.png',
        createdAt: 'today'));
    app.comic.project.preciseReferences
        .add(ComicReferenceAsset(id: 'r', name: 'r', filePath: 'PRIVATE.png'));
    app.comic.project.historyGroupId = 'private';
    final exported = await act(app, 'comic.project.export'),
        portable = jsonDecode(exported['json']);
    expect(exported['json'], isNot(contains('PRIVATE')));
    expect(exported['json'], isNot(contains('private')));
    await act(app, 'comic.project.import', {'project': portable});
    expect(app.comic.project.id, isNot(oldId));
    expect(app.comic.project.panels.single.id, isNot(panel.id));
    expect(app.comic.project.panels.single.overrideParams, true);
    expect(app.comic.project.panels.single.params.steps, 31);
    expect(app.comic.project.panels.single.candidates, isEmpty);
    expect(app.comic.project.preciseReferences, isEmpty);
    expect(
        (await SharedPreferences.getInstance())
            .getString('comic_project_agent_backup_v1'),
        contains('PRIVATE.png'));
  });
  test('reference inheritance overrides reset and removals', () async {
    final app = await fixture();
    await act(app, 'comic.panels.append', {'text': 'forest\nsea'});
    final id = app.comic.project.panels.first.id;
    app.comic.project.preciseReferences
        .add(ComicReferenceAsset(id: 'r', name: 'r', filePath: 'keep.png'));
    await act(app, 'comic.references.update', {
      'id': 'r',
      'patch': {
        'strength': 0.5,
        'scope': 'include',
        'scopePanelIds': [id]
      }
    });
    await act(app, 'comic.references.panel', {
      'id': id,
      'referenceId': 'r',
      'patch': {'enabled': false, 'strength': 0.2}
    });
    expect(
        app.comic.project.panels.first.preciseReferences.single.enabled, false);
    await act(
        app, 'comic.references.panel.reset', {'id': id, 'referenceId': 'r'});
    expect(app.comic.project.panels.first.preciseReferences, isEmpty);
    await act(app, 'comic.panels.remove', {'id': id});
    expect(app.comic.project.preciseReferences.single.scopePanelIds, isEmpty);
    final result = await act(app, 'comic.references.remove', {'id': 'r'});
    expect(result['filesRetained'], true);
    expect(app.comic.project.preciseReferences, isEmpty);
  });
  test('invalid inputs do not change revision', () async {
    final app = await fixture();
    await act(app, 'comic.panels.append', {'text': 'forest'});
    final rev = app.comic.revision, id = app.comic.project.panels.single.id;
    final cases = <Map<String, dynamic>>[
      {
        'action': 'comic.project.update',
        'patch': {'arbitraryPath': 'x'}
      },
      {
        'action': 'comic.project.update',
        'patch': {
          'globalParams': {'steps': 0}
        }
      },
      {
        'action': 'comic.project.update',
        'patch': {
          'globalParams': {'width': 100}
        }
      },
      {
        'action': 'comic.project.update',
        'patch': {
          'globalParams': {'model': 'fake'}
        }
      },
      {
        'action': 'comic.panels.reorder',
        'order': [id, id]
      },
      {
        'action': 'comic.panels.update',
        'id': id,
        'patch': {
          'imageSize': {'width': 1, 'height': 1}
        }
      },
      {'action': 'comic.candidates.select', 'id': id, 'candidateId': 'missing'},
      {'action': 'comic.project.read', 'limit': 51},
      {'action': 'comic.project.read', 'path': 'C:/secret'},
      {
        'action': 'comic.panels.append',
        'text': 'new',
        'expectedRevision': 'old'
      },
    ];
    for (final data in cases) {
      await expectLater(
          SoftwareActions(app).execute(
              'langbai_software_action', {'expectedRevision': rev, ...data}),
          throwsStateError);
      expect(app.comic.revision, rev);
    }
  });
  test('backup-time UI edit stops stale transaction', () async {
    final storage = GateStorage(), app = await fixture();
    final actual = await fixture(storage: storage);
    await act(actual, 'comic.panels.append', {'text': 'forest'});
    final gate = Completer<void>(), started = Completer<void>();
    storage.onBackup = () async {
      started.complete();
      await gate.future;
    };
    final assertion =
        expectLater(act(actual, 'comic.project.new'), throwsStateError);
    await started.future;
    actual.comic.project.title = 'UI edit';
    gate.complete();
    await assertion;
    expect(actual.comic.project.title, 'UI edit');
    expect(actual.comic.project.panels, hasLength(1));
    expect(actual.comic.editing, false);
    expect(app.comic.editing, false);
  });
  test(
      'save-time UI edit is retained and concurrent flush never reverts Agent save',
      () async {
    final storage = GateStorage();
    final app = await fixture(storage: storage);
    var gate = Completer<void>(), started = Completer<void>();
    var first = true;
    storage.onSave = () async {
      if (first) {
        first = false;
        started.complete();
        await gate.future;
      }
    };
    final assertion = expectLater(
        act(app, 'comic.project.update', {
          'patch': {'title': 'Agent'}
        }),
        throwsStateError);
    await started.future;
    app.comic.project.title = 'UI';
    gate.complete();
    await assertion;
    expect((await storage.getComicProject(app.params)).title, 'UI');
    gate = Completer<void>();
    started = Completer<void>();
    first = true;
    final success = act(app, 'comic.project.update', {
      'patch': {'title': 'Agent next'}
    });
    await started.future;
    final flush = app.comic.flush();
    gate.complete();
    await success;
    await flush;
    expect((await storage.getComicProject(app.params)).title, 'Agent next');
    expect(app.comic.project.title, 'Agent next');
  });
  test('failed backup/save retain active state and release lock', () async {
    final storage = GateStorage();
    final app = await fixture(storage: storage);
    await act(app, 'comic.panels.append', {'text': 'forest'});
    final revision = app.comic.revision;
    storage.onBackup = () async => throw StateError('disk full');
    await expectLater(act(app, 'comic.project.new'), throwsStateError);
    expect(app.comic.revision, revision);
    storage.onSave = () async => throw StateError('disk full');
    await expectLater(
        act(app, 'comic.panels.append', {'text': 'sea'}), throwsStateError);
    expect(app.comic.revision, revision);
    expect(app.comic.editing, false);
  });
  test(
      'registered sources copy PNG, other sessions and arbitrary paths rejected',
      () async {
    final app = await fixture(),
        dir = await Directory.systemTemp.createTemp('comic-assets-');
    addTearDown(() => dir.delete(recursive: true));
    final source = File('${dir.path}/source.png');
    await source.writeAsBytes(img.encodePng(img.Image(width: 8, height: 8)));
    final assets =
            ComicAssets(root: () async => Directory('${dir.path}/managed')),
        actions = ComicActions(app,
            assets: ComicAssets(
                root: () async => Directory('${dir.path}/managed')));
    final attachment = AgentAttachment(
        id: 'a',
        name: 'a',
        mime: 'image/png',
        size: await source.length(),
        kind: 'image',
        filePath: source.path);
    app.history.add(HistoryItem(
        id: 'h',
        filePath: source.path,
        createdAt: 'today',
        date: 'today',
        model: 'nai',
        width: 8,
        height: 8,
        seed: 1,
        prompt: 'p',
        params: {}));
    app.referencePresets.add(ReferencePreset(
        id: 'r',
        name: 'r',
        group: '',
        kind: ReferencePresetKind.precise,
        filePath: source.path,
        createdAt: 'today'));
    for (final row in [
      ('history', 'h'),
      ('reference', 'r'),
      ('attachment', 'a')
    ]) {
      final result = await actions.execute({
        'action': 'comic.references.import',
        'source': row.$1,
        'sourceId': row.$2,
        'expectedRevision': app.comic.revision
      }, attachments: [
        attachment
      ]);
      expect(result['referenceId'], isNotEmpty);
    }
    expect(app.comic.project.preciseReferences, hasLength(3));
    for (final ref in app.comic.project.preciseReferences) {
      expect(ref.filePath, isNot(source.path));
      expect(img.decodeImage(await File(ref.filePath).readAsBytes())!.width, 8);
    }
    await expectLater(
        actions.execute({
          'action': 'comic.references.import',
          'source': 'attachment',
          'sourceId': 'a',
          'expectedRevision': app.comic.revision
        }),
        throwsStateError);
    await expectLater(
        assets.importReference(app, 'path', source.path, []), throwsStateError);
    expect(await source.exists(), true);
  });
  test(
      'invalid missing and stale imports leave originals and clean fresh copies',
      () async {
    final app = await fixture(),
        dir = await Directory.systemTemp.createTemp('comic-invalid-');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/source.png');
    await file.writeAsString('not image');
    final attachment = AgentAttachment(
            id: 'a',
            name: 'a',
            mime: 'image/png',
            size: 9,
            kind: 'image',
            filePath: file.path),
        assets =
            ComicAssets(root: () async => Directory('${dir.path}/managed'));
    await expectLater(
        assets.importReference(app, 'attachment', 'a', [attachment]),
        throwsStateError);
    await file.delete();
    await expectLater(
        assets.importReference(app, 'attachment', 'a', [attachment]),
        throwsStateError);
    await file.writeAsBytes(img.encodePng(img.Image(width: 8, height: 8)));
    final racing = ComicAssets(root: () async {
      app.comic.project.title = 'UI edit';
      return Directory('${dir.path}/managed');
    });
    await expectLater(
        ComicActions(app, assets: racing).execute({
          'action': 'comic.references.import',
          'source': 'attachment',
          'sourceId': 'a',
          'expectedRevision': app.comic.revision
        }, attachments: [
          attachment
        ]),
        throwsStateError);
    expect(await Directory('${dir.path}/managed').list().toList(), isEmpty);
    expect(await file.exists(), true);
    expect(app.comic.project.preciseReferences, isEmpty);
  });
  test(
      'ZIP has complete selected images portable manifest verified digest and share',
      () async {
    final app = await fixture(),
        dir = await Directory.systemTemp.createTemp('comic-zip-');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/source.png');
    await file.writeAsBytes(img.encodePng(img.Image(width: 8, height: 8)));
    await act(app, 'comic.panels.append', {'text': 'forest\nsea'});
    for (final p in app.comic.project.panels) {
      p.candidates.add(ComicCandidate(
          id: 'c',
          historyItemId: 'h',
          outputPath: file.path,
          createdAt: 'today'));
    }
    var shares = 0;
    final actions = ComicActions(app,
        assets: ComicAssets(
            root: () async => Directory('${dir.path}/exports'),
            share: (f) async {
              expect(await f.exists(), true);
              shares++;
            }));
    final result = await actions.execute({
      'action': 'comic.images.export',
      'expectedRevision': app.comic.revision
    });
    final bytes = await File(result['filePath']).readAsBytes();
    expect(result['count'], 2);
    expect(result['sha256'], sha256.convert(bytes).toString());
    expect(result['shared'], true);
    expect(shares, 1);
    final archive = ZipDecoder().decodeBytes(bytes, verify: true);
    expect(archive.files.map((f) => f.name), [
      'images/001.png',
      'images/002.png',
      'project.json',
      'prompts.md',
      'images.json'
    ]);
    expect(utf8.decode(archive.findFile('project.json')!.content as List<int>),
        isNot(contains(dir.path)));
    app.comic.project.panels.last.candidates.single.outputPath = 'missing.png';
    await expectLater(
        actions.execute({
          'action': 'comic.images.export',
          'expectedRevision': app.comic.revision
        }),
        throwsStateError);
    expect(await Directory('${dir.path}/exports').list().length, 1);
    expect(shares, 1);
  });
  test('ZIP race creates no export and share failure retains archive',
      () async {
    final app = await fixture(),
        dir = await Directory.systemTemp.createTemp('comic-zip-race-');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/source.png');
    await file.writeAsBytes(img.encodePng(img.Image(width: 8, height: 8)));
    await act(app, 'comic.panels.append', {'text': 'forest'});
    app.comic.project.panels.single.candidates.add(ComicCandidate(
        id: 'c',
        historyItemId: 'h',
        outputPath: file.path,
        createdAt: 'today'));
    final root = Directory('${dir.path}/exports'),
        racing = ComicActions(app, assets: ComicAssets(root: () async {
          app.comic.project.title = 'UI';
          return Directory('${dir.path}/exports');
        }));
    await expectLater(
        racing.execute({
          'action': 'comic.images.export',
          'expectedRevision': app.comic.revision
        }),
        throwsStateError);
    expect(await root.list().toList(), isEmpty);
    final normal = ComicActions(app,
        assets: ComicAssets(
            root: () async => root,
            share: (_) async => throw StateError('no share')));
    final result = await normal.execute({
      'action': 'comic.images.export',
      'expectedRevision': app.comic.revision
    });
    expect(result['shared'], false);
    expect(await File(result['filePath']).exists(), true);
  });

  test(
      'Agent schema declares every comic argument and real executor reads shared project',
      () async {
    final schema = agentToolSchemas()
        .firstWhere((t) => t['function']['name'] == 'langbai_software_action');
    final properties = schema['function']['parameters']['properties'] as Map;
    for (final spec in comicActionCatalog.values) {
      for (final field in List<String>.from(spec['fields'])) {
        expect(properties.containsKey(field), true, reason: field);
      }
    }
    final app = await fixture();
    final result = await AgentToolExecutor(
            app: app,
            listMemories: () => [],
            upsertMemory: (v) async => v,
            deleteMemory: (_) async => false)
        .execute(
            'langbai_software_action', {'action': 'comic.project.read'}, []);
    expect(result.ok, true);
    expect(jsonDecode(result.output)['project']['id'], app.comic.project.id);
  });
  test(
      'replace CSV panels backs up original and size template applies all panels',
      () async {
    final app = await fixture();
    await act(app, 'comic.panels.append', {'text': 'forest'});
    await act(app, 'comic.panels.replace',
        {'text': 'title,prompt\nOne,sea\nTwo,rain'});
    expect(app.comic.project.panels.map((p) => p.prompt), ['sea', 'rain']);
    expect(
        (await SharedPreferences.getInstance())
            .getString('comic_project_agent_backup_v1'),
        contains('forest'));
    await act(app, 'comic.panels.sizes', {'text': '832×1216\n1024×1024'});
    expect(app.comic.project.panels.map((p) => p.imageWidth), [832, 1024]);
    expect(app.comic.project.sizeMode, ComicSizeMode.perPanel);
    await act(app, 'comic.project.new');
    expect(app.comic.project.panels, isEmpty);
  });
  test('queue busy rejects edits and read pagination is bounded', () async {
    final app = await fixture();
    await act(app, 'comic.panels.append', {'text': 'one\ntwo\nthree'});
    final read =
        await act(app, 'comic.project.read', {'offset': 1, 'limit': 1});
    expect(read['total'], 3);
    expect(read['nextOffset'], 2);
    expect((read['panels'] as List).single['prompt'], 'two');
    app.comic.queueRunning = true;
    await expectLater(
        act(app, 'comic.panels.append', {'text': 'four'}), throwsStateError);
    app.comic.queueRunning = false;
    expect(app.comic.project.panels, hasLength(3));
  });
}
