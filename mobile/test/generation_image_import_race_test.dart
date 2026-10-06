import 'dart:async';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'issues_42_46_test.dart' as fixtures;

class _ReadFile implements File {
  @override
  final String path;
  final Future<Uint8List> bytes;
  _ReadFile(this.path, this.bytes);
  @override
  Future<Uint8List> readAsBytes() => bytes;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AppState state;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    state = AppState(storage: Storage());
    state.params
      ..positivePrompt = 'frozen prompt'
      ..negativePrompt = 'frozen negative'
      ..seed = 42
      ..steps = 28;
  });
  tearDown(() => state.dispose());
  void unchanged() {
    expect(state.params.positivePrompt, 'frozen prompt');
    expect(state.params.negativePrompt, 'frozen negative');
    expect(state.params.seed, 42);
    expect(state.params.steps, 28);
    expect(state.extras.charCaptions, isEmpty);
    expect(state.workbenchImportedParams, isNull);
  }

  test(
      'explicit restore while generation is busy rejects before reading or mutating',
      () async {
    state.busy = true;
    var reads = 0;
    await IOOverrides.runZoned(() async {
      await expectLater(
          state.importGenerationImage('pending.png'), throwsStateError);
    }, createFile: (path) {
      reads++;
      return _ReadFile(path, Future.value(fixtures.fixture()));
    });
    expect(reads, 0);
    unchanged();
    expect(state.workbenchImage, isNull);
  });
  for (final finishesDuringRead in [false, true]) {
    test(
        'generation starts during explicit read (finishes=$finishesDuringRead): no late mutation',
        () async {
      final delayed = Completer<Uint8List>();
      await IOOverrides.runZoned(() async {
        final pending = state.importGenerationImage('pending.png');
        // Attach the error observer before resolving the delayed I/O.
        final rejected = expectLater(pending, throwsStateError);
        state.busy = true;
        if (finishesDuringRead) state.busy = false;
        delayed.complete(fixtures.fixture());
        await rejected;
      }, createFile: (path) => _ReadFile(path, delayed.future));
      unchanged();
      expect(state.workbenchImage, isNull);
    });
  }
  for (final latestRestoresMetadata in [false, true]) {
    test(
        'old delayed explicit import cannot supersede newer metadata=$latestRestoresMetadata image',
        () async {
      final delayed = Completer<Uint8List>();
      await IOOverrides.runZoned(() async {
        final old = state.importGenerationImage('old.png');
        final rejected = expectLater(old, throwsStateError);
        await state.setWorkbenchPath('latest.png',
            applyMetadata: latestRestoresMetadata);
        final prompt = state.params.positivePrompt;
        final seed = state.params.seed;
        delayed.complete(fixtures.fixture());
        await rejected;
        expect(state.workbenchImage?.filePath, 'latest.png');
        expect(state.params.positivePrompt, prompt);
        expect(state.params.seed, seed);
        expect(prompt,
            latestRestoresMetadata ? 'restored scene' : 'frozen prompt');
        expect(seed, latestRestoresMetadata ? 9876 : 42);
      },
          createFile: (path) => _ReadFile(
              path,
              path == 'old.png'
                  ? delayed.future
                  : Future.value(fixtures.fixture())));
    });
  }
  test(
      'clear workbench cancels an older explicit import without resurrecting its image',
      () async {
    final delayed = Completer<Uint8List>();
    await IOOverrides.runZoned(() async {
      final old = state.importGenerationImage('old.png');
      final rejected = expectLater(old, throwsStateError);
      state.clearWorkbench();
      delayed.complete(fixtures.fixture());
      await rejected;
    }, createFile: (path) => _ReadFile(path, delayed.future));
    unchanged();
    expect(state.workbenchImage, isNull);
  });
  test(
      'history image-only selection still works while busy and never restores form metadata',
      () async {
    state.busy = true;
    await IOOverrides.runZoned(
        () => state
            .setWorkbenchFromHistory(fixtures.record('history', 'history.png')),
        createFile: (path) =>
            _ReadFile(path, Future.value(fixtures.fixture())));
    expect(state.workbenchImage?.filePath, 'history.png');
    expect(state.params.positivePrompt, 'frozen prompt');
    expect(state.params.seed, 42);
    expect(state.workbenchImportedParams, isNotNull);
  });
}
