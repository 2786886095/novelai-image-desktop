import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:novelai_mobile/services/storage.dart';

// A scheduler barrier around real filesystem exists() results, not fabricated
// filesystem data. It forces both writers to observe the same unclaimed name.
class _ExistsBarrier {
  final ready = Completer<void>();
  int arrivals = 0;
  Future<void> arrive() async {
    if (++arrivals == 2) ready.complete();
    await ready.future.timeout(const Duration(seconds: 3));
  }
}

class _BarrierFile implements File {
  final File real;
  final _ExistsBarrier barrier;
  final String contested;
  _BarrierFile(this.real, this.barrier, this.contested);
  @override
  String get path => real.path;
  @override
  Future<bool> exists() async {
    final result = await real.exists();
    if (real.path == contested && !result) await barrier.arrive();
    return result;
  }

  @override
  Future<File> create({bool recursive = false, bool exclusive = false}) =>
      real.create(recursive: recursive, exclusive: exclusive);
  @override
  Future<File> writeAsBytes(List<int> bytes,
          {FileMode mode = FileMode.write, bool flush = false}) =>
      real.writeAsBytes(bytes, mode: mode, flush: flush);
  @override
  Future<FileSystemEntity> delete({bool recursive = false}) =>
      real.delete(recursive: recursive);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'same fixed timestamp across Storage instances preserves all IDs, paths and bytes',
      () async {
    SharedPreferences.setMockInitialValues({});
    UnifiedStorage.active = null;
    final root = await Directory.systemTemp.createTemp('image-identities-');
    addTearDown(() => root.delete(recursive: true));
    PathProviderPlatform.instance = _Paths(root.path);
    final now = DateTime.utc(2026, 10, 17, 12),
        a = Storage(imageClock: () => DateTime.utc(2026, 10, 17, 12)),
        b = Storage(imageClock: () => DateTime.utc(2026, 10, 17, 12));
    final settings = AppSettings(
        imageOutputDir: root.path,
        imageNameTemplate: 'same',
        saveToGallery: false,
        keepImageMetadata: true);
    await a.setSettings(settings);
    final directory = Directory('${root.path}/2026-10-17')..createSync();
    final old = File('${directory.path}/same.png')
      ..writeAsBytesSync([90, 80, 70]);
    final first = Uint8List.fromList(im.encodePng(
            im.Image(width: 8, height: 8)..clear(im.ColorRgb8(10, 20, 30)))),
        second = Uint8List.fromList(im.encodePng(
            im.Image(width: 8, height: 8)..clear(im.ColorRgb8(40, 50, 60))));
    final saved = await Future.wait([
      a.saveImage(first, GenerateParams(width: 8, height: 8), 1),
      b.saveImage(second, GenerateParams(width: 8, height: 8), 2)
    ]);
    expect(saved.map((v) => v.id).toSet(), hasLength(2));
    expect(saved.every((v) => v.createdAt == now.toIso8601String()), true);
    expect(saved.map((v) => v.filePath).toSet(), hasLength(2));
    expect(await File(saved[0].filePath).readAsBytes(), first);
    expect(await File(saved[1].filePath).readAsBytes(), second);
    expect(await old.readAsBytes(), [90, 80, 70]);
    final history = await Storage().getHistory();
    expect(history, hasLength(2));
    expect(history.map((v) => v.id).toSet(), hasLength(2));
    expect(history.map((v) => v.filePath).toSet(), hasLength(2));
  });

  test(
      'forced simultaneous same-name allocation retains both real payloads without clobber',
      () async {
    final root =
        await Directory.systemTemp.createTemp('image-allocation-race-');
    addTearDown(() => root.delete(recursive: true));
    final contested = '${root.path}/same.png',
        barrier = _ExistsBarrier(),
        outside = Zone.current;
    final result = await IOOverrides.runZoned(
        () => Future.wait([
              writeUniqueImageFile(
                  root, 'same', 'png', Uint8List.fromList([10, 20, 30])),
              writeUniqueImageFile(
                  root, 'same', 'png', Uint8List.fromList([40, 50, 60]))
            ]),
        createFile: (path) =>
            _BarrierFile(outside.run(() => File(path)), barrier, contested));
    expect(result.map((f) => f.path).toSet(), hasLength(2));
    expect(await File(result[0].path).readAsBytes(), [10, 20, 30]);
    expect(await File(result[1].path).readAsBytes(), [40, 50, 60]);
  });
  test('pre-existing file and directory names are never overwritten or removed',
      () async {
    final root =
        await Directory.systemTemp.createTemp('image-allocation-existing-');
    addTearDown(() => root.delete(recursive: true));
    final old = File('${root.path}/same.png')..writeAsBytesSync([90, 80, 70]);
    final directory = Directory('${root.path}/same-1.png')..createSync();
    final file = await writeUniqueImageFile(root, 'same', 'png', [1, 2, 3]);
    expect(file.path, '${root.path}/same-2.png');
    expect(await file.readAsBytes(), [1, 2, 3]);
    expect(await old.readAsBytes(), [90, 80, 70]);
    expect(await directory.exists(), true);
  });
}
