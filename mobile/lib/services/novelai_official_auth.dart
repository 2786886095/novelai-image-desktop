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

/// Safe, local category and actual status only; no remote response/credential.
class NovelAiOfficialAuthFailure extends StateError {
  final String code;
  final int? status;
  NovelAiOfficialAuthFailure(this.code, String message, {this.status})
      : super(message);
}

class NovelAiOfficialAuth {
  // Official user routes use the image host; never the selected relay address.
  static final loginUri = Uri.parse('https://image.novelai.net/user/login');
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
          bodyStatuses: const {200, 201, 400, 401, 403, 429},
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
      Object? body;
      try {
        body = jsonDecode(utf8.decode(response.bodyBytes));
      } catch (_) {
        if (response.statusCode == 403 &&
            RegExp(r'<html|cloudflare|captcha', caseSensitive: false)
                .hasMatch(utf8.decode(response.bodyBytes, allowMalformed: true))) {
          throw NovelAiOfficialAuthFailure('challenge',
              '官方要求网页安全验证；请在官网完成验证或使用 API Token。未保存账号',
              status: 403);
        }
      }
      final json = body is Map ? body : null;
      if (response.statusCode == 429) {
        throw NovelAiOfficialAuthFailure('rate-limited', '官方暂时限制登录频率；未重试、未保存账号',
            status: 429);
      }
      if ((json != null &&
          [
            'mfa',
            'otp',
            'otpRequired',
            'mfaRequired',
            'twoFactorRequired',
            'requiresTwoFactor'
          ].any((key) => json[key] != null && json[key] != false)) ||
          RegExp(r'otp|two.factor|2fa', caseSensitive: false)
              .hasMatch((json?['message'] ?? json?['error'] ?? '').toString())) {
        throw NovelAiOfficialAuthFailure('otp-unsupported',
            '官方要求二次验证；协议尚未验证，请使用 Persistent API Token',
            status: response.statusCode);
      }
      if (['challenge', 'captcha']
          .any((key) => json?[key] != null && json?[key] != false)) {
        throw NovelAiOfficialAuthFailure('challenge',
            '官方要求网页安全验证；请在官网完成验证或使用 API Token。未保存账号',
            status: response.statusCode);
      }
      if (response.statusCode != 201 && response.statusCode != 200) {
        throw NovelAiOfficialAuthFailure('auth',
            '官方拒绝本次登录（HTTP ${response.statusCode}）；请核对官网登录与账号信息，未保存账号',
            status: response.statusCode);
      }
      final token = body is Map ? body['accessToken'] : null;
      if (token is! String ||
          token.isEmpty ||
          token.length > maxTokenBytes ||
          !RegExp(r'^[\x21-\x7e]+$').hasMatch(token)) {
        throw NovelAiOfficialAuthFailure('invalid-response',
            '官方未返回有效登录凭据；未保存账号', status: response.statusCode);
      }
      return token;
    } on TimeoutException {
      throw NovelAiOfficialAuthFailure('network', '官方登录超时；未保存凭据、未重试');
    } on http.ClientException {
      throw NovelAiOfficialAuthFailure('network', '官方登录网络失败；未重试');
    }
  }
}
