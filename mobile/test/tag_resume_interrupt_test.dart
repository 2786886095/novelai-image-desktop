import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/tags/multilingual_tag_packs.dart';

void main() {
  test('one download automatically resumes its saved bytes', () async {
    final root = await Directory.systemTemp.createTemp('resume-');
    addTearDown(() => root.delete(recursive: true));
    final file = File('${root.path}/fixture.part'), ranges = <String?>[];
    final client = MockClient.streaming((req, _) async {
      ranges.add(req.headers['range']);
      if (ranges.length == 1) {
        Stream<List<int>> cut() async* {
          yield utf8.encode('ab');
          throw const HttpException('controlled cut');
        }

        return http.StreamedResponse(cut(), 200, contentLength: 4);
      }
      return http.StreamedResponse(Stream.value(utf8.encode('cd')), 206,
          contentLength: 2, headers: {'content-range': 'bytes 2-3/4'});
    });
    final digest = sha256.convert(utf8.encode('abcd')).toString();
    await MultilingualTagPacks.resumeTagPack(
        client, 'stamp', 'fixture', file, 4, digest);
    expect(ranges, [null, 'bytes=2-']);
    expect(await file.readAsString(), 'abcd');
  });

  test(
      'persistent interruption stops after three retries and retains exact prefix',
      () async {
    final root = await Directory.systemTemp.createTemp('resume-limit-');
    addTearDown(() => root.delete(recursive: true));
    final file = File('${root.path}/fixture.part');
    final ranges = <String?>[], states = <String>[];
    final client = MockClient.streaming((req, _) async {
      ranges.add(req.headers['range']);
      final start = ranges.length - 1;
      Stream<List<int>> shortBody() async* {
        yield [start];
      }

      return http.StreamedResponse(shortBody(), start == 0 ? 200 : 206,
          contentLength: 8 - start,
          headers: {if (start > 0) 'content-range': 'bytes $start-7/8'});
    });
    await expectLater(
        MultilingualTagPacks.resumeTagPack(
            client, 'stamp', 'fixture', file, 8, 'unused',
            onInterrupted: (next, saved) => states.add('$next:$saved')),
        throwsA(isA<HttpException>()));
    expect(ranges, [null, 'bytes=1-', 'bytes=2-', 'bytes=3-']);
    expect(states, ['1:1', '2:2', '3:3', '0:4']);
    expect(await file.readAsBytes(), [0, 1, 2, 3]);
  });
  test(
      'ignored Range and interrupted restart do not destroy the original prefix',
      () async {
    final root = await Directory.systemTemp.createTemp('resume-restart-');
    addTearDown(() => root.delete(recursive: true));
    final file = File('${root.path}/fixture.part');
    await file.writeAsString('ab');
    final ranges = <String?>[], saved = <int>[];
    final client = MockClient.streaming((req, _) async {
      ranges.add(req.headers['range']);
      if (ranges.length == 1) {
        return http.StreamedResponse(Stream.value([97]), 200, contentLength: 4);
      }
      return http.StreamedResponse(Stream.value([99, 100]), 206,
          contentLength: 2, headers: {'content-range': 'bytes 2-3/4'});
    });
    await MultilingualTagPacks.resumeTagPack(client, 'stamp', 'fixture', file,
        4, sha256.convert(utf8.encode('abcd')).toString(),
        onInterrupted: (_, n) => saved.add(n));
    expect(ranges, ['bytes=2-', 'bytes=2-']);
    expect(saved, [2]);
    expect(await file.readAsString(), 'abcd');
  });
  test('integrity failures and permanent HTTP failures are not retried',
      () async {
    final root = await Directory.systemTemp.createTemp('resume-invalid-');
    addTearDown(() => root.delete(recursive: true));
    final file = File('${root.path}/fixture.part');
    for (final code in [200, 404]) {
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return http.Response('abcd', code);
      });
      await expectLater(
          MultilingualTagPacks.resumeTagPack(
              client, 'stamp', 'fixture', file, 4, 'wrong',
              onInterrupted: (_, __) =>
                  fail('Non-transient failure must not retry')),
          throwsA(code == 200 ? isA<FormatException>() : isA<HttpException>()));
      expect(calls, 1);
      expect(await file.exists(), isFalse);
    }
  });
}
