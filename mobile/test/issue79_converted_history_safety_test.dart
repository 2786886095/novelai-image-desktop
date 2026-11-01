import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/history/converted_history.dart';
import 'package:novelai_mobile/images/image_file_access.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async => root;
}

Uint8List _bytes({int width = 32, int height = 24, bool webp = true}) {
  final image = im.Image(width: width, height: height, numChannels: 4);
  for (final p in image) { p..r = p.x * 7..g = p.y * 9..b = 77..a = 255; }
  return webp ? im.encodeWebP(image, lossless: true, exact: true) : im.encodePng(image);
}
HistoryItem _row(String path) => HistoryItem(id: 'kept-id', filePath: path,
    date: '2026-10-31', createdAt: '2026-10-31T12:00:00Z', seed: 77,
    model: 'fixture', width: 32, height: 24, prompt: 'fixture', groupId: 'kept-group',
    params: {'sourceImageHash': 'original-generation-hash'});

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late Storage storage;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('issue79-safety-');
    SharedPreferences.setMockInitialValues({}); UnifiedStorage.active = null;
    PathProviderPlatform.instance = _Paths(root.path);
    storage = Storage();
    await storage.setSettings(AppSettings(imageOutputDir: root.path, saveToGallery: false));
  });
  tearDown(() async {
    expect(root.parent.absolute.path, Directory.systemTemp.absolute.path);
    expect(root.uri.pathSegments.where((s) => s.isNotEmpty).last, startsWith('issue79-safety-'));
    if (await root.exists()) await root.delete(recursive: true);
  });

  for (final extension in ['png', 'jpg', 'jpeg']) {
    test('missing $extension rebinds a unique genuine same-size WebP', () async {
      final source = File('${root.path}/image.$extension');
      final target = File('${root.path}/image.webp')..writeAsBytesSync(_bytes());
      await storage.writeHistory([_row(source.path)]);
      expect(await storage.reconcileMissingHistory(), isEmpty);
      expect((await storage.getHistory()).single.filePath, target.path);
    });
    test('existing $extension remains authoritative when WebP was only saved alongside', () async {
      final source = File('${root.path}/image.$extension')..writeAsBytesSync(_bytes(webp: false));
      File('${root.path}/image.webp').writeAsBytesSync(_bytes());
      await storage.writeHistory([_row(source.path)]);
      await storage.reconcileMissingHistory();
      expect((await storage.getHistory()).single.filePath, source.path);
    });
  }
  test('case-insensitive WebP extension is accepted without rewriting basename', () async {
    final source = '${root.path}/image.png';
    final target = File('${root.path}/image.WEBP')..writeAsBytesSync(_bytes());
    await storage.writeHistory([_row(source)]); await storage.reconcileMissingHistory();
    expect((await storage.getHistory()).single.filePath, target.path);
  });
  for (final kind in ['renamed PNG', 'truncated WebP', 'wrong dimensions']) {
    test('$kind preserves the missing record instead of guessing or pruning', () async {
      final source = '${root.path}/image.png';
      final bytes = kind == 'renamed PNG' ? _bytes(webp: false)
          : kind == 'wrong dimensions' ? _bytes(width: 31) : _bytes().sublist(0, 22);
      final target = File('${root.path}/image.webp')..writeAsBytesSync(bytes);
      final row = _row(source); await storage.writeHistory([row]);
      expect(await storage.reconcileMissingHistory(), isEmpty);
      expect((await storage.getHistory()).single.toJson(), row.toJson());
      expect(target.readAsBytesSync(), bytes);
    });
  }
  test('a WebP in another directory is not guessed and confirmed missing retains legacy prune', () async {
    final child = Directory('${root.path}/other')..createSync();
    final target = File('${child.path}/image.webp')..writeAsBytesSync(_bytes());
    final row = _row('${root.path}/image.png'); await storage.writeHistory([row]);
    expect(await storage.reconcileMissingHistory(), {row.id});
    expect(await storage.getHistory(), isEmpty); expect(target.existsSync(), isTrue);
  });
  test('missing native WebP is not treated as a conversion source', () async {
    final row = _row('${root.path}/image.webp'); await storage.writeHistory([row]);
    expect(await storage.reconcileMissingHistory(), {row.id});
    expect(await storage.getHistory(), isEmpty);
  });
  test('explicitly deleted row is not resurrected from a remaining counterpart', () async {
    File('${root.path}/image.webp').writeAsBytesSync(_bytes());
    await storage.writeHistory([]); await storage.reconcileMissingHistory();
    expect(await storage.getHistory(), isEmpty);
  });
  test('candidate symbolic link is blocked and never used as image identity', () async {
    final target = File('${root.path}/outside.webp')..writeAsBytesSync(_bytes());
    final link = Link('${root.path}/image.webp');
    try { await link.create(target.path); }
    on FileSystemException catch (e) { if (Platform.isWindows && [5, 1314].contains(e.osError?.errorCode)) return; rethrow; }
    final row = _row('${root.path}/image.png'); await storage.writeHistory([row]);
    expect(await storage.reconcileMissingHistory(), isEmpty);
    expect((await storage.getHistory()).single.filePath, row.filePath);
  });

  test('AppState repairs img2img original without retargeting unrelated active image', () async {
    final source = '${root.path}/image.png';
    final target = File('${root.path}/image.webp')..writeAsBytesSync(_bytes());
    final unrelated = File('${root.path}/unrelated.png')..writeAsBytesSync(_bytes(webp: false));
    final other = HistoryItem.fromJson({..._row(unrelated.path).toJson(), 'id': 'unrelated-id'});
    final old = _row(source); await storage.writeHistory([old, other]);
    final app = AppState(storage: storage); addTearDown(app.dispose);
    app.booted = true; app.history = [old, other]; app.current = other;
    app.i2iOriginalImage = WorkingImage(filePath: source, width: 32, height: 24);
    app.workbenchImage = WorkingImage(filePath: unrelated.path, width: 32, height: 24);
    app.comparisonBefore = WorkingImage(filePath: source, width: 32, height: 24);
    app.comparisonAfter = WorkingImage(filePath: unrelated.path, width: 32, height: 24);
    await app.reconcileMissingHistory();
    expect(app.i2iOriginalImage?.filePath, target.path);
    expect(app.comparisonBefore?.filePath, target.path);
    expect(app.current?.id, other.id); expect(app.current?.filePath, unrelated.path);
    expect(app.workbenchImage?.filePath, unrelated.path);
    expect(app.comparisonAfter?.filePath, unrelated.path);
  });

  group('iOS coordinated protocol host contract (not device certification)', () {
    const source = '/authorized/output/image.png', target = '/authorized/output/image.webp';
    Map<String, dynamic> candidate() => {'sourcePath': source, 'state': 'candidate',
      'path': target, 'sourceMissing': true, 'available': true, 'coordinated': true, 'bytes': _bytes()};
    test('uses only coordinated returned bytes, not host filesystem scanning', () async {
      var calls = 0;
      final value = await findConvertedHistoryWebp(_row(source), roots: [root], coordinated: true,
        nativeLookup: (path) async { calls++; expect(path, source); return candidate(); });
      expect(value.state, ConvertedHistoryState.recovered); expect(value.path, target); expect(calls, 1);
    });
    for (final kind in ['wrong source', 'different directory', 'different stem', 'case-changed stem', 'noncanonical candidate', 'not coordinated', 'unavailable', 'malformed bytes', 'ambiguous']) {
      test('$kind remains blocked and retains the row', () async {
        final map = candidate();
        switch (kind) {
          case 'wrong source': map['sourcePath'] = '/other/image.png';
          case 'different directory': map['path'] = '/another/image.webp';
          case 'different stem': map['path'] = '/authorized/output/other.webp';
          case 'case-changed stem': map['path'] = '/authorized/output/Image.webp';
          case 'noncanonical candidate': map['path'] = '/authorized/output/../output/image.webp';
          case 'not coordinated': map['coordinated'] = false;
          case 'unavailable': map['available'] = false;
          case 'malformed bytes': map['bytes'] = _bytes(webp: false);
          case 'ambiguous': map['state'] = 'blocked';
        }
        final nativeStorage = Storage(imageReader: ImageFileReader(coordinated: true,
          nativeRead: (path, max) async => throw PlatformException(code: 'output_image_missing')),
          convertedWebpLookup: (path) async => map);
        final row = _row(source); await nativeStorage.writeHistory([row]);
        expect(await nativeStorage.reconcileMissingHistory(), isEmpty);
        expect((await nativeStorage.getHistory()).single.toJson(), row.toJson());
      });
    }
    test('revoked grant exception retains row and never falls back to local bytes', () async {
      final value = await findConvertedHistoryWebp(_row(source), roots: [root], coordinated: true,
        nativeLookup: (_) async => throw PlatformException(code: 'output_folder_read'));
      expect(value.state, ConvertedHistoryState.blocked);
    });
    test('coordinated success updates history while preserving completion metadata', () async {
      final nativeStorage = Storage(imageReader: ImageFileReader(coordinated: true,
        nativeRead: (path, max) async => throw PlatformException(code: 'output_image_missing')),
        convertedWebpLookup: (_) async => candidate());
      final row = _row(source); await nativeStorage.writeHistory([row]);
      expect(await nativeStorage.reconcileMissingHistory(), isEmpty);
      final saved = (await nativeStorage.getHistory()).single;
      expect(saved.toJson(), {...row.toJson(), 'filePath': target});
    });
  });
}
