import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/nai_models.dart';
import 'storage.dart';
import 'novelai_account_api.dart';

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
  String get loginMethodLabel => switch (method) {
        'relay' => '第三方中转独立 API Token',
        'official-login' => '官方邮箱密码登录',
        _ => '官方 API Token'
      };
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
      throw const FormatException('账号名称、类型或 API Token 无效');
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
        throw const FormatException('官方凭据只能使用固定官方地址；第三方 API Token 禁止发送至官方');
      }
    }
  }

  /// Accept a known raw operation URL as well as a provider's explicit prefix.
  static String normalizeBase(String input) {
    final trimmed = input.trim().replaceAll(RegExp(r'/+$'), '').replaceFirst(
        RegExp(
            r'/(ai/(generate-image(-stream)?|upscale|augment-image|encode-vibe)|user/(data|subscription))$'),
        '');
    return Uri.parse(trimmed).toString().replaceAll(RegExp(r'/+$'), '');
  }
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
  Map<String, AccountSummary> _summaries = {};
  AccountSummary cachedSummary(String? id, {bool stale = true}) =>
      _summaries[id]?.copyWith(stale: stale) ??
      AccountSummary(hasToken: id != null);
  String reveal(String id) =>
      _entries.firstWhere((e) => e.profile.id == id).token;
  String get nextLabel {
    var n = 1;
    final names = profiles.map((p) => p.label).toSet();
    while (names.contains('用户$n')) {
      n++;
    }
    return '用户$n';
  }

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
      final cached = j['summaries'];
      if (cached is Map) {
        for (final e in entries) {
          final v = cached[e.profile.id];
          if (v is Map) {
            _summaries[e.profile.id] = AccountSummary(
                hasToken: true,
                stale: true,
                tierName:
                    v['tierName'] is String ? v['tierName'] as String : null,
                tierLevel: v['tierLevel'] is int ? v['tierLevel'] as int : null,
                anlasBalance: v['anlasBalance'] is int && v['anlasBalance'] >= 0
                    ? v['anlasBalance'] as int
                    : null,
                expiresAt: v['expiresAt'] is String &&
                        RegExp(r'^\d{4}-\d{2}-\d{2}$')
                            .hasMatch(v['expiresAt'] as String)
                    ? v['expiresAt'] as String
                    : null,
                hasActiveSubscription: v['hasActiveSubscription'] == true);
          }
        }
      }
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
            label: '用户1',
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

  Future<void> _commit(List<NovelAiCredentialSnapshot> entries, String? id,
      {Map<String, AccountSummary>? summaries}) async {
    final cache = Map<String, AccountSummary>.from(summaries ?? _summaries)
      ..removeWhere((id, _) => !entries.any((e) => e.profile.id == id));
    await write(jsonEncode({
      'version': 1,
      'activeId': id,
      'summaries': cache.map((id, s) => MapEntry(id, {
            'tierName': s.tierName,
            'tierLevel': s.tierLevel,
            'anlasBalance': s.anlasBalance,
            if (s.expiresAt != null) 'expiresAt': s.expiresAt,
            'hasActiveSubscription': s.hasActiveSubscription == true
          })),
      'accounts':
          entries.map((e) => {...e.profile.toJson(), 'token': e.token}).toList()
    }));
    _entries = entries;
    _activeId = id;
    _summaries = cache;
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
        final duplicate = _duplicate(p, token);
        if (duplicate != null) return duplicate.profile;
        await _commit([..._entries, NovelAiCredentialSnapshot(p, token.trim())],
            _activeId);
        return p;
      });
  NovelAiCredentialSnapshot? _duplicate(NovelAiAccount p, String token) =>
      _entries
          .where((e) =>
              _identity(e.profile.apiBaseUrl) == _identity(p.apiBaseUrl) &&
              e.token == token.trim())
          .firstOrNull;

  String _identity(String base) {
    final u = Uri.parse(base.trim());
    return Uri(
            scheme: 'https',
            host: u.host.toLowerCase(),
            port: u.port == 443 ? null : u.port,
            path: u.path)
        .toString()
        .replaceAll(RegExp(r'/+$'), '');
  }

  AccountSummary _mergeVerifiedSummary(String id, AccountSummary fresh) {
    final previous = _summaries[id];
    return AccountSummary(
        hasToken: true,
        tierName: fresh.tierName ?? previous?.tierName,
        tierLevel: fresh.tierLevel ?? previous?.tierLevel,
        anlasBalance: fresh.anlasBalance ?? previous?.anlasBalance,
        expiresAt: fresh.expiresAt ?? previous?.expiresAt,
        hasActiveSubscription: fresh.hasActiveSubscription,
        opusUsage: fresh.opusUsage,
        opusUsageUpdatedAt: fresh.opusUsageUpdatedAt,
        stale: fresh.anlasBalance == null);
  }

  /// All production save paths use this verify-then-single-vault-commit operation.
  Future<NovelAiAccount> addVerified(
          {required String label,
          required String method,
          required String token,
          required Future<AccountSummary> Function(NovelAiCredentialSnapshot)
              verify,
          String apiBaseUrl = 'https://api.novelai.net',
          String imageBaseUrl = 'https://image.novelai.net'}) =>
      _change(() async {
        final api = NovelAiAccount.normalizeBase(apiBaseUrl);
        final image = NovelAiAccount.normalizeBase(
            imageBaseUrl.trim().isEmpty ? apiBaseUrl : imageBaseUrl);
        final p = NovelAiAccount(
            id: '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}',
            label: label.trim().isEmpty ? nextLabel : label.trim(),
            method: method,
            apiBaseUrl: api,
            imageBaseUrl: image);
        p.validate(token);
        final duplicate = _duplicate(p, token),
            snapshot = duplicate ?? NovelAiCredentialSnapshot(p, token.trim());
        final summary = await verify(snapshot);
        if (!summary.hasToken || summary.stale) {
          throw const FormatException('验证未通过，未保存账号');
        }
        final entries = duplicate == null ? [..._entries, snapshot] : _entries;
        await _commit(entries, snapshot.profile.id, summaries: {
          ..._summaries,
          snapshot.profile.id:
              _mergeVerifiedSummary(snapshot.profile.id, summary)
        });
        return snapshot.profile;
      });
  Future<void> rememberSummary(String id, AccountSummary summary) async {
    if (!_ready ||
        locked ||
        !_entries.any((e) => e.profile.id == id) ||
        summary.stale) return;
    _mutating = true;
    try {
      await _commit(_entries, _activeId,
          summaries: {..._summaries, id: _mergeVerifiedSummary(id, summary)});
    } finally {
      _mutating = false;
    }
  }

  Future<void> activate(String? id) => _change(() async {
        if (id != null && !_entries.any((e) => e.profile.id == id)) {
          throw StateError('Unknown account');
        }
        await _commit(_entries, id);
      });
  Future<void> remove(String id) => _change(() async {
        if (!_entries.any((e) => e.profile.id == id)) {
          throw StateError('Unknown account');
        }
        final remaining = _entries.where((e) => e.profile.id != id).toList();
        await _commit(remaining,
            id == _activeId ? remaining.firstOrNull?.profile.id : _activeId);
      });
  Future<T> operation<T>(
      Future<T> Function(NovelAiCredentialSnapshot snapshot) action,
      {String? expectedToken,
      String? profileId}) async {
    final inherited =
        Zone.current[_zone] as (NovelAiAccounts, NovelAiCredentialSnapshot)?;
    final snapshot = inherited?.$1 == this
        ? inherited!.$2
        : profileId == null
            ? active
            : _entries.where((e) => e.profile.id == profileId).firstOrNull;
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

  Map<String, dynamic> exportBackup() {
    if (!_ready) throw StateError('账号尚未加载');
    return parseBackup({
      'version': 1,
      'selectedId': _activeId,
      'accounts': _entries
          .map((e) => {
                ...e.profile.toJson(),
                'token': e.token,
                if (_summaries[e.profile.id] case final s?)
                  'accountSummary': {
                    if (s.tierName != null) 'tierName': s.tierName,
                    if (s.tierLevel != null) 'tierLevel': s.tierLevel,
                    if (s.anlasBalance != null) 'anlasBalance': s.anlasBalance,
                    if (s.expiresAt != null) 'expiresAt': s.expiresAt,
                    'hasActiveSubscription': s.hasActiveSubscription == true,
                  },
              })
          .toList(),
    });
  }

  static Map<String, dynamic> parseBackup(Object? value) {
    Never fail() =>
        throw const FormatException('Invalid portable NovelAI account backup');
    if (value is! Map ||
        jsonEncode(value).length > 4 * 1024 * 1024 ||
        value['version'] != 1 ||
        value.keys
            .any((k) => !['version', 'selectedId', 'accounts'].contains(k)) ||
        value['accounts'] is! List ||
        (value['accounts'] as List).length > 128 ||
        !(value['selectedId'] == null || value['selectedId'] is String)) fail();
    final ids = <String>{}, entries = <Map<String, dynamic>>[];
    for (final raw in value['accounts'] as List) {
      if (raw is! Map ||
          raw.keys.any((k) => ![
                'id',
                'label',
                'method',
                'apiBaseUrl',
                'imageBaseUrl',
                'token',
                'accountSummary'
              ].contains(k)) ||
          !['id', 'label', 'method', 'apiBaseUrl', 'imageBaseUrl', 'token']
              .every((k) => raw[k] is String) ||
          !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
              .hasMatch(raw['id'] as String) ||
          !ids.add(raw['id'] as String)) fail();
      final entry = Map<String, dynamic>.from(raw),
          p = NovelAiAccount.fromJson(entry);
      try {
        p.validate(entry['token'] as String);
      } catch (_) {
        fail();
      }
      if ([p.apiBaseUrl, p.imageBaseUrl].any((base) => base.length > 4096)) {
        fail();
      }
      final s = entry['accountSummary'];
      if (s != null &&
          (s is! Map ||
              s.keys.any((k) => ![
                    'tierName',
                    'tierLevel',
                    'anlasBalance',
                    'expiresAt',
                    'hasActiveSubscription'
                  ].contains(k)) ||
              (s['tierName'] != null &&
                  (s['tierName'] is! String ||
                      (s['tierName'] as String).length > 32)) ||
              ['tierLevel', 'anlasBalance'].any((k) =>
                  s[k] != null &&
                  (s[k] is! int || s[k] < 0 || s[k] > 9007199254740991)) ||
              (s['expiresAt'] != null &&
                  (s['expiresAt'] is! String ||
                      !RegExp(r'^\d{4}-\d{2}-\d{2}$')
                          .hasMatch(s['expiresAt'] as String))) ||
              (s['hasActiveSubscription'] != null &&
                  s['hasActiveSubscription'] is! bool))) fail();
      entries.add({
        ...entry,
        'label': p.label.trim(),
        'token': (entry['token'] as String).trim()
      });
    }
    if (value['selectedId'] != null && !ids.contains(value['selectedId'])) {
      fail();
    }
    return {
      'version': 1,
      'selectedId': value['selectedId'],
      'accounts': entries
    };
  }

  /// Prepare/read-only verify every account first, then perform one OS-vault write.
  Future<Future<void> Function()> prepareBackupRestore(Object? value,
      Future<AccountSummary> Function(NovelAiCredentialSnapshot) verify) async {
    final portable = parseBackup(value), expected = jsonEncode(exportBackup());
    if (locked || hostBusy?.call() == true) throw StateError('账号操作正在进行');
    final entries = List<NovelAiCredentialSnapshot>.from(_entries),
        summaries = Map<String, AccountSummary>.from(_summaries);
    final mapping = <String, String>{};
    for (final raw in portable['accounts'] as List) {
      final p = NovelAiAccount.fromJson(Map<String, dynamic>.from(raw as Map)),
          token = raw['token'] as String;
      final candidate = NovelAiCredentialSnapshot(p, token),
          fresh = await verify(candidate);
      if (!fresh.hasToken || fresh.stale) {
        throw const FormatException('验证未通过，未保存账号');
      }
      final duplicate = entries
          .where((e) =>
              _identity(e.profile.apiBaseUrl) == _identity(p.apiBaseUrl) &&
              e.token == token)
          .firstOrNull;
      final id = duplicate?.profile.id ??
          (entries.any((e) => e.profile.id == p.id)
              ? '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 32)}'
              : p.id);
      mapping[p.id] = id;
      if (duplicate == null) {
        entries.add(NovelAiCredentialSnapshot(
            NovelAiAccount(
                id: id,
                label: p.label,
                method: p.method,
                apiBaseUrl: p.apiBaseUrl,
                imageBaseUrl: p.imageBaseUrl),
            token));
      }
      final cached = raw['accountSummary'] as Map?;
      summaries[id] = AccountSummary(
          hasToken: true,
          stale: fresh.anlasBalance == null,
          tierName: fresh.tierName ??
              summaries[id]?.tierName ??
              cached?['tierName'] as String?,
          tierLevel: fresh.tierLevel ??
              summaries[id]?.tierLevel ??
              cached?['tierLevel'] as int?,
          anlasBalance: fresh.anlasBalance ??
              summaries[id]?.anlasBalance ??
              cached?['anlasBalance'] as int?,
          expiresAt: fresh.expiresAt ??
              summaries[id]?.expiresAt ??
              cached?['expiresAt'] as String?,
          hasActiveSubscription: p.relay ? false : fresh.hasActiveSubscription);
    }
    if (entries.length > 128) {
      throw const FormatException('Account backup exceeds saved account limit');
    }
    final selected = (portable['accounts'] as List).isEmpty
        ? _activeId
        : mapping[portable['selectedId']];
    return () => _change(() async {
          if (jsonEncode(exportBackup()) != expected) {
            throw StateError('Account vault changed during backup import');
          }
          if ((portable['accounts'] as List).isEmpty) return;
          await _commit(entries, selected, summaries: summaries);
        });
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
  Future<Map<String, dynamic>?> exportNovelAiAccountsBackup() async {
    await ready();
    return accounts.exportBackup();
  }

  Future<AccountSummary> verifyBackupAccount(
          NovelAiCredentialSnapshot snapshot, AppSettings settings) =>
      NovelAiAccountApi(accounts).verifyCandidate(snapshot, settings);
  @override
  Future<Future<void> Function()> prepareNovelAiAccountsRestore(
      Object? value) async {
    await ready();
    final settings = await getSettings();
    return accounts.prepareBackupRestore(
        value, (s) => verifyBackupAccount(s, settings));
  }

  @override
  Future<String?> getToken() async {
    await ready();
    return accounts.operationToken;
  }

  @override
  Future<void> setToken(String token) async {
    await ready();
    if (accounts.locked || accounts.hostBusy?.call() == true) {
      throw StateError('账号正在使用，未保存');
    }
    final settings = await getSettings();
    final api = NovelAiAccountApi(accounts);
    await accounts.addVerified(
        label: accounts.nextLabel,
        method: 'token',
        token: token,
        verify: (snapshot) => api.verifyCandidate(snapshot, settings));
  }

  @override
  Future<void> clearToken() async {
    await ready();
    await accounts.activate(null);
  }
}
