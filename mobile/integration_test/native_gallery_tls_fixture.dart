// Real loopback TLS/CONNECT transport for gallery production clients/widgets.
// Synthetic public certificate, process-local trust only; no fake HTTP or TLS bypass.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:novelai_mobile/services/gallery_download.dart';
import 'native_ui_tls_credentials.dart';
import 'native_tls_context.dart';

class NativeGalleryTlsFixture {
  final HttpServer tls, proxy;
  final Uint8List image;
  final requests = <Map<String, Object?>>[];
  final errors = <String>[];
  final sockets = <Socket>{};
  String searchMode = 'normal', imageMode = 'normal';
  Completer<void> heldArrived = Completer<void>();
  HttpRequest? held;
  NativeGalleryTlsFixture._(this.tls, this.proxy, this.image);
  static Future<NativeGalleryTlsFixture> open(Uint8List image) async {
    final context = nativeFixtureServerContext(
        chainBase64: nativeUiChainBase64,
        keyBase64: nativeUiPrivateKey,
        pkcs12Base64: nativeUiPkcs12Base64);
    final tls =
        await HttpServer.bindSecure(InternetAddress.loopbackIPv4, 0, context);
    final proxy = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final value = NativeGalleryTlsFixture._(tls, proxy, image);
    trustNativeFixtureRootInDisposableProcess();
    tls.listen(value._respond, onError: (Object e) => value.errors.add('$e'));
    proxy.listen(value._tunnel, onError: (Object e) => value.errors.add('$e'));
    return value;
  }

  HttpClient ioClient() => HttpClient(context: nativeFixtureClientContext())
    ..findProxy = (_) => 'PROXY 127.0.0.1:${proxy.port}';
  http.Client client() => IOClient(ioClient());
  Future<void> _tunnel(HttpRequest r) async {
    try {
      if (!r.connectionInfo!.remoteAddress.isLoopback ||
          r.method != 'CONNECT' ||
          r.uri.toString() != 'danbooru.donmai.us:443') {
        errors.add('Unapproved CONNECT ${r.method} ${r.uri}');
        r.response.statusCode = 403;
        await r.response.close();
        return;
      }
      final a = await r.response.detachSocket(writeHeaders: false);
      final b = await Socket.connect(InternetAddress.loopbackIPv4, tls.port);
      sockets.addAll([a, b]);
      a.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      unawaited(a
          .cast<List<int>>()
          .pipe(b)
          .catchError((Object _) {})
          .whenComplete(() {
        sockets.remove(a);
        b.destroy();
      }));
      unawaited(b
          .cast<List<int>>()
          .pipe(a)
          .catchError((Object _) {})
          .whenComplete(() {
        sockets.remove(b);
        a.destroy();
      }));
    } catch (e) {
      errors.add('$e');
    }
  }

  Map<String, Object> post(int id) => {
        'id': id,
        'rating': 'g',
        'score': 42,
        'fav_count': 7,
        'image_width': 64,
        'image_height': 64,
        'tag_string_artist': 'native_artist',
        'tag_string_general': 'blue_sky forest',
        'tag_string_character': 'native_character_$id',
        'tag_string_copyright': 'original',
        'tag_string_meta': 'highres',
        'tag_string':
            'blue_sky forest native_artist native_character_$id original highres',
        'preview_file_url': 'https://danbooru.donmai.us/preview/$id.png',
        'large_file_url': 'https://danbooru.donmai.us/preview/$id.png',
        'file_url': 'https://danbooru.donmai.us/images/$id.png'
      };
  Future<void> _respond(HttpRequest r) async {
    try {
      final body = await r.fold<int>(0, (n, b) => n + b.length);
      requests.add({
        'method': r.method,
        'path': r.uri.path,
        'query': r.uri.queryParameters,
        'bodyBytes': body,
        'authorization': r.headers.value('authorization')
      });
      if (!r.connectionInfo!.remoteAddress.isLoopback ||
          r.method != 'GET' ||
          body != 0 ||
          r.headers.value('authorization') != null) {
        throw StateError('Gallery non-GET/upload/credential');
      }
      if (r.uri.path == '/posts.json') {
        if (searchMode == 'error') {
          r.response.statusCode = 503;
          r.response.write('temporary fixture outage');
        } else {
          final page = int.tryParse(r.uri.queryParameters['page'] ?? '1') ?? 1;
          r.response.headers.contentType = ContentType.json;
          r.response.write(jsonEncode(page == 1
              ? List.generate(24, (i) => post(i + 1))
              : page == 2
                  ? [post(25)]
                  : []));
        }
      } else if (RegExp(r'^/posts/\d+\.json$').hasMatch(r.uri.path)) {
        r.response.headers.contentType = ContentType.json;
        r.response.write(jsonEncode(
            post(int.parse(r.uri.path.split('/').last.split('.').first))));
      } else if (r.uri.path.startsWith('/preview/')) {
        r.response.headers.contentType = ContentType('image', 'png');
        r.response.add(image);
      } else if (r.uri.path.startsWith('/images/')) {
        if (imageMode == 'hold') {
          held = r;
          if (!heldArrived.isCompleted) heldArrived.complete();
          return;
        }
        if (imageMode == 'error') {
          r.response.statusCode = 503;
        } else if (imageMode == 'html') {
          r.response.headers.contentType = ContentType.html;
          r.response.write('<html>not an image</html>');
        } else if (imageMode == 'oversize') {
          r.response.headers.contentType = ContentType('image', 'png');
          r.response.contentLength = maxGalleryImageBytes + 1;
          r.response.add([0]);
        } else {
          r.response.headers.contentType = ContentType('image', 'png');
          r.response.add(image);
        }
      } else {
        throw StateError('Unapproved gallery route ${r.uri}');
      }
      await r.response.close();
    } catch (e) {
      // Header-size rejection/cancellation intentionally closes the real socket.
      if (r.uri.path.startsWith('/images/') &&
          (imageMode == 'oversize' || imageMode == 'hold')) return;
      errors.add('$e');
      try {
        r.response.statusCode = 500;
        await r.response.close();
      } catch (_) {}
    }
  }

  void holdDownload() {
    imageMode = 'hold';
    heldArrived = Completer<void>();
  }

  Future<void> releaseHeld() async {
    final r = held;
    held = null;
    if (r == null) return;
    try {
      r.response.headers.contentType = ContentType('image', 'png');
      r.response.add(image);
      await r.response.close();
    } catch (_) {}
  }

  Future<void> close() async {
    await releaseHeld();
    for (final socket in sockets.toList()) {
      socket.destroy();
    }
    await proxy.close(force: true);
    await tls.close(force: true);
  }
}
