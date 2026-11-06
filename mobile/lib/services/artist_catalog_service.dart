import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../artist/artist_recipe.dart';
import '../models/nai_models.dart';
import 'proxy_http_client.dart';

const artistCatalogMaxSelection = 20000;
const _maxCompressed = 32 * 1024 * 1024;
const _maxExpanded = 96 * 1024 * 1024;
const _asset = 'assets/artist-catalog/danbooru.bin.gz';
const _bundledSha =
    'afcb2dd6820abdc1df249cf07e80e480c45fe4ffc399c7e23d1082ef9537e1cd';
const _mirrorBase =
    'https://raw.githubusercontent.com/2786886095/novelai-image-desktop/main/public/artist-catalog/';

class ArtistCatalogInfo {
  final int total;
  final DateTime savedAt;
  final bool downloaded;
  final bool recovered;
  const ArtistCatalogInfo(this.total, this.savedAt,
      {this.downloaded = false, this.recovered = false});
}

class ArtistCatalogSelection {
  final List<ArtistTagRecord> items;
  final ArtistCatalogInfo catalog;
  const ArtistCatalogSelection(this.items, this.catalog);
}

/// The desktop LBART001 format and sparse Fisher-Yates/Mulberry32 sampler.
/// The complete binary stays off the UI isolate; only the selected rows return.
List<int> sampleArtistCatalogIndices(int total, int count, int seed) {
  if (total <= 0 ||
      total > 2000000 ||
      count < 0 ||
      count > artistCatalogMaxSelection) {
    throw const FormatException('Invalid artist selection size');
  }
  var state = seed & 0xffffffff;
  int next(int range) {
    final ceiling = (0x100000000 ~/ range) * range;
    while (true) {
      state = (state + 0x6d2b79f5) & 0xffffffff;
      var value = ((state ^ (state >>> 15)) * (state | 1)) & 0xffffffff;
      value ^=
          (value + (((value ^ (value >>> 7)) * (value | 61)) & 0xffffffff)) &
              0xffffffff;
      final unsigned = (value ^ (value >>> 14)) & 0xffffffff;
      if (unsigned < ceiling) return unsigned % range;
    }
  }

  final swaps = <int, int>{}, result = <int>[];
  for (var i = 0; i < count && i < total; i++) {
    final j = i + next(total - i);
    result.add(swaps[j] ?? j);
    swaps[j] = swaps[i] ?? i;
    swaps.remove(i);
  }
  return result;
}

Future<ArtistCatalogSelection> _readSelection(String path, int count,
    bool random, int seed, bool downloaded, bool recovered) async {
  final file = File(path);
  if (await file.length() > _maxCompressed) {
    throw const FormatException('Mirror file too large');
  }
  final out = BytesBuilder(copy: false);
  await for (final chunk in file.openRead().transform(gzip.decoder)) {
    if (out.length + chunk.length > _maxExpanded) {
      throw const FormatException('Expanded mirror too large');
    }
    out.add(chunk);
  }
  final data = out.takeBytes();
  if (data.length < 56 ||
      ascii.decode(data.sublist(0, 8), allowInvalid: true) != 'LBART001') {
    throw const FormatException('Invalid mirror header');
  }
  final body = Uint8List.sublistView(data, 0, data.length - 32);
  final checksum = sha256.convert(body).bytes;
  for (var i = 0; i < 32; i++) {
    if (checksum[i] != data[body.length + i]) {
      throw const FormatException('Mirror checksum mismatch');
    }
  }
  final view = ByteData.sublistView(body),
      total = view.getUint32(8, Endian.little);
  final stamp = view.getFloat64(12, Endian.little);
  final strings = 24 + total * 12;
  if (total < 1 ||
      total > 2000000 ||
      !stamp.isFinite ||
      stamp != stamp.truncateToDouble() ||
      stamp <= 0 ||
      stamp >
          DateTime.now().add(const Duration(days: 1)).millisecondsSinceEpoch ||
      strings >= body.length) {
    throw const FormatException('Invalid mirror size/date');
  }
  var previousCount = 0xffffffff, previousId = 0;
  for (var i = 0; i < total; i++) {
    final p = 24 + i * 12, id = view.getUint32(p, Endian.little);
    final posts = view.getUint32(p + 4, Endian.little);
    final a = view.getUint32(p + 8, Endian.little);
    final b = i + 1 < total
        ? view.getUint32(p + 20, Endian.little)
        : body.length - strings;
    if (id == 0 ||
        (i == 0 && a != 0) ||
        a >= b ||
        b > body.length - strings ||
        b - a > 960 ||
        posts > previousCount ||
        (i > 0 && posts == previousCount && id <= previousId)) {
      throw const FormatException('Invalid mirror record/order');
    }
    previousCount = posts;
    previousId = id;
  }
  final indices = random
      ? sampleArtistCatalogIndices(total, count, seed)
      : List.generate(count < total ? count : total, (i) => i);
  final rows = <ArtistTagRecord>[];
  for (final i in indices) {
    final p = 24 + i * 12, a = strings + view.getUint32(p + 8, Endian.little);
    final b = i + 1 < total
        ? strings + view.getUint32(p + 20, Endian.little)
        : body.length;
    final name = utf8.decode(Uint8List.sublistView(body, a, b));
    if (name.isEmpty ||
        name.length > 240 ||
        RegExp(r'[\x00-\x20,]').hasMatch(name)) {
      throw const FormatException('Invalid mirror artist tag');
    }
    rows.add(ArtistTagRecord(view.getUint32(p, Endian.little), name,
        view.getUint32(p + 4, Endian.little)));
  }
  return ArtistCatalogSelection(
      rows,
      ArtistCatalogInfo(
          total, DateTime.fromMillisecondsSinceEpoch(stamp.toInt()),
          downloaded: downloaded, recovered: recovered));
}

Future<ArtistCatalogSelection> _selectOffThread(String path, int count,
        bool random, int seed, bool downloaded, bool recovered) =>
    Isolate.run(
        () => _readSelection(path, count, random, seed, downloaded, recovered));

class ArtistCatalogService {
  final Future<Directory> Function() directory;
  final Future<Uint8List> Function() bundledBytes;
  final http.Client Function(AppSettings) clientFactory;
  // Test fixtures may supply their own checked mirror hash; production pins the desktop asset.
  final String bundledSha256;
  static int _serial = 0;
  static final _updatingPaths = <String>{};
  Future<Directory>? _initializing;
  http.Client? _active;
  bool _cancelled = false;
  bool _updating = false;
  ArtistCatalogService(
      {Future<Directory> Function()? directory,
      Future<Uint8List> Function()? bundledBytes,
      http.Client Function(AppSettings)? clientFactory,
      this.bundledSha256 = _bundledSha})
      : directory = directory ??
            (() async => Directory(
                '${(await getApplicationSupportDirectory()).path}/artist-catalog')),
        bundledBytes = bundledBytes ??
            (() async => (await rootBundle.load(_asset)).buffer.asUint8List()),
        clientFactory = clientFactory ??
            ((s) => createProxyHttpClient(s, scope: ProxyScope.update));

  Future<Directory> _ensure() => _initializing ??= (() async {
        final root = await directory();
        await root.create(recursive: true);
        final bundled = File('${root.path}/bundled.bin.gz');
        if (!await bundled.exists() ||
            sha256.convert(await bundled.readAsBytes()).toString() !=
                bundledSha256) {
          final bytes = await bundledBytes();
          if (bytes.length > _maxCompressed ||
              sha256.convert(bytes).toString() != bundledSha256) {
            throw const FormatException('Bundled mirror integrity failure');
          }
          final pending = File('${root.path}/bundled-${_serial++}.pending');
          await pending.writeAsBytes(bytes, flush: true);
          await pending.rename(bundled.path);
        }
        return root;
      })()
          .catchError((Object error) {
        _initializing = null;
        throw error;
      });

  Future<ArtistCatalogSelection> select(
      {int count = 1000, bool random = false, int seed = 0}) async {
    if (count < 1 || count > artistCatalogMaxSelection) {
      throw const FormatException('Invalid artist selection count');
    }
    final root = await _ensure(), current = File('${root.path}/current.bin.gz');
    if (await current.exists()) {
      try {
        return await _selectOffThread(
            current.path, count, random, seed, true, false);
      } on FormatException {
        /* An invalid download never prevents bundled offline use. */
      } on FileSystemException {
        /* A failed local read can still use the fixed bundled snapshot. */
      }
      return _selectOffThread(
          '${root.path}/bundled.bin.gz', count, random, seed, false, true);
    }
    return _selectOffThread(
        '${root.path}/bundled.bin.gz', count, random, seed, false, false);
  }

  void cancelUpdate() {
    _cancelled = true;
    _active?.close();
  }

  void _check() {
    if (_cancelled) throw const FormatException('Mirror update cancelled');
  }

  /// Explicit action only. No automatic HTTP on load, sample, draw or restart.
  /// Both destinations are fixed; the manifest cannot choose a server or path.
  Future<ArtistCatalogInfo> update(AppSettings settings,
      {void Function(int received, int? total)? progress}) async {
    if (_updating) throw StateError('Mirror update already running');
    _updating = true;
    _cancelled = false;
    File? pending;
    http.Client? client;
    Timer? timer;
    String? claimed;
    try {
      final root = await _ensure();
      _check();
      if (!_updatingPaths.add(root.absolute.path)) {
        throw StateError('Mirror update already running');
      }
      claimed = root.absolute.path;
      final session = clientFactory(settings);
      client = session;
      _active = session;
      timer = Timer(const Duration(minutes: 3), cancelUpdate);
      Future<http.StreamedResponse> request(String name) async {
        final req = http.Request('GET', Uri.parse('$_mirrorBase$name'))
          ..followRedirects = false
          ..headers['User-Agent'] = 'Langbai-Studio-Mobile/Artist-Mirror';
        final res =
            await session.send(req).timeout(const Duration(seconds: 30));
        _check();
        if (res.statusCode != 200) {
          throw http.ClientException('Mirror HTTP ${res.statusCode}');
        }
        return res;
      }

      final manifestResponse = await request('manifest.json'),
          manifestBytes = BytesBuilder(copy: false);
      await for (final chunk
          in manifestResponse.stream.timeout(const Duration(seconds: 30))) {
        _check();
        if (manifestBytes.length + chunk.length > 65536) {
          throw const FormatException('Mirror manifest too large');
        }
        manifestBytes.add(chunk);
      }
      final meta = jsonDecode(utf8.decode(manifestBytes.takeBytes()));
      if (meta is! Map ||
          meta['format'] != 'LBART001' ||
          meta['sha256'] is! String ||
          !RegExp(r'^[a-f0-9]{64}$').hasMatch(meta['sha256'] as String) ||
          meta['byteLength'] is! int ||
          (meta['byteLength'] as int) < 56 ||
          (meta['byteLength'] as int) > _maxCompressed ||
          meta['uniqueArtistTags'] is! int ||
          meta['savedAt'] is! int) {
        throw const FormatException('Invalid mirror manifest');
      }
      final expected = meta['byteLength'] as int;
      final res = await request('danbooru.bin.gz');
      if (res.contentLength != null && res.contentLength != expected) {
        throw const FormatException('Mirror length mismatch');
      }
      pending = File('${root.path}/download-${_serial++}.pending');
      final sink = pending.openWrite();
      var received = 0;
      try {
        await for (final chunk
            in res.stream.timeout(const Duration(seconds: 30))) {
          _check();
          received += chunk.length;
          if (received > expected) {
            throw const FormatException('Mirror exceeds declared length');
          }
          sink.add(chunk);
          await sink.flush();
          progress?.call(received, expected);
        }
      } finally {
        await sink.close();
      }
      _check();
      if (received != expected) {
        throw const FormatException('Incomplete mirror download');
      }
      final digest = await sha256.bind(pending.openRead()).first;
      _check();
      if (digest.toString() != meta['sha256']) {
        throw const FormatException('Downloaded mirror hash mismatch');
      }
      final path = pending.path;
      final inspected = await _selectOffThread(path, 1, false, 0, true, false);
      _check();
      if (inspected.catalog.total != meta['uniqueArtistTags'] ||
          inspected.catalog.savedAt.millisecondsSinceEpoch != meta['savedAt']) {
        throw const FormatException('Mirror manifest contents mismatch');
      }
      await pending.rename('${root.path}/current.bin.gz');
      pending = null;
      return inspected.catalog;
    } finally {
      timer?.cancel();
      client?.close();
      if (claimed != null) _updatingPaths.remove(claimed);
      _active = null;
      _updating = false;
      if (pending != null && await pending.exists()) await pending.delete();
    }
  }
}
