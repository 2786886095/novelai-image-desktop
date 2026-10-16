// Production secure-account and artist clients over real local TLS/CONNECT.
// No fake HTTP client, HttpOverrides, bad-certificate callback or public socket.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'native_ui_tls_credentials.dart';
import 'native_tls_context.dart';

class NativeUiTlsFixture {
  final HttpServer tls, proxy;
  final Uint8List image;
  final requests = <Map<String, Object?>>[];
  final blockedAuthorities = <String>[];
  final errors = <String>[];
  final sockets = <Socket>{};
  String mode = 'normal';
  int balance = 1000;
  HttpRequest? held;
  final heldArrived = Completer<void>();
  NativeUiTlsFixture._(this.tls, this.proxy, this.image);
  String get proxyUrl => 'http://127.0.0.1:${proxy.port}';
  static const a = 'https://relay-a.native.invalid';
  static const b = 'https://relay-b.native.invalid';
  static const tokenA = 'NATIVE_UI_SYNTHETIC_ACCOUNT_A_NOT_REAL';
  static const tokenB = 'NATIVE_UI_SYNTHETIC_ACCOUNT_B_NOT_REAL';
  static const hosts = {
    'relay-a.native.invalid:443',
    'relay-b.native.invalid:443',
    'danbooru.donmai.us:443'
  };
  static Future<NativeUiTlsFixture> open(Uint8List image) async {
    final context = nativeFixtureServerContext(
        chainBase64: nativeUiChainBase64,
        keyBase64: nativeUiPrivateKey,
        pkcs12Base64: nativeUiPkcs12Base64);
    final tls = await HttpServer.bindSecure(
            InternetAddress.loopbackIPv4, 0, context),
        proxy = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final value = NativeUiTlsFixture._(tls, proxy, image);
    trustNativeFixtureRootInDisposableProcess();
    tls.listen(value._respond,
        onError: (Object error) => value.errors.add('$error'));
    proxy.listen(value._tunnel,
        onError: (Object error) => value.errors.add('$error'));
    return value;
  }

  Future<void> _tunnel(HttpRequest request) async {
    try {
      final authority = request.uri.toString();
      if (!request.connectionInfo!.remoteAddress.isLoopback ||
          request.method != 'CONNECT' ||
          !hosts.contains(authority)) {
        blockedAuthorities.add(authority);
        request.response.statusCode = 403;
        await request.response.close();
        return;
      }
      final inbound = await request.response.detachSocket(writeHeaders: false),
          outbound =
              await Socket.connect(InternetAddress.loopbackIPv4, tls.port);
      sockets.addAll([inbound, outbound]);
      inbound.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      unawaited(inbound
          .cast<List<int>>()
          .pipe(outbound)
          .catchError((Object _) {})
          .whenComplete(() {
        sockets.remove(inbound);
        outbound.destroy();
      }));
      unawaited(outbound
          .cast<List<int>>()
          .pipe(inbound)
          .catchError((Object _) {})
          .whenComplete(() {
        sockets.remove(outbound);
        inbound.destroy();
      }));
    } catch (error) {
      errors.add('$error');
    }
  }

  Future<void> _respond(HttpRequest request) async {
    try {
      if (!request.connectionInfo!.remoteAddress.isLoopback) {
        throw StateError('Non-loopback socket');
      }
      final body = await utf8.decoder.bind(request).join(),
          host = Uri.parse('https://${request.headers.host}').host;
      final authorization =
          request.headers.value(HttpHeaders.authorizationHeader);
      requests.add({
        'method': request.method,
        'host': host,
        'path': request.uri.path,
        'bodyBytes': utf8.encode(body).length,
        'authorizationSha256': authorization == null
            ? null
            : sha256.convert(utf8.encode(authorization)).toString()
      });
      if (host == 'danbooru.donmai.us') {
        if (request.method != 'GET' || authorization != null) {
          throw StateError('Artist request leaked account credential');
        }
        if (mode == 'offline') {
          request.response.statusCode = 503;
        } else {
          request.response.headers.contentType = ContentType.json;
          request.response.write(jsonEncode(
              (int.tryParse(request.uri.queryParameters['page'] ?? '1') ?? 1) > 1
                  ? []
                  : [
            {'id': 1, 'name': 'native_artist_a', 'post_count': 100},
            {'id': 2, 'name': 'native_artist_b', 'post_count': 80},
            {
              'id': 3,
              'name': 'deprecated_artist',
              'post_count': 90,
              'is_deprecated': true
            },
            {'id': 1, 'name': 'native_artist_a', 'post_count': 100},
            {'id': 0, 'name': 'invalid_artist', 'post_count': 10}
          ]));
        }
      } else {
        final token = host == 'relay-a.native.invalid'
            ? tokenA
            : host == 'relay-b.native.invalid'
                ? tokenB
                : null;
        if (token == null || authorization != 'Bearer $token') {
          throw StateError('Wrong credential origin binding');
        }
        if (mode == 'invalid') {
          request.response.statusCode = 401;
          request.response.write('DO_NOT_DISCLOSE $token');
        } else if (mode == 'hold' && request.uri.path == '/user/data') {
          held = request;
          if (!heldArrived.isCompleted) heldArrived.complete();
          return;
        } else if (request.method == 'GET' &&
            request.uri.path == '/user/data') {
          request.response.headers.contentType = ContentType.json;
          request.response.write(jsonEncode({
            'subscription': {
              'tier': 0,
              'active': false,
              'trainingStepsLeft': {
                'fixedTrainingStepsLeft': balance,
                'purchasedTrainingSteps': 0
              }
            }
          }));
        } else if (request.method == 'POST' &&
            request.uri.path == '/ai/generate-image') {
          final payload = jsonDecode(body) as Map;
          final parameters = payload['parameters'] as Map;
          if (parameters['width'] != 64 || parameters['height'] != 64) {
            throw StateError('Unexpected account fixture generation size');
          }
          final archive = Archive()
            ..addFile(ArchiveFile('0.png', image.length, image));
          request.response.headers.contentType =
              ContentType('application', 'zip');
          request.response.add(ZipEncoder().encode(archive));
        } else {
          throw StateError(
              'Unexpected account operation ${request.method} ${request.uri.path}');
        }
      }
      await request.response.close();
    } catch (error) {
      errors.add('$error');
      request.response.statusCode = 500;
      await request.response.close();
    }
  }

  Future<void> releaseHeld() async {
    final request = held;
    if (request == null) throw StateError('No actual held native TLS request');
    held = null;
    request.response.headers.contentType = ContentType.json;
    request.response.write(jsonEncode({
      'subscription': {
        'tier': 0,
        'active': false,
        'trainingStepsLeft': {
          'fixedTrainingStepsLeft': balance,
          'purchasedTrainingSteps': 0
        }
      }
    }));
    await request.response.close();
  }

  Future<void> close() async {
    for (final socket in sockets.toList()) {
      socket.destroy();
    }
    await proxy.close(force: true);
    await tls.close(force: true);
  }
}
