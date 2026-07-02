import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';

class _ScriptedApi extends NaiApi {
  final List<Future<AiTextResult> Function()> convertResponses;
  final List<Future<AiTextResult> Function()> reverseResponses;
  int convertCalls = 0;
  int reverseCalls = 0;

  _ScriptedApi({this.convertResponses = const [], this.reverseResponses = const []});

  @override
  Future<AiTextResult> convertPrompt({
    required AppSettings settings,
    required String apiKey,
    required String text,
    required ReversePromptMode mode,
    required bool knownCharacter,
    required String systemTemplate,
  }) {
    final response = convertResponses[convertCalls];
    convertCalls++;
    return response();
  }

  @override
  Future<AiTextResult> reversePrompt({
    required AppSettings settings,
    required String apiKey,
    required Uint8List image,
    required ReversePromptMode mode,
    required ReversePromptScope scope,
    required String hint,
    required bool knownCharacter,
    required String systemTemplate,
  }) {
    final response = reverseResponses[reverseCalls];
    reverseCalls++;
    return response();
  }
}

class _FakeStorage extends Storage {
  List<TextToolHistoryItem> convertHistory = [];
  List<TextToolHistoryItem> reverseHistory = [];

  @override
  Future<String?> getVisionKey() async => 'vision-key';
  @override
  Future<String?> getConvertKey() async => 'convert-key';

  @override
  Future<List<TextToolHistoryItem>> getConvertHistory() async => convertHistory;
  @override
  Future<void> setConvertHistory(List<TextToolHistoryItem> items) async {
    convertHistory = items;
  }

  @override
  Future<List<TextToolHistoryItem>> getReverseHistory() async => reverseHistory;
  @override
  Future<void> setReverseHistory(List<TextToolHistoryItem> items) async {
    reverseHistory = items;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  AppState buildState(_ScriptedApi api, _FakeStorage storage) => AppState(
        api: api,
        storage: storage,
        offlineTags: _StubOfflineTags(),
      )..settings = AppSettings(proxyMode: 'direct');

  test('runs two convert submissions concurrently instead of blocking the second',
      () async {
    final firstCompleter = Completer<AiTextResult>();
    final secondCompleter = Completer<AiTextResult>();
    final api = _ScriptedApi(convertResponses: [
      () => firstCompleter.future,
      () => secondCompleter.future,
    ]);
    final storage = _FakeStorage();
    final state = buildState(api, storage);

    state.convertInput = '第一段描述';
    final runningFirst = state.convertPrompt();
    await Future<void>.delayed(Duration.zero);
    expect(api.convertCalls, 1);

    // The button never disables, so a second submission can start while the
    // first is still in flight — this is the whole point of the tracker.
    state.convertInput = '第二段描述';
    final runningSecond = state.convertPrompt();
    await Future<void>.delayed(Duration.zero);
    expect(api.convertCalls, 2);

    expect(state.convertJobs, hasLength(2));
    expect(
      state.convertJobs.every((j) => j.status == TextToolJobStatus.processing),
      isTrue,
    );

    firstCompleter.complete(const AiTextResult(ok: true, message: 'ok', text: '1girl, solo'));
    await runningFirst;
    expect(
      state.convertJobs.firstWhere((j) => j.label == '第一段描述').status,
      TextToolJobStatus.done,
    );
    expect(
      state.convertJobs.firstWhere((j) => j.label == '第二段描述').status,
      TextToolJobStatus.processing,
    );

    secondCompleter.complete(const AiTextResult(ok: true, message: 'ok', text: '1boy, solo'));
    await runningSecond;
    expect(
      state.convertJobs.every((j) => j.status == TextToolJobStatus.done),
      isTrue,
    );
    expect(state.convertHistory, hasLength(2));
    expect(storage.convertHistory, hasLength(2));
  });

  test('marks a failed convert job without adding a history entry', () async {
    final api = _ScriptedApi(convertResponses: [
      () async => const AiTextResult(ok: false, message: 'API 出错了'),
    ]);
    final storage = _FakeStorage();
    final state = buildState(api, storage);
    state.convertInput = '坏掉的请求';

    await state.convertPrompt();

    expect(state.convertJobs.single.status, TextToolJobStatus.failed);
    expect(state.convertJobs.single.message, 'API 出错了');
    expect(state.convertHistory, isEmpty);
  });

  test('persists a reverse history item with the source image path', () async {
    final tempFile =
        File('${Directory.systemTemp.path}/texttool_test_${DateTime.now().microsecondsSinceEpoch}.png');
    await tempFile.writeAsBytes([0, 1, 2, 3]);
    addTearDown(() {
      if (tempFile.existsSync()) tempFile.deleteSync();
    });

    final api = _ScriptedApi(reverseResponses: [
      () async => const AiTextResult(ok: true, message: 'ok', text: '1girl, blue hair'),
    ]);
    final storage = _FakeStorage();
    final state = buildState(api, storage);
    state.workbenchImage = WorkingImage(filePath: tempFile.path);
    state.reverseHint = 'hint text';

    await state.reversePrompt();

    expect(state.reverseHistory, hasLength(1));
    expect(state.reverseHistory.single.sourceImagePath, tempFile.path);

    // The source image still exists, so pruning must not remove the record.
    await state.pruneMissingReverseHistory();
    expect(state.reverseHistory, hasLength(1));

    // Once the source image is gone, the lazy-cleanup pass drops the record —
    // same precedent as the main gallery's dropMissingImage.
    tempFile.deleteSync();
    await state.pruneMissingReverseHistory();
    expect(state.reverseHistory, isEmpty);
  });

  test('removes a finished job from the tracker without touching history', () async {
    final api = _ScriptedApi();
    final storage = _FakeStorage();
    final state = buildState(api, storage);
    state.convertJobs = [
      TextToolJob(
        id: 'a',
        label: 'done job',
        mode: ReversePromptMode.tags,
        knownCharacter: false,
        status: TextToolJobStatus.done,
        result: 'x',
        addedAt: DateTime.now(),
      ),
    ];
    state.convertHistory = [
      TextToolHistoryItem(
        id: 'a',
        mode: ReversePromptMode.tags,
        knownCharacter: false,
        input: 'x',
        result: 'x',
        createdAt: DateTime.now().toIso8601String(),
      ),
    ];

    state.removeConvertJob('a');

    expect(state.convertJobs, isEmpty);
    expect(state.convertHistory, hasLength(1));
  });

  test('deletes and clears convert history through the persistence bridge', () async {
    final api = _ScriptedApi();
    final storage = _FakeStorage();
    final state = buildState(api, storage);
    state.convertHistory = [
      TextToolHistoryItem(
        id: 'a',
        mode: ReversePromptMode.tags,
        knownCharacter: false,
        input: 'x',
        result: 'x',
        createdAt: DateTime.now().toIso8601String(),
      ),
      TextToolHistoryItem(
        id: 'b',
        mode: ReversePromptMode.tags,
        knownCharacter: false,
        input: 'y',
        result: 'y',
        createdAt: DateTime.now().toIso8601String(),
      ),
    ];

    await state.deleteConvertHistoryItem('a');
    expect(state.convertHistory, hasLength(1));
    expect(storage.convertHistory, hasLength(1));

    await state.clearConvertHistory();
    expect(state.convertHistory, isEmpty);
    expect(storage.convertHistory, isEmpty);
  });

  test('treats removing an in-flight job as cancellation: no result, no history entry',
      () async {
    final pending = Completer<AiTextResult>();
    final api = _ScriptedApi(convertResponses: [
      () => pending.future,
    ]);
    final storage = _FakeStorage();
    final state = buildState(api, storage);
    state.convertInput = '会被取消的请求';

    final running = state.convertPrompt();
    await Future<void>.delayed(Duration.zero);
    final jobId = state.convertJobs.single.id;

    // User taps the ✕ on the still-processing job — this is "cancel".
    state.removeConvertJob(jobId);
    expect(state.convertJobs, isEmpty);

    // The underlying request keeps running and eventually succeeds, but since
    // its job is gone from the tracker the result must be fully discarded.
    pending.complete(const AiTextResult(ok: true, message: 'ok', text: '1girl, solo'));
    await running;

    expect(state.convertResult, isEmpty);
    expect(state.convertHistory, isEmpty);
  });

  test(
      'auto-dismisses a done job from the tracker shortly after it finishes, without touching history',
      () async {
    final api = _ScriptedApi(convertResponses: [
      () async => const AiTextResult(ok: true, message: 'ok', text: '1girl, solo'),
    ]);
    final storage = _FakeStorage();
    final state = buildState(api, storage);
    state.convertInput = '应该自动消失';

    await state.convertPrompt();
    expect(state.convertJobs, hasLength(1));
    expect(state.convertJobs.single.status, TextToolJobStatus.done);

    await Future<void>.delayed(const Duration(milliseconds: 1600));
    expect(state.convertJobs, isEmpty);
    expect(state.convertHistory, hasLength(1));
  });
}

class _StubOfflineTags extends OfflineTagStore {
  @override
  Future<OfflineTagStatus> status() async => const OfflineTagStatus();
}
