import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:http/http.dart' as http;

import '../models/nai_models.dart';

class AiTextResult {
  final bool ok;
  final String message;
  final String text;
  const AiTextResult({required this.ok, required this.message, this.text = ''});
}

class TagSuggestion {
  final String tag;
  final int count;
  final String? description;
  const TagSuggestion({required this.tag, this.count = 0, this.description});
}

class NaiApi {
  final _rng = Random.secure();

  int randomSeed() => 1 + _rng.nextInt(2147483646);

  String _tierName(int? tier) {
    switch (tier) {
      case 3:
        return 'Opus';
      case 2:
        return 'Scroll';
      case 1:
        return 'Tablet';
      case 0:
        return 'Paper';
      default:
        return '已验证';
    }
  }

  Future<AccountSummary> verifyToken(String token, AppSettings settings) async {
    final t = token.trim();
    if (t.isEmpty) return const AccountSummary(hasToken: false);
    final info = await http.get(
      Uri.parse('${_base(settings.apiBaseUrl, 'https://api.novelai.net')}/user/information'),
      headers: {'Authorization': 'Bearer $t'},
    ).timeout(const Duration(seconds: 15));
    if (info.statusCode == 401) throw Exception('Token 无效或已过期。');
    if (info.statusCode >= 400) throw Exception('Token 验证失败（HTTP ${info.statusCode}）。');
    return fetchAccount(t, settings);
  }

  Future<AccountSummary> fetchAccount(String token, AppSettings settings) async {
    try {
      final res = await http.get(
        Uri.parse('${_base(settings.apiBaseUrl, 'https://api.novelai.net')}/user/data'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 15));
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final sub = (data['subscription'] ?? {}) as Map<String, dynamic>;
      final tier = sub['tier'] as int?;
      int? anlas;
      final steps = sub['trainingStepsLeft'];
      if (steps is Map) {
        anlas = ((steps['fixedTrainingStepsLeft'] ?? 0) as num).toInt() +
            ((steps['purchasedTrainingSteps'] ?? 0) as num).toInt();
      } else if (steps is num) {
        anlas = steps.toInt();
      }
      return AccountSummary(
        hasToken: true,
        tierName: _tierName(tier),
        tierLevel: tier,
        anlasBalance: anlas,
        hasActiveSubscription: sub['active'] is bool ? sub['active'] as bool : null,
      );
    } catch (_) {
      return const AccountSummary(hasToken: true, tierName: '已验证');
    }
  }

  Future<(List<Uint8List>, int)> generate(
    String token,
    AppSettings settings,
    GenerateParams params,
    GenerateExtras extras,
  ) async {
    final seed = params.seedMode != 'random' && params.seed > 0 ? params.seed : randomSeed();
    final payload = await buildPayload(token, settings, params, seed, extras);
    final bytes = await _postGenerate(token, settings, payload);
    return (_extractImages(bytes), seed);
  }

  Future<(List<Uint8List>, int)> img2img(
    String token,
    AppSettings settings,
    GenerateParams params,
    GenerateExtras extras,
    Uint8List imageBytes,
    I2IParams i2i,
  ) async {
    final seed = params.seedMode != 'random' && params.seed > 0 ? params.seed : randomSeed();
    final payload = await buildPayload(token, settings, params, seed, extras);
    payload['action'] = 'img2img';
    final p = payload['parameters'] as Map<String, dynamic>;
    p['image'] = base64Encode(imageBytes);
    p['strength'] = i2i.strength.clamp(0, 1);
    p['noise'] = i2i.noise.clamp(0, 0.99);
    p['extra_noise_seed'] = i2i.extraNoiseSeed > 0 ? i2i.extraNoiseSeed : randomSeed();
    final bytes = await _postGenerate(token, settings, payload);
    return (_extractImages(bytes), seed);
  }

  Future<(List<Uint8List>, int)> inpaint(
    String token,
    AppSettings settings,
    GenerateParams params,
    Uint8List imageBytes,
    Uint8List maskBytes,
    String inpaintModel,
    int width,
    int height,
  ) async {
    final seed = params.seedMode != 'random' && params.seed > 0 ? params.seed : randomSeed();
    final p = params.copy()
      ..model = inpaintModel
      ..width = width
      ..height = height;
    final payload = await buildPayload(token, settings, p, seed, GenerateExtras());
    payload['action'] = 'infill';
    final parameters = payload['parameters'] as Map<String, dynamic>;
    parameters['image'] = base64Encode(imageBytes);
    parameters['mask'] = base64Encode(maskBytes);
    parameters['add_original_image'] = true;
    parameters['strength'] = 1;
    parameters['noise'] = 0;
    final bytes = await _postGenerate(token, settings, payload);
    return (_extractImages(bytes), seed);
  }

  Future<Uint8List> upscale(String token, AppSettings settings, Uint8List imageBytes, int width, int height, int scale) async {
    final res = await _postWithRetry(
      () => http.post(
        Uri.parse('${_base(settings.apiBaseUrl, 'https://api.novelai.net')}/ai/upscale'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
          'Accept': 'application/zip, application/octet-stream, image/png',
        },
        body: jsonEncode({'image': base64Encode(imageBytes), 'width': width, 'height': height, 'scale': scale}),
      ).timeout(const Duration(seconds: 180)),
    );
    final images = _extractImages(res.bodyBytes);
    return images.isNotEmpty ? images.first : res.bodyBytes;
  }

  Future<List<Uint8List>> augment(
    String token,
    AppSettings settings,
    Uint8List imageBytes,
    int width,
    int height,
    String tool,
    AugmentOptions options,
  ) async {
    final payload = <String, dynamic>{
      'image': base64Encode(imageBytes),
      'width': width,
      'height': height,
      'req_type': tool,
      'defry': options.defry.clamp(0, 5),
    };
    if (tool == 'colorize') payload['prompt'] = options.colorizePrompt;
    if (tool == 'emotion') payload['prompt'] = '${options.emotion};;${options.emotionLevel.clamp(0, 5)}';

    final res = await _postWithRetry(
      () => http.post(
        Uri.parse('${_base(settings.imageBaseUrl, 'https://image.novelai.net')}/ai/augment-image'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
          'Accept': 'application/zip, application/octet-stream',
        },
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 180)),
    );
    return _extractImages(res.bodyBytes);
  }

  Future<Map<String, dynamic>> buildPayload(
    String token,
    AppSettings settings,
    GenerateParams params,
    int seed,
    GenerateExtras extras,
  ) async {
    final basePrompt = _merge(params.stylePrompt, params.positivePrompt);
    final effectivePrompt = params.qualityToggle ? _merge(basePrompt, _qualityTags(params.model)) : basePrompt;
    final effectiveNegative = _merge(params.negativePrompt, _ucPresetText(params.model, params.ucPreset));
    final charCaptions = extras.charCaptions
        .where((c) => c.prompt.trim().isNotEmpty)
        .take(6)
        .map((c) => {
              'char_caption': c.prompt.trim(),
              'centers': c.useCoords
                  ? [
                      {'x': c.x.clamp(0, 1), 'y': c.y.clamp(0, 1)}
                    ]
                  : [],
            })
        .toList();
    final hasCoords = charCaptions.any((c) => (c['centers'] as List).isNotEmpty);

    final parameters = <String, dynamic>{
      'params_version': 3,
      'width': params.width,
      'height': params.height,
      'scale': params.cfgScale,
      'sampler': params.sampler,
      'steps': params.steps,
      'n_samples': 1,
      'seed': seed,
      'noise_schedule': params.noiseSchedule.isEmpty ? 'native' : params.noiseSchedule,
      'uc': effectiveNegative,
      'negative_prompt': effectiveNegative,
      'ucPreset': params.ucPreset,
      'uc_preset': params.ucPreset,
      'cfg_rescale': params.cfgRescale,
      'legacy': false,
      'legacy_v3_extend': false,
      'dynamic_thresholding': params.cfgRescale > 0,
      'skip_cfg_above_sigma': null,
      'qualityToggle': params.qualityToggle,
      'quality_toggle': params.qualityToggle,
    };
    if (params.variety) parameters['variety'] = true;

    if (params.isV4Plus) {
      parameters['use_coords'] = hasCoords;
      parameters['v4_prompt'] = {
        'caption': {'base_caption': effectivePrompt, 'char_captions': charCaptions},
        'use_coords': hasCoords,
        'use_order': true,
      };
      parameters['v4_negative_prompt'] = {
        'caption': {'base_caption': effectiveNegative, 'char_captions': []},
        'use_coords': false,
        'use_order': false,
        'legacy_uc': !params.isV45,
      };
    } else {
      parameters['sm'] = params.smea;
      parameters['sm_dyn'] = params.smea && params.smeaDyn;
    }

    if (extras.vibeImages.isNotEmpty) {
      final encoded = <VibeTransferItem>[];
      for (final vibe in extras.vibeImages) {
        encoded.add(await _encodeVibeOrRaw(token, settings, params.model, vibe));
      }
      parameters['reference_image_multiple'] = encoded.map((e) => e.base64).toList();
      parameters['reference_information_extracted_multiple'] = encoded.map((e) => e.infoExtracted).toList();
      parameters['reference_strength_multiple'] = encoded.map((e) => e.strength).toList();
    }

    return {'input': effectivePrompt, 'model': params.model, 'action': 'generate', 'parameters': parameters};
  }

  Future<List<String>> listModels(String apiUrl, String apiKey) async {
    if (apiUrl.trim().isEmpty || apiKey.trim().isEmpty) return [];
    final res = await http.get(
      Uri.parse('${_base(apiUrl, apiUrl)}/models'),
      headers: {'Authorization': 'Bearer $apiKey'},
    ).timeout(const Duration(seconds: 20));
    if (res.statusCode >= 400) throw Exception('模型检测失败（HTTP ${res.statusCode}）');
    final data = jsonDecode(res.body);
    final raw = data is Map ? data['data'] : data;
    if (raw is! List) return [];
    return raw.map((e) => e is String ? e : e['id']).whereType<String>().toList()..sort();
  }

  Future<AiTextResult> reversePrompt({
    required AppSettings settings,
    required String apiKey,
    required Uint8List image,
    required ReversePromptMode mode,
  }) async {
    if (apiKey.trim().isEmpty) return const AiTextResult(ok: false, message: '请先填写 AI 反推 API Key');
    final system = _modeSystemPrompt(mode, reverse: true);
    final user = [
      {
        'type': 'image_url',
        'image_url': {'url': 'data:image/png;base64,${base64Encode(image)}', 'detail': 'high'}
      },
      {'type': 'text', 'text': 'Generate the prompt for this image.\n${_modeInstruction(mode)}'}
    ];
    return _chat(settings.visionApiUrl, apiKey, settings.visionApiModel, system, user);
  }

  Future<AiTextResult> convertPrompt({
    required AppSettings settings,
    required String apiKey,
    required String text,
    required ReversePromptMode mode,
  }) async {
    if (apiKey.trim().isEmpty) return const AiTextResult(ok: false, message: '请先填写转换 API Key');
    final hints = mode == ReversePromptMode.natural || !settings.mcpForConvert ? <TagSuggestion>[] : await searchTags(settings, text, 16);
    final hintText = hints.isEmpty ? '' : '\nCandidate Danbooru tags:\n${hints.map((e) => e.tag).join(', ')}';
    final user = 'User description:\n$text\n\n${_modeInstruction(mode)}$hintText';
    return _chat(settings.convertApiUrl, apiKey, settings.convertApiModel, _modeSystemPrompt(mode, reverse: false), user);
  }

  Future<List<TagSuggestion>> searchTags(AppSettings settings, String query, int limit, {String apiKey = ''}) async {
    if (settings.tagServerUrl.trim().isEmpty || query.trim().isEmpty) return _localTags(query, limit);
    final base = _base(settings.tagServerUrl, settings.tagServerUrl);
    final headers = <String, String>{};
    if (apiKey.trim().isNotEmpty) headers['Authorization'] = 'Bearer ${apiKey.trim()}';
    final attempts = <Future<http.Response> Function()>[
      () => http.get(Uri.parse('$base/search?q=${Uri.encodeQueryComponent(query)}&limit=$limit'), headers: headers),
      () => http.get(Uri.parse('$base/tags?q=${Uri.encodeQueryComponent(query)}&limit=$limit'), headers: headers),
      () => http.post(Uri.parse('$base/search'), headers: {...headers, 'Content-Type': 'application/json'}, body: jsonEncode({'query': query, 'limit': limit})),
      () => http.post(
            Uri.parse(base),
            headers: {...headers, 'Content-Type': 'application/json'},
            body: jsonEncode({
              'jsonrpc': '2.0',
              'id': DateTime.now().millisecondsSinceEpoch,
              'method': 'tools/call',
              'params': {
                'name': 'search_tags',
                'arguments': {'query': query, 'limit': limit}
              }
            }),
          ),
    ];
    for (final attempt in attempts) {
      try {
        final res = await attempt().timeout(const Duration(seconds: 8));
        final tags = _parseTagPayload(jsonDecode(res.body)).take(limit).toList();
        if (tags.isNotEmpty) return tags;
      } catch (_) {}
    }
    return _localTags(query, limit);
  }

  Future<VibeTransferItem> _encodeVibeOrRaw(String token, AppSettings settings, String model, VibeTransferItem vibe) async {
    try {
      final res = await http.post(
        Uri.parse('${_base(settings.imageBaseUrl, 'https://image.novelai.net')}/ai/encode-vibe'),
        headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'},
        body: jsonEncode({'image': _stripBase64(vibe.base64), 'information_extracted': vibe.infoExtracted, 'model': model}),
      ).timeout(const Duration(seconds: 60));
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return VibeTransferItem(base64: base64Encode(res.bodyBytes), infoExtracted: vibe.infoExtracted, strength: vibe.strength);
      }
    } catch (_) {}
    return vibe;
  }

  Future<Uint8List> _postGenerate(String token, AppSettings settings, Map<String, dynamic> payload) async {
    final res = await _postWithRetry(
      () => http.post(
        Uri.parse('${_base(settings.imageBaseUrl, 'https://image.novelai.net')}/ai/generate-image'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
          'Accept': 'application/zip, application/octet-stream',
        },
        body: jsonEncode(payload),
      ).timeout(const Duration(seconds: 180)),
    );
    return res.bodyBytes;
  }

  Future<http.Response> _postWithRetry(Future<http.Response> Function() fn, {int retries = 3}) async {
    var attempt = 0;
    while (true) {
      try {
        final res = await fn();
        if (res.statusCode == 200 || res.statusCode == 201) return res;
        final retryable = [429, 500, 502, 503, 524].contains(res.statusCode);
        if (!retryable || attempt >= retries) throw Exception(_errorText(res));
        final retryAfter = int.tryParse(res.headers['retry-after'] ?? '');
        final waitMs = retryAfter != null && retryAfter > 0 ? retryAfter * 1000 : 2000 * (1 << attempt);
        attempt++;
        await Future.delayed(Duration(milliseconds: min(waitMs, 30000)));
      } on Exception {
        if (attempt >= retries) rethrow;
        attempt++;
        await Future.delayed(Duration(milliseconds: 2000 * (1 << (attempt - 1))));
      }
    }
  }

  Future<AiTextResult> _chat(String apiUrl, String apiKey, String model, String system, Object user) async {
    try {
      final body = {
        'model': model.trim().isEmpty ? 'gpt-4o-mini' : model.trim(),
        'max_tokens': 2000,
        'messages': [
          {'role': 'system', 'content': system},
          {'role': 'user', 'content': user},
        ],
      };
      final res = await http.post(
        Uri.parse('${_base(apiUrl, apiUrl)}/chat/completions'),
        headers: {'Authorization': 'Bearer $apiKey', 'Content-Type': 'application/json'},
        body: jsonEncode(body),
      ).timeout(const Duration(seconds: 60));
      if (res.statusCode >= 400) return AiTextResult(ok: false, message: 'AI 调用失败（HTTP ${res.statusCode}）：${res.body}');
      final data = jsonDecode(res.body);
      final content = data['choices']?[0]?['message']?['content']?.toString().trim() ?? '';
      return content.isEmpty ? const AiTextResult(ok: false, message: 'AI 返回内容为空') : AiTextResult(ok: true, message: '成功', text: _cleanPrompt(content));
    } catch (e) {
      return AiTextResult(ok: false, message: e.toString().replaceFirst('Exception: ', ''));
    }
  }

  List<Uint8List> _extractImages(Uint8List bytes) {
    try {
      final archive = ZipDecoder().decodeBytes(bytes);
      final out = <Uint8List>[];
      for (final file in archive) {
        if (file.isFile && file.content is List<int>) {
          final data = file.content as List<int>;
          if (data.isNotEmpty) out.add(Uint8List.fromList(data));
        }
      }
      return out;
    } catch (_) {
      if (bytes.length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50) return [bytes];
      return [];
    }
  }

  String _errorText(http.Response res) {
    try {
      final body = jsonDecode(res.body);
      if (body is Map && body['message'] != null) return '请求失败（${res.statusCode}）：${body['message']}';
    } catch (_) {}
    return '请求失败（HTTP ${res.statusCode}）。';
  }

  String _base(String value, String fallback) {
    final v = value.trim().isEmpty ? fallback : value.trim();
    return v.replaceAll(RegExp(r'/+$'), '');
  }

  String _merge(String a, String b) {
    final left = a.trim();
    final right = b.trim();
    if (left.isEmpty) return right;
    if (right.isEmpty) return left;
    return '$left, $right';
  }

  String _qualityTags(String model) {
    if (model.startsWith('nai-diffusion-4-5')) return 'location, very aesthetic, masterpiece, no text';
    if (model.startsWith('nai-diffusion-4')) return 'no text, best quality, very aesthetic, absurdres';
    return 'best quality, amazing quality, very aesthetic, absurdres';
  }

  String _ucPresetText(String model, int preset) {
    if (preset == 3) return '';
    if (model.startsWith('nai-diffusion-4-5')) {
      return preset == 0
          ? 'blurry, lowres, upscaled, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, too many watermarks'
          : 'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks';
    }
    return preset == 0 ? 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality' : '';
  }

  String _stripBase64(String value) => value.contains(',') ? value.split(',').last : value;

  String _cleanPrompt(String raw) => raw
      .trim()
      .replaceFirst(RegExp(r'^```(?:text|txt|prompt|markdown)?\s*', caseSensitive: false), '')
      .replaceFirst(RegExp(r'\s*```$'), '')
      .replaceFirst(RegExp(r'^(?:output|prompt|result|答案|输出|结果)\s*[:：]\s*', caseSensitive: false), '')
      .replaceAll('\\n', ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  String _modeInstruction(ReversePromptMode mode) {
    switch (mode) {
      case ReversePromptMode.natural:
        return 'Output one English natural-language NovelAI V4.5 prompt. Do not output comma-separated Danbooru tags. For multiple original characters, use: base scene | A boy/girl ... | A boy/girl ...';
      case ReversePromptMode.mixed:
        return 'Output one mixed NovelAI V4.5 prompt: mostly Danbooru tags plus short natural-language clauses for composition.';
      case ReversePromptMode.tags:
        return 'Output one comma-separated Danbooru / NovelAI tag prompt. Do not output pure prose.';
    }
  }

  String _modeSystemPrompt(ReversePromptMode mode, {required bool reverse}) {
    final task = reverse ? '根据图片反推出' : '把用户输入转换成';
    switch (mode) {
      case ReversePromptMode.natural:
        return '你是 NovelAI V4.5 提示词专家。请$task 100% 英文自然语言 prompt。只输出一行，不要解释，不要 Danbooru tag 列表。多人使用 base scene | character 1 | character 2。';
      case ReversePromptMode.mixed:
        return '你是 NovelAI V4.5 / Danbooru 提示词专家。请$task混合 prompt：80% Danbooru tag + 20% 简短自然语言。只输出一行。';
      case ReversePromptMode.tags:
        return '你是 NovelAI V4.5 / Danbooru 提示词专家。请$task英文 Danbooru tag prompt。只输出一行，tag 之间使用英文逗号。';
    }
  }

  List<TagSuggestion> _parseTagPayload(Object? payload) {
    if (payload == null) return [];
    if (payload is List) return payload.map(_tagFromAny).whereType<TagSuggestion>().toList();
    if (payload is String) {
      try {
        return _parseTagPayload(jsonDecode(payload));
      } catch (_) {
        return payload.split(RegExp(r'[\n,]')).map(_tagFromAny).whereType<TagSuggestion>().toList();
      }
    }
    if (payload is Map) {
      final content = payload['content'];
      if (content is List) {
        final text = content.map((e) => e is Map ? e['text'] : e).whereType<String>().join('\n');
        final parsed = _parseTagPayload(text);
        if (parsed.isNotEmpty) return parsed;
      }
      for (final key in ['tags', 'results', 'data', 'items', 'result']) {
        final parsed = _parseTagPayload(payload[key]);
        if (parsed.isNotEmpty) return parsed;
      }
    }
    return [];
  }

  TagSuggestion? _tagFromAny(Object? item) {
    if (item is String) {
      final tag = item.trim();
      return tag.isEmpty ? null : TagSuggestion(tag: tag);
    }
    if (item is Map) {
      final tag = (item['tag'] ?? item['name'] ?? item['value'] ?? item['label'] ?? item['text'])?.toString().trim();
      if (tag == null || tag.isEmpty) return null;
      final count = int.tryParse((item['count'] ?? item['post_count'] ?? item['posts'] ?? 0).toString()) ?? 0;
      final desc = (item['description'] ?? item['translation'] ?? item['zh'])?.toString();
      return TagSuggestion(tag: tag, count: count, description: desc);
    }
    return null;
  }

  List<TagSuggestion> _localTags(String query, int limit) {
    const tags = [
      ['girl', '女孩'],
      ['boy', '男孩'],
      ['blue eyes', '蓝眼睛'],
      ['white hair', '白发'],
      ['black hair', '黑发'],
      ['classroom', '教室'],
      ['desk', '桌子'],
      ['drawing', '画画'],
      ['hoodie', '连帽衫'],
      ['juggling', '抛接球'],
      ['full body', '全身'],
      ['from front', '正面视角'],
      ['looking at viewer', '看向观众'],
      ['solo', '单人'],
      ['2boys', '两个男孩'],
      ['2girls', '两个女孩'],
      ['smile', '微笑'],
      ['standing', '站立'],
      ['sitting', '坐着'],
      ['sketchbook', '素描本'],
    ];
    final q = query.toLowerCase().trim();
    return tags
        .where((e) => e[0].contains(q) || e[1].contains(query))
        .take(limit)
        .map((e) => TagSuggestion(tag: e[0], description: e[1]))
        .toList();
  }
}
