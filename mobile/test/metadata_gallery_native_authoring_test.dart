// Host authoring only; no native receipts, HTTP fakes or TLS bypass.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/images/metadata_recovery.dart';
import 'package:novelai_mobile/services/gallery_download.dart';
import '../integration_test/native_gallery_tls_fixture.dart';
import '../integration_test/native_metadata_fixture_data.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('embedded 42 original hashes and actual offline Reader match manifests',
      () async {
    final reader = MetadataRecoveryReader(
        fetchAsset: (_) async => throw StateError('Offline fetched assets'));
    expect(nativeMetadataFixtures.length, 42);
    for (final f in nativeMetadataFixtures) {
      final bytes = base64Decode(f['base64'] as String);
      expect(sha256.convert(bytes).toString(), f['sha256']);
      final report =
          await reader.read(bytes, mode: MetadataRecoveryMode.offline);
      final actual = {
        ...report.imported.compatibleValuesByKey,
        'characters': report.characterCaptions.length
      };
      final expected = Map<String, dynamic>.from(f['expected'] as Map);
      for (final e in expected.entries) {
        expect(actual[e.key], e.value, reason: '${f['name']} ${e.key}');
      }
      if (expected.isEmpty) {
        expect(report.imported.isEmpty, isTrue);
        expect(report.characterCaptions, isEmpty);
      }
    }
    await reader.cancel();
  });
  test(
      'real TLS batch cancel retains durable first file without saving held successor',
      () async {
    final previous = HttpOverrides.current;
    HttpOverrides.global = null;
    final image = im.encodePng(im.Image(width: 64, height: 64));
    final tls = await NativeGalleryTlsFixture.open(image);
    final root = await Directory.systemTemp.createTemp('gallery-owned-cancel-');
    final client = tls.client(), cancel = GalleryDownloadCancellation();
    try {
      final pending = downloadGalleryBatch<int>(
          images: [1, 2],
          id: (i) => '$i',
          cancellation: cancel,
          fetch: (i) => fetchGalleryImage(
              client, 'https://danbooru.donmai.us/images/$i.png', {},
              cancellation: cancel),
          save: (i, _, bytes, ext) async {
            final file = await File('${root.path}/$i.$ext').writeAsBytes(bytes);
            tls.imageMode = 'hold';
            return file;
          });
      await tls.heldArrived.future.timeout(const Duration(seconds: 10));
      cancel.cancel();
      final result = await pending.timeout(const Duration(seconds: 5));
      expect(tls.held, isNotNull);
      expect(result.cancelled, isTrue);
      expect(result.savedFiles.length, 1);
      expect(result.failures, isEmpty);
      expect(await result.savedFiles.single.readAsBytes(), image);
      expect(root.listSync().length, 1);
      await tls.releaseHeld();
      expect(root.listSync().length, 1);
      expect(tls.errors, isEmpty);
    } finally {
      client.close();
      await tls.close();
      await root.delete(recursive: true);
      HttpOverrides.global = previous;
    }
  });
  test('cancel during started durable save retains it and starts no next fetch',
      () async {
    final root =
        await Directory.systemTemp.createTemp('gallery-durable-cancel-');
    final cancel = GalleryDownloadCancellation(),
        entered = Completer<void>(),
        release = Completer<void>();
    var fetches = 0;
    try {
      final pending = downloadGalleryBatch<int>(
          images: [1, 2],
          id: (i) => '$i',
          cancellation: cancel,
          fetch: (_) async {
            fetches++;
            return (
              bytes: im.encodePng(im.Image(width: 1, height: 1)),
              extension: 'png'
            );
          },
          save: (i, _, bytes, ext) async {
            entered.complete();
            await release.future;
            return File('${root.path}/$i.$ext').writeAsBytes(bytes);
          });
      await entered.future;
      cancel.cancel();
      release.complete();
      final result = await pending;
      expect(result.savedFiles.length, 1);
      expect(result.cancelled, isTrue);
      expect(fetches, 1);
      expect(result.failures, isEmpty);
    } finally {
      await root.delete(recursive: true);
    }
  });
}
