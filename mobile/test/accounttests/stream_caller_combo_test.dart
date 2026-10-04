import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/generation_scope.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/nai_stream.dart';

void main() {
  final fixture = jsonDecode(
      File('test/accounttests/fixtures/novelai-native-response-fixture.json')
          .readAsStringSync()) as Map;
  final png = (fixture['cases'] as List)
      .firstWhere((row) => row['id'] == 'raw-png')['body'] as String;
  final body = utf8.encode('event: final\ndata: ${jsonEncode({
        'event_type': 'final',
        'samp_ix': 0,
        'image': png
      })}\n\n');
  AppSettings settings(HttpServer server) => AppSettings(
      imageBaseUrl: 'http://127.0.0.1:${server.port}',
      allowCustomEndpoint: true,
      allowCustomEndpointFallback: false,
      proxyMode: 'direct',
      streamPreviewEnabled: true);

  for (final kind in [
    'unscoped-global-stop',
    'credentials-change-after-preview'
  ]) {
    test('actual stream caller combination $kind', () async {
      final previous = HttpOverrides.current;
      HttpOverrides.global = null;
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final posts = <String>[];
      var credentialMismatch = false;
      final subscription = server.listen((request) async {
        posts.add(request.uri.path);
        credentialMismatch |= request.method != 'POST' ||
            request.headers.value(HttpHeaders.authorizationHeader) !=
                'Bearer QA_ONLY_PLACEHOLDER_TOKEN';
        await request.drain<void>();
        request.response.headers.contentType =
            ContentType('text', 'event-stream');
        request.response.add(body);
        await request.response.close();
      });
      final api = NaiApi();
      var credentialsChanged = false;
      final scope = GenerationScope(assertCredentials: (_, __) {
        if (credentialsChanged) throw StateError('OWNED ACCOUNT CHANGED');
      });
      final previews = <NaiGenerationPreview>[];
      Future<(List<Uint8List>, int)> generate() => api.generate(
              'QA_ONLY_PLACEHOLDER_TOKEN',
              settings(server),
              GenerateParams(),
              GenerateExtras(), onPreview: (preview) {
            previews.add(preview);
            if (preview.progress >= 1) return;
            if (kind == 'unscoped-global-stop') api.cancelActiveGeneration();
            credentialsChanged = true;
          });
      Object? error;
      var count = 0;
      try {
        count = (await (kind == 'unscoped-global-stop'
                ? generate()
                : scope.run(generate)))
            .$1
            .length;
      } catch (caught) {
        error = caught;
      } finally {
        await subscription.cancel();
        await server.close(force: true);
        HttpOverrides.global = previous;
      }
      final finals =
          previews.where((p) => p.finalImage || p.progress == 1).length;
      final passed = !credentialMismatch &&
          posts.length == 1 &&
          posts.single == '/ai/generate-image-stream' &&
          count == 0 &&
          finals == 0 &&
          error != null &&
          (kind != 'credentials-change-after-preview' || error is StateError);
      debugPrint('NOVELAI_STREAM_CALLER_COMBO=${jsonEncode({
            'kind': kind,
            'posts': posts,
            'count': count,
            'finalNotifications': finals,
            'errorType': error?.runtimeType.toString() ?? '',
            'passed': passed
          })}');
      expect(passed, true);
    }, timeout: const Timeout(Duration(seconds: 20)));
  }

  for (final kind in [
    'parallel-scoped-stop',
    'parallel-parent-guard',
    'parallel-global-stop'
  ]) {
    test('actual stream caller combination $kind', () async {
      final previous = HttpOverrides.current;
      HttpOverrides.global = null;
      final firstServer =
          await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final secondServer =
          await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final secondPosted = Completer<void>();
      final releaseSecond = Completer<void>();
      final posts = [<String>[], <String>[]];
      var credentialMismatch = false;
      final subscriptions = <StreamSubscription<HttpRequest>>[];
      for (var i = 0; i < 2; i++) {
        final index = i;
        final server = index == 0 ? firstServer : secondServer;
        subscriptions.add(server.listen((request) async {
          posts[index].add(request.uri.path);
          credentialMismatch |= request.method != 'POST' ||
              request.headers.value(HttpHeaders.authorizationHeader) !=
                  'Bearer QA_ONLY_PLACEHOLDER_TOKEN';
          await request.drain<void>();
          if (index == 1 && !secondPosted.isCompleted) secondPosted.complete();
          await (index == 0 ? secondPosted.future : releaseSecond.future);
          try {
            request.response.headers.contentType =
                ContentType('text', 'event-stream');
            request.response.add(body);
            await request.response.close();
          } on HttpException {
            // The owned server may finish after the client has been cancelled.
          } on SocketException {
            // Cancellation is asserted through the public client result below.
          }
        }));
      }
      final api = NaiApi();
      var guardChanged = false;
      final firstScope = GenerationScope(beforeSubmit: () {
        if (guardChanged) throw StateError('OWNED FIRST WORKSPACE CHANGED');
      });
      final secondScope = GenerationScope();
      Future<Map<String, dynamic>> outcome(int index) async {
        var count = 0;
        var finals = 0;
        Object? error;
        final scope = index == 0 ? firstScope : secondScope;
        try {
          final result = await scope.run(() => api.generate(
                  'QA_ONLY_PLACEHOLDER_TOKEN',
                  settings(index == 0 ? firstServer : secondServer),
                  GenerateParams(),
                  GenerateExtras(), onPreview: (preview) {
                if (preview.finalImage || preview.progress == 1) finals++;
                if (index != 0 || preview.progress >= 1) return;
                if (kind == 'parallel-scoped-stop') firstScope.cancel();
                if (kind == 'parallel-parent-guard') guardChanged = true;
                if (kind == 'parallel-global-stop') {
                  api.cancelActiveGeneration();
                }
                if (!releaseSecond.isCompleted) releaseSecond.complete();
              }));
          count = result.$1.length;
          if (count == 1 && base64Encode(result.$1.single) != png) count = -1;
        } catch (caught) {
          error = caught;
        }
        return {
          'count': count,
          'finalNotifications': finals,
          'errorType': error?.runtimeType.toString() ?? ''
        };
      }

      List<Map<String, dynamic>> outcomes;
      try {
        outcomes = await Future.wait([outcome(0), outcome(1)]);
      } finally {
        if (!releaseSecond.isCompleted) releaseSecond.complete();
        if (!secondPosted.isCompleted) secondPosted.complete();
        for (final subscription in subscriptions) {
          await subscription.cancel();
        }
        await firstServer.close(force: true);
        await secondServer.close(force: true);
        HttpOverrides.global = previous;
      }
      final first = outcomes[0];
      final second = outcomes[1];
      final global = kind == 'parallel-global-stop';
      final passed = !credentialMismatch &&
          posts.every((rows) =>
              rows.length == 1 && rows.single == '/ai/generate-image-stream') &&
          first['count'] == 0 &&
          first['finalNotifications'] == 0 &&
          first['errorType'] != '' &&
          (kind != 'parallel-parent-guard' ||
              first['errorType'] == 'StateError') &&
          second['count'] == (global ? 0 : 1) &&
          second['finalNotifications'] == (global ? 0 : 1) &&
          (global ? second['errorType'] != '' : second['errorType'] == '');
      debugPrint('NOVELAI_STREAM_CALLER_COMBO=${jsonEncode({
            'kind': kind,
            'posts': posts,
            'first': first,
            'second': second,
            'passed': passed
          })}');
      expect(passed, true);
    }, timeout: const Timeout(Duration(seconds: 20)));
  }
}
