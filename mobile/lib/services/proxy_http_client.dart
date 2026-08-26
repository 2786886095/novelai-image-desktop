import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:flutter/services.dart';
import 'package:socks5_proxy/socks_client.dart';

import '../models/nai_models.dart';

enum ProxyKind { direct, http, socks5 }

enum ProxyScope { nai, mcp, ai, update, translate }

class ParsedProxy {
  final ProxyKind kind;
  final String host;
  final int port;
  final bool automatic;

  const ParsedProxy(this.kind,
      {this.host = '', this.port = 0, this.automatic = false});

  String get description => switch ((kind, automatic)) {
        (ProxyKind.direct, true) => 'Auto (system VPN/TUN)',
        (ProxyKind.http, true) => 'Auto HTTP $host:$port',
        (ProxyKind.socks5, true) => 'Auto SOCKS5 $host:$port',
        (ProxyKind.direct, false) => 'Direct',
        (ProxyKind.http, false) => 'HTTP $host:$port',
        (ProxyKind.socks5, false) => 'SOCKS5 $host:$port',
      };
}

const _networkChannel = MethodChannel('langbai.novelai/network');
String _resolvedSystemProxy = '';

Future<String> resolveSystemProxyRoute([
  String targetUrl = 'https://api.novelai.net',
]) async {
  try {
    return (await _networkChannel.invokeMethod<String>(
                'resolveProxy', targetUrl))
            ?.trim() ??
        '';
  } on MissingPluginException {
    return '';
  } on PlatformException {
    return '';
  }
}

/// Refresh the native OS proxy decision. Empty means DIRECT, which deliberately
/// leaves the socket to an Android/iOS VPN or TUN virtual adapter.
Future<void> refreshSystemProxyRoute([
  String targetUrl = 'https://api.novelai.net',
]) async {
  _resolvedSystemProxy = await resolveSystemProxyRoute(targetUrl);
}

void setResolvedSystemProxyForTesting(String value) {
  _resolvedSystemProxy = value.trim();
}

ParsedProxy parseProxySettings(
  AppSettings settings, {
  String? automaticProxy,
}) {
  final automatic = settings.proxyMode == 'auto';
  final resolvedAutomaticProxy = automaticProxy ?? _resolvedSystemProxy;
  if (automatic && resolvedAutomaticProxy.isEmpty) {
    return const ParsedProxy(ProxyKind.direct, automatic: true);
  }
  if (settings.proxyMode == 'direct') {
    return const ParsedProxy(ProxyKind.direct);
  }
  var mode = automatic ? 'custom' : settings.proxyMode;
  var value = automatic ? resolvedAutomaticProxy : settings.proxyUrl.trim();
  if (mode == 'http' && value.isEmpty) value = 'http://127.0.0.1:7890';
  if (mode == 'socks5' && value.isEmpty) value = 'socks5://127.0.0.1:10808';
  if (!value.contains('://')) {
    value = '${mode == 'socks5' ? 'socks5' : 'http'}://$value';
  }
  final uri = Uri.tryParse(value);
  if (uri == null || uri.host.isEmpty) {
    throw const FormatException('Invalid proxy address. Enter a host and port');
  }
  if (mode == 'custom') mode = uri.scheme.toLowerCase();
  final kind = switch (mode) {
    'http' || 'https' => ProxyKind.http,
    'socks5' || 'socks' => ProxyKind.socks5,
    _ => throw const FormatException(
        'Custom proxy only supports http:// or socks5://'),
  };
  final defaultPort = kind == ProxyKind.socks5 ? 1080 : 8080;
  final port = uri.hasPort ? uri.port : defaultPort;
  if (port < 1 || port > 65535) {
    throw const FormatException('Invalid proxy port');
  }
  return ParsedProxy(kind, host: uri.host, port: port, automatic: automatic);
}

http.Client createProxyHttpClient(
  AppSettings settings, {
  ProxyScope? scope,
  String? automaticProxy,
}) {
  final enabled = proxyEnabledForScope(settings, scope);
  final proxy = enabled
      ? parseProxySettings(settings, automaticProxy: automaticProxy)
      : const ParsedProxy(ProxyKind.direct);
  final ioClient = HttpClient()..idleTimeout = const Duration(seconds: 20);
  if (proxy.kind == ProxyKind.http) {
    ioClient.findProxy = (_) => 'PROXY ${proxy.host}:${proxy.port}';
  } else if (proxy.kind == ProxyKind.socks5) {
    final address = InternetAddress.tryParse(proxy.host);
    if (address == null) {
      ioClient.close(force: true);
      throw const FormatException(
          'SOCKS5 proxy address must be an IPv4 or IPv6 address');
    }
    SocksTCPClient.assignToHttpClient(
      ioClient,
      [ProxySettings(address, proxy.port)],
    );
  }
  return IOClient(ioClient);
}

Future<http.Client> createProxyHttpClientForUri(
  AppSettings settings,
  Uri uri, {
  ProxyScope? scope,
}) async {
  final enabled = proxyEnabledForScope(settings, scope);
  final automaticProxy = enabled && settings.proxyMode == 'auto'
      ? await resolveSystemProxyRoute(uri.toString())
      : null;
  return createProxyHttpClient(
    settings,
    scope: scope,
    automaticProxy: automaticProxy,
  );
}

bool isRetryableNetworkError(Object error) =>
    error is SocketException ||
    error is HandshakeException ||
    error is HttpException ||
    error is TimeoutException ||
    error is http.ClientException;

Future<http.Response> getWithSafeNetworkRetry(
  AppSettings settings,
  Uri uri, {
  ProxyScope? scope,
  Map<String, String>? headers,
  Duration timeout = const Duration(seconds: 15),
  int attempts = 3,
}) async {
  Object? lastError;
  final safeAttempts = attempts.clamp(1, 5);
  for (var attempt = 0; attempt < safeAttempts; attempt++) {
    final client = await createProxyHttpClientForUri(
      settings,
      uri,
      scope: scope,
    );
    try {
      final response = await client.get(uri, headers: headers).timeout(timeout);
      final retryableStatus = response.statusCode == 502 ||
          response.statusCode == 503 ||
          response.statusCode == 504;
      if (!retryableStatus) return response;
      lastError = HttpException('HTTP ${response.statusCode}', uri: uri);
      if (attempt + 1 >= safeAttempts) throw lastError;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt + 1 >= safeAttempts) {
        rethrow;
      }
    } finally {
      client.close();
    }
    await Future.delayed(Duration(milliseconds: 250 * (1 << attempt)));
  }
  throw lastError ?? const SocketException('Network request failed');
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
  final stopwatch = Stopwatch()..start();
  for (final uri in [
    Uri.parse('https://api.novelai.net/user/information'),
    Uri.parse('https://image.novelai.net/user/data'),
  ]) {
    final response = await getWithSafeNetworkRetry(
      settings,
      uri,
      scope: ProxyScope.nai,
      timeout: const Duration(seconds: 12),
    );
    if (response.statusCode >= 500) {
      throw HttpException('NovelAI returned HTTP ${response.statusCode}');
    }
  }
  stopwatch.stop();
  final description = settings.proxyMode == 'auto'
      ? 'Auto per URL (system proxy/VPN)'
      : parseProxySettings(settings).description;
  return '$description connected, ${stopwatch.elapsedMilliseconds} ms';
}
