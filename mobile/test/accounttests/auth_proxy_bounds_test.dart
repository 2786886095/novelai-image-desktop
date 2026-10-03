import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_official_auth.dart';
import 'package:novelai_mobile/services/novelai_bounded_http.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'accounts_test.dart' show memoryVault;

// Exercise the real default proxy factory and IOClient. Stop at the native
// socket boundary, before any credentials or network traffic can leave tests.
class NativeCapture extends Fake implements HttpClient {
  String Function(Uri)? proxy;
  final opened = <Uri>[];
  final routes = <String>[];
  bool closed = false;
  @override
  set idleTimeout(Duration value) {}
  @override
  set findProxy(String Function(Uri)? value) {
    proxy = value;
  }

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async {
    opened.add(url);
    routes.add(proxy?.call(url) ?? 'DIRECT');
    throw const SocketException('Synthetic stop before opening a socket');
  }

  @override
  void close({bool force = false}) {
    closed = true;
  }
}

class StreamClient extends http.BaseClient {
  final Future<http.StreamedResponse> Function(http.BaseRequest) respond;
  bool closed = false;
  int sends = 0;
  StreamClient(this.respond);
  @override
  Future<http.StreamedResponse> send(http.BaseRequest r) {
    sends++;
    return respond(r);
  }

  @override
  void close() {
    closed = true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('langbai.novelai/network');
  final binding =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() => binding.setMockMethodCallHandler(channel, null));

  test('default login uses latest configured nai proxy, never a relay endpoint',
      () async {
    var settings = AppSettings()..proxyMode = 'direct';
    final auth = NovelAiOfficialAuth(settingsProvider: () => settings);
    final native = NativeCapture();
    // Changed after auth construction, read at actual connection time.
    await HttpOverrides.runZoned(() async {
      final pending = auth.login('fixture@example.invalid', 'fixture-password');
      settings = AppSettings()
        ..proxyMode = 'http'
        ..proxyForNai = true
        ..proxyUrl = 'http://127.0.0.1:4567'
        ..apiBaseUrl = 'https://relay.example'
        ..imageBaseUrl = 'https://relay.example';
      await expectLater(pending, throwsStateError);
    }, createHttpClient: (_) => native);
    expect(native.opened.single, NovelAiOfficialAuth.loginUri);
    expect(native.routes.single, 'PROXY 127.0.0.1:4567');
    expect(native.closed, true);
  });
  test('auto proxy resolves fixed official URL; proxyForNai off means direct',
      () async {
    final queries = <Object?>[];
    binding.setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'resolveProxy');
      queries.add(call.arguments);
      return 'http://127.0.0.1:5678';
    });
    for (final enabled in [true, false]) {
      final native = NativeCapture();
      final auth = NovelAiOfficialAuth(
          settingsProvider: () => AppSettings()
            ..proxyMode = 'auto'
            ..proxyForNai = enabled);
      await HttpOverrides.runZoned(() async {
        await expectLater(
            auth.login('fixture@example.invalid', 'fixture-password'),
            throwsStateError);
      }, createHttpClient: (_) => native);
      expect(native.routes.single, enabled ? 'PROXY 127.0.0.1:5678' : 'DIRECT');
      expect(native.opened.single.host, 'image.novelai.net');
    }
    expect(queries, ['https://image.novelai.net/user/login']);
  });
  test('read-only account refresh already follows the real nai proxy factory',
      () async {
    final vault = await memoryVault(legacy: 'synthetic-token');
    final native = NativeCapture();
    final api = NovelAiAccountApi(vault);
    final settings = AppSettings()
      ..proxyMode = 'http'
      ..proxyForNai = true
      ..proxyUrl = 'http://127.0.0.1:6789';
    await HttpOverrides.runZoned(() async {
      final account = await api.fetchAccount('synthetic-token', settings);
      expect(
          account.stale, true); // Synthetic network failure, not zero balance.
    }, createHttpClient: (_) => native);
    expect(
        native.opened.single.toString(), 'https://image.novelai.net/user/data');
    expect(native.routes.single, 'PROXY 127.0.0.1:6789');
    expect(native.closed, true);
    expect(vault.locked, false);
  });
  test('async client-open deadline closes late client and never submits',
      () async {
    final gate = Completer<http.Client>();
    final lateClient = StreamClient(
        (_) async => http.StreamedResponse(const Stream.empty(), 200));
    final request = http.Request('POST', NovelAiOfficialAuth.loginUri);
    await expectLater(
        novelAiBoundedRequest(
            openClient: () => gate.future,
            request: request,
            timeout: const Duration(milliseconds: 30)),
        throwsA(isA<TimeoutException>()));
    gate.complete(lateClient);
    await Future<void>.delayed(Duration.zero);
    expect(lateClient.closed, true);
    expect(lateClient.sends, 0);
  });
  test(
      'login async factory is bounded and late completion cannot send credentials',
      () async {
    final gate = Completer<http.Client>(), entered = Completer<void>();
    final client = StreamClient(
        (_) async => http.StreamedResponse(const Stream.empty(), 200));
    final auth = NovelAiOfficialAuth(
        timeout: const Duration(milliseconds: 800),
        clientFactory: () {
          entered.complete();
          return gate.future;
        });
    final result = auth.login('fixture@example.invalid', 'fixture-password');
    final assertion = expectLater(result, throwsStateError);
    await entered.future;
    await assertion;
    gate.complete(client);
    await Future<void>.delayed(Duration.zero);
    expect(client.sends, 0);
    expect(client.closed, true);
  });
  test(
      'headers stall and body stall both time out and close once without retries',
      () async {
    final headers = Completer<http.StreamedResponse>();
    final first = StreamClient((_) => headers.future);
    await expectLater(
        novelAiBoundedRequest(
            openClient: () => first,
            request: http.Request('POST', NovelAiOfficialAuth.loginUri),
            timeout: const Duration(milliseconds: 30)),
        throwsA(isA<TimeoutException>()));
    expect(first.closed, true);
    expect(first.sends, 1);
    var lateCancelled = false;
    final lateBody = StreamController<List<int>>(onCancel: () {
      lateCancelled = true;
    });
    headers.complete(http.StreamedResponse(lateBody.stream, 200));
    await Future<void>.delayed(Duration.zero);
    expect(lateCancelled, true);
    await lateBody.close();
    var bodyCancelled = false;
    final body = StreamController<List<int>>(onCancel: () {
      bodyCancelled = true;
    });
    final second =
        StreamClient((_) async => http.StreamedResponse(body.stream, 200));
    await expectLater(
        novelAiBoundedRequest(
            openClient: () => second,
            request: http.Request('POST', NovelAiOfficialAuth.loginUri),
            timeout: const Duration(milliseconds: 30)),
        throwsA(isA<TimeoutException>()));
    expect(bodyCancelled, true);
    expect(second.closed, true);
    expect(second.sends, 1);
    await body.close();
  });
  for (final lengthHeader in [true, false]) {
    test(
        'response limit enforced for ${lengthHeader ? 'declared length' : 'chunked bytes'}',
        () async {
      var cancelled = false;
      final stream = StreamController<List<int>>(onCancel: () {
        cancelled = true;
      });
      final client = StreamClient((_) async => http.StreamedResponse(
          stream.stream, 200,
          contentLength: lengthHeader ? 100 : null));
      final pending = novelAiBoundedRequest(
          openClient: () => client,
          request: http.Request('POST', NovelAiOfficialAuth.loginUri),
          maxResponseBytes: 10);
      final assertion = expectLater(pending, throwsStateError);
      if (!lengthHeader) {
        stream.add(List.filled(6, 65));
        stream.add(List.filled(5, 65));
      }
      await assertion;
      expect(cancelled, true);
      expect(client.closed, true);
      expect(client.sends, 1);
      await stream.close();
    });
  }
  test(
      'valid bounded response exactly at byte cap keeps injected sync clients working',
      () async {
    final response = await novelAiBoundedRequest(
        openClient: () => MockClient((r) async {
              expect(r.followRedirects, false);
              expect(r.maxRedirects, 0);
              return http.Response('1234567890', 200);
            }),
        request: http.Request('POST', NovelAiOfficialAuth.loginUri),
        maxResponseBytes: 10);
    expect(response.body, '1234567890');
  });
  test(
      'oversize token, malformed JSON, control characters and challenges never become credentials',
      () async {
    final bodies = [
      jsonEncode(
          {'accessToken': 't' * (NovelAiOfficialAuth.maxTokenBytes + 1)}),
      jsonEncode({'accessToken': 'token\r\ninjected'}),
      '{broken',
      jsonEncode({
        'accessToken': 'partial-token',
        'challenge': {'type': 'otp'}
      }),
      jsonEncode({'accessToken': 'partial-token', 'mfaRequired': true}),
      jsonEncode({'accessToken': 'partial-token', 'otp': 'secret-otp'}),
      jsonEncode({
        'accessToken': 'partial-token',
        'extra': 'x' * NovelAiOfficialAuth.maxResponseBytes
      }),
    ];
    for (final body in bodies) {
      var calls = 0;
      final auth = NovelAiOfficialAuth(
          clientFactory: () => MockClient((_) async {
                calls++;
                return http.Response(body, 200);
              }));
      await expectLater(
          auth.login('fixture@example.invalid', 'fixture-password'),
          throwsA(isA<StateError>().having((e) => e.toString(),
              'no secret echo', isNot(contains('partial-token')))));
      expect(calls, 1);
    }
  });
  test('native proxy resolution timeout does not leak a late client or send',
      () async {
    final proxy = Completer<String?>(), started = Completer<void>();
    binding.setMockMethodCallHandler(channel, (_) {
      started.complete();
      return proxy.future;
    });
    final native = NativeCapture();
    await HttpOverrides.runZoned(() async {
      final auth = NovelAiOfficialAuth(
          timeout: const Duration(milliseconds: 800),
          settingsProvider: () => AppSettings()
            ..proxyMode = 'auto'
            ..proxyForNai = true);
      final assertion = expectLater(
          auth.login('fixture@example.invalid', 'fixture-password'),
          throwsStateError);
      await started.future;
      await assertion;
      proxy.complete('http://127.0.0.1:7891');
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }, createHttpClient: (_) => native);
    expect(native.opened, isEmpty);
    expect(native.closed, true);
  });
}
