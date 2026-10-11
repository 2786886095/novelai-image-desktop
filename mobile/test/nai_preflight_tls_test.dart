import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:image/image.dart' as images;
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/generation_scope.dart';

class FixtureTrust extends HttpOverrides {
  final bool trusted;
  FixtureTrust(this.trusted);
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final testContext = SecurityContext(withTrustedRoots: false);
    if (trusted) {
      testContext.setTrustedCertificatesBytes(File(
              '../shared/issue-network-fixtures/public-test-ca.${Platform.isIOS ? 'der' : 'pem'}')
          .readAsBytesSync());
    }
    return super.createHttpClient(testContext);
  }
}

class TlsFixture {
  late HttpServer tls;
  late ServerSocket proxy;
  final sockets = <Socket>[];
  int connections = 0, posts = 0, dropBeforeTls;
  final int status;
  final bool dropAfterPost;
  TlsFixture(
      {this.dropBeforeTls = 1, this.status = 200, this.dropAfterPost = false});
  Future<void> start() async {
    final serverContext = SecurityContext()
      ..useCertificateChain(
          '../shared/issue-network-fixtures/public-test-cert.pem')
      ..usePrivateKey('../shared/issue-network-fixtures/public-test-key.pem');
    tls = await HttpServer.bindSecure(
        InternetAddress.loopbackIPv4, 0, serverContext);
    tls.listen((r) async {
      await r.drain<void>();
      posts++;
      if (dropAfterPost) {
        (await r.response.detachSocket()).destroy();
        return;
      }
      final png = images.encodePng(images.Image(width: 16, height: 16));
      final zip = ZipEncoder().encode(
          Archive()..addFile(ArchiveFile('image.png', png.length, png)));
      r.response.statusCode = status;
      r.response.headers.contentType = ContentType('application', 'zip');
      r.response.add(zip);
      await r.response.close();
    }, onError: (_) {});
    proxy = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    proxy.listen((s) async {
      sockets.add(s);
      connections++;
      if (connections <= dropBeforeTls) {
        s.listen((_) {
          unawaited(s.close());
        });
        return;
      }
      final remote =
          await Socket.connect(InternetAddress.loopbackIPv4, tls.port);
      sockets.add(remote);
      s.listen(remote.add,
          onError: (_) => remote.destroy(), onDone: () => remote.destroy());
      remote.listen(s.add,
          onError: (_) => s.destroy(), onDone: () => s.destroy());
    });
  }

  Future<void> close() async {
    for (final socket in sockets) {
      socket.destroy();
    }
    await proxy.close();
    await tls.close(force: true);
  }

  AppSettings settings({bool stream = false}) => AppSettings()
    ..allowCustomEndpoint = true
    ..proxyMode = 'direct'
    ..streamPreviewEnabled = stream
    ..imageBaseUrl = 'https://127.0.0.1:${proxy.port}';
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final stream in [false, true]) {
    test(
        '#69 real TLS preflight recovery stream=$stream submits exactly one HTTP body',
        () async {
      final f = TlsFixture();
      await f.start();
      final previous = HttpOverrides.current;
      HttpOverrides.global = FixtureTrust(true);
      try {
        final output = await NaiApi().generate('public-fixture-token',
            f.settings(stream: stream), GenerateParams(), GenerateExtras(),
            onPreview: stream ? (_) {} : null);
        debugPrint('ISSUE69_MOBILE_REAL_TLS: ${jsonEncode({
              'stream': stream,
              'connections': f.connections,
              'posts': f.posts,
              'images': output.$1.length
            })}', wrapWidth: null);
        expect(output.$1, hasLength(1));
        expect(f.connections, 2);
        expect(f.posts, 1);
      } finally {
        HttpOverrides.global = previous;
        await f.close();
      }
    });
  }
  test('#69 certificate rejection never submits or disables validation',
      () async {
    final f = TlsFixture(dropBeforeTls: 0);
    await f.start();
    final previous = HttpOverrides.current;
    HttpOverrides.global = FixtureTrust(false);
    try {
      await expectLater(
          NaiApi().generate('public-fixture-token', f.settings(),
              GenerateParams(), GenerateExtras()),
          throwsA(anything));
      expect(f.connections, 1);
      expect(f.posts, 0);
    } finally {
      HttpOverrides.global = previous;
      await f.close();
    }
  });
  for (final status in [500]) {
    test('#69 HTTP $status and ambiguous post-body disconnect are not replayed',
        () async {
      for (final dropAfterPost in [false, true]) {
        final f = TlsFixture(
            dropBeforeTls: 0, status: status, dropAfterPost: dropAfterPost);
        await f.start();
        final previous = HttpOverrides.current;
        HttpOverrides.global = FixtureTrust(true);
        try {
          await expectLater(
              NaiApi().generate('public-fixture-token', f.settings(),
                  GenerateParams(), GenerateExtras()),
              throwsA(anything));
          expect(f.connections, 1);
          expect(f.posts, 1);
        } finally {
          HttpOverrides.global = previous;
          await f.close();
        }
      }
    });
  }
  test(
      '#69 cancellation during preflight backoff never starts a second connection',
      () async {
    final f = TlsFixture(dropBeforeTls: 99);
    await f.start();
    final previous = HttpOverrides.current;
    HttpOverrides.global = FixtureTrust(true);
    try {
      final scope = GenerationScope(), api = NaiApi();
      final pending = scope.run(() => api.generate('public-fixture-token',
          f.settings(), GenerateParams(), GenerateExtras()));
      final failed = expectLater(pending, throwsA(anything));
      while (f.connections == 0) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
      scope.cancel();
      await failed;
      expect(f.connections, 1);
      expect(f.posts, 0);
    } finally {
      HttpOverrides.global = previous;
      await f.close();
    }
  });
  test('#69 bounded preflight attempts never submit HTTP', () async {
    final f = TlsFixture(dropBeforeTls: 99);
    await f.start();
    final previous = HttpOverrides.current;
    HttpOverrides.global = FixtureTrust(true);
    try {
      await expectLater(
          NaiApi().generate('public-fixture-token', f.settings(),
              GenerateParams(), GenerateExtras()),
          throwsA(anything));
      expect(f.connections, 3);
      expect(f.posts, 0);
    } finally {
      HttpOverrides.global = previous;
      await f.close();
    }
  });
  test('#69 cold PAC resolver completes for actual image URL before submission',
      () async {
    final f = TlsFixture(dropBeforeTls: 0);
    await f.start();
    final previous = HttpOverrides.current;
    HttpOverrides.global = FixtureTrust(true);
    final gate = Completer<String>();
    final urls = <String>[];
    const channel = MethodChannel('langbai.novelai/network');
    // Use the channel name actually declared by the production proxy resolver.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      urls.add(call.arguments.toString());
      return gate.future;
    });
    try {
      final settings = f.settings()..proxyMode = 'auto';
      final pending = NaiApi().generate(
          'public-fixture-token', settings, GenerateParams(), GenerateExtras());
      for (var i = 0; urls.isEmpty && i < 100; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
      expect(urls, ['https://127.0.0.1:${f.proxy.port}/ai/generate-image']);
      expect(f.connections, 0);
      expect(f.posts, 0);
      gate.complete(
          ''); // Native DIRECT result, deliberately no automatic proxy.
      await pending;
      expect(f.posts, 1);
    } finally {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
      HttpOverrides.global = previous;
      await f.close();
    }
  });
}
