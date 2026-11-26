import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/tag_asset_download.dart';

void main() {
  final source = Uri.parse(
      'https://github.com/example/repo/releases/download/tag/tag_catalog.db');
  test('CDN failure keeps the resume offset and the signed object path',
      () async {
    final urls = <Uri>[];
    final client = MockClient((request) async {
      urls.add(request.url);
      expect(request.headers['Range'], 'bytes=4-');
      if (urls.length == 1) {
        return http.Response('', 302, headers: {
          'location':
              'https://release-assets.githubusercontent.com/github-production-release-asset/test/data?sig=fixture'
        });
      }
      if (urls.length == 2) throw const SocketException('connection reset');
      return http.Response('data', 206);
    });
    final reply = await openTagAsset(client, source, offset: 4);
    expect(await reply.stream.bytesToString(), 'data');
    expect(urls.last.host, 'releaseassetproduction.blob.core.windows.net');
    expect(urls.last.query, 'sig=fixture');
  });
  test('API fallback is pinned and unexpected redirect hosts are rejected',
      () async {
    final urls = <Uri>[];
    final client = MockClient((request) async {
      urls.add(request.url);
      if (urls.length == 1) return http.Response('unavailable', 503);
      return http.Response('', 302,
          headers: {'location': 'https://example.invalid/file'});
    });
    await expectLater(openTagAsset(client, source), throwsFormatException);
    expect(urls.last.path, '/repos/example/repo/releases/assets/533720512');
    expect(urls.length, 2);
  });
}
