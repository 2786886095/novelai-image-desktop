import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  test('parse and compare versions', () {
    expect(parseLatestYmlVersion('version: "v2.3.0"'), '2.3.0');
    expect(parseLatestYmlVersion('path: file'), isNull);
    expect(compareVersions('2.10.0', '2.9.0'), 1);
  });
  test('migrates saved Gitee setting', () {
    expect(
        AppSettings.fromJson({'updateSource': 'gitee'}).updateSource, 'github');
  });
  for (final source in ['github', 'gitee']) {
    test('only GitHub for $source', () async {
      final hosts = <String>[];
      final result = await checkAppUpdateWithClient(MockClient((r) async {
        hosts.add(r.url.host);
        return http.Response('version: 99.0.0', 200);
      }), preferredSource: source, isAndroid: false);
      expect(result.hasUpdate, isTrue);
      expect(hosts, ['github.com']);
    });
  }
  test('Android obtains APK from GitHub assets', () async {
    final hosts = <String>[];
    final result = await checkAppUpdateWithClient(MockClient((r) async {
      hosts.add(r.url.host);
      return r.url.host == 'github.com'
          ? http.Response('version: 99.0.0', 200)
          : http.Response(
              jsonEncode({
                'tag_name': 'v99.0.0',
                'assets': [
                  {
                    'name': 'app-release.apk',
                    'browser_download_url':
                        'https://github.com/example/app-release.apk'
                  }
                ]
              }),
              200);
    }), isAndroid: true, preferredSource: 'gitee');
    expect(result.releaseUrl, 'https://github.com/example/app-release.apk');
    expect(hosts, ['github.com', 'api.github.com']);
  });
  test('manifest failure retries GitHub API only', () async {
    final hosts = <String>[];
    final result = await checkAppUpdateWithClient(MockClient((r) async {
      hosts.add(r.url.host);
      return r.url.host == 'github.com'
          ? http.Response('blocked', 403)
          : http.Response('{"tag_name":"v99.0.0"}', 200);
    }), isAndroid: false);
    expect(result.hasUpdate, isTrue);
    expect(hosts, ['github.com', 'api.github.com']);
  });
  test('failure remains visible and does not use removed mirrors', () async {
    final hosts = <String>[];
    final result = await checkAppUpdateWithClient(MockClient((r) async {
      hosts.add(r.url.host);
      return http.Response('blocked', 403);
    }), isAndroid: false);
    expect(result.error, 'network');
    expect(hosts, ['github.com', 'api.github.com']);
  });
  test('missing Android APK is an error', () async {
    final result = await checkAppUpdateWithClient(
        MockClient((r) async => r.url.host == 'github.com'
            ? http.Response('version: 99.0.0', 200)
            : http.Response('{"tag_name":"v99.0.0","assets":[]}', 200)),
        isAndroid: true);
    expect(result.error, 'network');
  });
}
