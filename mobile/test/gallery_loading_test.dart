import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/online_gallery_service.dart';

void main() {
  MockClient client(Future<http.Response> Function(http.Request) codex) {
    return MockClient((request) async {
      final name = request.url.path.split('/').last;
      final Object data;
      switch (name) {
        case 'data-source.json':
          data = {'baseUrl': 'https://assets.quicktagcloud.com/data', 'pointer': 'current.json'};
        case 'current.json':
          data = {'release': 'r-test', 'manifest': 'releases/r-test/manifest.json'};
        case 'manifest.json':
          data = {'files': {}};
        case 'codexes.json':
          data = List.generate(10, (i) => {'id': 'fixture_$i', 'title': 'Fixture $i', 'type': 'artist', 'entryCount': 1});
        case 'media.json':
          data = {'baseUrl': 'https://assets.quicktagcloud.com'};
        default: return codex(request);
      }
      return http.Response(jsonEncode(data), 200);
    });
  }
  test('an unavailable large collection uses one total timeout, not two 3-minute waits', () async {
    var reads = 0;
    final service = OnlineGalleryService(
      requestTimeout: const Duration(milliseconds: 25),
      client: client((_) { reads++; return Completer<http.Response>().future; }),
    );
    await expectLater(service.search(source: OnlineGallerySource.quicktag, collectionId: 'fixture_0'), throwsA(isA<TimeoutException>()));
    expect(reads, 1);
  });
  test('global search returns explicit incomplete collections instead of waiting for all stalled books', () async {
    var reads = 0;
    final service = OnlineGalleryService(
      requestTimeout: const Duration(milliseconds: 500),
      globalSearchTimeout: const Duration(milliseconds: 25),
      client: client((_) { reads++; return Completer<http.Response>().future; }),
    );
    final page = await service.search(source: OnlineGallerySource.quicktag, query: 'sample', searchAll: true);
    expect(page.items, isEmpty);
    expect(page.navigation!['failedCollections'], hasLength(10));
    expect(reads, 3);
  });
  test('an individual request timeout does not exhaust the shared search budget', () async {
    var reads = 0;
    final service = OnlineGalleryService(
      requestTimeout: const Duration(milliseconds: 100),
      globalSearchTimeout: const Duration(seconds: 2),
      client: client((_) async {
        reads++;
        throw TimeoutException('Individual fixture request timed out');
      }),
    );
    final page = await service.search(source: OnlineGallerySource.quicktag, query: 'sample', searchAll: true);
    expect(page.items, isEmpty);
    expect(page.navigation!['failedCollections'], hasLength(10));
    expect(reads, 10);
  });
  test('normal lists use previews and remain independent of counts and image reads', () async {
    final urls = <Uri>[];
    final service = OnlineGalleryService(client: MockClient((request) async {
      urls.add(request.url);
      return http.Response(jsonEncode([{'id': 42, 'preview_file_url': 'https://cdn.example/preview.jpg', 'file_url': 'https://cdn.example/original.png'}]), 200);
    }));
    final page = await service.search(source: OnlineGallerySource.safebooru);
    expect(page.items.single.cover.previewUrl, 'https://cdn.example/preview.jpg');
    expect(page.items.single.cover.downloadUrl, 'https://cdn.example/original.png');
    expect(urls.single.path, '/posts.json');
  });
}
