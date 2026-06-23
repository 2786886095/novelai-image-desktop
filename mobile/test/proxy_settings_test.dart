import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';

void main() {
  test('default settings use a direct connection (mobile relies on system VPN)',
      () {
    final proxy = parseProxySettings(AppSettings());
    expect(proxy.kind, ProxyKind.direct);
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
