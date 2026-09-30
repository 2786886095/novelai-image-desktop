import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/nai_models.dart';
import 'storage.dart';

/// Version 1 mirrors src/nai-accounts.ts. Secrets never enter profile JSON.
class NovelAiAccount {
  final String id, label, method, apiBaseUrl, imageBaseUrl;
  const NovelAiAccount(
      {required this.id,
      required this.label,
      required this.method,
      this.apiBaseUrl = 'https://api.novelai.net',
      this.imageBaseUrl = 'https://image.novelai.net'});
  bool get relay => method == 'relay';
  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'method': method,
        'apiBaseUrl': apiBaseUrl,
        'imageBaseUrl': imageBaseUrl
      };
  factory NovelAiAccount.fromJson(Map<String, dynamic> j) => NovelAiAccount(
      id: j['id'] as String,
      label: j['label'] as String,
      method: j['method'] as String,
      apiBaseUrl: j['apiBaseUrl'] as String,
      imageBaseUrl: j['imageBaseUrl'] as String);
  void validate(String token) {
    if (id.isEmpty ||
        label.trim().isEmpty ||
        label.length > 120 ||
        !['token', 'official-login', 'relay'].contains(method) ||
        token.trim().isEmpty ||
        token.length > 16384 ||
        RegExp(r'[\r\n]').hasMatch(token)) {
      throw const FormatException('账号名称、类型或 Token 无效');
    }
    for (final pair in [
      (apiBaseUrl, 'api.novelai.net'),
      (imageBaseUrl, 'image.novelai.net')
    ]) {
      final u = Uri.parse(pair.$1);
      if (u.scheme != 'https' ||
          u.host.isEmpty ||
          u.userInfo.isNotEmpty ||
          u.hasQuery ||
          u.hasFragment ||
          u.path.contains('\\') ||
          RegExp(r'/(dashboard|login)(/|$)', caseSensitive: false)
              .hasMatch(u.path) ||
          u.pathSegments.any((s) => s == '..' || s == '.')) {
        throw const FormatException('请输入明确的 HTTPS API 前缀，不是登录页或控制台');
      }
      final official =
          u.host == 'novelai.net' || u.host.endsWith('.novelai.net');
      if (relay
          ? official
          : (u.host != pair.$2 ||
              u.port != 443 ||
              (u.path != '' && u.path != '/'))) {
        throw const FormatException('官方凭据只能使用固定官方地址；第三方 Token 禁止发送至官方');
      }
    }
  }

  /// Accept a known raw operation URL as well as a provider's explicit prefix.
  static String normalizeBase(String input) =>
      input.trim().replaceAll(RegExp(r'/+$'), '').replaceFirst(
          RegExp(
              r'/(ai/(generate-image(-stream)?|upscale|augment-image|encode-vibe)|user/(data|subscription))$'),
          '');
}

class NovelAiCredentialSnapshot {
  final NovelAiAccount profile;
  final String token;
  const NovelAiCredentialSnapshot(this.profile, this.token);
  AppSettings settings(AppSettings source) =>
      AppSettings.fromJson(jsonDecode(jsonEncode(source.toJson())))
        ..apiBaseUrl = profile.apiBaseUrl
        ..imageBaseUrl = profile.imageBaseUrl
        ..allowCustomEndpoint = profile.relay
        ..allowCustomEndpointFallback = false;
  Uri imageRoute(String route) =>
      Uri.parse('${profile.imageBaseUrl.replaceAll(RegExp(r'/+$'), '')}$route');
}

/// One OS-vault document is the commit point, including the active id. No
/// plaintext preferences, password, derived key, or overwrite of nai_token.
class NovelAiAccounts {
  static final shared = NovelAiAccounts();
  static const vaultKey = 'nai_accounts_v1';
  final Future<String?> Function() read;
  final Future<void> Function(String) write;
  NovelAiAccounts(
      {Future<String?> Function()? read, Future<void> Function(String)? write})
      : read = read ?? (() => const FlutterSecureStorage().read(key: vaultKey)),
        write = write ??
            ((v) =>
                const FlutterSecureStorage().write(key: vaultKey, value: v));
  List<NovelAiCredentialSnapshot> _entries = [];
  String? _activeId;
  bool _ready = false, _mutating = false;
  bool Function()? hostBusy;
  void Function()? onCommitted;
  int _leases = 0;
  Future<void>? _loading;
  static final _zone = Object();
  bool get locked => _mutating || _leases > 0;
  List<NovelAiAccount> get profiles =>
      List.unmodifiable(_entries.map((e) => e.profile));
  NovelAiCredentialSnapshot? get active =>
      _entries.where((e) => e.profile.id == _activeId).firstOrNull;
  Future<void> load(
      {required Future<String?> Function() legacyToken,
      required Future<AppSettings> Function() legacySettings}) {
    if (_ready) return Future.value();
    return _loading ??=
        _load(legacyToken, legacySettings).whenComplete(() => _loading = null);
  }

  Future<void> _load(Future<String?> Function() legacyToken,
      Future<AppSettings> Function() legacySettings) async {
    final raw = await read();
    if (raw != null) {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      if (j['version'] != 1) {
        throw const FormatException('Unsupported account vault');
      }
      final entries = (j['accounts'] as List).map((v) {
        final p = NovelAiAccount.fromJson(Map<String, dynamic>.from(v as Map));
        final token = v['token'] as String;
        p.validate(token);
        return NovelAiCredentialSnapshot(p, token);
      }).toList();
      if (entries.map((e) => e.profile.id).toSet().length != entries.length ||
          (j['activeId'] != null &&
              !entries.any((e) => e.profile.id == j['activeId']))) {
        throw const FormatException('Invalid account vault identity');
      }
      _entries = entries;
      _activeId = j['activeId'] as String?;
    } else {
      final token = await legacyToken();
      if (token != null && token.trim().isNotEmpty) {
        final s = await legacySettings();
        final image = NovelAiAccount.normalizeBase(s.imageBaseUrl);
        final apiHost = Uri.tryParse(s.apiBaseUrl)?.host;
        final apiOfficial = apiHost == 'novelai.net' ||
            apiHost?.endsWith('.novelai.net') == true;
        final relay = s.allowCustomEndpoint &&
            Uri.tryParse(image)?.host != 'image.novelai.net';
        final p = NovelAiAccount(
            id: 'legacy-v1',
            label: '原有账号（保留旧凭据）',
            method: relay ? 'relay' : 'token',
            // A legacy relay may have left the unused API slot at the official
            // default. Never move its token to that host during migration.
            apiBaseUrl: relay
                ? (apiOfficial
                    ? image
                    : NovelAiAccount.normalizeBase(s.apiBaseUrl))
                : 'https://api.novelai.net',
            imageBaseUrl: relay ? image : 'https://image.novelai.net');
        p.validate(token);
        await _commit([NovelAiCredentialSnapshot(p, token.trim())], p.id);
      } else {
        await _commit([], null);
      }
    }
    _ready = true;
  }

  Future<void> _commit(
      List<NovelAiCredentialSnapshot> entries, String? id) async {
    await write(jsonEncode({
      'version': 1,
      'activeId': id,
      'accounts':
          entries.map((e) => {...e.profile.toJson(), 'token': e.token}).toList()
    }));
    _entries = entries;
    _activeId = id;
    onCommitted?.call();
  }

  Future<T> _change<T>(Future<T> Function() action) async {
    if (!_ready || locked || hostBusy?.call() == true) {
      throw StateError('账号操作正在进行，请等待任务完成');
    }
    _mutating = true;
    try {
      return await action();
    } finally {
      _mutating = false;
    }
  }

  Future<NovelAiAccount> add(
          {required String label,
          required String method,
          required String token,
          String apiBaseUrl = 'https://api.novelai.net',
          String imageBaseUrl = 'https://image.novelai.net'}) =>
      _change(() async {
        final p = NovelAiAccount(
            id: '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}',
            label: label.trim(),
            method: method,
            apiBaseUrl: NovelAiAccount.normalizeBase(apiBaseUrl),
            imageBaseUrl: NovelAiAccount.normalizeBase(imageBaseUrl));
        p.validate(token);
        await _commit([..._entries, NovelAiCredentialSnapshot(p, token.trim())],
            _activeId);
        return p;
      });
  Future<void> activate(String? id) => _change(() async {
        if (id != null && !_entries.any((e) => e.profile.id == id)) {
          throw StateError('Unknown account');
        }
        await _commit(_entries, id);
      });
  Future<void> remove(String id) => _change(() => _commit(
      _entries.where((e) => e.profile.id != id).toList(),
      id == _activeId ? null : _activeId));
  Future<T> operation<T>(
      Future<T> Function(NovelAiCredentialSnapshot snapshot) action,
      {String? expectedToken}) async {
    final inherited =
        Zone.current[_zone] as (NovelAiAccounts, NovelAiCredentialSnapshot)?;
    final snapshot = inherited?.$1 == this ? inherited!.$2 : active;
    if (_mutating ||
        !_ready ||
        snapshot == null ||
        (expectedToken != null && expectedToken != snapshot.token)) {
      throw StateError('账号已变化或未激活，未提交请求');
    }
    _leases++;
    try {
      return await runZoned(() => action(snapshot),
          zoneValues: {_zone: (this, snapshot)});
    } finally {
      _leases--;
    }
  }

  String? get operationToken {
    final inherited =
        Zone.current[_zone] as (NovelAiAccounts, NovelAiCredentialSnapshot)?;
    return inherited?.$1 == this ? inherited!.$2.token : active?.token;
  }
}

/// Uses the existing Storage service for every other credential and all data.
class NovelAiAccountStorage extends Storage {
  final NovelAiAccounts accounts;
  NovelAiAccountStorage(this.accounts);
  Future<void> ready() => accounts.load(
      legacyToken: super.getToken, legacySettings: super.getSettings);
  @override
  Future<String?> getToken() async {
    await ready();
    return accounts.operationToken;
  }

  @override
  Future<void> setToken(String token) async {
    await ready();
    final p = await accounts.add(
        label: 'NovelAI Token', method: 'token', token: token);
    await accounts.activate(p.id);
  }

  @override
  Future<void> clearToken() async {
    await ready();
    await accounts.activate(null);
  }
}
