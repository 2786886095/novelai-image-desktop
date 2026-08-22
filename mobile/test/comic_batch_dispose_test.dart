import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/batch/batch_redraw_controller.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

// Regression coverage for P1-04: leaving the comic/batch screen while a panel
// is still mid-generation must not throw when the in-flight request resolves
// after dispose() (a disposed ChangeNotifier throws on notifyListeners()),
// and must actually stop the queue rather than let it keep running unattended.
void main() {
  test(
      'comic queue freezes confirmed settings but a later regeneration uses the new settings',
      () async {
    final api = _CapturingSlowApi();
    final storage = _MemoryStorage();
    final app = AppState(api: api, storage: storage)
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );
    final controller = ComicController(app);
    controller.project = ComicProject.empty(app.params)
      ..globalParams.steps = 28
      ..panels = [
        ComicPanel(
          id: 'panel-1',
          index: 1,
          title: 'Panel 1',
          prompt: 'first panel',
          params: app.params.copy(),
        ),
        ComicPanel(
          id: 'panel-2',
          index: 2,
          title: 'Panel 2',
          prompt: 'second panel',
          params: app.params.copy(),
        ),
      ];
    addTearDown(app.dispose);
    addTearDown(controller.dispose);

    final firstRun = controller.addOneToAll();
    await _waitUntil(() => api.calls == 1);
    controller.project.globalParams.steps = 36;
    controller.changed();
    api.complete(0);
    await _waitUntil(() => api.calls == 2);
    expect(api.params.map((item) => item.steps), [28, 28]);
    api.complete(1);
    await firstRun;

    final nextRun = controller.addOne(controller.project.panels.first);
    await _waitUntil(() => api.calls == 3);
    expect(api.params.last.steps, 36);
    api.complete(2);
    await nextRun;
    expect(controller.project.panels.first.candidates, hasLength(2));
  });

  test(
      'ComicController.dispose() during an in-flight panel does not throw and stops the queue',
      () async {
    final pending = Completer<(List<Uint8List>, int)>();
    final api = _SlowApi(pending);
    final storage = _MemoryStorage();
    final app = AppState(api: api, storage: storage)
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );

    final controller = ComicController(app);
    controller.project = ComicProject.empty(app.params);
    final panel = ComicPanel(
      id: 'panel-1',
      index: 1,
      title: 'Panel 1',
      prompt: 'test panel',
      params: app.params.copy(),
    );

    final queueDone = controller.addOne(panel);
    await _waitUntil(() => api.calls == 1);
    expect(controller.queueRunning, isTrue);

    // Simulate leaving the comic tab while the panel request is still in flight.
    controller.dispose();
    expect(controller.queueCancelled, isTrue);

    // The in-flight request resolves AFTER dispose — notifyListeners() must be
    // a safe no-op here, not throw "used after being disposed".
    pending.complete((
      [
        Uint8List.fromList([1, 2, 3])
      ],
      7,
    ));
    await expectLater(queueDone, completes);
  });

  test(
      'BatchRedrawController.dispose() during an in-flight item does not throw and stops the queue',
      () async {
    final pending = Completer<(List<Uint8List>, int)>();
    final api = _SlowImg2ImgApi(pending);
    final storage = _MemoryStorage();
    final app = AppState(api: api, storage: storage)
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );

    final controller = BatchRedrawController(app);
    controller.project = BatchRedrawProject.empty(app.params);
    final item = BatchRedrawItem(
      id: 'item-1',
      name: 'source.png',
      base64: 'YWJj',
      prompt: 'redraw me',
    );

    final queueDone = controller.startQueue([item]);
    await _waitUntil(() => api.calls == 1);
    expect(controller.queueRunning, isTrue);

    controller.dispose();
    expect(controller.queueCancelled, isTrue);

    pending.complete((
      [
        Uint8List.fromList([4, 5, 6])
      ],
      9,
    ));
    await expectLater(queueDone, completes);
  });

  test(
      'BatchRedrawController stop cancels the whole queue without marking one item failed',
      () async {
    final pending = Completer<(List<Uint8List>, int)>();
    final api = _CancellableImg2ImgApi(pending);
    final storage = _MemoryStorage();
    final app = AppState(api: api, storage: storage)
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );
    final controller = BatchRedrawController(app);
    final first = BatchRedrawItem(
      id: 'item-1',
      name: 'first.png',
      base64: 'YWJj',
      prompt: 'first',
    );
    final second = BatchRedrawItem(
      id: 'item-2',
      name: 'second.png',
      base64: 'ZGVm',
      prompt: 'second',
    );
    controller.project = BatchRedrawProject.empty(app.params)
      ..items.addAll([first, second]);

    final queueDone = controller.startQueue([first, second]);
    await _waitUntil(() => api.calls == 1);
    controller.cancelQueue();
    await queueDone;

    expect(api.calls, 1, reason: 'stop must not start the second image');
    expect(controller.queueRunning, isFalse);
    expect(controller.queueCancelled, isTrue);
    expect(first.status, BatchItemStatus.pending);
    expect(first.error, isEmpty);
    expect(second.status, BatchItemStatus.pending);
    expect(
      controller.project.items
          .where((item) => item.status == BatchItemStatus.failed),
      isEmpty,
    );
  });

  test('BatchRedrawController clears outputs and returns to parameters',
      () async {
    final storage = _MemoryStorage();
    final app = AppState(storage: storage);
    final controller = BatchRedrawController(app);
    final done = BatchRedrawItem(
      id: 'done',
      name: 'done.png',
      base64: 'YWJj',
      prompt: 'keep prompt',
      status: BatchItemStatus.done,
      outputPath: '/trusted/output.png',
    );
    final failed = BatchRedrawItem(
      id: 'failed',
      name: 'failed.png',
      base64: 'ZGVm',
      prompt: 'keep failed prompt',
      status: BatchItemStatus.failed,
      error: 'network error',
    );
    controller.project = BatchRedrawProject.empty(app.params)
      ..items.addAll([done, failed]);
    controller.step = BatchRedrawStep.generate;

    expect(await controller.clearGeneratedResults(), isTrue);

    expect(storage.deletedPaths, {'/trusted/output.png'});
    expect(controller.step, BatchRedrawStep.params);
    expect(controller.queueDone, 0);
    expect(controller.queueTotal, 0);
    expect(done.status, BatchItemStatus.pending);
    expect(done.outputPath, isEmpty);
    expect(done.prompt, 'keep prompt');
    expect(failed.status, BatchItemStatus.pending);
    expect(failed.error, isEmpty);
  });

  test(
      'BatchRedrawController freezes a running batch and uses current values after clear or selected retry',
      () async {
    final api = _CapturingSlowImg2ImgApi();
    final storage = _MemoryStorage();
    final app = AppState(api: api, storage: storage)
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );
    final controller = BatchRedrawController(app);
    final globalItem = BatchRedrawItem(
      id: 'global',
      name: 'global.png',
      base64: 'YWJj',
      prompt: 'global prompt',
    );
    final overriddenItem = BatchRedrawItem(
      id: 'overridden',
      name: 'overridden.png',
      base64: 'ZGVm',
      prompt: 'overridden prompt',
      overrideParams: true,
      params: GenerateParams(model: 'nai-diffusion-4-5-full')..steps = 30,
    );
    controller.project = BatchRedrawProject.empty(app.params)
      // Vibe Transfer is intentionally unsupported by V5. Keep this queue
      // snapshot regression on V4.5 because the test exercises Vibe state.
      ..globalParams.model = 'nai-diffusion-4-5-full'
      ..globalParams.steps = 28
      ..globalStyle = 'old style'
      ..globalNegative = 'old negative'
      ..globalStrength = 0.4
      ..vibeImages.add(const VibeTransferItem(base64: 'cmVmZXJlbmNl'))
      ..items.addAll([globalItem, overriddenItem]);
    addTearDown(app.dispose);
    addTearDown(controller.dispose);

    final firstRun = controller.startQueue([globalItem, overriddenItem]);
    await _waitUntil(() => api.calls == 1);

    // These edits belong to the next confirmed queue, not to item #2 in the
    // currently running queue.
    controller.project
      ..globalStyle = 'new style'
      ..globalNegative = 'new negative'
      ..globalStrength = 0.65
      ..globalParams.steps = 36;
    overriddenItem
      ..params.steps = 40
      ..strength = 0.75;
    controller.project.preciseReferences.add(
      const PreciseReferenceItem(base64: 'bmV3LXJlZmVyZW5jZQ=='),
    );
    controller.changed();

    api.complete(0);
    await _waitUntil(() => api.calls == 2);
    expect(api.params.map((params) => params.steps), [28, 30]);
    expect(api.params.map((params) => params.positivePrompt), [
      'old style, global prompt',
      'old style, overridden prompt',
    ]);
    expect(api.params.map((params) => params.negativePrompt),
        ['old negative', 'old negative']);
    expect(api.strengths, [0.4, 0.4]);
    expect(
      api.capturedExtras.take(2).every(
            (extras) =>
                extras.vibeImages.length == 1 &&
                extras.preciseReferences.isEmpty,
          ),
      isTrue,
    );
    api.complete(1);
    await firstRun;

    // Clearing only resets results. It must retain the edited values so a new
    // batch uses the current global and per-item settings.
    expect(await controller.clearGeneratedResults(), isTrue);
    expect(globalItem.prompt, 'global prompt');
    expect(overriddenItem.prompt, 'overridden prompt');
    expect(globalItem.status, BatchItemStatus.pending);
    expect(overriddenItem.status, BatchItemStatus.pending);

    final secondRun = controller.startQueue([globalItem, overriddenItem]);
    await _waitUntil(() => api.calls == 3);
    expect(api.params[2].steps, 36);
    expect(api.params[2].positivePrompt, 'new style, global prompt');
    expect(api.params[2].negativePrompt, 'new negative');
    expect(api.strengths[2], 0.65);
    expect(api.capturedExtras[2].preciseReferences, hasLength(1));
    api.complete(2);
    await _waitUntil(() => api.calls == 4);
    expect(api.params[3].steps, 40);
    expect(api.params[3].positivePrompt, 'new style, overridden prompt');
    expect(api.strengths[3], 0.75);
    api.complete(3);
    await secondRun;

    // A selected-item re-generation takes one more fresh snapshot and does
    // not require deleting the existing output first.
    overriddenItem
      ..selected = true
      ..prompt = 'selected retry'
      ..params.steps = 44;
    controller.project.globalStyle = 'latest style';
    controller.changed();
    final retry = controller.startQueue(controller.selected);
    await _waitUntil(() => api.calls == 5);
    expect(api.params[4].steps, 44);
    expect(api.params[4].positivePrompt, 'latest style, selected retry');
    api.complete(4);
    await retry;
  });

  test('Storage.deleteHistoryFiles removes files and matching history records',
      () async {
    final directory = await Directory.systemTemp.createTemp('batch-clear-');
    addTearDown(() => directory.delete(recursive: true));
    final output = File('${directory.path}/generated.png');
    await output.writeAsBytes([1, 2, 3]);
    final historyItem = HistoryItem(
      id: 'history-1',
      filePath: output.path,
      date: '2026-07-21',
      createdAt: '2026-07-21T00:00:00',
      seed: 1,
      model: 'model',
      width: 64,
      height: 64,
      prompt: 'prompt',
    );
    final storage = _HistoryStorage([historyItem]);

    await storage.deleteHistoryFiles([output.path]);

    expect(output.existsSync(), isFalse);
    expect(storage.items, isEmpty);
  });
}

Future<void> _waitUntil(bool Function() condition) async {
  for (var attempt = 0; attempt < 100 && !condition(); attempt++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  expect(condition(), isTrue);
}

class _SlowApi extends NaiApi {
  _SlowApi(this.pending);
  final Completer<(List<Uint8List>, int)> pending;
  int calls = 0;

  @override
  Future<AccountSummary> fetchAccount(
    String token,
    AppSettings settings,
  ) async =>
      const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );

  @override
  Future<(List<Uint8List>, int)> generate(
    String token,
    AppSettings settings,
    GenerateParams params,
    GenerateExtras extras,
  ) async {
    calls += 1;
    return pending.future;
  }
}

class _CapturingSlowApi extends NaiApi {
  final List<Completer<(List<Uint8List>, int)>> _pending = [];
  final List<GenerateParams> params = [];
  int get calls => params.length;

  @override
  Future<AccountSummary> fetchAccount(
    String token,
    AppSettings settings,
  ) async =>
      const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );

  @override
  Future<(List<Uint8List>, int)> generate(
    String token,
    AppSettings settings,
    GenerateParams value,
    GenerateExtras extras,
  ) {
    params.add(value.copy());
    final pending = Completer<(List<Uint8List>, int)>();
    _pending.add(pending);
    return pending.future;
  }

  void complete(int index) {
    _pending[index].complete((
      [
        Uint8List.fromList([index + 1, 2, 3])
      ],
      100 + index,
    ));
  }
}

class _SlowImg2ImgApi extends NaiApi {
  _SlowImg2ImgApi(this.pending);
  final Completer<(List<Uint8List>, int)> pending;
  int calls = 0;

  @override
  Future<AccountSummary> fetchAccount(
    String token,
    AppSettings settings,
  ) async =>
      const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );

  @override
  Future<(List<Uint8List>, int)> img2img(
    String token,
    AppSettings settings,
    GenerateParams params,
    GenerateExtras extras,
    Uint8List sourceBytes,
    I2IParams i2i,
  ) async {
    calls += 1;
    return pending.future;
  }
}

class _CancellableImg2ImgApi extends _SlowImg2ImgApi {
  _CancellableImg2ImgApi(super.pending);

  @override
  void cancelActiveGeneration() {
    if (!pending.isCompleted) {
      pending.completeError(const GenerationCancelledException());
    }
  }
}

class _CapturingSlowImg2ImgApi extends NaiApi {
  final List<Completer<(List<Uint8List>, int)>> _pending = [];
  final List<GenerateParams> params = [];
  final List<double> strengths = [];
  final List<GenerateExtras> capturedExtras = [];
  int get calls => params.length;

  @override
  Future<AccountSummary> fetchAccount(
    String token,
    AppSettings settings,
  ) async =>
      const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 1000,
        hasActiveSubscription: true,
      );

  @override
  Future<(List<Uint8List>, int)> img2img(
    String token,
    AppSettings settings,
    GenerateParams value,
    GenerateExtras extras,
    Uint8List sourceBytes,
    I2IParams i2i,
  ) {
    params.add(value.copy());
    strengths.add(i2i.strength);
    capturedExtras.add(extras.copy());
    final pending = Completer<(List<Uint8List>, int)>();
    _pending.add(pending);
    return pending.future;
  }

  void complete(int index) {
    _pending[index].complete((
      [
        Uint8List.fromList([index + 1, 2, 3])
      ],
      200 + index,
    ));
  }
}

class _MemoryStorage extends Storage {
  final Set<String> deletedPaths = {};

  @override
  Future<String?> getToken() async => 'test-token';

  @override
  Future<void> setComicProject(ComicProject project) async {}

  @override
  Future<void> setBatchRedrawProject(BatchRedrawProject project) async {}

  @override
  Future<void> deleteHistoryFiles(Iterable<String> filePaths) async {
    deletedPaths.addAll(filePaths);
  }

  @override
  Future<void> writeGroups(List<HistoryGroup> groups) async {}

  @override
  Future<HistoryItem> saveImage(
    Uint8List bytes,
    GenerateParams params,
    int seed, {
    String feature = 't2i',
    String? model,
    int? width,
    int? height,
    String? groupId,
  }) async {
    return HistoryItem(
      id: 'saved-1',
      filePath: 'memory-saved-1.png',
      date: '2026-06-22',
      createdAt: '2026-06-22T00:00:00',
      seed: seed,
      model: model ?? params.model,
      width: width ?? params.width,
      height: height ?? params.height,
      prompt: params.positivePrompt,
      feature: feature,
      groupId: groupId,
      params: params.toJson(),
    );
  }
}

class _HistoryStorage extends Storage {
  _HistoryStorage(this.items);
  List<HistoryItem> items;

  @override
  Future<List<HistoryItem>> getHistory() async => [...items];

  @override
  Future<void> writeHistory(List<HistoryItem> value) async {
    items = [...value];
  }
}
