import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';

void main() {
  tearDown(() => setResolvedSystemProxyForTesting(''));

  test('default settings use automatic direct routing for a system VPN/TUN',
      () {
    final proxy = parseProxySettings(AppSettings());
    expect(proxy.kind, ProxyKind.direct);
    expect(proxy.automatic, isTrue);
    expect(proxy.description, contains('VPN/TUN'));
  });

  test('automatic mode uses the native system proxy port when available', () {
    setResolvedSystemProxyForTesting('http://127.0.0.1:17890');
    final proxy = parseProxySettings(AppSettings());
    expect(proxy.kind, ProxyKind.http);
    expect(proxy.host, '127.0.0.1');
    expect(proxy.port, 17890);
    expect(proxy.automatic, isTrue);
  });

  test('direct and SOCKS5 presets parse correctly', () {
    final direct = parseProxySettings(AppSettings(proxyMode: 'direct'));
    expect(direct.kind, ProxyKind.direct);

    final socks = parseProxySettings(AppSettings(
      proxyMode: 'socks5',
      proxyUrl: 'socks5://127.0.0.1:10808',
    ));
    expect(socks.kind, ProxyKind.socks5);
    expect(socks.port, 10808);
  });

  test('custom proxy requires a supported URL scheme', () {
    expect(
      () => parseProxySettings(AppSettings(
        proxyMode: 'custom',
        proxyUrl: 'ftp://127.0.0.1:21',
      )),
      throwsFormatException,
    );
  });
}
