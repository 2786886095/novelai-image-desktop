// Actual isolated HTTP CONNECT + TLS sockets for the production update client.
// No HttpOverrides, fake Client, bad-certificate callback, or public request.
// Synthetic ZIP envelope is test-only, unsigned and not an installable application.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'native_os_tls_credentials.dart';
import 'native_tls_context.dart';

class NativeIosUpdateTlsFixture {
  final HttpServer tls;
  final HttpServer proxy;
  final requests = <Map<String, Object?>>[];
  final connections = <String>[];
  final errors = <String>[];
  final sockets = <Socket>{};
  String mode = 'normal';
  final Uint8List artifact = Uint8List.fromList(ZipEncoder().encode(Archive()
    ..addFile(ArchiveFile('Payload/Runner.app/Info.plist', 25,
        utf8.encode('TEST-ONLY; NOT INSTALLABLE')))));
  NativeIosUpdateTlsFixture._(this.tls, this.proxy);
  String get proxyUrl => 'http://127.0.0.1:${proxy.port}';
  String get artifactDigest => sha256.convert(artifact).toString();
  String get certificateDigest =>
      sha256.convert(base64Decode(nativeOsFixtureCertificateBase64)).toString();
  static const version = '99.0.0';
  static const release =
      'https://github.com/2786886095/novelai-image-desktop/releases/latest';
  static const ipaUrl =
      'https://github.com/2786886095/novelai-image-desktop/releases/download/v99.0.0/novelai-mobile-unsigned.ipa';
  static const hosts = {
    'github.com:443',
    'api.github.com:443',
    'objects.githubusercontent.com:443'
  };

  static Future<NativeIosUpdateTlsFixture> open() async {
    final context = nativeFixtureServerContext(
        chainBase64: nativeOsFixtureChainBase64,
        keyBase64: nativeOsFixturePrivateKeyBase64,
        pkcs12Base64: nativeOsFixturePkcs12Base64);
    final tls =
        await HttpServer.bindSecure(InternetAddress.loopbackIPv4, 0, context);
    final proxy = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final fixture = NativeIosUpdateTlsFixture._(tls, proxy);
    tls.listen(fixture._respond,
        onError: (Object error) => fixture.errors.add('$error'));
    proxy.listen(fixture._tunnel,
        onError: (Object error) => fixture.errors.add('$error'));
    return fixture;
  }

  // Adds only this explicit test CA to this disposable Dart process's roots.
  // Hostname verification and all normal TLS validation remain enabled.
  void trustInDisposableProcess() =>
      trustNativeFixtureRootInDisposableProcess();

  Future<void> _tunnel(HttpRequest request) async {
    try {
      final authority = request.uri.toString();
      if (!request.connectionInfo!.remoteAddress.isLoopback ||
          request.method != 'CONNECT' ||
          !hosts.contains(authority)) {
        request.response.statusCode = HttpStatus.forbidden;
        await request.response.close();
        return;
      }
      connections.add(authority);
      final inbound = await request.response.detachSocket(writeHeaders: false);
      sockets.add(inbound);
      final outbound =
          await Socket.connect(InternetAddress.loopbackIPv4, tls.port);
      sockets.add(outbound);
      inbound.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      unawaited(_pump(inbound, outbound));
      unawaited(_pump(outbound, inbound));
    } catch (error) {
      errors.add('$error');
    }
  }

  Future<void> _pump(Socket source, Socket destination) async {
    try {
      await source.cast<List<int>>().pipe(destination);
    } catch (_) {/* A closed test client ends its tunnel. */} finally {
      sockets.remove(source);
      destination.destroy();
    }
  }

  Future<void> _respond(HttpRequest request) async {
    try {
      if (!request.connectionInfo!.remoteAddress.isLoopback ||
          request.method != 'GET') {
        throw StateError(
            'Only actual local read-only update requests are allowed');
      }
      final body =
          await request.fold<List<int>>(<int>[], (a, b) => a..addAll(b));
      if (body.isNotEmpty ||
          request.headers.value(HttpHeaders.authorizationHeader) != null) {
        throw StateError('Update check leaked a credential or request body');
      }
      requests.add({
        'method': request.method,
        'host': request.headers.host,
        'path': request.uri.path,
        'requestBodyBytes': body.length,
        'authorizationPresent': false
      });
      if (mode == 'http-error') {
        request.response.statusCode = HttpStatus.serviceUnavailable;
      } else if (request.uri.path.endsWith('/latest.yml')) {
        request.response.headers.contentType = ContentType.text;
        request.response.write('version: $version\n');
      } else if (request.uri.path ==
          '/repos/2786886095/novelai-image-desktop/releases/latest') {
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode({
          'tag_name': 'v$version',
          'html_url': release,
          'assets': [
            {
              'name': 'novelai-mobile-unsigned.ipa',
              'browser_download_url': ipaUrl,
              'digest': 'sha256:$artifactDigest',
              'size': artifact.length
            }
          ]
        }));
      } else if (request.uri.path ==
          '/2786886095/novelai-image-desktop/releases/download/v99.0.0/novelai-mobile-unsigned.ipa') {
        request.response.headers.contentType = ContentType.binary;
        if (mode == 'hold') {
          await request.response.flush();
          return;
        }
        request.response.add(mode == 'corrupt'
            ? List<int>.filled(artifact.length, 90)
            : mode == 'oversize'
                ? [...artifact, 1]
                : mode == 'truncated'
                    ? artifact.sublist(0, artifact.length - 1)
                    : artifact);
      } else {
        throw StateError(
            'Unexpected production request path: ${request.uri.path}');
      }
      await request.response.close();
    } catch (error) {
      errors.add('$error');
      request.response.statusCode = HttpStatus.internalServerError;
      await request.response.close();
    }
  }

  Future<void> close() async {
    for (final socket in sockets.toList()) {
      socket.destroy();
    }
    await proxy.close(force: true);
    await tls.close(force: true);
  }
}
