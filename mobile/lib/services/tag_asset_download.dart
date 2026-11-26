import 'dart:async';
import 'dart:io';
import 'package:http/http.dart' as http;

const _assetIds = {
  'tag_catalog.db': 533720512,
  'cooccurrence-v2.db.gz': 525243775,
  'tags-2026-11-26-zh-CN.sqlite.gz': 796598090,
  'tags-2026-11-26-zh-TW.sqlite.gz': 796598089,
  'tags-2026-11-26-ja-JP.sqlite.gz': 796598087,
  'tags-2026-11-26-ko-KR.sqlite.gz': 796598088,
};
const _cdn = 'release-assets.githubusercontent.com';
const _storage = 'releaseassetproduction.blob.core.windows.net';

/// Owns one request at a time so redirects use their own system proxy route.
class TagAssetClient extends http.BaseClient {
  TagAssetClient(this.route);
  final Future<http.Client> Function(Uri uri) route;
  http.Client? _current;
  bool _closed = false;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (_closed) throw const HttpException('Download closed');
    _current?.close();
    final client = await route(request.url.replace(query: '', fragment: ''));
    if (_closed) {
      client.close();
      throw const HttpException('Download closed');
    }
    _current = client;
    return client.send(request);
  }

  @override
  void close() {
    _closed = true;
    _current?.close();
  }
}

/// The request can be repeated without changing certificate or host checks.
class RetryableTagDownload extends HttpException {
  const RetryableTagDownload(super.message);
}

Future<http.StreamedResponse> openTagAsset(http.Client client, Uri canonical,
    {required int size, int offset = 0, void Function()? checkActive}) async {
  final paths = canonical.pathSegments;
  final id = _assetIds[paths.last];
  final candidates = [
    canonical,
    if (id != null)
      Uri.https(
          'api.github.com',
          '/repos/${paths[0]}/${paths[1]}/releases/assets/$id',
          {'download': DateTime.now().millisecondsSinceEpoch.toString()})
  ];
  final seen = <Uri>{};
  final failures = <String>[];
  var temporaryFailure = false;
  for (var i = 0; i < candidates.length; i++) {
    checkActive?.call();
    final uri = candidates[i];
    if (!seen.add(uri)) continue;
    if (uri.scheme != 'https' ||
        uri.port != 443 ||
        uri.userInfo.isNotEmpty ||
        !{
          'github.com',
          'api.github.com',
          _cdn,
          'objects.githubusercontent.com',
          _storage
        }.contains(uri.host)) {
      throw const FormatException('Unexpected tag download host');
    }
    final request = http.Request('GET', uri)..followRedirects = false;
    request.headers['Accept'] = 'application/octet-stream';
    if (offset > 0) request.headers['Range'] = 'bytes=$offset-';
    try {
      final response =
          await client.send(request).timeout(const Duration(seconds: 30));
      final status = response.statusCode;
      if ((status == 200 || status == 206) &&
          !RegExp(r'json|text/html', caseSensitive: false)
              .hasMatch(response.headers['content-type'] ?? '')) {
        final partial = status == 206;
        final validRange = !partial ||
            response.headers['content-range'] == 'bytes $offset-${size - 1}/$size';
        if (validRange && (response.contentLength == null ||
            response.contentLength == size - (partial ? offset : 0))) {
          return response;
        }
        await response.stream.listen((_) {}).cancel();
        failures.add('${uri.host}: unexpected file length or download range');
        continue;
      }
      if (offset > 0 && status == 416) return response;
      await response.stream.listen((_) {}).cancel();
      final location = response.headers['location'];
      if ({301, 302, 303, 307, 308}.contains(status) &&
          location != null &&
          seen.length < 8) {
        final next = uri.resolve(location);
        candidates.insert(i + 1, next);
        if (next.host == _cdn &&
            next.path.startsWith('/github-production-release-asset/')) {
          candidates.insert(i + 2, next.replace(host: _storage));
        }
      } else {
        if (status == 408 || status == 429 || (status >= 500 && status < 600)) {
          temporaryFailure = true;
        }
        failures.add('${uri.host}: HTTP $status');
      }
    } on Exception catch (error) {
      checkActive?.call();
      if (error is SocketException || error is TimeoutException || error is http.ClientException || error is HttpException) {
        temporaryFailure = true;
      }
      failures.add('${uri.host}: ${error.runtimeType}');
    }
  }
  final message = 'Tag download failed (${failures.join(", ")})';
  if (temporaryFailure) throw RetryableTagDownload(message);
  throw HttpException(message);
}
