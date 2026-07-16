import 'dart:async';
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
      cnPrompt: '测试',
      enPrompt: 'test panel',
      params: app.params.copy(),
      status: ComicPanelStatus.converted,
    );

    final queueDone = controller.startQueue([panel]);
    await _waitUntil(() => api.calls == 1);
    expect(controller.queueRunning, isTrue);

    // Simulate leaving the comic tab while the panel request is still in flight.
    controller.dispose();
    expect(controller.queueCancelled, isTrue);

    // The in-flight request resolves AFTER dispose — notifyListeners() must be
    // a safe no-op here, not throw "used after being disposed".
    pending.complete((
      [Uint8List.fromList([1, 2, 3])],
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
      [Uint8List.fromList([4, 5, 6])],
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

class _MemoryStorage extends Storage {
  @override
  Future<String?> getToken() async => 'test-token';

  @override
  Future<void> setComicProject(ComicProject project) async {}

  @override
  Future<void> setBatchRedrawProject(BatchRedrawProject project) async {}

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
