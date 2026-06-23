import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:socks5_proxy/socks_client.dart';

import '../models/nai_models.dart';

enum ProxyKind { direct, http, socks5 }

enum ProxyScope { nai, mcp, ai, update, translate }

class ParsedProxy {
  final ProxyKind kind;
  final String host;
  final int port;

  const ParsedProxy(this.kind, {this.host = '', this.port = 0});

  String get description => switch (kind) {
        ProxyKind.direct => '直连',
        ProxyKind.http => 'HTTP $host:$port',
        ProxyKind.socks5 => 'SOCKS5 $host:$port',
      };
}

ParsedProxy parseProxySettings(AppSettings settings) {
  if (settings.proxyMode == 'direct') {
    return const ParsedProxy(ProxyKind.direct);
  }
  var mode = settings.proxyMode;
  var value = settings.proxyUrl.trim();
  if (mode == 'http' && value.isEmpty) value = 'http://127.0.0.1:7890';
  if (mode == 'socks5' && value.isEmpty) value = 'socks5://127.0.0.1:10808';
  if (!value.contains('://')) {
    value = '${mode == 'socks5' ? 'socks5' : 'http'}://$value';
  }
  final uri = Uri.tryParse(value);
  if (uri == null || uri.host.isEmpty) {
    throw const FormatException('代理地址无效，请填写完整的主机和端口');
  }
  if (mode == 'custom') mode = uri.scheme.toLowerCase();
  final kind = switch (mode) {
    'http' || 'https' => ProxyKind.http,
    'socks5' || 'socks' => ProxyKind.socks5,
    _ => throw const FormatException('自定义代理只支持 http:// 或 socks5://'),
  };
  final defaultPort = kind == ProxyKind.socks5 ? 1080 : 8080;
  final port = uri.hasPort ? uri.port : defaultPort;
  if (port < 1 || port > 65535) throw const FormatException('代理端口无效');
  return ParsedProxy(kind, host: uri.host, port: port);
}

http.Client createProxyHttpClient(
  AppSettings settings, {
  ProxyScope? scope,
}) {
  final enabled = proxyEnabledForScope(settings, scope);
  final proxy = enabled
      ? parseProxySettings(settings)
      : const ParsedProxy(ProxyKind.direct);
  final ioClient = HttpClient()..idleTimeout = const Duration(seconds: 20);
  if (proxy.kind == ProxyKind.http) {
    ioClient.findProxy = (_) => 'PROXY ${proxy.host}:${proxy.port}';
  } else if (proxy.kind == ProxyKind.socks5) {
    final address = InternetAddress.tryParse(proxy.host);
    if (address == null) {
      ioClient.close(force: true);
      throw const FormatException('SOCKS5 代理地址请使用 IPv4 或 IPv6 地址');
    }
    SocksTCPClient.assignToHttpClient(
      ioClient,
      [ProxySettings(address, proxy.port)],
    );
  }
  return IOClient(ioClient);
}

bool proxyEnabledForScope(AppSettings settings, ProxyScope? scope) =>
    switch (scope) {
      ProxyScope.nai => settings.proxyForNai,
      ProxyScope.mcp => settings.proxyForMcp,
      ProxyScope.ai => settings.proxyForAi,
      ProxyScope.update => settings.proxyForUpdate,
      ProxyScope.translate => settings.proxyForTranslate,
      null => true,
    };

Future<String> testProxyConnection(AppSettings settings) async {
  final parsed = parseProxySettings(settings);
  final client = createProxyHttpClient(settings);
  try {
    final stopwatch = Stopwatch()..start();
    final response = await client
        .get(Uri.parse('https://api.novelai.net/user/information'))
        .timeout(const Duration(seconds: 12));
    stopwatch.stop();
    if (response.statusCode >= 500) {
      throw HttpException('NovelAI 返回 HTTP ${response.statusCode}');
    }
    return '${parsed.description}连接成功，${stopwatch.elapsedMilliseconds} ms';
  } finally {
    client.close();
  }
}
