import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/translation_session.dart';

const success =
    TranslationReply(ok: true, text: 'translated', sourceLanguage: 'en');
void main() {
  testWidgets(
      'preview live save restores off on failure and cancels pending auto request',
      (tester) async {
    var calls = 0;
    final s = TranslationSession('words', 'ja', (v, t, f) async {
      calls++;
      return success;
    });
    final saved = <bool>[];
    await s.persistLive(true, (v) async {
      saved.add(v);
    });
    expect(saved, [true]);
    await tester.pump(const Duration(milliseconds: 600));
    expect(calls, 1);
    await s.persistLive(false, (v) async {
      saved.add(v);
    });
    await expectLater(
        s.persistLive(true, (v) async {
          throw StateError('save failed');
        }),
        throwsStateError);
    expect(s.live, isFalse);
    s.editSource('paused');
    await tester.pump(const Duration(seconds: 2));
    expect(calls, 1);
    s.dispose();
  });
  testWidgets('late failed live save does not notify a disposed preview',
      (tester) async {
    final d = Completer<void>();
    var calls = 0;
    final s = TranslationSession('words', 'ja', (v, t, f) async {
      calls++;
      return success;
    });
    final p = s.persistLive(true, (_) => d.future);
    s.dispose();
    d.completeError(StateError('late save'));
    await expectLater(p, throwsStateError);
    await tester.pump(const Duration(seconds: 2));
    expect(calls, 0);
  });
  testWidgets('default off, editable drafts and explicit manual translation',
      (tester) async {
    final calls = <List<String>>[];
    final s = TranslationSession('original', 'ja', (v, t, f) async {
      calls.add([v, t, f]);
      return success;
    });
    s.start();
    s.editSource('edited');
    await tester.pump(const Duration(seconds: 3));
    expect(calls, isEmpty);
    s.translate();
    await tester.pump();
    expect(calls, [
      ['edited', 'ja', 'auto']
    ]);
    expect(s.result, 'translated');
    s.editResult('manual');
    expect(s.valid, isTrue);
    expect(s.swap(), isTrue);
    expect(s.source, 'manual');
    expect(s.result, 'edited');
    expect(s.sourceLanguage, 'ja');
    expect(s.target, 'en');
    s.dispose();
  });
  testWidgets('600ms debounce, one flight and latest input wins',
      (tester) async {
    final first = Completer<TranslationReply>(),
        last = Completer<TranslationReply>(),
        calls = <String>[];
    final s = TranslationSession('initial', 'ja', (v, t, f) {
      calls.add(v);
      return calls.length == 1 ? first.future : last.future;
    }, live: true);
    s.start();
    await tester.pump(const Duration(milliseconds: 300));
    s.editSource('first');
    await tester.pump(const Duration(milliseconds: 599));
    expect(calls, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    expect(calls, ['first']);
    s.editSource('middle');
    await tester.pump(const Duration(milliseconds: 600));
    s.editSource('last');
    await tester.pump(const Duration(milliseconds: 600));
    expect(calls, ['first']);
    first.complete(const TranslationReply(ok: true, text: 'STALE'));
    await tester.pump();
    expect(s.result, '');
    expect(calls, ['first', 'last']);
    last.complete(success);
    await tester.pump();
    expect(s.result, 'translated');
    s.dispose();
  });
  testWidgets('IME suppresses incomplete source and protects manual result',
      (tester) async {
    var calls = 0;
    final s = TranslationSession('original', 'en', (v, t, f) async {
      calls++;
      return success;
    }, live: true);
    s.start();
    s.setComposing(true);
    s.editSource('拼');
    await tester.pump(const Duration(seconds: 3));
    expect(calls, 0);
    s.editSource('拼音');
    s.setComposing(false);
    await tester.pump(const Duration(milliseconds: 600));
    expect(calls, 1);
    s.setComposing(true);
    s.editResult('人工');
    s.setComposing(false, scheduleOnEnd: false);
    await tester.pump(const Duration(seconds: 3));
    expect(calls, 1);
    expect(s.result, '人工');
    s.dispose();
  });
  testWidgets('manual result invalidates pending provider reply',
      (tester) async {
    final d = Completer<TranslationReply>(),
        s = TranslationSession('original', 'en', (v, t, f) => d.future);
    s.translate();
    s.editResult('my result');
    d.complete(success);
    await tester.pump();
    expect(s.result, 'my result');
    expect(s.valid, isTrue);
    s.dispose();
  });
  testWidgets('language change cancels stale result, explicit from/to used',
      (tester) async {
    final d = Completer<TranslationReply>(), calls = <List<String>>[];
    final s = TranslationSession('original', 'ja', (v, t, f) {
      calls.add([v, t, f]);
      return calls.length == 1 ? d.future : Future.value(success);
    }, live: true);
    s.start();
    await tester.pump(const Duration(milliseconds: 600));
    s.setLanguages('zh-TW', 'ko');
    await tester.pump(const Duration(milliseconds: 600));
    d.complete(success);
    await tester.pump();
    expect(calls.last, ['original', 'ko', 'zh-TW']);
    expect(s.result, 'translated');
    s.dispose();
  });
  testWidgets(
      'empty/disable/close cancel timers and close ignores pending reply',
      (tester) async {
    var calls = 0;
    final d = Completer<TranslationReply>(),
        s = TranslationSession('words', 'ja', (v, t, f) {
          calls++;
          return d.future;
        }, live: true);
    s.start();
    s.editSource(' ');
    await tester.pump(const Duration(seconds: 3));
    s.editSource('words');
    s.setLive(false);
    await tester.pump(const Duration(seconds: 3));
    expect(calls, 0);
    s.translate();
    expect(calls, 1);
    s.dispose();
    d.complete(success);
    await tester.pump();
    expect(s.result, '');
    final other = TranslationSession('words', 'ja', (v, t, f) async {
      calls++;
      return success;
    }, live: true);
    other.start();
    other.dispose();
    await tester.pump(const Duration(seconds: 3));
    expect(calls, 1);
  });
  testWidgets('failed provider has no retry loop; manual retry recovers',
      (tester) async {
    var calls = 0;
    final s = TranslationSession('words', 'ja', (v, t, f) async {
      calls++;
      return calls == 1
          ? const TranslationReply(ok: false, error: 'fixture failure')
          : success;
    }, live: true);
    s.start();
    await tester.pump(const Duration(milliseconds: 600));
    expect(s.error, 'fixture failure');
    expect(s.valid, isFalse);
    await tester.pump(const Duration(seconds: 10));
    expect(calls, 1);
    s.translate();
    await tester.pump();
    expect(s.valid, isTrue);
    s.dispose();
  });
  testWidgets(
      'auto swap never guesses unsupported detection and empty result fails',
      (tester) async {
    final s = TranslationSession(
        'words',
        'ja',
        (v, t, f) async => const TranslationReply(
            ok: true, text: ' ', sourceLanguage: 'unknown'));
    expect(s.canSwap, isFalse);
    s.translate();
    await tester.pump();
    expect(s.valid, isFalse);
    expect(s.canSwap, isFalse);
    s.setLanguages('en', 'ja');
    expect(s.canSwap, isTrue);
    s.dispose();
  });
}
