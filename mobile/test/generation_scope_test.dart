import 'dart:async';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:image/image.dart' as image_lib;
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/generation_scope.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  test(
      'scope cancellation closes only attached clients, detaches and never invokes another scope',
      () async {
    var a = 0, b = 0;
    final one = GenerationScope(), two = GenerationScope();
    one.attach(() => a++);
    final detach = two.attach(() => b++);
    one.cancel();
    one.cancel();
    expect(a, 1);
    expect(b, 0);
    expect(() => one.check(), throwsStateError);
    detach();
    two.cancel();
    expect(b, 0);
  });
  test(
      'actual native HTTP transport keeps a simultaneous independent request alive on scoped stop',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final requests = <HttpRequest>[];
    final arrived = Completer<void>();
    server.listen((r) async {
      await r.drain<void>();
      requests.add(r);
      if (requests.length == 2) arrived.complete();
    });
    final api = NaiApi(),
        settings = AppSettings()
          ..allowCustomEndpoint = true
          ..imageBaseUrl = 'http://127.0.0.1:${server.port}',
        params = GenerateParams()..positivePrompt = 'fixture';
    final one = GenerationScope(), two = GenerationScope();
    final a = one
        .run(() => api.generate('fixture', settings, params, GenerateExtras()));
    final aError = expectLater(a, throwsA(anything));
    // Ensure the first request has reached the server before creating the second.
    for (var i = 0; requests.isEmpty && i < 200; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    expect(requests, hasLength(1));
    final b = two
        .run(() => api.generate('fixture', settings, params, GenerateExtras()));
    await arrived.future.timeout(const Duration(seconds: 5));
    one.cancel();
    await aError;
    final png = image_lib.encodePng(image_lib.Image(width: 16, height: 16));
    final zip = ZipEncoder()
        .encode(Archive()..addFile(ArchiveFile('image.png', png.length, png)))!;
    requests[1].response.add(zip);
    await requests[1].response.close();
    final result = await b.timeout(const Duration(seconds: 5));
    expect(result.$1, hasLength(1));
    expect(two.cancelled, false);
  }, timeout: const Timeout(Duration(seconds: 20)));
  test('pre-cancelled scope rejects before opening a paid HTTP connection',
      () async {
    final scope = GenerationScope()..cancel(),
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    var calls = 0;
    server.listen((r) {
      calls++;
      r.response.close();
    });
    final settings = AppSettings()
      ..allowCustomEndpoint = true
      ..imageBaseUrl = 'http://127.0.0.1:${server.port}';
    await expectLater(
        scope.run(() => NaiApi().generate('fixture', settings,
            GenerateParams()..positivePrompt = 'fixture', GenerateExtras())),
        throwsStateError);
    expect(calls, 0);
  });
  test(
      'native final guard runs after asynchronous preparation and before any POST',
      () async {
    var checks = 0;
    final scope = GenerationScope(beforeSubmit: () {
      checks++;
      throw StateError('source changed');
    });
    await expectLater(
        scope.run(() => NaiApi().generate('fixture', AppSettings(),
            GenerateParams()..positivePrompt = 'fixture', GenerateExtras())),
        throwsStateError);
    expect(checks, 1);
  });
  test('stopping during native 429 backoff prevents another submission',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    var calls = 0;
    final scope = GenerationScope();
    final first = Completer<void>();
    server.listen((r) async {
      calls++;
      await r.drain<void>();
      r.response.statusCode = 429;
      r.response.headers.set('retry-after', '1');
      await r.response.close();
      if (!first.isCompleted) first.complete();
    });
    final settings = AppSettings()
      ..allowCustomEndpoint = true
      ..imageBaseUrl = 'http://127.0.0.1:${server.port}';
    final request = scope.run(() => NaiApi().generate('fixture', settings,
        GenerateParams()..positivePrompt = 'fixture', GenerateExtras()));
    final error = expectLater(request, throwsA(anything));
    await first.future;
    scope.cancel();
    await error;
    expect(calls, 1);
  }, timeout: const Timeout(Duration(seconds: 10)));
}
