import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/update_service.dart';

void main() {
  test('parses updater manifest versions with or without v prefix', () {
    expect(parseLatestYmlVersion('version: 1.7.0\npath: app.exe'), '1.7.0');
    expect(parseLatestYmlVersion('version: "v2.0.1"'), '2.0.1');
    expect(parseLatestYmlVersion('path: app.exe'), isNull);
  });

  test('uses release manifest before GitHub API', () async {
    var requests = 0;
    final info = await checkAppUpdateWithClient(MockClient((request) async {
      requests++;
      expect(request.url.host, 'github.com');
      return http.Response('version: 99.0.0\npath: app.exe', 200);
    }));
    expect(info.hasUpdate, isTrue);
    expect(info.latestVersion, '99.0.0');
    expect(requests, 1);
  });

  test('falls back to GitHub API when manifest is unavailable', () async {
    final calls = <Uri>[];
    final info = await checkAppUpdateWithClient(MockClient((request) async {
      calls.add(request.url);
      if (request.url.host == 'github.com') return http.Response('', 404);
      return http.Response(
        jsonEncode({
          'tag_name': 'v99.1.0',
          'html_url': 'https://example.test/release',
        }),
        200,
      );
    }));
    expect(info.hasUpdate, isTrue);
    expect(info.latestVersion, '99.1.0');
    expect(info.releaseUrl, 'https://example.test/release');
    expect(calls.map((uri) => uri.host), ['github.com', 'api.github.com']);
  });

  test('returns a compact error instead of a raw socket exception', () async {
    final info = await checkAppUpdateWithClient(MockClient((request) async {
      throw http.ClientException('socket refused');
    }));
    expect(info.hasUpdate, isFalse);
    expect(info.error, 'network');
    expect(info.error, isNot(contains('socket')));
  });
}
