import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'official_metadata_assets.dart';
import 'png_metadata.dart';

enum MetadataRecoveryMode { online, offline }

class MetadataRecoveryFailure implements Exception {
  final String code;
  const MetadataRecoveryFailure(this.code);
  @override
  String toString() => 'MetadataRecoveryFailure: $code';
}

typedef OfficialMetadataAssetFetcher = Future<Uint8List> Function(String assetId);
typedef OfficialMetadataSandbox = Future<Map<String, dynamic>> Function(
    Uint8List image, List<Map<String, String>> assets, String requestId);

const maxRecoveryImageBytes = 64 * 1024 * 1024;
const maxRecoveryImagePixels = 16 * 1024 * 1024;
const maxRecoveryMetadataBytes = 8 * 1024 * 1024;

/// Only a fixed public asset ID crosses the downloader. No image/prompt/token
/// is available to that transport. Each read executes the actual pinned
/// official importer in a new isolated native WebView Worker, never in Dart.
class MetadataRecoveryReader {
  static const channel = MethodChannel('langbai.novelai/official_metadata');
  final OfficialMetadataAssetFetcher? fetchAsset;
  final OfficialMetadataSandbox? sandbox;
  final Map<String, Uint8List> _cache = {};
  final Set<HttpClient> _clients = {};
  int _revision = 0;
  String? _activeRequest;

  MetadataRecoveryReader({this.fetchAsset, this.sandbox});

  Future<void> cancel() async {
    _revision++;
    for (final client in _clients.toList()) { client.close(force: true); }
    _clients.clear();
    final id = _activeRequest;
    _activeRequest = null;
    if (id != null && sandbox == null) {
      try { await channel.invokeMethod<void>('cancel', {'id': id}); }
      catch (_) { /* Disposal/cancellation never becomes an offline read. */ }
    }
  }

  void _current(int revision) {
    if (_revision != revision) throw const MetadataRecoveryFailure('cancelled');
  }

  static OfficialMetadataAsset assetFor(String id) {
    for (final asset in officialMetadataAssets) { if (asset.id == id) return asset; }
    throw const MetadataRecoveryFailure('unknown_asset');
  }

  /// No redirects, cookies, authentication, arbitrary URI, request body or AI.
  Future<Uint8List> _download(String id) async {
    final asset = assetFor(id);
    final uri = Uri.parse(asset.url);
    final query = uri.queryParameters;
    if (uri.scheme != 'https' || uri.host != 'novelai.net' || uri.userInfo.isNotEmpty ||
        uri.hasFragment || !uri.path.startsWith('/_next/static/') ||
        (query.isNotEmpty && (query.length != 1 || !query.containsKey('dpl') ||
            !RegExp(r'^[A-Za-z0-9-]+$').hasMatch(query['dpl']!))) ||
        asset.bytes <= 0 || asset.bytes > 2 * 1024 * 1024) {
      throw const MetadataRecoveryFailure('invalid_asset_source');
    }
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 20);
    _clients.add(client);
    try {
      final request = await client.getUrl(uri).timeout(const Duration(seconds: 20));
      request.followRedirects = false;
      request.headers.set(HttpHeaders.acceptHeader, 'application/octet-stream');
      final response = await request.close().timeout(const Duration(seconds: 20));
      if (response.statusCode != 200) throw const MetadataRecoveryFailure('asset_http_failed');
      if (response.contentLength > 2 * 1024 * 1024) throw const MetadataRecoveryFailure('asset_size_changed');
      final out = BytesBuilder(copy: false);
      await for (final chunk in response.timeout(const Duration(seconds: 20))) {
        if (out.length + chunk.length > asset.bytes) throw const MetadataRecoveryFailure('asset_size_changed');
        out.add(chunk);
      }
      return out.takeBytes();
    } on MetadataRecoveryFailure { rethrow; }
    catch (_) { throw const MetadataRecoveryFailure('asset_download_failed'); }
    finally { _clients.remove(client); client.close(force: true); }
  }

  Future<List<Map<String, String>>> _assets(int revision) async {
    final output = <Map<String, String>>[];
    for (final asset in officialMetadataAssets) {
      _current(revision);
      var bytes = _cache[asset.id];
      if (bytes == null) {
        bytes = await (fetchAsset == null ? _download(asset.id) : fetchAsset!(asset.id))
            .timeout(const Duration(seconds: 20), onTimeout: () => throw const MetadataRecoveryFailure('asset_timeout'));
        _current(revision);
        if (bytes.length != asset.bytes || sha256.convert(bytes).toString() != asset.sha256) {
          throw const MetadataRecoveryFailure('asset_integrity_changed');
        }
        bytes = Uint8List.fromList(bytes);
        _cache[asset.id] = bytes;
      }
      output.add({'id': asset.id, 'base64': base64Encode(bytes)});
    }
    return output;
  }

  Future<Map<String, dynamic>> _native(
      Uint8List image, List<Map<String, String>> assets, String id) async {
    final host = await rootBundle.loadString('assets/metadata/official_metadata_host.js');
    final worker = await rootBundle.loadString('assets/metadata/official_metadata_worker.js');
    final manifest = jsonDecode(await rootBundle.loadString('assets/metadata/runtime_manifest.json')) as Map;
    if (sha256.convert(utf8.encode(host)).toString() != manifest['hostSha256'] ||
        sha256.convert(utf8.encode(worker)).toString() != manifest['workerSha256']) {
      throw const MetadataRecoveryFailure('local_runtime_integrity');
    }
    // Asset loading may yield while a mode/image switch cancels this request.
    // Do not let an obsolete request start a WebView and cancel its successor.
    if (_activeRequest != id) throw const MetadataRecoveryFailure('cancelled');
    final raw = await channel.invokeMethod<String>('read', {
      'id': id, 'host': host, 'worker': worker,
      'payload': jsonEncode({'image': base64Encode(image), 'assets': assets}),
    }).timeout(const Duration(seconds: 45), onTimeout: () => throw const MetadataRecoveryFailure('sandbox_timeout'));
    if (raw == null || utf8.encode(raw).length > 18 * 1024 * 1024) throw const MetadataRecoveryFailure('invalid_response');
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) throw const MetadataRecoveryFailure('invalid_response');
    return decoded;
  }

  Future<ImageMetadataReport> read(Uint8List bytes,
      {MetadataRecoveryMode mode = MetadataRecoveryMode.online}) async {
    final revision = _revision + 1;
    await cancel();
    _current(revision);
    if (bytes.length > maxRecoveryImageBytes) throw const MetadataRecoveryFailure('image_too_large');
    if (mode == MetadataRecoveryMode.offline) {
      final metadata = await compute(parseImageTextMetadata, Uint8List.fromList(bytes));
      _current(revision);
      return inspectImageMetadata(metadata);
    }
    assertOfficialMetadataImage(bytes);
    final assets = await _assets(revision);
    _current(revision);
    final id = '${DateTime.now().microsecondsSinceEpoch}-$revision';
    _activeRequest = id;
    try {
      final result = await (sandbox ?? _native)(Uint8List.fromList(bytes), assets, id);
      _current(revision);
      if (result['ok'] != true) throw const MetadataRecoveryFailure('official_read_failed');
      final raw = result['metadata'];
      if (raw is! Map || raw.keys.any((k) => k is! String) || raw.values.any((v) => v is! String) ||
          utf8.encode(jsonEncode(raw)).length > maxRecoveryMetadataBytes) {
        throw const MetadataRecoveryFailure('invalid_response');
      }
      final report = inspectImageMetadata(Map<String, String>.from(raw));
      final original = result['originalMetadata'];
      if (original == null) return report;
      if (original is! Map || utf8.encode(jsonEncode(original)).length > maxRecoveryMetadataBytes) {
        throw const MetadataRecoveryFailure('invalid_response');
      }
      // Preserve actual official numeric/object keys for complete raw display.
      // The Comment envelope is only the compatible-parameter mapping view.
      return ImageMetadataReport(kind: report.kind, software: report.software,
          imported: report.imported, characterCaptions: report.characterCaptions,
          entries: report.entries, rawMetadata: report.rawMetadata,
          rawText: const JsonEncoder.withIndent('  ').convert(original), warnings: report.warnings);
    } on MetadataRecoveryFailure { rethrow; }
    catch (_) { throw const MetadataRecoveryFailure('sandbox_failed'); }
    finally { if (_activeRequest == id) _activeRequest = null; }
  }
}

/// Sniff bounded PNG/WebP bytes before any GET or pixel allocation. JPEG is
/// explicitly offline-only; online failure never invokes the local parser.
void assertOfficialMetadataImage(Uint8List bytes) {
  if (bytes.length > maxRecoveryImageBytes) throw const MetadataRecoveryFailure('image_too_large');
  if (bytes.length < 33) throw const MetadataRecoveryFailure('online_png_webp_only');
  final view = ByteData.sublistView(bytes);
  var width = 0, height = 0;
  if (listEquals(bytes.sublist(0, 8), [137, 80, 78, 71, 13, 10, 26, 10])) {
    if (view.getUint32(8) != 13 || view.getUint32(12) != 0x49484452) throw const MetadataRecoveryFailure('invalid_image_header');
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (view.getUint32(0) == 0x52494646 && view.getUint32(8) == 0x57454250) {
    final end = view.getUint32(4, Endian.little) + 8;
    if (end > bytes.length || end < 12) throw const MetadataRecoveryFailure('invalid_image_header');
    var offset = 12;
    while (offset + 8 <= end) {
      final type = view.getUint32(offset), length = view.getUint32(offset + 4, Endian.little), start = offset + 8;
      if (start + length + (length & 1) > end) throw const MetadataRecoveryFailure('invalid_image_header');
      if (type == 0x56503858 && length >= 10) {
        width = 1 + bytes[start + 4] + bytes[start + 5] * 256 + bytes[start + 6] * 65536;
        height = 1 + bytes[start + 7] + bytes[start + 8] * 256 + bytes[start + 9] * 65536;
      } else if (width == 0 && type == 0x5650384c && length >= 5 && bytes[start] == 0x2f) {
        final bits = view.getUint32(start + 1, Endian.little); width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1;
      } else if (width == 0 && type == 0x56503820 && length >= 10 &&
          bytes[start + 3] == 0x9d && bytes[start + 4] == 1 && bytes[start + 5] == 0x2a) {
        width = view.getUint16(start + 6, Endian.little) & 0x3fff; height = view.getUint16(start + 8, Endian.little) & 0x3fff;
      }
      offset = start + length + (length & 1);
    }
    if (offset != end) throw const MetadataRecoveryFailure('invalid_image_header');
  } else { throw const MetadataRecoveryFailure('online_png_webp_only'); }
  if (width <= 0 || height <= 0 || width * height > maxRecoveryImagePixels) throw const MetadataRecoveryFailure('image_pixel_limit');
}
