import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const ch = MethodChannel('langbai.novelai/network');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late HttpServer server;
  late List<String> paths, routes;
  late Future<void> Function(HttpRequest) serve;
  late HttpOverrides? old;
  setUp(() async {
    old = HttpOverrides.current;
    HttpOverrides.global = null;
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    paths = [];
    routes = [];
    serve = (r) async {
      expect(r.headers.value('authorization'), 'Bearer fixture');
      r.response.headers.contentType = ContentType.json;
      if (r.method == 'POST') {
        final body = jsonDecode(await utf8.decoder.bind(r).join());
        expect(body['model'], 'fixture-model');
        r.response.write(jsonEncode({
          'choices': [
            {
              'message': {'content': 'fixture success'},
              'finish_reason': 'stop'
            }
          ]
        }));
      } else {
        r.response.write(jsonEncode({
          'data': [
            {'id': 'fixture-model'}
          ]
        }));
      }
    };
    server.listen((r) async {
      paths.add('${r.method} ${r.uri}');
      try {
        await serve(r);
      } finally {
        await r.response.close();
      }
    });
    messenger.setMockMethodCallHandler(ch, (call) async {
      routes.add(call.arguments as String);
      return 'http://127.0.0.1:${server.port}';
    });
    setResolvedSystemProxyForTesting('http://127.0.0.1:1');
  });
  tearDown(() async {
    await server.close(force: true);
    setResolvedSystemProxyForTesting('');
    messenger.setMockMethodCallHandler(ch, null);
    HttpOverrides.global = old;
  });
  test(
      'per-target system route for discovery and chat, including full endpoint input',
      () async {
    final api = NaiApi(), s = AppSettings();
    const base =
        'http://deepseek-route.invalid/tenant/v1/chat/completions?version=1';
    expect(await api.listModels(s, base, 'fixture'), ['fixture-model']);
    final chat = await api.runTextAi(
        settings: s,
        apiKey: 'fixture',
        apiUrl: base,
        model: 'fixture-model',
        system: 'fixture',
        user: 'fixture');
    expect(chat.ok, isTrue, reason: chat.message);
    expect(routes,
        ['http://deepseek-route.invalid/tenant/v1/models?version=1', base]);
    expect(paths, ['GET ${routes.first}', 'POST $base']);
  });
  test(
      'direct AI bypasses proxy lookup; mixed listings preserve valid ids including UTF-8',
      () async {
    serve = (r) async {
      r.response.headers.set('content-type', 'application/json');
      r.response.add(utf8.encode(jsonEncode({
        'data': [
          null,
          3,
          {},
          '',
          '  z  ',
          {'id': '标签'},
          {'id': 'z'}
        ]
      })));
    };
    final url = 'http://127.0.0.1:${server.port}/v1/models/';
    expect(
        await NaiApi()
            .listModels(AppSettings(proxyForAi: false), url, 'fixture'),
        ['z', '标签']);
    expect(routes, isEmpty);
    expect(paths, ['GET /v1/models']);
  });
  test('a valid empty list is distinct from an unsupported response', () async {
    var body = '{"data":[]}';
    serve = (r) async {
      r.response.write(body);
    };
    final url = 'http://127.0.0.1:${server.port}';
    final s = AppSettings(proxyMode: 'direct'), api = NaiApi();
    expect(await api.listModels(s, url, 'fixture'), isEmpty);
    for (final bad in [
      '{"message":"not a model list"}',
      '{"data":[{},null]}',
      '<html>sign in</html>'
    ]) {
      body = bad;
      await expectLater(
          api.listModels(s, url, 'fixture'), throwsA(isA<FormatException>()));
    }
  });
  test('explicit AI HTTP proxy is retained and does not consult PAC', () async {
    final api = NaiApi();
    final s = AppSettings(
        proxyMode: 'http', proxyUrl: 'http://127.0.0.1:${server.port}');
    expect(await api.listModels(s, 'http://deepseek-route.invalid/', 'fixture'),
        ['fixture-model']);
    expect(routes, isEmpty);
    expect(paths, ['GET http://deepseek-route.invalid/models']);
  });
  test(
      'slow system route uses the same 20-second budget and never submits a late GET',
      () async {
    final resolver = Completer<String>();
    messenger.setMockMethodCallHandler(ch, (call) => resolver.future);
    final elapsed = Stopwatch()..start();
    await expectLater(
        NaiApi().listModels(
            AppSettings(), 'http://deepseek-route.invalid', 'fixture'),
        throwsA(isA<TimeoutException>()));
    expect(elapsed.elapsedMilliseconds, inInclusiveRange(19500, 25000));
    resolver.complete('http://127.0.0.1:${server.port}');
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(paths, isEmpty);
  });
}
