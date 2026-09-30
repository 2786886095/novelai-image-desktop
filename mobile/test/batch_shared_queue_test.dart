import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/services/generation_scope.dart';
import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/batch/batch_redraw_controller.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class MemoryStorage extends Storage {
  final List<HistoryItem> saved = [];
  int loads = 0, writes = 0;
  String token = 'fixture-token';
  bool failProject = false, failRun = false;
  int? failImageAt, failHistoryAt;
  BatchRedrawProject? stored;
  Map<String, dynamic>? run;
  @override
  Future<BatchRedrawProject> getBatchRedrawProject(
      GenerateParams params) async {
    loads++;
    return stored ?? BatchRedrawProject.empty(params);
  }

  @override
  Future<Map<String, dynamic>?> getBatchRun() async =>
      run == null ? null : Map.of(run!);
  @override
  Future<void> setBatchRun(Map<String, dynamic> value) async {
    if (failRun) throw StateError('journal full');
    run = Map.of(value);
  }

  @override
  Future<String?> getToken() async => token;
  @override
  Future<void> writeGroups(List<HistoryGroup> groups) async {}
  @override
  Future<void> setBatchRedrawProject(BatchRedrawProject project) async {
    writes++;
    if (failProject) throw StateError('project full');
    stored = BatchRedrawProject.fromJson(
        jsonDecode(jsonEncode(project.toJson())), project.globalParams,
        trustOutputs: true);
  }

  @override
  Future<HistoryItem> saveImage(
      Uint8List bytes, GenerateParams params, int seed,
      {String feature = 't2i',
      String? model,
      int? width,
      int? height,
      String? groupId}) async {
    if (failImageAt == saved.length) throw StateError('disk full');
    final historyFails = failHistoryAt == saved.length;
    final item = HistoryItem(
        id: 'image-${saved.length}',
        filePath: 'fixture-${saved.length}.png',
        date: '2026-09-29',
        createdAt: '2026-09-29T00:00:00Z',
        prompt: params.positivePrompt,
        model: params.model,
        width: params.width,
        height: params.height,
        seed: seed,
        params: params.toJson(),
        groupId: groupId);
    saved.add(item);
    if (historyFails) throw SavedImageHistoryException(item);
    return item;
  }
}

class QueueApi extends NaiApi {
  int calls = 0, globalCancels = 0;
  final sources = <List<int>>[], paramsSeen = <GenerateParams>[];
  @override
  void cancelActiveGeneration() {
    globalCancels++;
  }

  Future<(List<Uint8List>, int)> Function()? handler;
  @override
  Future<AccountSummary> fetchAccount(
          String token, AppSettings settings) async =>
      const AccountSummary(
          hasToken: true,
          anlasBalance: 1000,
          tierLevel: 1,
          hasActiveSubscription: true);
  @override
  Future<(List<Uint8List>, int)> img2img(
      String token,
      AppSettings settings,
      GenerateParams params,
      GenerateExtras extras,
      Uint8List source,
      I2IParams i2i) async {
    calls++;
    sources.add(List.of(source));
    paramsSeen.add(params.copy());
    return handler == null
        ? (
            [
              Uint8List.fromList([1, 2, 3])
            ],
            42
          )
        : await handler!();
  }
}

Future<void> until(bool Function() condition) async {
  for (var i = 0; i < 300 && !condition(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  expect(condition(), isTrue);
}

BatchRedrawProject project(GenerateParams params) =>
    BatchRedrawProject.empty(params)
      ..items = [
        for (var i = 0; i < 2; i++)
          BatchRedrawItem(
              id: '$i', name: '$i.png', base64: 'YWJj', prompt: 'forest')
      ];
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'baseline: batch stops after a request fails rather than charging remaining images',
      () async {
    final api = QueueApi()
      ..handler = (() => Future.error(Exception('server failure')));
    final storage = MemoryStorage();
    final app = AppState(api: api, storage: storage);
    final c = BatchRedrawController(app)
      ..project = BatchRedrawProject.empty(app.params);
    c.project.items = [
      for (var i = 0; i < 2; i++)
        BatchRedrawItem(
            id: '$i', name: '$i.png', base64: 'YWJj', prompt: 'forest')
    ];
    await c.startQueue(c.project.items);
    expect(api.calls, 1);
    expect(c.project.items.first.status, BatchItemStatus.failed);
    expect(c.project.items.last.status, BatchItemStatus.pending);
    c.dispose();
    app.dispose();
  });
  test('baseline: late paid outputs are all retained after stopping', () async {
    final gate = Completer<(List<Uint8List>, int)>();
    final api = QueueApi()..handler = (() => gate.future);
    final storage = MemoryStorage();
    final app = AppState(api: api, storage: storage);
    final c = BatchRedrawController(app)
      ..project = BatchRedrawProject.empty(app.params);
    final item = BatchRedrawItem(
        id: 'one', name: 'one.png', base64: 'YWJj', prompt: 'forest');
    c.project.items = [item];
    final work = c.startQueue(c.project.items);
    await until(() => api.calls == 1);
    c.cancelQueue();
    gate.complete((
      [
        Uint8List.fromList([1]),
        Uint8List.fromList([2])
      ],
      42
    ));
    await work;
    expect(storage.saved, hasLength(2));
    expect(item.candidates, hasLength(2));
    expect(c.queueCancelled, isTrue);
    c.dispose();
    app.dispose();
  });

  test(
      'shared application controller loads once and reserves app busy before asynchronous work',
      () async {
    final storage = MemoryStorage();
    final api = QueueApi();
    final app = AppState(api: api, storage: storage);
    final c = app.batchRedraw;
    expect(identical(c, app.batchRedraw), isTrue);
    await c.load();
    expect(storage.loads, 1);
    c.project = project(app.params);
    final work = c.startQueue(c.project.items);
    expect(c.queueRunning, isTrue);
    expect(app.busy, isTrue);
    await work;
    expect(app.busy, isFalse);
    expect(c.runPhase, 'completed');
    expect(storage.run?['done'], 2);
    expect(storage.run?['active'], isFalse);
    app.dispose();
  });
  test(
      'source bytes and prompts are frozen but candidates attach to the shared live project',
      () async {
    final gate = Completer<(List<Uint8List>, int)>();
    final api = QueueApi()..handler = (() => gate.future);
    final storage = MemoryStorage();
    final app = AppState(api: api, storage: storage);
    final c = app.batchRedraw;
    await c.load();
    c.project = project(app.params);
    final work = c.startQueue(c.project.items);
    await until(() => api.calls == 1);
    c.project.items.last
      ..base64 = 'ZGVm'
      ..prompt = 'changed';
    gate.complete((
      [
        Uint8List.fromList([1])
      ],
      42
    ));
    await work;
    expect(api.sources, [
      [97, 98, 99],
      [97, 98, 99]
    ]);
    expect(api.paramsSeen.last.positivePrompt, 'forest');
    expect(c.project.items.last.candidates, hasLength(1));
    app.dispose();
  });
  test(
      'reset during a paid queue is rejected and scoped cancellation never calls global cancel',
      () async {
    final gate = Completer<(List<Uint8List>, int)>();
    final api = QueueApi()..handler = (() => gate.future);
    final storage = MemoryStorage();
    final app = AppState(api: api, storage: storage);
    final c = app.batchRedraw;
    await c.load();
    c.project = project(app.params);
    final work = c.startQueue(c.project.items);
    await until(() => api.calls == 1);
    expect(c.reset, throwsStateError);
    c.cancelQueue();
    expect(api.globalCancels, 0);
    gate.complete((
      [
        Uint8List.fromList([1])
      ],
      42
    ));
    await work;
    expect(api.calls, 1);
    expect(c.runPhase, 'cancelled');
    expect(c.project.items.first.candidates, hasLength(1));
    app.dispose();
  });
  test(
      'configuration drift after a paid response preserves it and prevents the next request',
      () async {
    final gate = Completer<(List<Uint8List>, int)>();
    final api = QueueApi()..handler = (() => gate.future);
    final app = AppState(api: api, storage: MemoryStorage());
    final c = app.batchRedraw;
    await c.load();
    c.project = project(app.params);
    final work = c.startQueue(c.project.items);
    await until(() => api.calls == 1);
    app.settings.imageBaseUrl = 'https://changed.example';
    gate.complete((
      [
        Uint8List.fromList([1])
      ],
      42
    ));
    await work;
    expect(api.calls, 1);
    expect(c.project.items.first.candidates, hasLength(1));
    expect(c.runPhase, 'failed');
    expect(c.runError, contains('配置已变化'));
    app.dispose();
  });
  test('credential drift prevents the next batch submission', () async {
    final gate = Completer<(List<Uint8List>, int)>();
    final api = QueueApi()..handler = (() => gate.future);
    final storage = MemoryStorage();
    final app = AppState(api: api, storage: storage);
    final c = app.batchRedraw;
    await c.load();
    c.project = project(app.params);
    final work = c.startQueue(c.project.items);
    await until(() => api.calls == 1);
    storage.token = 'changed';
    gate.complete((
      [
        Uint8List.fromList([1])
      ],
      42
    ));
    await work;
    expect(api.calls, 1);
    expect(c.runPhase, 'failed');
    expect(c.runError, contains('凭据已变化'));
    app.dispose();
  });
  for (final failure in ['project', 'journal']) {
    test(
        '$failure persistence failure prevents every paid submission and releases busy state',
        () async {
      final storage = MemoryStorage();
      final api = QueueApi();
      final app = AppState(api: api, storage: storage);
      final c = app.batchRedraw;
      await c.load();
      c.project = project(app.params);
      storage.failProject = failure == 'project';
      storage.failRun = failure == 'journal';
      await c.startQueue(c.project.items);
      expect(api.calls, 0);
      expect(c.queueRunning, isFalse);
      expect(app.busy, isFalse);
      expect(c.runPhase, 'failed');
      app.dispose();
    });
  }
  test('interrupted journal never automatically replays requests', () async {
    final storage = MemoryStorage()
      ..run = {
        'id': 'interrupted',
        'total': 2,
        'done': 1,
        'phase': 'running',
        'error': null
      };
    final api = QueueApi();
    final app = AppState(api: api, storage: storage);
    final c = app.batchRedraw;
    await c.load();
    expect(c.runPhase, 'interrupted');
    expect(storage.run?['phase'], 'interrupted');
    expect(api.calls, 0);
    expect(c.queueRunning, isFalse);
    app.dispose();
  });
  test(
      'corrupt persisted project is retained rather than replaced with an empty project',
      () async {
    SharedPreferences.setMockInitialValues(
        {'batch_redraw_project_v1': '{broken'});
    final app = AppState(storage: Storage());
    final c = app.batchRedraw;
    await c.load();
    expect(c.loadError, isNotNull);
    c.changed();
    await expectLater(c.flush(), throwsStateError);
    expect(
        (await SharedPreferences.getInstance())
            .getString('batch_redraw_project_v1'),
        '{broken');
    app.dispose();
  });
  test('corrupt run journal blocks launch without overwriting the original',
      () async {
    final storage = MemoryStorage()
      ..run = {'id': 'broken', 'phase': 'running', 'total': -1, 'done': 0};
    final api = QueueApi();
    final app = AppState(api: api, storage: storage);
    final c = app.batchRedraw;
    await c.load();
    expect(c.loadError, isNotNull);
    expect(storage.run?['total'], -1);
    expect(api.calls, 0);
    app.dispose();
  });
  for (final failure in ['file', 'history']) {
    test('$failure failure retains saved candidates and stops following tasks',
        () async {
      final storage = MemoryStorage();
      if (failure == 'file') {
        storage.failImageAt = 1;
      } else {
        storage.failHistoryAt = 0;
      }
      final api = QueueApi()
        ..handler = (() => Future.value((
              [
                Uint8List.fromList([1]),
                Uint8List.fromList([2])
              ],
              42
            )));
      final app = AppState(api: api, storage: storage);
      final c = app.batchRedraw;
      await c.load();
      c.project = project(app.params);
      await c.startQueue(c.project.items);
      expect(api.calls, 1);
      expect(c.runPhase, 'failed');
      expect(c.project.items.first.candidates,
          hasLength(failure == 'file' ? 1 : 2));
      expect(c.project.items.first.status, BatchItemStatus.failed);
      app.dispose();
    });
  }
  test('compatible provider is not silently sent to the native image endpoint',
      () async {
    final api = QueueApi();
    final app = AppState(api: api, storage: MemoryStorage());
    final c = app.batchRedraw;
    await c.load();
    c.project = project(app.params);
    app.settings.imageProvider = 'openai-images';
    await c.startQueue(c.project.items);
    expect(api.calls, 0);
    expect(c.runError, contains('未自动回退'));
    app.dispose();
  });
  test('queue cancellation invokes only its request-owned transport handler',
      () async {
    final api = ScopedQueueApi();
    final app = AppState(api: api, storage: MemoryStorage());
    final c = app.batchRedraw;
    await c.load();
    c.project = project(app.params);
    final work = c.startQueue(c.project.items);
    await until(() => api.calls == 1);
    c.cancelQueue();
    await work;
    expect(api.ownedCancels, 1);
    expect(api.globalCancels, 0);
    expect(c.runPhase, 'cancelled');
    app.dispose();
  });
  testWidgets(
      'real batch screen unmount/remount reuses the running application controller',
      (tester) async {
    final gate = Completer<(List<Uint8List>, int)>();
    final api = QueueApi()..handler = (() => gate.future);
    final storage = MemoryStorage();
    final app = AppState(
        api: api, storage: storage, preloadCompletedImage: (_) async {});
    final c = app.batchRedraw;
    await tester.runAsync(() => c.load());
    c.project = project(app.params);
    c.step = BatchRedrawStep.params;
    Widget screen() => ChangeNotifierProvider.value(
        value: app, child: const MaterialApp(home: BatchRedrawScreen()));
    await tester.pumpWidget(screen());
    final work = c.startQueue(c.project.items);
    await tester.runAsync(() => until(() => api.calls == 1));
    await tester.pumpWidget(const SizedBox());
    expect(c.queueRunning, isTrue);
    expect(c.queueCancelled, isFalse);
    await tester.pumpWidget(screen());
    expect(identical(app.batchRedraw, c), isTrue);
    expect(storage.loads, 1);
    gate.complete((
      [
        Uint8List.fromList([1])
      ],
      42
    ));
    await tester.runAsync(() => work);
    await tester.pump();
    expect(c.runPhase, 'completed');
    expect(api.calls, 2);
    await tester.pumpWidget(const SizedBox());
    app.dispose();
  });
}

class ScopedQueueApi extends QueueApi {
  int ownedCancels = 0;
  @override
  Future<(List<Uint8List>, int)> img2img(
      String token,
      AppSettings settings,
      GenerateParams params,
      GenerateExtras extras,
      Uint8List source,
      I2IParams i2i) async {
    calls++;
    final gate = Completer<(List<Uint8List>, int)>();
    final detach = GenerationScope.current?.attach(() {
      ownedCancels++;
      gate.completeError(const GenerationCancelledException());
    });
    try {
      return await gate.future;
    } finally {
      detach?.call();
    }
  }
}
