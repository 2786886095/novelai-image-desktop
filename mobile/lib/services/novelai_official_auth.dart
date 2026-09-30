import 'dart:async';
import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/nai_models.dart';
import 'novelai_bounded_http.dart';
import 'proxy_http_client.dart';
import 'storage.dart';

/// Reference: Aedial/novelai-api utils.py get_access_key, independently tested
/// against Python hashlib + hash-wasm Argon2id. This is NOT an official support claim.
Future<String> deriveNovelAiAccessKey(String email, String password) async {
  final prefix = String.fromCharCodes(password.runes.take(6));
  final salt = await Blake2b(hashLengthInBytes: 16)
      .hash(utf8.encode('$prefix${email}novelai_data_access_key'));
  final secret = SecretKey(utf8.encode(password));
  final key = await Argon2id(
          parallelism: 1, memory: 1953, iterations: 2, hashLength: 64)
      .deriveKey(secretKey: secret, nonce: salt.bytes);
  try {
    return base64UrlEncode(await key.extractBytes()).substring(0, 64);
  } finally {
    key.destroy();
    secret.destroy();
  }
}

Future<String> _derive(List<String> values) =>
    deriveNovelAiAccessKey(values[0], values[1]);

class NovelAiOfficialAuth {
  static final loginUri = Uri.parse('https://api.novelai.net/user/login');
  static const maxResponseBytes = 64 * 1024;
  static const maxTokenBytes = 16 * 1024;
  final FutureOr<http.Client> Function()? clientFactory;
  final FutureOr<AppSettings> Function() settingsProvider;
  final Duration timeout;
  NovelAiOfficialAuth(
      {this.clientFactory,
      FutureOr<AppSettings> Function()? settingsProvider,
      this.timeout = const Duration(seconds: 30)})
      : settingsProvider = settingsProvider ?? Storage().getSettings;
  Future<String> login(String email, String password) async {
    if (email.trim().isEmpty ||
        password.isEmpty ||
        utf8.encode(email).length > 1024 ||
        utf8.encode(password).length > 4096) {
      throw const FormatException('官方邮箱或密码为空或超出长度限制');
    }
    final clock = Stopwatch()..start();
    // One total deadline covers derivation, current settings, native proxy
    // resolution, async client opening, response headers and streamed bytes.
    try {
      final key = await compute(_derive, [email, password]).timeout(timeout);
      final remaining = timeout - clock.elapsed;
      if (remaining <= Duration.zero) throw TimeoutException('Login expired');
      final request = http.Request('POST', loginUri)
        ..headers['Content-Type'] = 'application/json'
        ..body = jsonEncode({'key': key});
      final response = await novelAiBoundedRequest(
          request: request,
          timeout: remaining,
          maxResponseBytes: maxResponseBytes,
          openClient: () async {
            if (clientFactory != null) return await clientFactory!();
            // Read the LIVE settings after derivation, not a constructor/UI copy.
            // Then freeze proxy policy for this operation. API/image base URLs
            // never select the authentication destination, even for a relay.
            final current = await settingsProvider();
            final snapshot =
                AppSettings.fromJson(jsonDecode(jsonEncode(current.toJson())));
            return createProxyHttpClientForUri(snapshot, loginUri,
                scope: ProxyScope.nai);
          });
      if (response.statusCode != 201 && response.statusCode != 200) {
        throw StateError(
            '官方登录失败（HTTP ${response.statusCode}）；若需二次验证，请使用官方 Persistent API Token');
      }
      Object? body;
      try {
        body = jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        throw StateError('官方登录响应格式无效；未保存凭据');
      }
      final json = body is Map ? body : null;
      if (json != null &&
          [
            'challenge',
            'mfa',
            'otp',
            'mfaRequired',
            'twoFactorRequired',
            'requiresTwoFactor'
          ].any((key) => json[key] != null && json[key] != false)) {
        throw StateError('官方要求二次验证；协议尚未验证，请使用 Persistent API Token');
      }
      final token = body is Map ? body['accessToken'] : null;
      if (token is! String ||
          token.isEmpty ||
          token.length > maxTokenBytes ||
          !RegExp(r'^[\x21-\x7e]+$').hasMatch(token)) {
        throw StateError('官方未返回访问凭据；二次验证流程尚未验证，请使用 Token');
      }
      return token;
    } on TimeoutException {
      throw StateError('官方登录超时；未保存凭据、未重试');
    } on http.ClientException {
      throw StateError('官方登录网络失败；未重试');
    }
  }
}
