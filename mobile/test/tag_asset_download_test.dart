import 'dart:io';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:novelai_mobile/tags/multilingual_tag_packs.dart';
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
      return http.Response('data', 206, headers: {'content-range': 'bytes 4-7/8'});
    });
    final reply = await openTagAsset(client, source, size: 8, offset: 4);
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
    await expectLater(openTagAsset(client, source, size: 8), throwsFormatException);
    expect(urls.last.path, '/repos/example/repo/releases/assets/533720512');
    expect(urls.length, 2);
  });
  test('invalid range falls back without losing the dictionary prefix', () async {
    final dir = await Directory.systemTemp.createTemp('pack-resume-');
    addTearDown(() => dir.delete(recursive: true));
    final archive = File('${dir.path}/saved.part');
    await archive.writeAsString('ab');
    final starts = <String?>[];
    final client = MockClient((request) async {
      starts.add(request.headers['range']);
      final range = starts.length==1 ? 'bytes 0-1/4' : 'bytes 2-3/4';
      return http.Response('cd',206,headers:{'content-range':range});
    });
    final digest = sha256.convert(utf8.encode('abcd')).toString();
    await MultilingualTagPacks.resumeTagPack(client,'stamp','tag_catalog.db',archive,4,digest);
    expect(starts,['bytes=2-','bytes=2-']);
    await MultilingualTagPacks.resumeTagPack(client,'stamp','tag_catalog.db',archive,4,digest);
    expect(await archive.readAsString(),'abcd');
    expect(starts.length,2);
  });
}
