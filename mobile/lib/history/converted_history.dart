import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:image/image.dart' as im;
import 'package:path/path.dart' as p;

import '../models/nai_models.dart';
import '../services/ios_output_folder.dart';

enum ConvertedHistoryState { originalPresent, missing, notApplicable, blocked, recovered }

class ConvertedHistoryResult {
  final ConvertedHistoryState state;
  final String? path;
  const ConvertedHistoryResult(this.state, [this.path]);
}

typedef NativeConvertedHistoryLookup = Future<Map<String, dynamic>?> Function(String sourcePath);

const _maxConvertedBytes = 64 * 1024 * 1024;
const _maxConvertedPixels = 16 * 1024 * 1024;
const _maxDirectoryEntries = 10000;
const _maxWebpChunks = 256;

class _DirectorySnapshot {
  final FileStat stat;
  final Map<String, String> names;
  final Map<String, List<String>> webpByStem;
  _DirectorySnapshot(this.stat, this.names, this.webpByStem);
}

/// Operation-local snapshots and payload budget. Never reused across refreshes.
/// No bytes or negative directory result survive a single reconciliation slice.
class ConvertedHistoryScan {
  final int maxReadBytes;
  final int maxRows;
  final int maxLookups;
  final int maxNativeLookups;
  final Duration timeBudget;
  final _clock = Stopwatch()..start();
  final _directories = <String, Future<_DirectorySnapshot?>>{};
  int rows = 0, lookups = 0, nativeLookups = 0, readBytes = 0;
  ConvertedHistoryScan({this.maxReadBytes = _maxConvertedBytes, this.maxRows = 256,
    this.maxLookups = 32, this.maxNativeLookups = 8,
    this.timeBudget = const Duration(milliseconds: 200)});
  int get remainingBytes => maxReadBytes - readBytes;
  bool get canInspect => rows < maxRows && (rows == 0 || _clock.elapsed < timeBudget);
  bool canLookup(bool coordinated) => lookups < maxLookups && remainingBytes > 0 &&
      (!coordinated || nativeLookups < maxNativeLookups);
  bool startLookup(bool coordinated) {
    if (!canLookup(coordinated)) return false;
    lookups++; if (coordinated) nativeLookups++; return true;
  }
  bool charge(int bytes) {
    if (bytes < 0 || bytes > remainingBytes) return false;
    readBytes += bytes; return true;
  }
  Future<_DirectorySnapshot?> _snapshot(Directory directory) {
    final key = _nameKey(p.normalize(p.absolute(directory.path)));
    return _directories.putIfAbsent(key, () async {
      try {
        if (await FileSystemEntity.type(directory.path, followLinks: false) != FileSystemEntityType.directory) return null;
        final before = await directory.stat(), names = <String, String>{}, stems = <String, List<String>>{};
        var count = 0;
        await for (final entry in directory.list(followLinks: false)) {
          if (++count > _maxDirectoryEntries) return null;
          final name = p.basename(entry.path); names[_nameKey(name)] = name;
          if (p.extension(name).toLowerCase() == '.webp') {
            (stems[_nameKey(p.basenameWithoutExtension(name))] ??= []).add(name);
          }
        }
        final snapshot = _DirectorySnapshot(before, names, stems);
        return await _unchanged(directory, snapshot) ? snapshot : null;
      } catch (_) { return null; }
    });
  }
  Future<bool> _unchanged(Directory directory, _DirectorySnapshot snapshot) async {
    try {
      if (await FileSystemEntity.type(directory.path, followLinks: false) != FileSystemEntityType.directory) return false;
      final now = await directory.stat();
      return now.modified == snapshot.stat.modified && now.changed == snapshot.stat.changed && now.mode == snapshot.stat.mode;
    } catch (_) { return false; }
  }
  Future<bool> directoryAvailable(Directory directory) async {
    final value = await _snapshot(directory);
    return value != null && await _unchanged(directory, value);
  }
}

String _nameKey(String value) => Platform.isWindows ? value.toLowerCase() : value;

/// Read only the admitted initial length, then one EOF sentinel byte. A growing
/// file cannot cause readAsBytes to allocate its new unbounded length.
Future<Uint8List?> _readBounded(File file, int size) async {
  if (size <= 0 || size > _maxConvertedBytes) return null;
  final handle = await file.open(mode: FileMode.read);
  try {
    if (await handle.length() != size) return null;
    final bytes = Uint8List(size); var offset = 0;
    while (offset < size) {
      final count = await handle.readInto(bytes, offset, size);
      if (count <= 0) return null;
      offset += count;
    }
    if (await handle.readByte() != -1 || await handle.length() != size) return null;
    return bytes;
  } finally { await handle.close(); }
}

Future<bool> _validateInWorker(Uint8List bytes, HistoryItem original) async {
  if (bytes.length < 20 || bytes.length > _maxConvertedBytes) return false;
  // compute uses a real isolate on Android/iOS/desktop, unlike an async wrapper.
  return compute(_decodeConvertedWebp, (bytes, original.width, original.height),
      debugLabel: 'converted-history-webp');
}
bool _decodeConvertedWebp((Uint8List, int, int) input) =>
    _validConvertedWebp(input.$1, input.$2, input.$3);

bool _sameName(String a, String b) => Platform.isWindows ? a.toLowerCase() == b.toLowerCase() : a == b;

bool _validCounterpartPath(String source, String candidate, {bool coordinated = false}) {
  final paths = coordinated ? p.posix : p.context;
  if (coordinated && (paths.normalize(candidate) != candidate || candidate.contains('\\'))) return false;
  final sameStem = coordinated
      ? paths.basenameWithoutExtension(source) == paths.basenameWithoutExtension(candidate)
      : _sameName(paths.basenameWithoutExtension(source), paths.basenameWithoutExtension(candidate));
  return paths.isAbsolute(candidate) && paths.equals(paths.normalize(paths.dirname(source)), paths.normalize(paths.dirname(candidate))) &&
      sameStem && paths.extension(candidate).toLowerCase() == '.webp' && !paths.equals(source, candidate);
}

bool validConvertedHistoryWebp(Uint8List bytes, HistoryItem original) =>
    _validConvertedWebp(bytes, original.width, original.height);

bool _validConvertedWebp(Uint8List bytes, int width, int height) {
  if (bytes.length < 20 || bytes.length > _maxConvertedBytes ||
      width <= 0 || height <= 0 ||
      width * height > _maxConvertedPixels ||
      latin1.decode(bytes.sublist(0, 4)) != 'RIFF' ||
      latin1.decode(bytes.sublist(8, 12)) != 'WEBP') return false;
  final view = ByteData.sublistView(bytes);
  if (view.getUint32(4, Endian.little) + 8 != bytes.length) return false;
  // Bound and validate the actual RIFF chunks before decoding. A renamed PNG,
  // truncated body, animation or oversized canvas is not a safe still-image match.
  var at = 12, images = 0, chunks = 0;
  while (at + 8 <= bytes.length) {
    if (++chunks > _maxWebpChunks) return false;
    final kind = latin1.decode(bytes.sublist(at, at + 4));
    final count = view.getUint32(at + 4, Endian.little);
    if (count > bytes.length - at - 8) return false;
    if (kind == 'ANIM' || kind == 'ANMF') return false;
    if (kind == 'VP8 ' || kind == 'VP8L') images++;
    at += 8 + count + (count.isOdd ? 1 : 0);
  }
  if (at != bytes.length || images != 1) return false;
  try {
    final decoder = im.WebPDecoder()..maxPixels = _maxConvertedPixels;
    final info = decoder.startDecode(bytes);
    if (info == null || info.width != width || info.height != height) return false;
    final decoded = decoder.decode(bytes);
    return decoded != null && decoded.width == width && decoded.height == height;
  } catch (_) { return false; }
}

/// Look up only a same-directory/same-stem converted WebP. This never scans an
/// arbitrary root, changes an image, guesses among duplicates, or deletes data.
Future<ConvertedHistoryResult> findConvertedHistoryWebp(HistoryItem original,
    {required List<Directory> roots, required bool coordinated,
    NativeConvertedHistoryLookup? nativeLookup, ConvertedHistoryScan? scan}) async {
  const blocked = ConvertedHistoryResult(ConvertedHistoryState.blocked);
  final source = original.filePath;
  final paths = coordinated ? p.posix : p.context;
  if (!paths.isAbsolute(source) || (coordinated && (paths.normalize(source) != source || source.contains('\\'))) ||
      source.contains(RegExp(r'[\x00-\x1f]')) ||
      paths.basenameWithoutExtension(source).isEmpty) return blocked;
  if (!{'.png', '.jpg', '.jpeg'}.contains(paths.extension(source).toLowerCase())) {
    return const ConvertedHistoryResult(ConvertedHistoryState.notApplicable);
  }
  final operation = scan ?? ConvertedHistoryScan();
  if (!operation.startLookup(coordinated)) return blocked;
  if (coordinated) {
    final allowance = operation.remainingBytes;
    // No Dart File fallback for iOS/provider paths. The native bridge must prove
    // a live bookmarked/sandbox parent and return coordinated candidate bytes.
    try {
      final value = await (nativeLookup != null ? nativeLookup(source)
          : IosOutputFolder.findConvertedWebp(source, maxBytes: allowance));
      final returnedBytes = value?['bytes'];
      if (returnedBytes is Uint8List && !operation.charge(returnedBytes.length)) {
        operation.charge(operation.remainingBytes); return blocked;
      }
      if (value?['sourcePath'] != source || value?['coordinated'] != true || value?['available'] != true) return blocked;
      if (value?['state'] == 'original') return const ConvertedHistoryResult(ConvertedHistoryState.originalPresent);
      if (value?['state'] == 'missing' && value?['sourceMissing'] == true) return const ConvertedHistoryResult(ConvertedHistoryState.missing);
      final candidate = value?['path'], bytes = value?['bytes'];
      if (value?['state'] != 'candidate' || value?['sourceMissing'] != true ||
          candidate is! String || bytes is! Uint8List ||
          !_validCounterpartPath(source, candidate, coordinated: true) || !await _validateInWorker(bytes, original)) return blocked;
      return ConvertedHistoryResult(ConvertedHistoryState.recovered, candidate);
    } catch (_) {
      // The native bounded read may have consumed its full allowance before a
      // changing/provider file failed. Do not spend that allowance twice.
      operation.charge(operation.remainingBytes); return blocked;
    }
  }
  try {
    final type = await FileSystemEntity.type(source, followLinks: false);
    if (type != FileSystemEntityType.notFound) return const ConvertedHistoryResult(ConvertedHistoryState.originalPresent);
    final parent = File(source).parent;
    final absolute = p.normalize(p.absolute(parent.path));
    // Allow OS aliases above a declared root, but never a link in its subtree.
    final bases = roots.where((r) => p.equals(p.absolute(r.path), absolute) || p.isWithin(p.absolute(r.path), absolute)).toList()
      ..sort((a, b) => b.path.length.compareTo(a.path.length));
    final base = bases.isEmpty ? parent : bases.first;
    if (await FileSystemEntity.type(base.path, followLinks: false) != FileSystemEntityType.directory) return blocked;
    final realBase = await base.resolveSymbolicLinks();
    var cursor = p.absolute(base.path);
    final relative = p.relative(absolute, from: cursor);
    if (relative != '.') {
      for (final component in p.split(relative)) {
        if (component == '..') return blocked;
        cursor = p.join(cursor, component);
        if (await FileSystemEntity.type(cursor, followLinks: false) != FileSystemEntityType.directory) return blocked;
      }
    }
    final realParent = await parent.resolveSymbolicLinks();
    if (!p.equals(realParent, p.normalize(p.join(realBase, relative)))) return blocked;
    final snapshot = await operation._snapshot(parent);
    if (snapshot == null || !await operation._unchanged(parent, snapshot)) return blocked;
    if (snapshot.names.containsKey(_nameKey(p.basename(source)))) {
      return const ConvertedHistoryResult(ConvertedHistoryState.originalPresent);
    }
    final names = snapshot.webpByStem[_nameKey(p.basenameWithoutExtension(source))] ?? const <String>[];
    if (names.isEmpty) {
      // Directory timestamps can be coarse/lazy (notably on Windows). Never
      // reuse a negative list as deletion proof: point-probe every supported
      // extension casing for this exact stem, without re-enumerating D names.
      final stem = p.basenameWithoutExtension(source);
      for (var mask = 0; mask < (Platform.isWindows ? 1 : 16); mask++) {
        const letters = 'webp';
        final extension = List.generate(4, (i) => mask & (1 << i) == 0
            ? letters[i] : letters[i].toUpperCase()).join();
        if (await FileSystemEntity.type(p.join(parent.path, '$stem.$extension'),
            followLinks: false) != FileSystemEntityType.notFound) return blocked;
      }
      return const ConvertedHistoryResult(ConvertedHistoryState.missing);
    }
    if (names.length != 1) return blocked;
    final candidate = File(p.join(parent.path, names.single));
    if (await FileSystemEntity.type(candidate.path, followLinks: false) != FileSystemEntityType.file ||
        !p.equals(await candidate.resolveSymbolicLinks(), p.join(realParent, p.basename(candidate.path)))) return blocked;
    final before = await candidate.stat();
    if (before.size <= 0 || before.size > _maxConvertedBytes || !operation.charge(before.size)) return blocked;
    final bytes = await _readBounded(candidate, before.size);
    if (bytes == null) return blocked;
    final after = await candidate.stat();
    if (before.size != after.size || before.modified != after.modified || before.changed != after.changed ||
        await FileSystemEntity.type(candidate.path, followLinks: false) != FileSystemEntityType.file ||
        !p.equals(await candidate.resolveSymbolicLinks(), p.join(realParent, p.basename(candidate.path))) ||
        await FileSystemEntity.type(source, followLinks: false) != FileSystemEntityType.notFound ||
        !await operation._unchanged(parent, snapshot) ||
        !await _validateInWorker(bytes, original)) return blocked;
    // Preserve the original directory spelling (including legal mixed Windows
    // separators); only the actual counterpart's basename changes identity.
    final prefix = source.substring(0, source.length - p.basename(source).length);
    return ConvertedHistoryResult(ConvertedHistoryState.recovered, '$prefix${p.basename(candidate.path)}');
  } catch (_) { return blocked; }
}
