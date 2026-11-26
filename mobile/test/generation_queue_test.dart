import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/nai_stream.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  test('text generation followed by preview and another generation stays text-only', () async {
    final api = _QueueApi();
    final state = AppState(api: api, storage: _MemoryStorage())
      ..account = const AccountSummary(hasToken: true, tierLevel: 1, anlasBalance: 100, hasActiveSubscription: true)
      ..params.positivePrompt = 'first';
    final run = state.runTextOrImage();
    await _waitUntil(() => api.prompts.isNotEmpty);
    api.firstRequest.complete(([Uint8List.fromList([1, 2, 3])], 11));
    await run;
    expect(state.current, isNotNull);
    expect(state.workbenchImage, isNull);
    state.previewHistoryResult(state.current!);
    state.params.positivePrompt = 'second';
    await state.runTextOrImage();
    expect(api.prompts, ['first', 'second']);
    expect(state.history.length, 2);
    expect(state.workbenchImage, isNull);
    expect(state.i2iOriginalImage, isNull);
  });
  test('next redraw uses the selected image bytes and its adaptive size', () async {
    final api = _SourceApi();
    final state = AppState(api: api, storage: _SourceStorage(),
        preloadCompletedImage: (_) async {})
      ..account = const AccountSummary(hasToken: true, tierLevel: 1,
          anlasBalance: 100, hasActiveSubscription: true)
      ..params.positivePrompt = 'fixture';
    const original = WorkingImage(filePath: 'original.png', width: 1024, height: 512);
    state.workbenchImage = state.i2iOriginalImage = original;
    final originalSize = state.i2iOutputSize;
    state.setI2ISourceMode('latest');
    state.setI2ISizeMode('custom');
    state.params.width = state.params.height = 768;
    await state.runTextOrImage();
    state.setI2ISizeMode('adaptive');
    state.setI2ISourceMode('original');
    final selectedPath = state.previewInput?.filePath;
    await state.runTextOrImage();
    await state.runTextOrImage();
    state.clearComparison();
    state.setI2ISourceMode('latest');
    await state.runTextOrImage();
    // The result preview can be browsed independently of the next request.
    state.previewHistoryResult(state.history.last);
    state.setI2ISourceMode('original');
    await state.runTextOrImage();
    debugPrint('redraw input ids=${api.ids} second size=${api.sizes[1]} '
        'original size=$originalSize selected preview=$selectedPath');
    expect(api.ids, [0, 0, 0, 3, 0]);
    expect(api.sizes[1], originalSize);
    expect(selectedPath, original.filePath);
    state.dispose();
  });

  test('a job added during generation runs after the active image', () async {
    final api = _QueueApi();
    final storage = _MemoryStorage();
    final state = AppState(api: api, storage: storage)
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 100,
        hasActiveSubscription: true,
      )
      ..params.positivePrompt = 'first prompt'
      ..generationGroupId = 'group-a';

    final run = state.generate();
    await _waitUntil(() => api.prompts.length == 1);
    expect(state.generationQueueRunning, isTrue);

    state.params.positivePrompt = 'second prompt';
    state.generationGroupId = 'group-b';
    await state.enqueueGeneration();
    expect(state.generationQueue.single.params.positivePrompt, 'second prompt');
    expect(state.generationQueue.single.historyGroupId, 'group-b');

    api.firstRequest.complete((
      [
        Uint8List.fromList([1, 2, 3])
      ],
      11
    ));
    await run;

    expect(api.prompts, ['first prompt', 'second prompt']);
    expect(storage.savedPrompts, ['first prompt', 'second prompt']);
    expect(storage.savedGroupIds, ['group-a', 'group-b']);
    expect(state.generationQueueRunning, isFalse);
    expect(state.queueProgress?.done, 2);
  });

  test('queued snapshot appears before the background quote completes',
      () async {
    final api = _QueueApi()..queuedQuote = Completer<int?>();
    final state = AppState(api: api, storage: _MemoryStorage())
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 100,
        hasActiveSubscription: true,
      )
      ..params.positivePrompt = 'first prompt';

    final run = state.generate();
    await _waitUntil(() => api.prompts.length == 1);
    state.params.positivePrompt = 'queued prompt';

    final enqueue = state.enqueueGeneration();
    expect(state.generationQueue, hasLength(1));
    expect(state.generationQueue.single.quotePending, isTrue);

    await _waitUntil(() => api.quoteRequests == 2);
    api.queuedQuote!.complete(20);
    await enqueue;
    expect(state.generationQueue.single.quotePending, isFalse);

    api.firstRequest.complete((
      [
        Uint8List.fromList([1, 2, 3])
      ],
      11,
    ));
    await run;
  });

  test('keeps the live frame until the completed file is display-ready',
      () async {
    final api = _QueueApi()..emitPreview = true;
    final preload = Completer<void>();
    final preloadPaths = <String>[];
    final state = AppState(
      api: api,
      storage: _MemoryStorage(),
      preloadCompletedImage: (path) {
        preloadPaths.add(path);
        return preload.future;
      },
    )
      ..account = const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 100,
        hasActiveSubscription: true,
      )
      ..params.positivePrompt = 'preview transition';

    final run = state.generate();
    await _waitUntil(() => api.prompts.length == 1);
    expect(state.generationPreview, isNotNull);

    api.firstRequest.complete((
      [
        Uint8List.fromList([1, 2, 3])
      ],
      11,
    ));
    await _waitUntil(() => preloadPaths.isNotEmpty);

    expect(preloadPaths, ['memory-1.png']);
    expect(state.busy, isTrue);
    expect(state.current, isNull);
    expect(state.generationPreview, isNotNull);
    expect(state.status, contains('保存'));

    preload.complete();
    await run;

    expect(state.current?.filePath, 'memory-1.png');
    expect(state.generationPreview, isNull);
    expect(state.busy, isFalse);
  });
}

Future<void> _waitUntil(bool Function() condition) async {
  for (var attempt = 0; attempt < 100 && !condition(); attempt++) {
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  expect(condition(), isTrue);
}

class _QueueApi extends NaiApi {
  final firstRequest = Completer<(List<Uint8List>, int)>();
  final prompts = <String>[];
  Completer<int?>? queuedQuote;
  int quoteRequests = 0;
  bool emitPreview = false;

  @override
  Future<AccountSummary> fetchAccount(
    String token,
    AppSettings settings,
  ) async =>
      const AccountSummary(
        hasToken: true,
        tierLevel: 1,
        anlasBalance: 100,
        hasActiveSubscription: true,
      );

  @override
  Future<int?> requestOfficialGenerationPrice(
    String token,
    AppSettings settings,
    GenerateParams params,
  ) async {
    quoteRequests++;
    if (quoteRequests > 1 && queuedQuote != null) {
      return queuedQuote!.future;
    }
    return 20;
  }

  @override
  Future<(List<Uint8List>, int)> generate(
    String token,
    AppSettings settings,
    GenerateParams params,
    GenerateExtras extras, {
    void Function(NaiGenerationPreview preview)? onPreview,
  }) async {
    prompts.add(params.positivePrompt);
    if (emitPreview) {
      onPreview?.call(NaiGenerationPreview(
        image: Uint8List.fromList([9, 8, 7]),
        progress: 1,
        currentStep: 28,
        totalSteps: 28,
        sampleIndex: 0,
        finalImage: true,
      ));
    }
    if (prompts.length == 1) return firstRequest.future;
    return (
      [
        Uint8List.fromList([4, 5, 6])
      ],
      12
    );
  }
}

class _MemoryStorage extends Storage {
  final savedPrompts = <String>[];
  final savedGroupIds = <String?>[];

  @override
  Future<String?> getToken() async => 'test-token';

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
    savedPrompts.add(params.positivePrompt);
    savedGroupIds.add(groupId);
    final id = '${savedPrompts.length}';
    return HistoryItem(
      id: id,
      filePath: 'memory-$id.png',
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

class _SourceApi extends _QueueApi {
  final ids = <int>[];
  final sizes = <(int, int)>[];

  @override
  Future<(List<Uint8List>, int)> img2img(String token, AppSettings settings,
      GenerateParams params, GenerateExtras extras, Uint8List bytes, I2IParams i2i) async {
    ids.add(bytes.single);
    sizes.add((params.width, params.height));
    return ([Uint8List.fromList([ids.length])], ids.length);
  }
}

class _SourceStorage extends _MemoryStorage {
  @override
  Future<Uint8List> readImage(String path, {int maxBytes = 64 * 1024 * 1024}) async {
    final value = path == 'original.png' ? 0 : int.parse(RegExp(r'memory-(\d+)').firstMatch(path)!.group(1)!);
    return Uint8List.fromList([value]);
  }
}
