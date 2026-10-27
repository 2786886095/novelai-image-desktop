import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/comic/comic_prompt.dart';
import 'package:novelai_mobile/comic/comic_prompt_controller.dart';
import 'package:novelai_mobile/services/generation_scope.dart';

void main() {
  ComicPromptComposerController make(ComicPromptTransport transport,
          {String Function()? context,
          Future<String?> Function()? read,
          Future<void> Function(String)? write}) =>
      ComicPromptComposerController(
          transport: transport,
          contextFingerprint: context ?? () => 'config-v1',
          readDraft: read ?? () async => null,
          writeDraft: write ?? (_) async {});
  test('recommend mode cannot generate from a fake default page number',
      () async {
    var calls = 0;
    final c = make((r, s) async {
      calls++;
      return const ComicTextReply(
          ok: true, text: '{"pages":2,"reason":"Two beats"}');
    });
    addTearDown(c.dispose);
    await c.load();
    c.setInput('A story');
    await c.generate();
    expect(calls, 0);
    expect(c.canGenerate, false);
    await c.recommend();
    expect(calls, 1);
    expect(c.pages, 2);
    expect(c.reason, 'Two beats');
    expect(c.canGenerate, true);
    c.setInput('New story');
    expect(c.recommendationCurrent, false);
    expect(c.canGenerate, false);
  });
  test('five pages use explicit four plus one batches and no auto continuation',
      () async {
    final requests = <ComicPromptRequest>[];
    final c = make((r, s) async {
      requests.add(r);
      return ComicTextReply(
          ok: true,
          text: List.generate(
                  r.pages, (i) => '1girl, page ${r.batchFrom + i}, outdoors')
              .join('\n'));
    });
    addTearDown(c.dispose);
    await c.load();
    c.setInput('Umbrella story');
    c.setManual(true);
    c.setPages('5');
    await c.generate();
    expect(requests.length, 1);
    expect(c.completedPages, 4);
    expect(c.canContinue, true);
    expect(c.canImport, false);
    await Future<void>.delayed(const Duration(milliseconds: 5));
    expect(requests.length, 1);
    await c.generate(next: true);
    expect(requests.length, 2);
    expect(requests.last.batchFrom, 5);
    expect(requests.last.pages, 1);
    expect(requests.last.continuity, contains('page 4'));
    expect(c.canImport, true);
    expect(c.pagesToImport().length, 5);
  });
  test('single-panel format allows eight pages per explicit batch', () async {
    final requests = <ComicPromptRequest>[];
    final c = make((r, s) async {
      requests.add(r);
      return ComicTextReply(
          ok: true,
          text: List.generate(r.pages, (i) => '1girl, scene $i').join('\n'));
    });
    addTearDown(c.dispose);
    await c.load();
    c.setInput('Story');
    c.setManual(true);
    c.setFormat(ComicPromptFormat.singlePanel);
    c.setPages('9');
    await c.generate();
    expect(requests.single.pages, 8);
    expect(c.completedPages, 8);
    expect(c.canContinue, true);
  });
  for (final axis in ['input', 'format', 'context', 'output']) {
    test('a changed $axis never adopts a late response over current edits',
        () async {
      var context = 'first';
      final gate = Completer<ComicTextReply>(), entered = Completer<void>();
      final c = make((r, s) {
        entered.complete();
        return gate.future;
      }, context: () => context);
      addTearDown(c.dispose);
      await c.load();
      c.setInput('Original');
      c.setManual(true);
      c.setPages('1');
      final pending = c.generate();
      await entered.future;
      if (axis == 'input') c.setInput('New input');
      if (axis == 'format') c.setFormat(ComicPromptFormat.singlePanel);
      if (axis == 'context') context = 'new template';
      if (axis == 'output') c.editOutput('newer user edit');
      gate.complete(
          const ComicTextReply(ok: true, text: '1girl, old request scene'));
      await pending;
      expect(c.output, axis == 'output' ? 'newer user edit' : '');
      expect(c.unused, true);
      expect(c.canImport, false);
    });
  }
  test('cancellation closes only its owner scope and sends no automatic retry',
      () async {
    var ownCancelled = 0, otherCancelled = 0, calls = 0;
    final other = GenerationScope()..attach(() => otherCancelled++);
    final gate = Completer<ComicTextReply>(), entered = Completer<void>();
    final c = make((r, s) {
      calls++;
      s.attach(() => ownCancelled++);
      entered.complete();
      return gate.future;
    });
    addTearDown(c.dispose);
    await c.load();
    c.setInput('A');
    c.setManual(true);
    final pending = c.generate();
    await entered.future;
    c.cancel();
    expect(ownCancelled, 1);
    expect(otherCancelled, 0);
    expect(other.cancelled, false);
    gate.complete(const ComicTextReply(ok: true, text: '1girl'));
    await pending;
    expect(c.output, '');
    expect(calls, 1);
    expect(c.busy, false);
  });
  test(
      'mismatch and truncated responses retain raw without importing or retrying',
      () async {
    for (final reply in [
      const ComicTextReply(ok: true, text: '1girl', truncated: true),
      const ComicTextReply(ok: true, text: '1girl\n2girls')
    ]) {
      var calls = 0;
      final c = make((r, s) async {
        calls++;
        return reply;
      });
      await c.load();
      c.setInput('A');
      c.setManual(true);
      await c.generate();
      expect(c.raw, reply.text);
      expect(c.output, '');
      expect(c.canImport, false);
      expect(calls, 1);
      c.dispose();
    }
  });
  test('corrupt draft original bytes are never overwritten', () async {
    var writes = 0;
    final c = make((r, s) async => const ComicTextReply(ok: true),
        read: () async => '{broken',
        write: (_) async {
          writes++;
        });
    addTearDown(c.dispose);
    await c.load();
    expect(c.draftError, isNotNull);
    c.setInput('New draft');
    await c.flush();
    expect(writes, 0);
    expect(c.canGenerate, false);
  });
  test(
      'draft roundtrip retains text without credentials and stale configuration stays non-importable',
      () async {
    String? saved;
    var config = 'model-one';
    final c = make(
        (r, s) async =>
            const ComicTextReply(ok: true, text: '1girl, quiet street'),
        context: () => config,
        write: (s) async {
          saved = s;
        });
    await c.load();
    c.setInput('Story');
    c.setManual(true);
    await c.generate();
    await c.flush();
    expect(saved, isNotNull);
    expect(saved, isNot(contains('model-one')));
    c.dispose();
    config = 'model-two';
    final restored = make((r, s) async => const ComicTextReply(ok: true),
        context: () => config, read: () async => saved);
    addTearDown(restored.dispose);
    await restored.load();
    expect(restored.output, '1girl, quiet street');
    expect(restored.input, 'Story');
    expect(restored.canImport, false);
  });
  test('invalid manual count does not create a corrupt self-saved draft',
      () async {
    String? saved;
    final c =
        make((r, s) async => const ComicTextReply(ok: true), write: (s) async {
      saved = s;
    });
    await c.load();
    c.setPages('99');
    await c.flush();
    c.dispose();
    final restored = make((r, s) async => const ComicTextReply(ok: true),
        read: () async => saved);
    addTearDown(restored.dispose);
    await restored.load();
    expect(restored.draftError, isNull);
    expect(restored.pages, isNull);
    expect(restored.canGenerate, false);
  });
}
