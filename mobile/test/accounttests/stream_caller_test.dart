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
  for (final kind in [
    'success',
    'guard-after-preview',
    'scope-cancel-after-preview',
    'global-cancel-after-preview',
    'invalid-final',
    'error-after-final'
  ]) {
    test('actual legacy stream caller $kind', () async {
      final previous = HttpOverrides.current;
      HttpOverrides.global = null;
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final posts = <String>[];
      var credentialMismatch = false;
      String frame(String type, Map<String, dynamic> value) =>
          'event: $type\ndata: ${jsonEncode({
                'event_type': type,
                ...value
              })}\n\n';
      final body = frame('final', {
            'samp_ix': 0,
            'image': kind == 'invalid-final'
                ? base64Encode(utf8.encode('OWNED INVALID IMAGE'))
                : png
          }) +
          (kind == 'error-after-final'
              ? frame('error', {'message': 'OWNED STREAM SERVER ERROR'})
              : '');
      final subscription = server.listen((request) async {
        posts.add(request.uri.path);
        credentialMismatch |= request.method != 'POST' ||
            request.headers.value(HttpHeaders.authorizationHeader) !=
                'Bearer QA_ONLY_PLACEHOLDER_TOKEN';
        await request.drain<void>();
        request.response.headers.contentType =
            ContentType('text', 'event-stream');
        request.response.add(utf8.encode(body));
        await request.response.close();
      });
      final api = NaiApi();
      var guardChanged = false;
      final scope = GenerationScope(beforeSubmit: () {
        if (guardChanged) throw StateError('OWNED GUARDED SOURCE CHANGED');
      });
      final previews = <NaiGenerationPreview>[];
      var triggered = false;
      void preview(NaiGenerationPreview event) {
        previews.add(event);
        if (event.progress >= 1 || triggered) return;
        triggered = true;
        if (kind == 'guard-after-preview') guardChanged = true;
        if (kind == 'scope-cancel-after-preview') scope.cancel();
        if (kind == 'global-cancel-after-preview') api.cancelActiveGeneration();
      }

      final settings = AppSettings(
          imageBaseUrl: 'http://127.0.0.1:${server.port}',
          allowCustomEndpoint: true,
          allowCustomEndpointFallback: false,
          proxyMode: 'direct',
          streamPreviewEnabled: true);
      Object? error;
      var images = <Uint8List>[];
      try {
        Future<(List<Uint8List>, int)> generate() => api.generate(
            'QA_ONLY_PLACEHOLDER_TOKEN',
            settings,
            GenerateParams(),
            GenerateExtras(),
            onPreview: preview);
        images = (await scope.run(generate)).$1;
      } catch (caught) {
        error = caught;
      } finally {
        await subscription.cancel();
        await server.close(force: true);
        HttpOverrides.global = previous;
      }
      final success = kind == 'success';
      final notifications = previews
          .where((event) => event.finalImage || event.progress == 1)
          .length;
      final passed = !credentialMismatch &&
          posts.length == 1 &&
          posts.single == '/ai/generate-image-stream' &&
          images.length == (success ? 1 : 0) &&
          ((error == null) == success) &&
          notifications == (success ? 1 : 0) &&
          (!success || base64Encode(images.single) == png) &&
          (kind != 'guard-after-preview' || error is StateError);
      debugPrint('NOVELAI_STREAM_CALLER=${jsonEncode({
            'kind': kind,
            'posts': posts,
            'count': images.length,
            'finalNotifications': notifications,
            'errorType': error?.runtimeType.toString() ?? '',
            'passed': passed
          })}');
      expect(passed, true);
    }, timeout: const Timeout(Duration(seconds: 20)));
  }
}
