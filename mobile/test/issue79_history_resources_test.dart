import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:path/path.dart' as p;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/history/converted_history.dart';
import 'package:novelai_mobile/images/image_file_access.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';

class _Paths extends PathProviderPlatform {
  final String root; _Paths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async => root;
}
Uint8List _webp() => im.encodeWebP(im.Image(width: 8, height: 8), lossless: true);
HistoryItem _row(String path, [String id = 'row']) => HistoryItem(id: id,
  filePath: path, date: '2026-10-31', createdAt: '2026-10-31T00:00:00Z',
  seed: 7, model: 'fixture', width: 8, height: 8, prompt: 'fixture',
  params: {'sourceImageHash': 'original-hash'}, groupId: 'original-group');

class _TrackingIo extends IOOverrides {
  final Map<String, int> listings = {};
  final Zone originalZone = Zone.current;
  final String? growing;
  final bool duringRead;
  int unboundedCalls = 0, boundedOpens = 0, requested = 0, readBytes = 0;
  bool grew = false;
  _TrackingIo({this.growing, this.duringRead = false});
  bool target(String path) => growing != null && p.equals(p.normalize(path), p.normalize(growing!));
  @override Future<FileSystemEntityType> fseGetType(String path, bool followLinks) =>
      originalZone.run(() => FileSystemEntity.type(path, followLinks: followLinks));
  @override FileSystemEntityType fseGetTypeSync(String path, bool followLinks) =>
      originalZone.run(() => FileSystemEntity.typeSync(path, followLinks: followLinks));
  void grow() {
    if (grew || growing == null) return; grew = true;
    super.createFile(growing!).writeAsBytesSync(List.filled(1024 * 1024, 0), mode: FileMode.append);
  }
  @override File createFile(String path) => _TrackedFile(super.createFile(path), this);
  @override Directory createDirectory(String path) => _TrackedDirectory(super.createDirectory(path), this);
}
class _TrackedFile implements File {
  final File inner; final _TrackingIo io;
  _TrackedFile(this.inner, this.io);
  @override String get path => inner.path;
  @override Directory get parent => io.createDirectory(inner.parent.path);
  @override File get absolute => _TrackedFile(inner.absolute, io);
  @override Uri get uri => inner.uri;
  @override Future<FileStat> stat() => inner.stat();
  @override Future<String> resolveSymbolicLinks() => inner.resolveSymbolicLinks();
  @override Future<bool> exists() => inner.exists();
  @override bool existsSync() => inner.existsSync();
  @override Future<int> length() => inner.length();
  @override Future<Uint8List> readAsBytes() async {
    if (io.target(path)) { io.unboundedCalls++; io.grow(); }
    final result = await inner.readAsBytes();
    if (io.target(path)) io.readBytes += result.length;
    return result;
  }
  @override Future<RandomAccessFile> open({FileMode mode = FileMode.read}) async {
    if (!io.target(path)) return inner.open(mode: mode);
    io.boundedOpens++; if (!io.duringRead) io.grow();
    return _TrackedHandle(await inner.open(mode: mode), io);
  }
  @override dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
class _TrackedHandle implements RandomAccessFile {
  final RandomAccessFile inner; final _TrackingIo io;
  _TrackedHandle(this.inner, this.io);
  @override String get path => inner.path;
  @override Future<int> length() => inner.length();
  @override Future<int> readInto(List<int> buffer, [int start = 0, int? end]) async {
    io.requested += (end ?? buffer.length) - start;
    final count = await inner.readInto(buffer, start, end); io.readBytes += count;
    if (io.duringRead) io.grow(); return count;
  }
  @override Future<int> readByte() async {
    io.requested++; final value = await inner.readByte(); if (value >= 0) io.readBytes++; return value;
  }
  @override Future<void> close() => inner.close();
  @override dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
class _TrackedDirectory implements Directory {
  final Directory inner; final _TrackingIo io;
  _TrackedDirectory(this.inner, this.io);
  @override String get path => inner.path;
  @override Directory get parent => io.createDirectory(inner.parent.path);
  @override Directory get absolute => _TrackedDirectory(inner.absolute, io);
  @override Uri get uri => inner.uri;
  @override Stream<FileSystemEntity> list({bool recursive = false, bool followLinks = true}) {
    final key = p.normalize(path); io.listings[key] = (io.listings[key] ?? 0) + 1;
    return inner.list(recursive: recursive, followLinks: followLinks);
  }
  @override Future<FileStat> stat() => inner.stat();
  @override Future<Directory> create({bool recursive = false}) async { await inner.create(recursive: recursive); return this; }
  @override void createSync({bool recursive = false}) => inner.createSync(recursive: recursive);
  @override Future<bool> exists() => inner.exists();
  @override bool existsSync() => inner.existsSync();
  @override Future<String> resolveSymbolicLinks() => inner.resolveSymbolicLinks();
  @override dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root; late Storage storage;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('issue79-resource-');
    SharedPreferences.setMockInitialValues({}); UnifiedStorage.active = null;
    PathProviderPlatform.instance = _Paths(root.path);
    storage = Storage(); await storage.setSettings(AppSettings(saveToGallery: false, imageOutputDir: root.path));
  });
  tearDown(() async {
    expect(root.parent.absolute.path, Directory.systemTemp.absolute.path);
    expect(p.basename(root.path), startsWith('issue79-resource-'));
    if (await root.exists()) await root.delete(recursive: true);
  });
  test('RIFF container with over 256 chunks is rejected before pixel decode', () {
    final original = _webp(); final chunks = BytesBuilder();
    chunks.add(original.sublist(0, 12));
    for (var i = 0; i < 300; i++) { chunks.add(ascii.encode('JUNK')); chunks.add([0, 0, 0, 0]); }
    chunks.add(original.sublist(12)); final bytes = chunks.takeBytes();
    ByteData.sublistView(bytes).setUint32(4, bytes.length - 8, Endian.little);
    expect(validConvertedHistoryWebp(bytes, _row('${root.path}/image.png')), isFalse);
  });
  for (final duringRead in [false, true]) {
    test('growing file uses bounded RAF and retains history (duringRead=$duringRead)', () async {
      final file = File('${root.path}/image.webp')..writeAsBytesSync(_webp());
      final size = file.lengthSync(), row = _row('${root.path}/image.png');
      await storage.writeHistory([row]); final tracking = _TrackingIo(growing: file.path, duringRead: duringRead);
      await IOOverrides.runWithIOOverrides(() => storage.reconcileMissingHistory(), tracking);
      expect((await storage.getHistory()).single.toJson(), row.toJson());
      expect(tracking.unboundedCalls, 0); expect(tracking.boundedOpens, 1);
      expect(tracking.readBytes, lessThanOrEqualTo(size + 1));
      expect(tracking.requested, lessThanOrEqualTo(size + 1));
    });
  }
  test('one reconcile reuses the parent listing and stem index for multiple missing rows', () async {
    final rows = [for (var i = 0; i < 4; i++) _row('${root.path}/image$i.png', 'row$i')];
    for (var i = 0; i < 4; i++) { File('${root.path}/image$i.webp').writeAsBytesSync(_webp()); }
    await storage.writeHistory(rows); final tracking = _TrackingIo();
    await IOOverrides.runWithIOOverrides(() => storage.reconcileMissingHistory(), tracking);
    expect((await storage.getHistory()).every((row) => row.filePath.endsWith('.webp')), isTrue);
    expect(tracking.listings[p.normalize(root.path)], 1);
  });
  test('bounded attempts retain deferred rows and rotate beyond an invalid prefix', () async {
    final rows = [for (var i = 0; i < 33; i++) _row('${root.path}/image$i.png', 'row$i')];
    for (var i = 0; i < 32; i++) { File('${root.path}/image$i.webp').writeAsBytesSync([1, 2, 3]); }
    final target = File('${root.path}/image32.webp')..writeAsBytesSync(_webp());
    await storage.writeHistory(rows); expect(await storage.reconcileMissingHistory(), isEmpty);
    expect((await storage.getHistory()).last.filePath, rows.last.filePath);
    for (var round = 0; round < 34; round++) {
      if ((await storage.getHistory()).last.filePath == target.path) break;
      expect(await storage.reconcileMissingHistory(), isEmpty);
    }
    final after = await storage.getHistory(); expect(after.length, rows.length);
    expect(after.last.filePath, target.path); expect(after.first.toJson(), rows.first.toJson());
  });
  test('iOS coordinate budget retains deferred rows and the next refresh advances past bad first row', () async {
    final rows = [for (final name in ['bad', ...List.generate(7, (i) => 'good$i'), 'last']) _row('/authorized/output/$name.png', name)];
    var calls = 0;
    final native = Storage(imageReader: ImageFileReader(coordinated: true,
      nativeRead: (path, max) async { if (path.endsWith('.webp')) return _webp(); throw PlatformException(code: 'output_image_missing'); }),
      convertedWebpLookup: (source) async { calls++; return {'sourcePath': source,
        'path': source.replaceFirst('.png', '.webp'), 'state': 'candidate', 'available': true,
        'coordinated': true, 'sourceMissing': true, 'bytes': source.contains('/bad.') ? Uint8List.fromList([1, 2, 3]) : _webp()}; });
    await native.writeHistory(rows); expect(await native.reconcileMissingHistory(), isEmpty);
    expect(calls, inInclusiveRange(1, 8)); expect((await native.getHistory()).length, 9);
    expect((await native.getHistory()).last.filePath, rows.last.filePath);
    for (var round = 0; round < 10; round++) {
      if ((await native.getHistory()).last.filePath.endsWith('.webp')) break;
      expect(await native.reconcileMissingHistory(), isEmpty);
    }
    expect(calls, 9);
    expect((await native.getHistory()).last.filePath, '/authorized/output/last.webp');
    expect((await native.getHistory()).first.toJson(), rows.first.toJson());
  });
}
