import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/aitag_service.dart';
import 'package:novelai_mobile/services/gallery_download.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final webp =
      File('../shared/image-input-fixtures/lossless.webp').readAsBytesSync();
  late Directory root;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('gallery-download-test-');
  });
  tearDown(() async {
    await root.delete(recursive: true);
  });
  test('AITag download uses WebP bytes, not NAI category, for filename format',
      () async {
    final client = MockClient((request) async {
      expect(request.headers['Referer'], 'https://aitag.win/');
      expect(request.url.path, '/NAI/123/sample.webp');
      return http.Response.bytes(webp, 200,
          headers: {'content-type': 'image/webp'});
    });
    final service = AitagService(client: client);
    final image = AitagImage.fromJson({
      'id': 1,
      'author_id': 123,
      'image_type': 'NAI',
      'file_name': 'sample'
    });
    final downloaded = await service.downloadImage(image);
    expect(downloaded.extension, 'webp');
    expect(downloaded.bytes, webp);
    service.close();
  });
  test(
      'HTML and empty HTTP 200 bodies are rejected, binary image streams accepted',
      () async {
    for (final bytes in [
      Uint8List(0),
      Uint8List.fromList('<html>blocked</html>'.codeUnits)
    ]) {
      final client = MockClient((_) async => http.Response.bytes(bytes, 200));
      await expectLater(fetchGalleryImage(client, 'https://cdn.example/a', {}),
          throwsA(isA<FormatException>()));
      client.close();
    }
    expect(validateGalleryImage(webp, 'application/octet-stream'), 'webp');
  });
  test('partial series continues and preserves saved files and failure counts',
      () async {
    final client = MockClient((request) async => request.url.path == '/bad'
        ? http.Response('not found', 404)
        : http.Response.bytes(webp, 200));
    final result = await downloadGalleryBatch<String>(
        images: ['good', 'bad', 'last'],
        id: (s) => s,
        fetch: (s) => fetchGalleryImage(client, 'https://cdn.example/$s', {}),
        save: (s, i, bytes, extension) =>
            File('${root.path}/$s.$extension').writeAsBytes(bytes));
    expect(result.savedFiles.length, 2);
    expect(result.failures, [(id: 'bad', reason: 'HTTP_404')]);
    expect(await result.savedFiles.last.readAsBytes(), webp);
    client.close();
  });
  test('file-write failure is visible without cancelling the remaining series',
      () async {
    final result = await downloadGalleryBatch<int>(
        images: [0, 1],
        id: (i) => '$i',
        fetch: (_) async => (bytes: webp, extension: 'webp'),
        save: (i, _, bytes, ext) async {
          if (i == 0) throw const FileSystemException('denied');
          return File('${root.path}/$i.$ext').writeAsBytes(bytes);
        });
    expect(result.savedFiles.length, 1);
    expect(result.failures.single.reason, 'FILE_WRITE_FAILED');
  });
  test('replaces an invalid old cached response', () async {
    const channel = MethodChannel('plugins.flutter.io/path_provider');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async => root.path);
    addTearDown(() => TestDefaultBinaryMessengerBinding
        .instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null));
    var calls = 0;
    final client = MockClient((_) async {
      calls++;
      return http.Response.bytes(webp, 200);
    });
    final file =
        await AitagImageCache.get('https://cdn.example/cache.webp', client);
    await file.writeAsString('<html>blocked</html>');
    await AitagImageCache.get('https://cdn.example/cache.webp', client);
    expect(calls, 2);
    expect(await file.readAsBytes(), webp);
    client.close();
  });
}
