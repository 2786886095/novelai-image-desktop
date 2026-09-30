import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/agent/web_search.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _PendingClient extends http.BaseClient {
  final started = Completer<void>();
  final pending = Completer<http.StreamedResponse>();
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    started.complete();
    return pending.future;
  }
  @override
  void close() {
    if (!pending.isCompleted) pending.completeError(StateError('cancelled'));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const html = '''
<table>
<tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fguide%3Fa%3D1%26b%3D2&amp;rut=x" class='result-link'>Example <b>guide</b></a></td></tr>
<tr><td class='result-snippet'>A useful &amp; public snippet.</td></tr>
<tr><td><a href="https://second.example/page" class="result-link">Second</a></td></tr>
<tr><td class="result-snippet">Another result</td></tr>
</table>''';

  test('parses titles, canonical URLs and snippets with limit', () {
    final parsed = parseDuckDuckGoLite(html, limit: 1);
    expect(parsed, hasLength(1));
    expect(parsed.single['title'], 'Example guide');
    expect(parsed.single['url'], 'https://example.org/guide?a=1&b=2');
    expect(parsed.single['snippet'], 'A useful & public snippet.');
  });

  test('public lookup uses bounded GET and reports provenance', () async {
    late Uri requested;
    final service = AgentWebSearch(AppSettings(), clientFactory: (uri) async {
      requested = uri;
      return MockClient((request) async {
        expect(request.method, 'GET');
        return http.Response(html, 200);
      });
    });
    final result = await service.search('flutter dart', limit: 2);
    expect(requested.host, 'lite.duckduckgo.com');
    expect(requested.queryParameters['q'], 'flutter dart');
    expect(result['provider'], contains('DuckDuckGo Lite'));
    expect(result['sources'], hasLength(2));
    expect(DateTime.tryParse(result['fetchedAt'] as String)?.isUtc, true);
    expect(result['warning'], contains('untrusted'));
    for (final source in result['sources'] as List) {
      expect(source['fetchedAt'], result['fetchedAt']);
      expect(source['snippetWarning'], contains('untrusted'));
    }
  });

  test('rejects private, loopback and credential-bearing source links', () {
    const bad = [
      'http://127.0.0.1/admin',
      'http://10.2.3.4/',
      'http://172.20.1.2/',
      'http://192.168.1.2/',
      'http://169.254.1.1/',
      'http://100.64.1.1/',
      'http://[::1]/',
      'http://[fc00::1]/',
      'http://localhost/',
      'http://service.local/',
      'http://service.lan/',
      'http://0177.0.0.1/',
      'http://127.1/',
      'http://2130706433/',
      'http://0x7f.0.0.1/',
      'http://0008.8.8.8/',
      'http://198.18.0.1/',
      'http://224.0.0.1/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:198.18.0.1]/',
      'https://user:password@example.org/',
      'https://example.org/?api_key=secret',
      'https://example.org/?auth_token=secret',
      'https://example.org/#access_token=secret',
    ];
    final links = [
      ...bad,
      'https://example.org/public?topic=art',
    ].map((url) => '<a class="result-link" href="$url">result</a>'
        '<td class="result-snippet">snippet</td>').join();
    final results = parseDuckDuckGoLite(links, limit: 8,
        fetchedAt: '2026-10-01T00:00:00.000Z');
    expect(results, hasLength(1));
    expect(results.single['url'], 'https://example.org/public?topic=art');
    expect(results.single['fetchedAt'], '2026-10-01T00:00:00.000Z');
  });

  test('keeps canonical public IP and ordinary hexadecimal-looking domains', () {
    const urls = ['https://8.8.8.8/', 'https://fdroid.org/',
      'https://[2606:4700:4700::1111]/'];
    for (final url in urls) {
      final results = parseDuckDuckGoLite(
          '<a class="result-link" href="$url">public</a>');
      expect(results, hasLength(1), reason: url);
      expect(results.single['url'], url);
    }
  });

  test('CAPTCHA and overlong query fail explicitly', () async {
    final service = AgentWebSearch(AppSettings(), clientFactory: (_) async =>
        MockClient((_) async => http.Response('CAPTCHA required', 200)));
    await expectLater(service.search('x'), throwsStateError);
    await expectLater(service.search('x' * 801), throwsArgumentError);
  });

  test('empty public result is not misreported as a successful citation', () async {
    final service = AgentWebSearch(AppSettings(), clientFactory: (_) async =>
        MockClient((_) async => http.Response('<html>No results</html>', 200)));
    await expectLater(service.search('unknown'), throwsStateError);
  });

  test('cancel closes the in-flight search client', () async {
    final client = _PendingClient();
    final service = AgentWebSearch(AppSettings(),
        clientFactory: (_) async => client);
    final request = service.search('pending');
    await client.started.future;
    service.cancel();
    await expectLater(request, throwsStateError);
  });

  test('lookup reads the current AI proxy route, not a stale settings snapshot',
      () async {
    var settings = AppSettings(proxyMode: 'direct');
    final service = AgentWebSearch(settings, currentSettings: () => settings);
    settings = AppSettings(proxyMode: 'custom',
        proxyUrl: 'ftp://invalid.example', proxyForAi: true);
    await expectLater(service.search('proxy check'), throwsFormatException);
  });

  test('unsupported tool returns failure rather than fabricated success',
      () async {
    final app = AppState(storage: Storage());
    final executor = AgentToolExecutor(app: app, listMemories: () => [],
        upsertMemory: (_) async => {}, deleteMemory: (_) async => false);
    final result = await executor.execute('langbai_not_a_tool', {}, []);
    expect(result.ok, false);
    expect(result.output, contains('未知工具'));
    app.dispose();
  });
}
