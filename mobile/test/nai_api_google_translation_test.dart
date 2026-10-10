import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/foundation.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

// Production NaiApi, with only the Google socket redirected to this test's
// loopback fixture. Never calls external endpoints or reads account credentials.
class _RedirectGoogle extends HttpOverrides {
  final int port;
  _RedirectGoogle(this.port);
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      _LoopbackClient(super.createHttpClient(context), port);
}

class _LoopbackClient implements HttpClient {
  final HttpClient inner;
  final int port;
  _LoopbackClient(this.inner, this.port);
  @override
  set idleTimeout(Duration value) => inner.idleTimeout = value;
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) {
    if (url.host != 'translate.googleapis.com' || method != 'GET') {
      throw StateError('Unexpected external request: $method $url');
    }
    return inner.openUrl(
        method, url.replace(scheme: 'http', host: '127.0.0.1', port: port));
  }

  @override
  void close({bool force = false}) => inner.close(force: force);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final settings =
      AppSettings(proxyMode: 'direct', translateProvider: 'google');
  test(
      'real mobile caller: missing index, prose, descriptors, source detection and controls',
      () async {
    final rows = (jsonDecode(
            File('../shared/google-prompt-translation-fixtures.json')
                .readAsStringSync()) as List)
        .cast<Map<String, dynamic>>();
    final observations = <Map<String, dynamic>>[];
    final queries = <String>[];
    Map<String, dynamic>? row;
    var status = 200;
    Object? overrideResponse;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      final q = request.uri.queryParameters['q']!;
      queries.add(q);
      final words = <String, String>{};
      final active = row;
      for (var i = 0; i < (active?['queries'] as List? ?? []).length; i++) {
        final terms = (active!['queries'][i] as String).split('\n');
        final values = (active['responses'][i] as String).split('\n');
        for (var j = 0; j < terms.length; j++) {
          words[terms[j]] = values[j];
        }
      }
      final text = q.split('\n').map((s) => words[s] ?? s).join('\n');
      request.response.statusCode = status;
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(overrideResponse ??
          [
            [
              [text]
            ],
            null,
            row?['detected'] ?? 'en'
          ]));
      await request.response.close();
    });
    final previous = HttpOverrides.current;
    HttpOverrides.global = _RedirectGoogle(server.port);
    try {
      for (final next in rows.where((r) => r['id'] != null)) {
        row = next;
        queries.clear();
        final result = await NaiApi().translateText(
            next['input'] as String, settings,
            target: next['target'] as String,
            sourceLanguage: next['source'] as String);
        observations.add({
          'id': next['id'],
          'input': next['input'],
          'queries': List.of(queries),
          'ok': result.ok,
          'text': result.text,
          'sourceLanguage': result.sourceLanguage,
          'passed': result.ok &&
              result.text == next['output'] &&
              jsonEncode(queries) == jsonEncode(next['queries']) &&
              result.sourceLanguage == next['detected']
        });
      }
      debugPrint('MOBILE_REPAIR_BEHAVIOR: ${jsonEncode(observations)}',
          wrapWidth: null);
      // HTTP failures and malformed responses never retry or publish partial text.
      queries.clear();
      status = 429;
      final failed = await NaiApi().translateText(
          'black_hat, blonde_hair', settings,
          target: 'zh-CN', sourceLanguage: 'en');
      expect(failed.ok, isFalse);
      expect(failed.text, isEmpty);
      expect(queries.length, 1);
      status = 200;
      overrideResponse = [
        [
          ['merged']
        ],
        null,
        'en'
      ];
      queries.clear();
      final malformed = await NaiApi().translateText(
          'black_hat, blonde_hair', settings,
          target: 'zh-CN', sourceLanguage: 'en');
      expect(malformed.ok, isFalse);
      expect(malformed.text, isEmpty);
      expect(queries.length, 1);
      queries.clear();
      final same = await NaiApi().translateText('black_hat', settings,
          target: 'en', sourceLanguage: 'en');
      final names = await NaiApi().translateText(
          'artist:pong, character:misumi_uika', settings,
          target: 'zh-CN', sourceLanguage: 'en');
      expect(same.text, 'black_hat');
      expect(names.text, 'artist:pong, character:misumi_uika');
      expect(queries, isEmpty);
      expect(observations.every((r) => r['passed'] == true), isTrue,
          reason: jsonEncode(observations));
    } finally {
      HttpOverrides.global = previous;
      await server.close(force: true);
    }
  });
}
