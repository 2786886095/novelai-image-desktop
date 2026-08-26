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

  test('uses GitHub as the default update source', () async {
    var requests = 0;
    final info = await checkAppUpdateWithClient(MockClient((request) async {
      requests++;
      expect(request.url.host, 'github.com');
      return http.Response('version: 99.0.0\npath: app.exe', 200);
    }));
    expect(info.hasUpdate, isTrue);
    expect(info.latestVersion, '99.0.0');
    expect(info.releaseUrl, contains('github.com'));
    expect(requests, 1);
  });

  test('uses Gitee first when selected', () async {
    final info = await checkAppUpdateWithClient(
      MockClient((request) async {
        expect(request.url.host, 'gitee.com');
        return http.Response(
          jsonEncode({
            'id': 99,
            'tag_name': 'v99.0.0',
            'assets': const [],
          }),
          200,
        );
      }),
      preferredSource: 'gitee',
    );
    expect(info.hasUpdate, isTrue);
    expect(info.releaseUrl, contains('gitee.com'));
  });

  test('Android verifies the GitHub APK asset before offering an update',
      () async {
    final calls = <Uri>[];
    final info = await checkAppUpdateWithClient(
      MockClient((request) async {
        calls.add(request.url);
        if (request.url.host == 'github.com') {
          return http.Response('version: 99.0.0\npath: app.exe', 200);
        }
        return http.Response(
          jsonEncode({
            'tag_name': 'v99.0.0',
            'html_url': 'https://github.com/example/release',
            'assets': [
              {
                'name': 'app-release.apk',
                'browser_download_url':
                    'https://github.com/example/app-release.apk',
              },
            ],
          }),
          200,
        );
      }),
      isAndroid: true,
    );
    expect(info.releaseUrl, 'https://github.com/example/app-release.apk');
    expect(calls.map((uri) => uri.host), ['github.com', 'api.github.com']);
  });

  test('Android falls back when the selected mirror has no APK asset',
      () async {
    final calls = <Uri>[];
    final info = await checkAppUpdateWithClient(
      MockClient((request) async {
        calls.add(request.url);
        if (request.url.host == 'gitee.com' &&
            request.url.path.endsWith('/releases/latest')) {
          return http.Response(
            jsonEncode({'id': 100, 'tag_name': 'v99.1.0', 'assets': const []}),
            200,
          );
        }
        if (request.url.host == 'gitee.com') {
          return http.Response('[]', 200);
        }
        if (request.url.host == 'github.com') {
          return http.Response('version: 99.1.0\npath: app.exe', 200);
        }
        return http.Response(
          jsonEncode({
            'tag_name': 'v99.1.0',
            'assets': [
              {
                'name': 'app-release.apk',
                'browser_download_url':
                    'https://github.com/example/app-release.apk',
              },
            ],
          }),
          200,
        );
      }),
      preferredSource: 'gitee',
      isAndroid: true,
    );
    expect(info.releaseUrl, contains('github.com'));
    expect(calls.map((uri) => uri.host), [
      'gitee.com',
      'gitee.com',
      'github.com',
      'api.github.com',
    ]);
  });

  test('falls back to Gitee when GitHub is unavailable', () async {
    final calls = <Uri>[];
    final info = await checkAppUpdateWithClient(MockClient((request) async {
      calls.add(request.url);
      if (request.url.host == 'github.com' ||
          request.url.host == 'api.github.com') {
        return http.Response('', 404);
      }
      return http.Response(
        jsonEncode({'id': 100, 'tag_name': 'v99.1.0', 'assets': const []}),
        200,
      );
    }));
    expect(info.hasUpdate, isTrue);
    expect(info.latestVersion, '99.1.0');
    expect(calls.map((uri) => uri.host),
        ['github.com', 'api.github.com', 'gitee.com']);
  });

  test('falls back to GitHub API when its manifest is unavailable', () async {
    final calls = <Uri>[];
    final info = await checkAppUpdateWithClient(MockClient((request) async {
      calls.add(request.url);
      if (request.url.host == 'github.com') {
        return http.Response('', 404);
      }
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
    expect(
      calls.map((uri) => uri.host),
      ['github.com', 'api.github.com'],
    );
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
