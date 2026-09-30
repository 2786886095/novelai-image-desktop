import 'dart:convert';
import 'dart:async';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import '../models/nai_models.dart';
import '../services/proxy_http_client.dart';
import '../services/openai_images.dart';
import '../state/app_state.dart';
import 'api_catalog.dart';

String validateApiUrl(dynamic value) {
  if (value is! String ||
      value.length > 2048 ||
      value != value.trim() ||
      RegExp(r'[\s\\]').hasMatch(value)) throw StateError('API 地址格式无效');
  final uri = Uri.tryParse(value);
  if (uri == null ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      (uri.scheme != 'https' &&
          !(uri.scheme == 'http' &&
              ['localhost', '127.0.0.1', '::1'].contains(uri.host)))) {
    throw StateError('使用 HTTPS 地址（本机允许 HTTP），地址不要包含密钥、查询参数或账号密码');
  }
  return value.replaceFirst(RegExp(r'/$'), '');
}

class AgentApiTools {
  final AppState app;
  final DateTime Function() clock;
  final Future<http.Client> Function(Uri)? clientFactory;
  final Duration connectionTimeout;
  final _pending = <String, Map<String, dynamic>>{};
  AgentApiTools(this.app,
      {DateTime Function()? clock,
      this.clientFactory,
      this.connectionTimeout = const Duration(seconds: 20)})
      : clock = clock ?? DateTime.now;
  void close() => _pending.clear();
  List<String> get profiles =>
      apiProfiles.keys.where((p) => apiProfiles[p]['mobile'] == true).toList();
  Future<String> _secret(String p) async =>
      (await switch (p) {
        'novelai' => app.storage.getToken(),
        'reverse' => app.storage.getVisionKey(),
        'convert' => app.storage.getConvertKey(),
        'agent' => app.storage.getAgentApiKey(),
        'tags' => app.storage.getTagKey(),
        _ => Future<String?>.value('')
      }) ??
      '';
  Future<void> _saveSecret(String p, String value) async {
    switch (p) {
      case 'novelai':
        if (value.isEmpty) {
          await app.clearToken();
        } else {
          await app.storage.setToken(value);
          app.account = const AccountSummary(hasToken: true);
          app.markChanged();
        }
        break;
      case 'reverse':
        await app.storage.setVisionKey(value);
        break;
      case 'convert':
        await app.storage.setConvertKey(value);
        break;
      case 'agent':
        await app.storage.setAgentApiKey(value);
        break;
      case 'tags':
        await app.storage.setTagKey(value);
        break;
      default:
        throw StateError('API 分类无效');
    }
  }

  Future<Map<String, dynamic>> _read(String p) async {
    if (p == 'compatible-image') return app.storage.readCompatibleApiState();
    final settings = (await app.storage.getSettings()).toJson(),
        fields = apiProfiles[p]['fields'] as Map;
    return {
      'config': {for (final k in fields.keys) k: settings[fields[k]['key']]},
      'secret': await _secret(p)
    };
  }

  Future<void> _writeImage(Map<String, dynamic> before,
      Map<String, dynamic> config, String key) async {
    try {
      final next =
          await app.storage.writeCompatibleApiState(before, config, key);
      app.settings.compatibleImage = next.compatibleImage;
      app.settings.imageProvider = next.imageProvider;
      app.generationQuote = null;
      app.markChanged();
    } catch (_) {
      throw StateError('图片 API 配置保存未完成，请重新读取状态；未切换到其他收费服务');
    }
  }

  String _revision(Map<String, dynamic> s) =>
      sha256.convert(utf8.encode(jsonEncode(s))).toString();
  Map<String, dynamic> _public(String p, Map<String, dynamic> state) {
    final config = Map<String, dynamic>.from(state['config']);
    for (final k in config.keys.toList()) {
      if (apiProfiles[p]['fields'][k]['type'] == 'url') {
        try {
          config[k] = validateApiUrl(config[k]);
        } catch (_) {
          config[k] = '地址格式需在软件中修正';
        }
      }
    }
    return {
      'profile': p,
      'title': apiProfiles[p]['title'],
      'config': config,
      'revision': _revision(state),
      'credentialConfigured': (state['secret'] as String).isNotEmpty,
      'editableFields': apiProfiles[p]['fields']
    };
  }

  void _validate(Map<String, dynamic> args) {
    final a = args['action'], p = args['profile'];
    if (!['read', 'configure', 'credential', 'clearCredential', 'test']
        .contains(a)) throw StateError('API 操作无效');
    if (p != null && !profiles.contains(p)) {
      throw StateError('本平台没有这个独立 API 配置');
    }
    if (a != 'read' && p == null) throw StateError('请选择 API 分类');
    final allowed = [
      'action',
      'profile',
      if (['configure', 'credential', 'clearCredential'].contains(a))
        'expectedRevision',
      if (a == 'configure') 'patch'
    ];
    if (args.keys.any((k) => !allowed.contains(k))) {
      throw StateError('未知 API 参数；密钥请在 Agent 的私密输入框填写');
    }
    if (['configure', 'credential', 'clearCredential'].contains(a) &&
        (args['expectedRevision'] is! String ||
            (args['expectedRevision'] as String).isEmpty)) {
      throw StateError('请先读取 API 配置');
    }
    if (a == 'configure') {
      final patch = args['patch'];
      if (patch is! Map || patch.isEmpty) throw StateError('请选择要修改的配置');
      for (final key in patch.keys) {
        final rule = apiProfiles[p]['fields'][key], v = patch[key];
        if (rule == null) throw StateError('未知 API 字段');
        if (rule['type'] == 'boolean') {
          if (v is! bool) throw StateError('开关值无效');
        } else if (rule['type'] == 'json') {
          if (v is! Map || jsonEncode(v).length > 16384) {
            throw StateError('扩展参数须为不超过 16 KiB 的对象');
          }
          for (final entry in v.entries) {
            final name = entry.key, value = entry.value;
            if (['negative_prompt', 'sampler'].contains(name)) {
              if (value is! String ||
                  value.length > 12000 ||
                  value.contains('\x00')) throw StateError('扩展参数类型无效');
            } else if (['steps', 'scale', 'seed'].contains(name)) {
              if (value is! num ||
                  !value.isFinite ||
                  name != 'scale' &&
                      (value != value.truncateToDouble() ||
                          value.abs() > 9007199254740991)) {
                throw StateError('扩展参数数值无效');
              }
            } else {
              throw StateError('未支持的网关扩展字段');
            }
          }
        } else if (rule['type'] == 'url') {
          validateApiUrl(v);
        } else if (v is! String ||
            v.trim().isEmpty ||
            v.length > 200 ||
            RegExp(r'[\r\n\x00]').hasMatch(v) ||
            (rule['values'] != null && !(rule['values'] as List).contains(v))) {
          throw StateError('API 字段值无效');
        }
        if (p == 'compatible-image' &&
            key == 'size' &&
            v != 'auto' &&
            !(v is String &&
                RegExp(r'^[1-9]\d{0,4}x[1-9]\d{0,4}$').hasMatch(v))) {
          throw StateError('尺寸应为 WIDTHxHEIGHT 或 auto');
        }
      }
    }
  }

  String _session(String s) {
    if (!RegExp(r'^[a-zA-Z0-9_.:-]{1,160}$').hasMatch(s) ||
        s == 'studio-library-ui') throw StateError('请先选择酒馆会话');
    return s;
  }

  Future<Map<String, dynamic>> approvalSummary(
      Map<String, dynamic> args) async {
    _validate(args);
    final p = args['profile'] as String, before = await _read(p);
    if (args['expectedRevision'] != _revision(before)) {
      throw StateError('API 配置已变化，请重新读取');
    }
    return {
      'profile': p,
      '名称': apiProfiles[p]['title'],
      'action': args['action'],
      '修改': args['patch'] ?? {},
      '说明': args['action'] == 'clearCredential'
          ? '清除本机代管凭据；后续相关服务需要重新填写。'
          : '修改保存的 API 配置；现有凭据将用于所示新地址。只影响后续请求，不会生成图片。'
    };
  }

  Future<dynamic> execute(
      String tool, Map<String, dynamic> args, String session) async {
    if (tool == 'studio_api_input' || tool == 'studio_resolve_api_input') {
      final sid = _session(session);
      var item = _pending[sid];
      if (item != null && item['expires'] < clock().millisecondsSinceEpoch) {
        _pending.remove(sid);
        item = null;
      }
      if (tool == 'studio_api_input') {
        return item == null
            ? null
            : {
                'id': item['id'],
                'profile': item['profile'],
                'title': apiProfiles[item['profile']]['title'],
                'expires': item['expires']
              };
      }
      if (args.keys
          .any((k) => !['sessionId', 'id', 'value', 'cancel'].contains(k))) {
        throw StateError('私密输入参数无效');
      }
      if (item == null || args['id'] != item['id']) {
        throw StateError('输入已过期或不属于当前会话');
      }
      if (args['cancel'] == true) {
        _pending.remove(sid);
        return {'cancelled': true};
      }
      final value = args['value'];
      if (value is! String ||
          value.trim().isEmpty ||
          value.length > 8192 ||
          RegExp(r'[\r\n\x00]').hasMatch(value)) throw StateError('请输入有效密钥');
      _pending.remove(
          sid); // Claim before the first await; duplicate UI submits cannot save twice.
      final p = item['profile'] as String, before = await _read(p);
      if (_revision(before) != item['revision']) {
        _pending.remove(sid);
        throw StateError('配置已变化，请重新发起私密输入');
      }
      try {
        if (p == 'compatible-image') {
          await _writeImage(before,
              Map<String, dynamic>.from(before['config'] as Map), value.trim());
        } else {
          await _saveSecret(p, value.trim());
        }
      } catch (_) {
        throw StateError('密钥保存未完成；请查看配置状态后再操作');
      }
      final after = await _read(p);
      if (after['secret'] != value.trim()) throw StateError('密钥保存回读不符');
      return {
        'saved': true,
        'profile': p,
        'credentialConfigured': true,
        'revision': _revision(after)
      };
    }
    if (tool != 'langbai_api') throw StateError('API 工具无效');
    _validate(args);
    final a = args['action'], p = args['profile'] as String?;
    if (a == 'read') {
      final snapshots = await Future.wait((p == null ? profiles : [p])
          .map((p) async => _public(p, await _read(p))));
      return {
        'profiles': snapshots,
        if (p != null) ...snapshots.single,
        'instructions':
            'configure 修改接口/模型；credential 打开会话内私密输入；test 只检查已保存地址，不创建收费对话。Android AI 翻译复用提示词转换 API。不要把密钥写进聊天。'
      };
    }
    final profile = p!, before = await _read(profile);
    if (a == 'test') return _test(profile, before);
    if (args['expectedRevision'] != _revision(before)) {
      throw StateError('API 配置已变化，请重新读取');
    }
    if (a == 'credential') {
      final sid = _session(session);
      _pending
          .removeWhere((k, v) => v['expires'] < clock().millisecondsSinceEpoch);
      if (_pending.containsKey(sid)) throw StateError('当前会话已有私密输入请求');
      if (_pending.length >= 20) throw StateError('待填写请求过多，请完成或取消已有请求');
      _pending[sid] = {
        'id': List.generate(
            24,
            (_) => Random.secure()
                .nextInt(256)
                .toRadixString(16)
                .padLeft(2, '0')).join(),
        'profile': profile,
        'revision': _revision(before),
        'expires': clock().millisecondsSinceEpoch + 300000
      };
      return {
        'awaitingUserInput': true,
        'profile': profile,
        'instructions': '在当前 Agent 会话的私密输入框填写密钥；不要在聊天回复密钥。保存后调用 read 查看已配置状态。'
      };
    }
    if (app.busy || app.generationQueueRunning) {
      throw StateError('相关任务正在运行，请停止或等待完成后修改 API');
    }
    if (profile == 'compatible-image') {
      await _writeImage(
          before,
          {
            ...Map<String, dynamic>.from(before['config'] as Map),
            ...Map<String, dynamic>.from(args['patch'] as Map? ?? {})
          },
          a == 'clearCredential' ? '' : before['secret'] as String);
    } else if (a == 'clearCredential') {
      await _saveSecret(profile, '');
    } else {
      final latest = await app.storage.getSettings();
      if (_revision(await _read(profile)) != args['expectedRevision']) {
        throw StateError('保存前 API 配置已变化');
      }
      final raw = latest.toJson(), fields = apiProfiles[profile]['fields'];
      for (final k in (args['patch'] as Map).keys) {
        raw[fields[k]['key']] = args['patch'][k];
      }
      final next = AppSettings.fromJson(raw);
      await app.storage.setSettings(next);
      // Refresh only changed fields; keep every live unrelated setting and draft.
      final live = app.settings.toJson();
      for (final k in (args['patch'] as Map).keys) {
        live[fields[k]['key']] = raw[fields[k]['key']];
      }
      app.settings = AppSettings.fromJson(live);
      app.markChanged();
    }
    final after = await _read(profile);
    if (a == 'clearCredential'
        ? (after['secret'] as String).isNotEmpty
        : (args['patch'] as Map).keys.any((k) =>
            jsonEncode(after['config'][k]) != jsonEncode(args['patch'][k]))) {
      throw StateError('保存后回读不符，请重新读取，不要重复执行');
    }
    return {'saved': true, ..._public(profile, after)};
  }

  Future<Map<String, dynamic>> _test(
      String p, Map<String, dynamic> state) async {
    final config = state['config'] as Map,
        base = validateApiUrl(config['baseUrl']),
        secret = state['secret'] as String,
        protocol = config['protocol'];
    if (p == 'novelai' && config['allowCustomEndpoint'] != true) {
      final host = Uri.parse(base).host;
      if (host != 'novelai.net' && !host.endsWith('.novelai.net')) {
        throw StateError('自定义地址未确认');
      }
    }
    if (p == 'compatible-image' && secret.isEmpty) {
      throw StateError('请先保存独立图片密钥');
    }
    final imageUrl =
        p == 'compatible-image' ? compatibleImageEndpoint(base) : null;
    final url = imageUrl != null
        ? imageUrl.replace(
            path: imageUrl.path
                .replaceFirst(RegExp(r'/images/generations$'), '/models'))
        : Uri.parse(p == 'novelai'
            ? '$base/user/subscription'
            : p == 'tags'
                ? base
                : base +
                    (protocol == 'anthropic-messages' && !base.endsWith('/v1')
                        ? '/v1/models'
                        : '/models'));
    final headers = <String, String>{'Accept': 'application/json'};
    if (secret.isNotEmpty) {
      if (protocol == 'anthropic-messages') {
        headers['x-api-key'] = secret;
        headers['anthropic-version'] = '2023-06-01';
      } else if (protocol == 'google-gemini') {
        headers['x-goog-api-key'] = secret;
      } else {
        headers['Authorization'] = 'Bearer $secret';
      }
    }
    http.Client? client;
    var expired = false;
    try {
      return await (() async {
        client = await (clientFactory?.call(url) ??
            createProxyHttpClientForUri(app.settings, url,
                scope: p == 'novelai'
                    ? ProxyScope.nai
                    : p == 'tags'
                        ? ProxyScope.mcp
                        : ProxyScope.ai));
        if (expired) {
          client!.close();
          throw TimeoutException('API connection expired');
        }
        final request = http.Request('GET', url)
          ..headers.addAll(headers)
          ..followRedirects = false;
        final response = await client!.send(request).timeout(connectionTimeout);
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw StateError('HTTP ${response.statusCode}');
        }
        final bytes = <int>[];
        await for (final chunk in response.stream.timeout(connectionTimeout)) {
          if (expired) throw TimeoutException('API connection expired');
          bytes.addAll(chunk);
          if (bytes.length > 1024 * 1024) {
            throw StateError('response too large');
          }
        }
        final dynamic data = ['novelai', 'tags'].contains(p)
            ? {}
            : jsonDecode(utf8.decode(bytes));
        if (p == 'compatible-image' &&
            !(data is List ||
                data is Map &&
                    (data['data'] is List || data['models'] is List))) {
          throw StateError('接口未返回模型列表');
        }
        final dynamic rows =
            data is List ? data : data['data'] ?? data['models'] ?? [];
        final models = rows is List
            ? rows
                .map((x) => x is String
                    ? x
                    : x is Map
                        ? (x['id'] ?? x['name'] ?? '').toString()
                        : '')
                .where((x) =>
                    x.isNotEmpty &&
                    x.length < 200 &&
                    !RegExp(r'[\r\n]').hasMatch(x) &&
                    (secret.isEmpty || !x.contains(secret)))
                .take(200)
                .toList()
            : <String>[];
        return {
          'connected': true,
          'profile': p,
          'status': response.statusCode,
          'models': models,
          'notice': '连接/模型列表可用不代表付费生成已验证；没有发起生成。'
        };
      })()
          .timeout(connectionTimeout, onTimeout: () {
        expired = true;
        client?.close();
        throw TimeoutException('API connection expired');
      });
    } catch (_) {
      throw StateError('连接检查失败；请检查地址、凭据或网络，服务端原始内容未发送给模型；未跟随重定向或发起生成。');
    } finally {
      client?.close();
    }
  }
}
