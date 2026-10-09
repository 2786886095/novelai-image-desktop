import 'dart:convert';
import 'package:crypto/crypto.dart';

import '../billing/anlas.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import '../services/novelai_accounts.dart';
import 'agent_models.dart';
import 'image_provider.dart';

Future<String> studioGenerationFingerprint(AppState app) async {
  // The legacy Storage route has no profile. Read its current credential too,
  // so replacing a token without changing settings invalidates old approvals.
  final accountStorage = app.storage is NovelAiAccountStorage
      ? app.storage as NovelAiAccountStorage : null;
  if (accountStorage != null) await accountStorage.ready();
  final active = accountStorage?.accounts.active;
  final credential = active?.token ??
      (accountStorage == null ? await app.storage.getToken() : null);
  final credentialRevision = sha256.convert(utf8.encode(jsonEncode([
    'studio-credential-v1', active?.profile.id, credential,
  ]))).toString();
  // Keep even the account id and endpoints out of logs and tool-visible data.
  return sha256.convert(utf8.encode(jsonEncode({
    'version': 2,
    'provider': app.settings.imageProvider,
    'compatible': app.settings.compatibleImage,
    'params': app.params.toJson(),
    'extrasHash': sha256.convert(utf8.encode(jsonEncode(app.extras.toJson()))).toString(),
    'group': app.generationGroupId,
    'tier': app.account.tierLevel,
    'subscription': app.account.hasActiveSubscription,
    'accountId': active?.profile.id,
    'accountMethod': active?.profile.method,
    'accountApiBase': active?.profile.apiBaseUrl,
    'accountImageBase': active?.profile.imageBaseUrl,
    'effectiveApiBase': app.settings.apiBaseUrl,
    'effectiveImageBase': app.settings.imageBaseUrl,
    'credentialRevision': credentialRevision,
  }))).toString();
}

Map<String, dynamic> studioGenerationPreview(AppState app, Map<String, dynamic> args) {
  assertAgentImageTool('langbai_generate_image', app.settings);
  if (app.settings.imageProvider == 'openai-images') {
    final input = compatibleAgentInput(args, app.settings);
    return {
      'positivePrompt': input.prompt, 'count': input.count,
      'model': app.settings.compatibleImage['model'],
      'imageProvider': 'openai-images', 'estimatedAnlas': null,
      'estimateSource': 'provider-unknown',
      'warning': '兼容服务费用由提供方决定；此处无法估价。',
    };
  }
  final params = app.params.copy();
  params.positivePrompt = (args['positivePrompt'] as String?)?.trim() ?? '';
  if (args['model'] is String && naiModels.any((model) => model.value == args['model'])) {
    params.model = args['model'] as String;
  }
  int? number(Object? value) => value is num ? value.round() : int.tryParse('$value');
  params.width = number(args['width']) ?? params.width;
  params.height = number(args['height']) ?? params.height;
  params.steps = number(args['steps']) ?? params.steps;
  if (args['effort'] == 'medium' || args['effort'] == 'high') params.effort = args['effort'] as String;
  final safe = params.normalized();
  final effective = safe.effectiveEffort();
  final count = (number(args['count']) ?? 1).clamp(1, 8).toInt();
  final advancedReferences = args.containsKey('vibeReferences') ||
      args.containsKey('preciseReferences') || args.containsKey('characterPrompts');
  final relay = (app.storage is NovelAiAccountStorage
          ? (app.storage as NovelAiAccountStorage).accounts.active?.profile.relay
          : null) ??
      app.settings.allowCustomEndpoint;
  final quote = (relay || advancedReferences) ? null : calculateImageGenerationAnlas(
    params: safe, account: app.account, extras: app.extras,
    batchCount: count, language: app.settings.language,
  );
  return {
    'positivePrompt': safe.positivePrompt, 'model': effective.model, 'effort': safe.effort,
    'width': safe.width, 'height': safe.height, 'steps': effective.steps,
    'count': count, 'imageProvider': 'novelai',
    'estimatedAnlas': quote?.amount,
    'estimateSource': quote == null ? 'provider-unknown' : 'local-estimate',
    'warning': relay
      ? '第三方中转费用由提供方决定；此处无法估价。'
      : quote == null
      ? '包含高级参考参数，无法可靠估价；可能消耗 Anlas。'
      : '本地估算并非实际扣费；最终以 NovelAI 为准。',
  };
}

class StudioGenerationPreparation {
  StudioGenerationPreparation({required this.id, required this.sessionId,
    required this.createdAt, required this.fingerprint,
    required this.arguments, required this.preview});

  final String id;
  final String sessionId;
  final DateTime createdAt;
  final String fingerprint;
  final Map<String, dynamic> arguments;
  final Map<String, dynamic> preview;
}

/// Prepared image operations are local, one-use and never persisted for replay.
class StudioGenerationPreparations {
  StudioGenerationPreparations({DateTime Function()? now}) : _now = now ?? DateTime.now;
  final DateTime Function() _now;
  final Map<String, StudioGenerationPreparation> _pending = {};

  Map<String, dynamic> prepare(String sessionId, Map<String, dynamic> arguments,
      String fingerprint, Map<String, dynamic> preview) {
    _prune();
    final prompt = arguments['positivePrompt'];
    if (sessionId.isEmpty || fingerprint.isEmpty || prompt is! String || prompt.trim().isEmpty) {
      throw StateError('请先提供正面提示词和当前生图设置。');
    }
    final encoded = jsonEncode(arguments);
    if (encoded.length > 20000) throw StateError('生图参数过长。');
    if (_pending.length >= 32) throw StateError('待确认生图过多，请稍后重试。');
    final id = agentId('prepare');
    _pending[id] = StudioGenerationPreparation(id: id,
      sessionId: sessionId, createdAt: _now(), fingerprint: fingerprint,
      arguments: Map<String, dynamic>.from(jsonDecode(encoded) as Map),
      preview: Map<String, dynamic>.from(preview));
    return {'preparationId': id, 'expiresInSeconds': 600, ...preview};
  }

  StudioGenerationPreparation inspect(String sessionId, Object? id, String fingerprint) {
    _prune();
    final item = _pending[id];
    if (item == null || item.sessionId != sessionId) {
      throw StateError('生图准备不存在或已过期，请重新准备。');
    }
    if (item.fingerprint != fingerprint) {
      throw StateError('生图设置已变化，请重新准备并查看费用。');
    }
    return item;
  }

  Map<String, dynamic> consume(String sessionId, Object? id, String fingerprint) {
    final item = inspect(sessionId, id, fingerprint);
    _pending.remove(item.id);
    return Map<String, dynamic>.from(item.arguments);
  }

  void _prune() {
    _pending.removeWhere((_, item) => _now().difference(item.createdAt) >=
        const Duration(minutes: 10));
  }
}
