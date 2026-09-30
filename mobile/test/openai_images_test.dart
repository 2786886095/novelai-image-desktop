import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image;
import 'package:novelai_mobile/services/openai_images.dart';

void main() {
  final servers = <HttpServer>[];
  const key = 'fixture-private-key';
  Uint8List png() => image
      .encodePng(image.Image(width: 4, height: 5)..textData = {'private': key});
  Future<String> serve(FutureOr<void> Function(HttpRequest) handler) async {
    final s = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    servers.add(s);
    s.listen(handler);
    return 'http://127.0.0.1:${s.port}';
  }

  CompatibleImageConfig config(String base, {String format = 'auto'}) =>
      CompatibleImageConfig(
          baseUrl: base, model: 'custom', apiKey: key, responseFormat: format);
  Future<CompatibleImageBatch> generate(String base,
          {int n = 1,
          CompatibleImageCancellation? cancellation,
          Duration timeout = const Duration(seconds: 5),
          int maxBytes = 64 * 1024 * 1024}) =>
      generateCompatibleImages(config(base),
          prompt: 'a quiet forest',
          size: '1024x1024',
          n: n,
          cancellation: cancellation,
          timeout: timeout,
          maxBytes: maxBytes);
  tearDown(() async {
    for (final s in servers) {
      await s.close(force: true);
    }
    servers.clear();
  });

  test(
      'matches desktop route/body rules with optional response format and explicit extensions',
      () {
    expect(compatibleImageEndpoint('https://gateway.example/v1/').toString(),
        'https://gateway.example/v1/images/generations');
    expect(
        compatibleImageEndpoint('https://gateway.example/v1/images/generations')
            .toString(),
        'https://gateway.example/v1/images/generations');
    expect(
        compatibleImageBody(config('https://gateway.example'),
            prompt: 'forest', size: 'auto', n: 1),
        {'model': 'custom', 'prompt': 'forest', 'size': 'auto', 'n': 1});
    expect(() => compatibleImageEndpoint('https://key:secret@example.com/v1'),
        throwsFormatException);
    expect(() => compatibleImageEndpoint('https://example.com/v1?key=secret'),
        throwsFormatException);
    expect(
        () => compatibleImageBody(config('https://gateway.example'),
            prompt: 'forest', size: 'auto', n: 1, extensions: {'api_key': key}),
        throwsFormatException);
  });
  test(
      'real HTTP sends dedicated key once and accepts actual pixels without upstream metadata',
      () async {
    var calls = 0;
    final base = await serve((r) async {
      calls++;
      expect(r.method, 'POST');
      expect(r.uri.path, '/v1/images/generations');
      expect(r.headers.value('authorization'), 'Bearer $key');
      final body = jsonDecode(await utf8.decoder.bind(r).join());
      expect(body, {
        'model': 'custom',
        'prompt': 'a quiet forest',
        'size': '1024x1024',
        'n': 1,
        'response_format': 'b64_json'
      });
      r.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(png())}
        ]
      }));
      await r.response.close();
    });
    final result = await generateCompatibleImages(
        config('$base/v1', format: 'b64_json'),
        prompt: 'a quiet forest',
        size: '1024x1024',
        n: 1);
    expect(result.complete, true);
    expect(result.submitted, true);
    expect(calls, 1);
    final decoded = image.decodePng(result.images.single)!;
    expect(decoded.width, 4);
    expect(decoded.textData, isNull);
  });
  test('URL retrieval has no key and POST redirects are not followed',
      () async {
    var posts = 0, gets = 0;
    late String base;
    base = await serve((r) async {
      if (r.uri.path == '/image') {
        gets++;
        expect(r.headers.value('authorization'), isNull);
        r.response.add(png());
      } else {
        posts++;
        r.response.write(jsonEncode({
          'data': [
            {'url': '$base/image'}
          ]
        }));
      }
      await r.response.close();
    });
    expect((await generate(base)).complete, true);
    expect(posts, 1);
    expect(gets, 1);
    var redirected = 0;
    final target = await serve((r) async {
      redirected++;
      await r.response.close();
    });
    final redirect = await serve((r) async {
      r.response.statusCode = 307;
      r.response.headers.set('location', target);
      await r.response.close();
    });
    final result = await generate(redirect);
    expect(result.error?.status, 307);
    expect(result.complete, false);
    expect(redirected, 0);
  });
  test('HTTP error never echoes secrets or retries a possibly billed request',
      () async {
    var calls = 0;
    final base = await serve((r) async {
      calls++;
      r.response.statusCode = 429;
      r.response.write('Authorization: Bearer $key');
      await r.response.close();
    });
    final result = await generate(base);
    expect(calls, 1);
    expect(result.error?.status, 429);
    expect(result.error.toString(), isNot(contains(key)));
  });
  test('valid earlier images survive malformed later data', () async {
    var calls = 0;
    final base = await serve((r) async {
      calls++;
      r.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(png())},
          {'b64_json': 'not base64'}
        ]
      }));
      await r.response.close();
    });
    final result = await generate(base, n: 2);
    expect(result.complete, false);
    expect(result.images, hasLength(1));
    expect(result.error?.phase, 'decode');
    expect(calls, 1);
  });
  test('pre-cancel sends nothing and in-flight cancel is not retried',
      () async {
    final arrived = Completer<void>();
    var calls = 0;
    final base = await serve((r) {
      calls++;
      if (!arrived.isCompleted) arrived.complete();
    });
    final cancelled = CompatibleImageCancellation()..cancel();
    expect((await generate(base, cancellation: cancelled)).submitted, false);
    expect(calls, 0);
    final token = CompatibleImageCancellation();
    final pending = generate(base, cancellation: token);
    await arrived.future;
    token.cancel();
    final result = await pending;
    expect(result.cancelled, true);
    expect(result.submitted, true);
    expect(calls, 1);
  });
  test('byte limit and timeout stop without silently resubmitting', () async {
    var calls = 0;
    final base = await serve((r) async {
      calls++;
      r.response.write('x' * 4096);
      await r.response.close();
    });
    expect((await generate(base, maxBytes: 64)).complete, false);
    expect(calls, 0, reason: 'oversized request body fails before POST');
    final response = await generate(base, maxBytes: 1024);
    expect(response.complete, false);
    expect(calls, 1);
    final slow = await serve((r) {});
    final result =
        await generate(slow, timeout: const Duration(milliseconds: 50));
    expect(result.timedOut, true);
    expect(result.cancelled, false);
    expect(result.submitted, true);
  });
}
