// Public fixture formats only; never a device acceptance receipt.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import '../integration_test/native_tls_context.dart';
import '../integration_test/native_tls_root_credentials.dart';
import '../integration_test/native_ui_tls_credentials.dart';
import '../integration_test/native_os_tls_credentials.dart';

class _Der {
  final int tag;
  final Uint8List bytes, value;
  _Der(this.tag, this.bytes, this.value);
  List<_Der> get children {
    final out = <_Der>[];
    var offset = 0;
    while (offset < value.length) {
      final n = _read(value, offset);
      out.add(n);
      offset += n.bytes.length;
    }
    if (offset != value.length) throw const FormatException('DER child bounds');
    return out;
  }
}

_Der _read(Uint8List b, int start) {
  var i = start;
  if (i + 2 > b.length) throw const FormatException('DER header');
  final tag = b[i++];
  var length = b[i++];
  if (length & 128 != 0) {
    final count = length & 127;
    if (count == 0 || count > 4 || i + count > b.length) {
      throw const FormatException('DER length');
    }
    length = 0;
    for (var k = 0; k < count; k++) {
      length = (length << 8) | b[i++];
    }
  }
  if (i + length > b.length) throw const FormatException('DER value bounds');
  return _Der(tag, Uint8List.sublistView(b, start, i + length),
      Uint8List.sublistView(b, i, i + length));
}

_Der _der(Uint8List b) {
  final n = _read(b, 0);
  if (n.bytes.length != b.length) {
    throw const FormatException('DER trailing bytes');
  }
  return n;
}

List<Uint8List> _pem(String encoded) => RegExp(
        r'-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)-----END CERTIFICATE-----')
    .allMatches(utf8.decode(base64Decode(encoded)))
    .map((m) => base64Decode(m[1]!.replaceAll(RegExp(r'\s'), '')))
    .toList();
String _oid(_Der n) {
  final b = n.value;
  final parts = <int>[
    b[0] < 80 ? b[0] ~/ 40 : 2,
    b[0] < 80 ? b[0] % 40 : b[0] - 80
  ];
  var v = 0;
  for (final x in b.skip(1)) {
    v = (v << 7) | (x & 127);
    if (x & 128 == 0) {
      parts.add(v);
      v = 0;
    }
  }
  return parts.join('.');
}

DateTime _time(_Der n) {
  final s = ascii.decode(n.value);
  final year =
      n.tag == 23 ? (int.parse(s.substring(0, 2)) >= 50 ? '19' : '20') + s : s;
  return DateTime.parse(
      '${year.substring(0, 4)}-${year.substring(4, 6)}-${year.substring(6, 8)}T${year.substring(8, 10)}:${year.substring(10, 12)}:${year.substring(12, 14)}Z');
}

Map<String, _Der> _extensions(_Der cert) {
  final a = cert.children.first.children.singleWhere((n) => n.tag == 0xa3);
  return {
    for (final e in a.children.single.children)
      _oid(e.children.first): _der(e.children.last.value)
  };
}

bool _ca(_Der cert) {
  final c = _extensions(cert)['2.5.29.19']!.children;
  return c.isNotEmpty && c.first.tag == 1 && c.first.value.single != 0;
}

void main() {
  final rootBytes = base64Decode(nativeTlsRootDerBase64),
      root = _der(rootBytes);
  test(
      'public CA is independent and both selectors use pinned-engine PEM trust',
      () {
    expect(_ca(root), isTrue);
    expect(_pem(nativeTlsRootPemBase64).single, orderedEquals(rootBytes));
    expect(nativeFixtureRootBytes(ios: true),
        orderedEquals(base64Decode(nativeTlsRootPemBase64)));
    for (final ios in [false, true]) {
      SecurityContext(withTrustedRoots: false)
          .setTrustedCertificatesBytes(nativeFixtureRootBytes(ios: ios));
    }
    expect(nativeFixtureRootBytes(ios: false),
        orderedEquals(base64Decode(nativeTlsRootPemBase64)));
    final t = root.children.first.children;
    expect(t[3].bytes, orderedEquals(t[5].bytes));
  });
  for (final item in [
    (
      'ui',
      nativeUiCertificate,
      nativeUiChainBase64,
      nativeUiPkcs12Base64,
      ['relay-a.native.invalid', 'relay-b.native.invalid', 'danbooru.donmai.us']
    ),
    (
      'os',
      nativeOsFixtureCertificateBase64,
      nativeOsFixtureChainBase64,
      nativeOsFixturePkcs12Base64,
      ['github.com', 'api.github.com', 'objects.githubusercontent.com']
    )
  ]) {
    test(
        '${item.$1} non-CA RSA2048 SHA256 leaf has exact SAN KU serverAuth and397-day expiry',
        () {
      final leafBytes = _pem(item.$2).single,
          leaf = _der(leafBytes),
          t = leaf.children.first.children,
          e = _extensions(leaf);
      expect(_ca(leaf), isFalse);
      expect(t[3].bytes, orderedEquals(root.children.first.children[5].bytes));
      expect(t[3].bytes, isNot(orderedEquals(t[5].bytes)));
      expect(_oid(leaf.children[1].children.first), '1.2.840.113549.1.1.11');
      final spki = t[6].children;
      expect(_oid(spki.first.children.first), '1.2.840.113549.1.1.1');
      final rsa = _der(Uint8List.sublistView(spki[1].value, 1))
              .children
              .first
              .value,
          modulus = rsa.first == 0 ? rsa.sublist(1) : rsa;
      expect(modulus.length * 8, greaterThanOrEqualTo(2048));
      final san = e['2.5.29.17']!.children;
      expect(san.every((n) => n.tag == 0x82), isTrue);
      expect(san.map((n) => ascii.decode(n.value)), unorderedEquals(item.$5));
      expect(e['2.5.29.37']!.children.map(_oid), contains('1.3.6.1.5.5.7.3.1'));
      final ku = e['2.5.29.15']!.value;
      expect(ku[1] & 0xa0, 0xa0);
      expect(ku[1] & 0x04, 0);
      final times = t[4].children,
          start = _time(times.first),
          end = _time(times.last);
      expect(end.difference(start), const Duration(days: 397));
      final now = DateTime.now().toUtc();
      expect(now.isAfter(start), isTrue);
      expect(now.isBefore(end.subtract(const Duration(days: 30))), isTrue,
          reason:
              'Rotate public TEST leaves before2027-10-17; never disable expiry validation');
      final chain = _pem(item.$3);
      expect(chain.length, 2);
      expect(chain.first, orderedEquals(leafBytes));
      expect(chain.last, orderedEquals(rootBytes));
    });
    test(
        '${item.$1} public P12 certificate chain and key parse without runtime OpenSSL',
        () {
      final bytes = base64Decode(item.$4);
      expect(_der(bytes).children.first.value.single, 3);
      // Native library format parsing, NOT a claimed iOS SecPKCS12Import pass.
      final c = SecurityContext();
      c.useCertificateChainBytes(bytes,
          password: nativeTlsFixturePkcs12Password);
      c.usePrivateKeyBytes(bytes, password: nativeTlsFixturePkcs12Password);
    });
  }
  test(
      'pinned-engine explicit PEM key and chain perform TLS and reject unknown CA and wrong host',
      () async {
    final context = nativeFixtureServerContext(
        chainBase64: nativeUiChainBase64,
        keyBase64: nativeUiPrivateKey,
        pkcs12Base64: nativeUiPkcs12Base64);
    final server =
        await SecureServerSocket.bind(InternetAddress.loopbackIPv4, 0, context);
    final sockets = <Socket>[];
    final listener = server.listen((socket) {
      sockets.add(socket);
      socket.listen((_) {}, onError: (Object _) {});
    }, onError: (Object _) {});
    Future<SecureSocket> connect(SecurityContext trust, String host) async {
      final plain =
          await Socket.connect(InternetAddress.loopbackIPv4, server.port);
      sockets.add(plain);
      final secure =
          await SecureSocket.secure(plain, host: host, context: trust)
              .timeout(const Duration(seconds: 5));
      sockets.add(secure);
      return secure;
    }

    try {
      final valid =
          await connect(nativeFixtureClientContext(), 'relay-a.native.invalid');
      expect(valid.peerCertificate!.der,
          orderedEquals(_pem(nativeUiCertificate).single));
      await expectLater(
          connect(SecurityContext(withTrustedRoots: false),
              'relay-a.native.invalid'),
          throwsA(isA<HandshakeException>()));
      await expectLater(
          connect(nativeFixtureClientContext(), 'wrong-host.native.invalid'),
          throwsA(isA<HandshakeException>()));
    } finally {
      for (final socket in sockets) {
        socket.destroy();
      }
      await server.close();
      await listener.cancel();
    }
  });
  test('bounded DER parser rejects indefinite lengths and trailing data', () {
    expect(() => _der(Uint8List.fromList([0x30, 0x80, 0, 0])),
        throwsFormatException);
    expect(() => _der(Uint8List.fromList([0x30, 0, 0])), throwsFormatException);
  });
}
