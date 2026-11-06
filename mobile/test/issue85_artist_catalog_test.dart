import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/artist_catalog_service.dart';

Uint8List packed(int total, {int base = 0}) {
  final names = List.generate(total, (i) => utf8.encode('artist_${base + i}'));
  final body = Uint8List(24 + 12 * total + names.fold<int>(0, (n, b) => n + b.length));
  body.setRange(0, 8, ascii.encode('LBART001'));
  final d = ByteData.sublistView(body);
  d.setUint32(8, total, Endian.little); d.setFloat64(12, 1788946177802, Endian.little);
  var offset = 0;
  for (var i = 0; i < total; i++) {
    d.setUint32(24 + i * 12, base + i + 1, Endian.little);
    d.setUint32(28 + i * 12, total - i, Endian.little);
    d.setUint32(32 + i * 12, offset, Endian.little);
    body.setRange(24 + 12 * total + offset, 24 + 12 * total + offset + names[i].length, names[i]);
    offset += names[i].length;
  }
  return Uint8List.fromList(gzip.encode([...body, ...sha256.convert(body).bytes]));
}
Map<String, Object> manifest(Uint8List b, int count) => {
  'format': 'LBART001', 'sha256': sha256.convert(b).toString(), 'byteLength': b.length,
  'uniqueArtistTags': count, 'savedAt': 1788946177802,
};

void main() {
  late Directory root; late Uint8List bundle;
  setUp(() async { root = await Directory.systemTemp.createTemp('langbai-issue85-'); bundle = packed(30); });
  tearDown(() async { await root.delete(recursive: true); });
  ArtistCatalogService service({http.Client Function(AppSettings)? client, Uint8List? asset}) {
    final bytes = asset ?? bundle;
    return ArtistCatalogService(directory: () async => root, bundledBytes: () async => bytes,
      bundledSha256: sha256.convert(bytes).toString(),
      clientFactory: client ?? (_) => throw StateError('Unexpected HTTP in offline operation'));
  }

  test('sampling is identical to desktop vectors, unique and reaches the tail', () {
    final vectors = jsonDecode(File('test/fixtures/issue85-desktop-sampling.json').readAsStringSync()) as List;
    for (final row in vectors) {
      expect(sampleArtistCatalogIndices(row['total'], row['count'], row['seed']), row['indices']);
    }
    final sample = sampleArtistCatalogIndices(738103, 20000, 42);
    expect(sample.toSet().length, 20000); expect(sample.any((i) => i > 700000), isTrue);
    expect(() => sampleArtistCatalogIndices(0, 1, 0), throwsFormatException);
    expect(() => sampleArtistCatalogIndices(10, 20001, 0), throwsFormatException);
  });
  test('popular and whole-random coexist; neither contacts HTTP', () async {
    final s = service();
    final popular = await s.select(count: 10), random = await s.select(count: 10, random: true, seed: 0);
    expect(popular.items.map((r) => r.id), orderedEquals(List.generate(10, (i) => i + 1)));
    expect(random.items.map((r) => r.id), isNot(orderedEquals(popular.items.map((r) => r.id))));
    expect(random.items.map((r) => r.id).toSet().length, 10);
    expect(random.catalog.total, 30); expect(random.catalog.downloaded, isFalse);
    expect((await s.select(count: 100)).items.length, 30);
  });
  test('real desktop snapshot and packaged asset have identical bytes and count', () async {
    final b = File('assets/artist-catalog/danbooru.bin.gz').readAsBytesSync();
    final original = File('../public/artist-catalog/danbooru.bin.gz').readAsBytesSync();
    expect(sha256.convert(b), sha256.convert(original));
    final meta = jsonDecode(File('../public/artist-catalog/manifest.json').readAsStringSync());
    expect(sha256.convert(b).toString(), meta['sha256']);
    final selected = await service(asset: b).select(count: 8000, random: true, seed: 246813579);
    expect(selected.catalog.total, meta['uniqueArtistTags']); expect(selected.items.length, 8000);
    expect(selected.items.map((x) => x.id).toSet().length, 8000);
  });
  test('explicit download uses two fixed GETs, checks hash, survives offline restart', () async {
    final fresh = packed(40, base: 100); final requests = <Uri>[];
    final s = service(client: (_) => MockClient((req) async {
      requests.add(req.url); expect(req.method, 'GET'); expect(req.followRedirects, isFalse);
      expect(req.headers.keys.any((k) => k.toLowerCase() == 'authorization'), isFalse);
      return req.url.path.endsWith('manifest.json') ? http.Response(jsonEncode(manifest(fresh, 40)), 200)
        : http.Response.bytes(fresh, 200);
    }));
    await s.select(count: 3); expect(requests, isEmpty);
    var progress = 0;
    final updated = await s.update(AppSettings(), progress: (n, total) { progress = n; expect(total, fresh.length); });
    expect(updated.total, 40); expect(progress, fresh.length);
    expect(requests.length, 2);
    expect(requests.every((u) => u.host == 'raw.githubusercontent.com' && u.path.startsWith('/2786886095/novelai-image-desktop/main/public/artist-catalog/')), isTrue);
    final restarted = await service().select(count: 6);
    expect(restarted.catalog.downloaded, isTrue); expect(restarted.items.first.id, 101);
    expect(requests.length, 2); expect(root.listSync().where((f) => f.path.endsWith('.pending')), isEmpty);
  });
  for (final failure in ['403', 'redirect', 'badHash', 'truncated', 'badCount', 'hugeManifest', 'invalidGzip', 'badHeader']) {
    test('$failure leaves the previous downloaded mirror intact', () async {
      final old = packed(30, base: 200), fresh = packed(40, base: 100);
      final current = File('${root.path}/current.bin.gz'); await current.writeAsBytes(old);
      final invalid = Uint8List.fromList([1, 2, 3]);
      final payload = failure == 'invalidGzip' ? invalid : fresh;
      final meta = manifest(payload, failure == 'badCount' ? 41 : 40);
      if (failure == 'badHash') meta['sha256'] = '0' * 64;
      if (failure == 'hugeManifest') meta['byteLength'] = 33 * 1024 * 1024;
      if (failure == 'badHeader') meta['format'] = 'unknown';
      final s = service(client: (_) => MockClient((req) async {
        if (failure == '403') return http.Response('', 403);
        if (failure == 'redirect') return http.Response('', 302, headers: {'location': 'https://not-allowed.invalid'});
        if (req.url.path.endsWith('manifest.json')) return http.Response(jsonEncode(meta), 200);
        return http.Response.bytes(failure == 'truncated' ? payload.sublist(0, payload.length - 1) : payload, 200);
      }));
      await expectLater(s.update(AppSettings()), throwsA(isA<Exception>()));
      expect(await current.readAsBytes(), old);
      expect((await service().select(count: 5)).items.first.id, 201);
      expect(root.listSync().where((f) => f.path.endsWith('.pending')), isEmpty);
    });
  }
  test('checksum corruption falls back to complete bundled snapshot', () async {
    final corrupt = packed(30, base: 100); corrupt[corrupt.length ~/ 2] ^= 1;
    await File('${root.path}/current.bin.gz').writeAsBytes(corrupt);
    final result = await service().select(count: 5);
    expect(result.catalog.downloaded, isFalse); expect(result.catalog.recovered, isTrue);
    expect(result.items.first.id, 1);
  });
  test('invalid selection count is rejected without network or file modification', () async {
    for (final count in [0, -1, 20001]) { await expectLater(service().select(count: count), throwsFormatException); }
    expect(root.listSync(), isEmpty);
  });
  test('cancel and concurrent update cannot replace a good snapshot', () async {
    final fresh = packed(40, base: 100), old = packed(30, base: 200);
    final current = File('${root.path}/current.bin.gz'); await current.writeAsBytes(old);
    final body = StreamController<List<int>>(); final started = Completer<void>();
    final s = service(client: (_) => MockClient.streaming((req, _) async {
      if (req.url.path.endsWith('manifest.json')) return http.StreamedResponse(Stream.value(utf8.encode(jsonEncode(manifest(fresh, 40)))), 200);
      started.complete(); return http.StreamedResponse(body.stream, 200);
    }));
    final job = s.update(AppSettings()); await started.future;
    await expectLater(s.update(AppSettings()), throwsStateError);
    expect((await service().select(count: 2)).items.first.id, 201);
    s.cancelUpdate(); body.add(fresh); await body.close();
    await expectLater(job, throwsA(isA<Exception>()));
    expect(await current.readAsBytes(), old);
    expect(root.listSync().where((f) => f.path.endsWith('.pending')), isEmpty);
  });
  test('oversized private bundled cache is replaced by the checked fixed asset', () async {
    final f = await File('${root.path}/bundled.bin.gz').open(mode: FileMode.write);
    await f.truncate(33 * 1024 * 1024); await f.close();
    expect((await service().select(count: 5)).items.length, 5);
    expect(await File('${root.path}/bundled.bin.gz').length(), bundle.length);
  });
  test('transport construction failure releases update ownership for retry', () async {
    final s = service(client: (_) => throw StateError('fixture transport unavailable'));
    for (var i = 0; i < 2; i++) {
      await expectLater(s.update(AppSettings()), throwsA(predicate((e) =>
          e is StateError && e.message == 'fixture transport unavailable')));
    }
    expect((await service().select(count: 2)).items.length, 2);
  });

}
