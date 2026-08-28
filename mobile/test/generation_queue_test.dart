import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
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
    GenerateExtras extras,
  ) async {
    prompts.add(params.positivePrompt);
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
