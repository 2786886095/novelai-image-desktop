// Common API regression harness also runs against the pristine parent.
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/update_service.dart';

Map<String, dynamic> release() => {
      'tag_name': 'v99.0.0',
      'html_url':
          'https://github.com/2786886095/novelai-image-desktop/releases/latest',
      'assets': [
        {
          'name': 'app-release.apk',
          'browser_download_url':
              'https://github.com/2786886095/novelai-image-desktop/releases/download/v99.0.0/app-release.apk',
          'digest': 'sha256:${'b' * 64}',
          'size': 123
        },
        {
          'name': 'novelai-mobile-unsigned.ipa',
          'browser_download_url':
              'https://github.com/2786886095/novelai-image-desktop/releases/download/v99.0.0/novelai-mobile-unsigned.ipa',
          'digest': 'sha256:${'a' * 64}',
          'size': 456
        },
      ]
    };
void main() {
  test(
      'non-Android HTML release never carries APK integrity as its own artifact',
      () async {
    final client = MockClient((r) async => r.url.host == 'github.com'
        ? http.Response('blocked', 403)
        : http.Response(jsonEncode(release()), 200));
    try {
      final info = await checkAppUpdateWithClient(client, isAndroid: false);
      // ignore: avoid_print
      print(
          'UPDATE_HTML_BOUNDARY apkSha256=${info.apkSha256} apkSize=${info.apkSize} url=${info.releaseUrl}');
      expect(info.hasUpdate, isTrue);
      expect(info.apkSha256, isNull);
      expect(info.apkSize, isNull);
    } finally {
      client.close();
    }
  });
  test('explicit iOS discovery binds its own exact IPA, not APK or HTML bytes',
      () async {
    final calls = <String>[];
    final client = MockClient((r) async {
      calls.add(r.url.host);
      return r.url.host == 'github.com'
          ? http.Response('version: 99.0.0', 200)
          : http.Response(jsonEncode(release()), 200);
    });
    try {
      final dynamic info = await Function.apply(checkAppUpdateWithClient,
          [client], {#isAndroid: false, #isIOS: true});
      expect(info.hasUpdate, isTrue);
      expect(info.ipaUrl,
          (release()['assets'] as List)[1]['browser_download_url']);
      expect(info.ipaSha256, 'a' * 64);
      expect(info.ipaSize, 456);
      expect(info.apkSha256, isNull);
      expect(calls, ['github.com', 'api.github.com']);
      // ignore: avoid_print
      print(
          'UPDATE_IOS_BOUNDARY ownIpaSha256=${info.ipaSha256} ownIpaSize=${info.ipaSize} apkMetadataAbsent=true');
    } finally {
      client.close();
    }
  });
}
