import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show MediaType;

import '../billing/anlas.dart';
import '../images/image_processing.dart';
import '../models/nai_models.dart';
import '../prompts/prompt_mode.dart';
import 'mcp_tag_client.dart';
import 'proxy_http_client.dart';

class AiTextResult {
  final bool ok;
  final String message;
  final String text;
  final PromptVariants? variants;
  const AiTextResult({
    required this.ok,
    required this.message,
    this.text = '',
    this.variants,
  });
}

class TagSuggestion {
  final String tag;
  final int count;
  final String? description;
  const TagSuggestion({required this.tag, this.count = 0, this.description});
}

class GenerationCancelledException implements Exception {
  const GenerationCancelledException();

  @override
  String toString() => 'Operation cancelled';
}

class NaiHttpException implements Exception {
  final int statusCode;
  final String message;

  const NaiHttpException(this.statusCode, this.message);

  @override
  String toString() => message;
}

String resolveNovelAiBaseUrl(
  String value,
  String fallback,
  AppSettings settings,
) {
  final candidate = value.trim().isEmpty ? fallback : value.trim();
  final normalized = candidate.replaceAll(RegExp(r'/+$'), '');
  if (settings.allowCustomEndpoint) return normalized;
  final uri = Uri.tryParse(normalized);
  final host = uri?.host.toLowerCase() ?? '';
  final official = uri?.scheme == 'https' &&
      (host == 'novelai.net' || host.endsWith('.novelai.net'));
  return official ? normalized : fallback;
}

class NaiApi {
  final _rng = Random.secure();
  final Map<String, String> _vibeEncodeCache = {};
  final List<AiCallLogEntry> _aiCallLog = [];
  http.Client? _activeGenerationClient;
  bool _generationCancelled = false;

  int randomSeed() => 1 + _rng.nextInt(2147483646);

  List<AiCallLogEntry> get aiCallLog => List.unmodifiable(_aiCallLog.reversed);

  void clearAiCallLog() => _aiCallLog.clear();

  int countCachedVibes(String model, GenerateExtras extras) => extras.vibeImages
      .where((vibe) => _vibeEncodeCache.containsKey(_vibeCacheKey(model, vibe)))
      .length;

  void cancelActiveGeneration() {
    _generationCancelled = true;
    _activeGenerationClient?.close();
  }

  Future<int?> requestOfficialGenerationPrice(
    String token,
    AppSettings settings,
    GenerateParams params,
  ) async {
    final quoteParams = params.copy()
      ..positivePrompt = params.positivePrompt.trim().isEmpty
          ? 'quote'
          : params.positivePrompt.trim();
    try {
      final payload = await buildPayload(
        token,
        settings,
        quoteParams,
        1,
        GenerateExtras(),
      );
      final response = await _withClient(
        settings,
        (client) => client
            .post(
              Uri.parse(
                '${_naiBase(settings.apiBaseUrl, 'https://api.novelai.net', settings)}/ai/generate-image/request-price',
              ),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: jsonEncode(payload),
            )
            .timeout(const Duration(seconds: 12)),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) return null;
      return extractOfficialAnlasPrice(jsonDecode(response.body));
    } catch (_) {
      return null;
    }
  }

  Future<AiTextResult> translateText(String text, AppSettings settings,
      {String target = 'en', String baiduSecret = ''}) async {
    final input = text.trim();
    if (input.isEmpty) {
      return const AiTextResult(ok: false, message: 'Nothing to translate');
    }
    if (settings.translateProvider == 'baidu') {
      return _translateWithBaidu(
        input,
        settings,
        target,
        baiduSecret,
      );
    }
    try {
      final uri = Uri.https(
        'translate.googleapis.com',
        '/translate_a/single',
        {'client': 'gtx', 'sl': 'auto', 'tl': target, 'dt': 't', 'q': input},
      );
      final response = await _withClient(
        settings,
        (client) => client.get(uri).timeout(const Duration(seconds: 8)),
        scope: ProxyScope.translate,
      );
      if (response.statusCode >= 400) {
        return AiTextResult(
          ok: false,
          message: 'Google Translate failed (HTTP ${response.statusCode})',
        );
      }
      final data = jsonDecode(response.body);
      final segments = data is List && data.isNotEmpty && data.first is List
          ? data.first as List
          : const [];
      final translated = segments
          .whereType<List>()
          .map((segment) =>
              segment.isEmpty ? '' : segment.first?.toString() ?? '')
          .join()
          .trim();
      return translated.isEmpty
          ? const AiTextResult(
              ok: false,
              message: 'Google Translate returned an empty result',
            )
          : AiTextResult(
              ok: true, message: 'Translation complete', text: translated);
    } catch (error) {
      return AiTextResult(
        ok: false,
        message: 'Google Translate failed. Check your network or proxy: $error',
      );
    }
  }

  Future<AiTextResult> _translateWithBaidu(
    String input,
    AppSettings settings,
    String target,
    String secret,
  ) async {
    final appId = settings.baiduAppId.trim();
    final cleanSecret = secret.trim();
    if (appId.isEmpty || cleanSecret.isEmpty) {
      return const AiTextResult(
        ok: false,
        message: 'Enter the Baidu Translate APP ID and save the secret first',
      );
    }
    final salt = '${DateTime.now().microsecondsSinceEpoch}';
    final sign = md5.convert(utf8.encode('$appId$input$salt$cleanSecret'));
    try {
      final response = await _withClient(
        settings,
        (client) => client.post(
          Uri.https('fanyi-api.baidu.com', '/api/trans/vip/translate'),
          headers: const {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: {
            'q': input,
            'from': 'auto',
            'to': target.toLowerCase().startsWith('zh') ? 'zh' : 'en',
            'appid': appId,
            'salt': salt,
            'sign': '$sign',
          },
        ).timeout(const Duration(seconds: 12)),
        scope: ProxyScope.translate,
      );
      final data = jsonDecode(response.body);
      if (response.statusCode >= 400 || data is! Map) {
        return AiTextResult(
          ok: false,
          message: 'Baidu Translate failed (HTTP ${response.statusCode})',
        );
      }
      if (data['error_code'] != null) {
        return AiTextResult(
          ok: false,
          message:
              'Baidu Translate failed: ${data['error_msg'] ?? data['error_code']}',
        );
      }
      final rows = data['trans_result'];
      final translated = rows is List
          ? rows
              .whereType<Map>()
              .map((row) => row['dst']?.toString() ?? '')
              .where((value) => value.isNotEmpty)
              .join('\n')
          : '';
      return translated.isEmpty
          ? const AiTextResult(
              ok: false,
              message: 'Baidu Translate returned no result',
            )
          : AiTextResult(
              ok: true, message: 'Translation complete', text: translated);
    } catch (error) {
      return AiTextResult(ok: false, message: 'Baidu Translate failed: $error');
    }
  }

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
        return 'Verified';
    }
  }

  Future<AccountSummary> verifyToken(String token, AppSettings settings) async {
    final t = token.trim();
    if (t.isEmpty) return const AccountSummary(hasToken: false);
    final info = await _withClient(
      settings,
      (client) => client.get(
        Uri.parse(
            '${_naiBase(settings.apiBaseUrl, 'https://api.novelai.net', settings)}/user/information'),
        headers: {'Authorization': 'Bearer $t'},
      ).timeout(const Duration(seconds: 15)),
    );
    if (info.statusCode == 401) {
      throw Exception('Token is invalid or expired.');
    }
    if (info.statusCode >= 400) {
      throw Exception('Token verification failed (HTTP ${info.statusCode}).');
    }
    return fetchAccount(t, settings);
  }

  Future<AccountSummary> fetchAccount(
      String token, AppSettings settings) async {
    try {
      final res = await _withClient(
        settings,
        (client) => client.get(
          Uri.parse(
              '${_naiBase(settings.apiBaseUrl, 'https://api.novelai.net', settings)}/user/data'),
          headers: {'Authorization': 'Bearer $token'},
        ).timeout(const Duration(seconds: 15)),
      );
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
        hasActiveSubscription:
            sub['active'] is bool ? sub['active'] as bool : null,
      );
    } catch (_) {
      return const AccountSummary(hasToken: true, tierName: 'Verified');
    }
  }

  Future<(List<Uint8List>, int)> generate(
    String token,
    AppSettings settings,
    GenerateParams params,
    GenerateExtras extras,
  ) async {
    final seed = params.seedMode != 'random' && params.seed > 0
        ? params.seed
        : randomSeed();
    var payload = await buildPayload(token, settings, params, seed, extras);
    Uint8List bytes;
    try {
      bytes = await _postGenerate(token, settings, payload);
    } on NaiHttpException catch (error) {
      if (!_shouldRetryCharactersAsPipe(error, params, extras)) rethrow;
      payload = await buildPayload(
        token,
        settings,
        params,
        seed,
        extras,
        structuredCharacters: false,
      );
      bytes = await _postGenerate(token, settings, payload);
    }
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
    final seed = params.seedMode != 'random' && params.seed > 0
        ? params.seed
        : randomSeed();
    Future<Map<String, dynamic>> makePayload(bool structuredCharacters) async {
      final payload = await buildPayload(
        token,
        settings,
        params,
        seed,
        extras,
        structuredCharacters: structuredCharacters,
      );
      payload['action'] = 'img2img';
      final p = payload['parameters'] as Map<String, dynamic>;
      p['image'] = base64Encode(
        resizeImageToSize(imageBytes, params.width, params.height),
      );
      p['strength'] = i2i.strength.clamp(0, 1);
      p['noise'] = i2i.noise.clamp(0, 0.99);
      p['extra_noise_seed'] =
          i2i.extraNoiseSeed > 0 ? i2i.extraNoiseSeed : randomSeed();
      return payload;
    }

    var payload = await makePayload(true);
    Uint8List bytes;
    try {
      bytes = await _postGenerate(token, settings, payload);
    } on NaiHttpException catch (error) {
      if (!_shouldRetryCharactersAsPipe(error, params, extras)) rethrow;
      payload = await makePayload(false);
      bytes = await _postGenerate(token, settings, payload);
    }
    return (_extractImages(bytes), seed);
  }

  Future<(List<Uint8List>, int, String)> inpaint(
    String token,
    AppSettings settings,
    GenerateParams params,
    Uint8List imageBytes,
    Uint8List maskBytes,
    String inpaintModel,
    int width,
    int height,
    double strength,
    double noise,
  ) async {
    final seed = params.seedMode != 'random' && params.seed > 0
        ? params.seed
        : randomSeed();
    final prepared = prepareInpaintAssets(imageBytes, maskBytes);
    final candidates = <String>[inpaintModel];
    if (inpaintModel == 'nai-diffusion-4-5-curated-inpainting') {
      candidates.add('nai-diffusion-4-5-full-inpainting');
    } else if (inpaintModel == 'nai-diffusion-4-curated-inpainting') {
      candidates.add('nai-diffusion-4-full-inpainting');
    }
    Uint8List? bytes;
    var usedModel = inpaintModel;
    for (var index = 0; index < candidates.length; index++) {
      final candidate = candidates[index];
      final p = params.copy()
        ..model = candidate
        ..width = prepared.width
        ..height = prepared.height;
      final payload =
          await buildPayload(token, settings, p, seed, GenerateExtras());
      payload['action'] = 'infill';
      final parameters = payload['parameters'] as Map<String, dynamic>;
      parameters['image'] = base64Encode(prepared.imageBytes);
      parameters['mask'] = base64Encode(prepared.maskBytes);
      parameters['add_original_image'] = true;
      parameters['strength'] = strength.clamp(0.1, 1);
      parameters['noise'] = noise.clamp(0, 0.99);
      parameters['extra_noise_seed'] = randomSeed();
      try {
        bytes = await _postGenerate(token, settings, payload);
        usedModel = candidate;
        break;
      } on NaiHttpException catch (error) {
        final canTryCompatibleModel = index + 1 < candidates.length &&
            (error.statusCode == 400 || error.statusCode == 422) &&
            RegExp(
              r"(?:doesn'?t|does not|not)\s+support|unsupported|invalid\s+model|action\s+infill",
              caseSensitive: false,
            ).hasMatch(error.message);
        if (!canTryCompatibleModel) rethrow;
      }
    }
    if (bytes == null) {
      throw StateError('Inpaint request returned no result');
    }
    final images = _extractImages(bytes)
        .map((image) => cropImageToSize(image, width, height))
        .toList();
    return (images, seed, usedModel);
  }

  Future<Uint8List> upscale(String token, AppSettings settings,
      Uint8List imageBytes, int width, int height, int scale) async {
    final res = await _withClient(
      settings,
      (client) => _postWithRetry(
        () => client
            .post(
              Uri.parse(
                  '${_naiBase(settings.apiBaseUrl, 'https://api.novelai.net', settings)}/ai/upscale'),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept':
                    'application/zip, application/octet-stream, image/png',
              },
              body: jsonEncode({
                'image': base64Encode(imageBytes),
                'width': width,
                'height': height,
                'scale': scale
              }),
            )
            .timeout(const Duration(seconds: 180)),
      ),
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
    if (tool == 'emotion') {
      payload['prompt'] =
          '${options.emotion};;${options.emotionLevel.clamp(0, 5)}';
    }

    final res = await _withClient(
      settings,
      (client) => _postWithRetry(
        () => client
            .post(
              Uri.parse(
                  '${_naiBase(settings.imageBaseUrl, 'https://image.novelai.net', settings)}/ai/augment-image'),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept': 'application/zip, application/octet-stream',
              },
              body: jsonEncode(payload),
            )
            .timeout(const Duration(seconds: 180)),
      ),
    );
    return _extractImages(res.bodyBytes);
  }

  Future<Map<String, dynamic>> buildPayload(
    String token,
    AppSettings settings,
    GenerateParams params,
    int seed,
    GenerateExtras extras, {
    bool structuredCharacters = true,
  }) async {
    final basePrompt = _merge(params.stylePrompt, params.positivePrompt);
    final effectivePrompt = params.qualityToggle
        ? _merge(basePrompt, _qualityTags(params.model))
        : basePrompt;
    final effectiveNegative = _merge(
        params.negativePrompt, _ucPresetText(params.model, params.ucPreset));
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
    final hasCoords = structuredCharacters &&
        charCaptions.any((c) => (c['centers'] as List).isNotEmpty);
    final inputPrompt = structuredCharacters || charCaptions.isEmpty
        ? effectivePrompt
        : [
            effectivePrompt,
            ...charCaptions.map((caption) => caption['char_caption'] as String),
          ].where((value) => value.trim().isNotEmpty).join(' | ');

    final parameters = <String, dynamic>{
      'params_version': 3,
      'width': params.width,
      'height': params.height,
      'scale': params.cfgScale.clamp(0, 10),
      'sampler': params.sampler,
      'steps': params.steps,
      'n_samples': 1,
      'seed': seed,
      'noise_schedule':
          params.noiseSchedule.isEmpty ? 'native' : params.noiseSchedule,
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
    if (params.variety) parameters['skip_cfg_above_sigma'] = 58;
    if (params.sampler == 'k_euler_ancestral' &&
        params.noiseSchedule != 'native') {
      parameters['deliberate_euler_ancestral_bug'] = false;
      parameters['prefer_brownian'] = true;
    }

    if (params.isV4Plus) {
      parameters['use_coords'] = hasCoords;
      parameters['v4_prompt'] = {
        'caption': {
          'base_caption': inputPrompt,
          'char_captions': structuredCharacters ? charCaptions : <Object>[]
        },
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
        encoded
            .add(await _encodeVibeOrRaw(token, settings, params.model, vibe));
      }
      parameters['reference_image_multiple'] =
          encoded.map((e) => e.base64).toList();
      parameters['reference_information_extracted_multiple'] =
          encoded.map((e) => e.infoExtracted).toList();
      parameters['reference_strength_multiple'] =
          encoded.map((e) => e.strength).toList();
    }

    final precise = extras.preciseReferences;
    if (params.isV45 && precise.isNotEmpty) {
      // Confirmed against the official client's real request (multipart HAR):
      // precise references are uploaded as binary parts (director_ref_N) in
      // _sendGenerate; the JSON references them via director_reference_images_cached
      // and base_caption carries the TYPE. The old director_reference_images:[base64]
      // in a JSON POST is silently ignored — the image was never applied (which is
      // why precise reference had no effect). Each image is preprocessed to an
      // opaque RGB official size; we keep that base64 here only as the byte source.
      final processed = precise
          .map((item) => base64Encode(prepareDirectorReferenceImage(
              base64Decode(_stripBase64(item.base64)))))
          .toList();
      parameters['director_reference_images'] = processed;
      parameters['director_reference_images_cached'] = [
        for (var i = 0; i < processed.length; i++)
          {
            'cache_secret_key':
                sha256.convert(base64Decode(processed[i])).toString(),
            'data': 'director_ref_$i',
          }
      ];
      parameters['normalize_reference_strength_multiple'] = true;
      parameters['director_reference_descriptions'] = precise
          .map((item) => {
                'caption': {
                  'base_caption':
                      item.type.isEmpty ? 'character&style' : item.type,
                  'char_captions': <Object>[],
                },
                'legacy_uc': false,
              })
          .toList();
      parameters['director_reference_strength_values'] =
          precise.map((item) => _round2(item.strength.clamp(0, 1))).toList();
      parameters['director_reference_secondary_strength_values'] = precise
          .map((item) => _round2(1 - item.fidelity.clamp(0, 1)))
          .toList();
      parameters['director_reference_information_extracted'] =
          precise.map((_) => 1.0).toList();
    }

    return {
      'input': inputPrompt,
      'model': params.model,
      'action': 'generate',
      'parameters': parameters
    };
  }

  bool _shouldRetryCharactersAsPipe(
    NaiHttpException error,
    GenerateParams params,
    GenerateExtras extras,
  ) =>
      params.isV4Plus &&
      (error.statusCode == 400 || error.statusCode == 422) &&
      extras.charCaptions.any((caption) => caption.prompt.trim().isNotEmpty);

  Future<List<String>> listModels(
      AppSettings settings, String apiUrl, String apiKey) async {
    if (apiUrl.trim().isEmpty || apiKey.trim().isEmpty) return [];
    final res = await _withClient(
      settings,
      (client) => client.get(
        Uri.parse('${_base(apiUrl, apiUrl)}/models'),
        headers: {'Authorization': 'Bearer $apiKey'},
      ).timeout(const Duration(seconds: 20)),
      scope: ProxyScope.ai,
    );
    if (res.statusCode >= 400) {
      throw Exception('Model detection failed (HTTP ${res.statusCode})');
    }
    final data = jsonDecode(res.body);
    final raw = data is Map ? data['data'] : data;
    if (raw is! List) return [];
    return raw
        .map((e) => e is String ? e : e['id'])
        .whereType<String>()
        .toList()
      ..sort();
  }

  Future<AiTextResult> runTextAi({
    required AppSettings settings,
    required String apiKey,
    required String apiUrl,
    required String model,
    required String system,
    required String user,
    int maxTokens = 2000,
    String label = 'Text AI call',
  }) {
    if (apiKey.trim().isEmpty) {
      return Future.value(
        const AiTextResult(
          ok: false,
          message: 'Enter the conversion API Key first',
        ),
      );
    }
    return _chat(
      settings,
      apiUrl,
      apiKey,
      model,
      system,
      user,
      maxTokens: maxTokens,
      label: label,
      apiKind: 'convert',
    );
  }

  Future<AiTextResult> reversePrompt({
    required AppSettings settings,
    required String apiKey,
    required Uint8List image,
    required ReversePromptMode mode,
    required ReversePromptScope scope,
    required String hint,
    required bool knownCharacter,
    required String systemTemplate,
  }) async {
    if (apiKey.trim().isEmpty) {
      return const AiTextResult(
        ok: false,
        message: 'Enter the AI inspect API Key first',
      );
    }
    final system = [
      systemTemplate.trim().isEmpty
          ? _modeSystemPrompt(mode, reverse: true)
          : systemTemplate.trim(),
      knownCharacterRuntimeInstruction(mode, 'reverse', knownCharacter),
    ].join('\n\n');
    final scopeText = switch (scope) {
      ReversePromptScope.full => 'full image',
      ReversePromptScope.character => 'character only',
      ReversePromptScope.object => 'object only',
      ReversePromptScope.scene => 'scene/background only',
    };
    final hints = !settings.tagServerEnabled ||
            !settings.mcpForReverse ||
            hint.trim().isEmpty
        ? <TagSuggestion>[]
        : await searchTags(settings, hint, 16);
    final tagHints = hints.isEmpty
        ? ''
        : '\nCandidate Danbooru tags: ${hints.map((e) => e.tag).join(', ')}';
    final user = [
      {
        'type': 'image_url',
        'image_url': {
          'url': 'data:${_imageMime(image)};base64,${base64Encode(image)}',
          'detail': 'high'
        }
      },
      {
        'type': 'text',
        'text': [
          'Reverse scope: $scopeText.',
          if (hint.trim().isNotEmpty) 'Subject hint: ${hint.trim()}',
          modeUserInstruction(mode, 'reverse'),
          if (tagHints.isNotEmpty) tagHints,
        ].join('\n')
      }
    ];
    return _promptChat(
      settings: settings,
      apiUrl: settings.visionApiUrl,
      apiKey: apiKey,
      model: settings.visionApiModel,
      system: system,
      user: user,
      source: 'reverse',
      knownCharacter: knownCharacter,
    );
  }

  Future<AiTextResult> convertPrompt({
    required AppSettings settings,
    required String apiKey,
    required String text,
    required ReversePromptMode mode,
    required bool knownCharacter,
    required String systemTemplate,
  }) async {
    if (apiKey.trim().isEmpty) {
      return const AiTextResult(
        ok: false,
        message: 'Enter the conversion API Key first',
      );
    }
    final hints = mode == ReversePromptMode.natural ||
            !settings.tagServerEnabled ||
            !settings.mcpForConvert
        ? <TagSuggestion>[]
        : await searchTags(settings, text, 16);
    final hintText = hints.isEmpty
        ? ''
        : '\nCandidate Danbooru tags:\n${hints.map((e) => e.tag).join(', ')}';
    final user =
        'User description:\n$text\n\n${modeUserInstruction(mode, 'convert')}$hintText';
    final system = [
      systemTemplate.trim().isEmpty
          ? _modeSystemPrompt(mode, reverse: false)
          : systemTemplate.trim(),
      knownCharacterRuntimeInstruction(mode, 'convert', knownCharacter),
    ].join('\n\n');
    return _promptChat(
      settings: settings,
      apiUrl: settings.convertApiUrl,
      apiKey: apiKey,
      model: settings.convertApiModel,
      system: system,
      user: user,
      source: 'convert',
      knownCharacter: knownCharacter,
    );
  }

  Future<AiTextResult> _promptChat({
    required AppSettings settings,
    required String apiUrl,
    required String apiKey,
    required String model,
    required String system,
    required Object user,
    required String source,
    required bool knownCharacter,
  }) async {
    final raw = await _chat(
      settings,
      apiUrl,
      apiKey,
      model,
      system,
      user,
      label: source == 'reverse' ? 'AI inspect' : 'Prompt conversion',
      apiKind: source == 'reverse' ? 'vision' : 'convert',
    );
    if (!raw.ok) return raw;
    // Known-character mode already requires both variants in the single
    // upfront call (knownCharacterRuntimeInstruction), so we accept whatever
    // parsePromptVariantResponse extracts rather than spending a second
    // request repairing an incomplete JSON response — same single-request
    // strategy for both convert and reverse.
    final parsed = parsePromptVariantResponse(raw.text, knownCharacter);
    return AiTextResult(
      ok: true,
      message: 'Success',
      text: parsed.primary,
      variants: parsed.variants,
    );
  }

  Future<List<TagSuggestion>> searchTags(
      AppSettings settings, String query, int limit,
      {String apiKey = '',
      bool fallbackLocal = true,
      bool forceRemote = false}) async {
    if ((!settings.tagServerEnabled && !forceRemote) ||
        settings.tagServerUrl.trim().isEmpty ||
        query.trim().isEmpty) {
      return fallbackLocal ? _localTags(query, limit) : [];
    }
    final base = _base(settings.tagServerUrl, settings.tagServerUrl);
    final headers = <String, String>{};
    if (apiKey.trim().isNotEmpty) {
      headers['Authorization'] = 'Bearer ${apiKey.trim()}';
    }
    return _withClient(settings, (client) async {
      if (settings.tagServerType == 'http' || settings.tagServerType == 'sse') {
        try {
          final result = await callMcpTagSearch(
            client: client,
            endpoint: base,
            transport: settings.tagServerType,
            apiKey: apiKey,
            preferredTool: settings.tagServerTool,
            query: query,
            limit: limit,
          );
          final tags = _parseTagPayload(result).take(limit).toList();
          if (tags.isNotEmpty) return tags;
        } catch (_) {}
        return fallbackLocal ? _localTags(query, limit) : [];
      }
      final attempts = <Future<http.Response> Function()>[
        () => client.get(
            Uri.parse(
                '$base/search?q=${Uri.encodeQueryComponent(query)}&limit=$limit'),
            headers: headers),
        () => client.get(
            Uri.parse(
                '$base/tags?q=${Uri.encodeQueryComponent(query)}&limit=$limit'),
            headers: headers),
        () => client.post(Uri.parse('$base/search'),
            headers: {...headers, 'Content-Type': 'application/json'},
            body: jsonEncode({'query': query, 'limit': limit})),
      ];
      for (final attempt in attempts) {
        try {
          final res = await attempt().timeout(const Duration(seconds: 8));
          final tags =
              _parseTagPayload(jsonDecode(res.body)).take(limit).toList();
          if (tags.isNotEmpty) return tags;
        } catch (_) {}
      }
      return fallbackLocal ? _localTags(query, limit) : [];
    }, scope: ProxyScope.mcp);
  }

  Future<VibeTransferItem> _encodeVibeOrRaw(String token, AppSettings settings,
      String model, VibeTransferItem vibe) async {
    if (!model.contains('-4')) return vibe;
    final cacheKey = _vibeCacheKey(model, vibe);
    final cached = _vibeEncodeCache[cacheKey];
    if (cached != null) {
      return VibeTransferItem(
        base64: cached,
        infoExtracted: vibe.infoExtracted,
        strength: vibe.strength,
        sourcePath: vibe.sourcePath,
      );
    }
    try {
      final res = await _withClient(
        settings,
        (client) => client
            .post(
              Uri.parse(
                  '${_naiBase(settings.imageBaseUrl, 'https://image.novelai.net', settings)}/ai/encode-vibe'),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json'
              },
              body: jsonEncode({
                'image': _stripBase64(vibe.base64),
                'information_extracted': vibe.infoExtracted,
                'model': model
              }),
            )
            .timeout(const Duration(seconds: 60)),
      );
      if (res.statusCode >= 200 && res.statusCode < 300) {
        final encoded = base64Encode(res.bodyBytes);
        _vibeEncodeCache[cacheKey] = encoded;
        return VibeTransferItem(
          base64: encoded,
          infoExtracted: vibe.infoExtracted,
          strength: vibe.strength,
          sourcePath: vibe.sourcePath,
        );
      }
      throw Exception('HTTP ${res.statusCode}：${res.body}');
    } catch (error) {
      throw Exception(
        'Reference image encoding failed (encode-vibe): ${error.toString().replaceFirst('Exception: ', '')}',
      );
    }
  }

  String _vibeCacheKey(String model, VibeTransferItem vibe) =>
      '$model|${vibe.infoExtracted.toStringAsFixed(3)}|${vibe.base64.length}|${vibe.base64.hashCode}';

  double _round2(num value) => (value * 100).round() / 100;

  // Sends the generate-image request. With precise references present it must be
  // multipart/form-data — a JSON "request" part + the images as binary
  // director_ref_N parts — matching the official client (base64-in-JSON ignored).
  Future<http.Response> _sendGenerate(
    http.Client client,
    Uri uri,
    String token,
    Map<String, dynamic> payload,
    bool useMultipart,
  ) async {
    if (!useMultipart) {
      return client.post(
        uri,
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
          'Accept': 'application/zip, application/octet-stream',
        },
        body: jsonEncode(payload),
      );
    }
    final params = Map<String, dynamic>.from(payload['parameters'] as Map);
    final images =
        ((params.remove('director_reference_images') as List?) ?? const [])
            .cast<String>();
    final request = http.MultipartRequest('POST', uri)
      ..headers['Authorization'] = 'Bearer $token'
      ..headers['Accept'] = 'application/zip, application/octet-stream';

    // Once precise references switch the request to multipart, NovelAI treats
    // image-bearing JSON fields as form-part NAMES rather than inline base64.
    // Upload img2img/inpaint assets as binary parts and point the JSON fields at
    // those names; otherwise the API reports "image field references unknown
    // form part <base64>". This also covers mobile batch redraw, which calls the
    // same img2img method.
    void attachImagePart(String field) {
      final encoded = params[field];
      if (encoded is! String || encoded.isEmpty) return;
      request.files.add(http.MultipartFile.fromBytes(
        field,
        base64Decode(_stripBase64(encoded)),
        filename: field,
        contentType: MediaType('image', 'png'),
      ));
      params[field] = field;
    }

    attachImagePart('image');
    attachImagePart('mask');
    final requestJson = {...payload, 'parameters': params};
    request.files.add(http.MultipartFile.fromString(
      'request',
      jsonEncode(requestJson),
      contentType: MediaType('application', 'json'),
    ));
    for (var index = 0; index < images.length; index++) {
      request.files.add(http.MultipartFile.fromBytes(
        'director_ref_$index',
        base64Decode(images[index]),
        filename: 'blob',
        contentType: MediaType('image', 'png'),
      ));
    }
    final streamed = await client.send(request);
    return http.Response.fromStream(streamed);
  }

  Future<Uint8List> _postGenerate(
      String token, AppSettings settings, Map<String, dynamic> payload) async {
    _generationCancelled = false;
    final client = createProxyHttpClient(settings, scope: ProxyScope.nai);
    _activeGenerationClient = client;
    final uri = Uri.parse(
      '${_naiBase(settings.imageBaseUrl, 'https://image.novelai.net', settings)}/ai/generate-image',
    );
    final cached =
        (payload['parameters'] as Map?)?['director_reference_images_cached'];
    final useMultipart = cached is List && cached.isNotEmpty;
    try {
      for (var attempt = 0; attempt <= 3; attempt++) {
        if (_generationCancelled) throw const GenerationCancelledException();
        try {
          final response =
              await _sendGenerate(client, uri, token, payload, useMultipart)
                  .timeout(const Duration(seconds: 180));
          if (response.statusCode == 200 || response.statusCode == 201) {
            return response.bodyBytes;
          }
          if (response.statusCode != 429 || attempt >= 3) {
            throw NaiHttpException(response.statusCode, _errorText(response));
          }
          final retryAfter =
              int.tryParse(response.headers['retry-after'] ?? '');
          final waitMs = retryAfter != null && retryAfter > 0
              ? retryAfter * 1000
              : 2000 * (1 << attempt);
          await Future.delayed(Duration(milliseconds: min(waitMs, 30000)));
        } catch (_) {
          if (_generationCancelled) throw const GenerationCancelledException();
          rethrow;
        }
      }
      throw StateError('Generation request did not complete');
    } finally {
      if (identical(_activeGenerationClient, client)) {
        _activeGenerationClient = null;
      }
      client.close();
    }
  }

  Future<http.Response> _postWithRetry(Future<http.Response> Function() fn,
      {int retries = 3}) async {
    for (var attempt = 0; attempt <= retries; attempt++) {
      final res = await fn();
      if (res.statusCode == 200 || res.statusCode == 201) return res;
      if (res.statusCode != 429 || attempt >= retries) {
        throw NaiHttpException(res.statusCode, _errorText(res));
      }
      final retryAfter = int.tryParse(res.headers['retry-after'] ?? '');
      final waitMs = retryAfter != null && retryAfter > 0
          ? retryAfter * 1000
          : 2000 * (1 << attempt);
      await Future.delayed(Duration(milliseconds: min(waitMs, 30000)));
    }
    throw StateError('Request did not complete');
  }

  Future<AiTextResult> _chat(AppSettings settings, String apiUrl, String apiKey,
      String model, String system, Object user,
      {int maxTokens = 2000,
      String label = 'AI call',
      String apiKind = 'convert'}) async {
    final effectiveModel = model.trim().isEmpty ? 'gpt-4o-mini' : model.trim();
    final userSummary = _summarizeAiUser(user);
    try {
      Future<http.Response> postChat(int tokens) => _withClient(
            settings,
            (client) => client
                .post(
                  Uri.parse('${_base(apiUrl, apiUrl)}/chat/completions'),
                  headers: {
                    'Authorization': 'Bearer $apiKey',
                    'Content-Type': 'application/json'
                  },
                  body: jsonEncode({
                    'model': effectiveModel,
                    'max_tokens': tokens,
                    'messages': [
                      {'role': 'system', 'content': system},
                      {'role': 'user', 'content': user},
                    ],
                  }),
                )
                .timeout(const Duration(seconds: 180)),
            scope: ProxyScope.ai,
          );

      var res = await postChat(maxTokens);
      if (res.statusCode >= 400) {
        final result = AiTextResult(
          ok: false,
          message: 'AI call failed (HTTP ${res.statusCode}): ${res.body}',
        );
        _addAiLog(label, apiKind, effectiveModel, system, userSummary, result);
        return result;
      }
      var data = jsonDecode(res.body);
      var content =
          data['choices']?[0]?['message']?['content']?.toString().trim() ?? '';
      var finish = data['choices']?[0]?['finish_reason']?.toString();
      // Reasoning models spend the whole budget on hidden reasoning, returning
      // empty content with finish_reason "length". Retry once with a much larger
      // budget so the actual answer has room (billed per real token).
      if (content.isEmpty && finish == 'length') {
        res = await postChat(max(maxTokens * 8, 32000));
        if (res.statusCode < 400) {
          data = jsonDecode(res.body);
          content =
              data['choices']?[0]?['message']?['content']?.toString().trim() ??
                  '';
          finish = data['choices']?[0]?['finish_reason']?.toString();
        }
      }
      final result = content.isEmpty
          ? AiTextResult(
              ok: false,
              message: finish == 'length'
                  ? 'The API response was truncated and empty. This model spent the budget on reasoning; use a non-reasoning model or raise max output tokens.'
                  : 'AI returned empty content')
          : AiTextResult(
              ok: true,
              message: 'Success',
              text: _cleanPrompt(content),
            );
      _addAiLog(label, apiKind, effectiveModel, system, userSummary, result);
      return result;
    } catch (e) {
      final result = AiTextResult(
          ok: false, message: e.toString().replaceFirst('Exception: ', ''));
      _addAiLog(label, apiKind, effectiveModel, system, userSummary, result);
      return result;
    }
  }

  void _addAiLog(
    String label,
    String apiKind,
    String model,
    String system,
    String user,
    AiTextResult result,
  ) {
    _aiCallLog.add(AiCallLogEntry(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      time: DateTime.now(),
      label: label,
      api: apiKind,
      model: model,
      systemPrompt: system,
      userText: user,
      ok: result.ok,
      response: result.ok ? result.text : result.message,
    ));
    if (_aiCallLog.length > 200) _aiCallLog.removeAt(0);
  }

  String _summarizeAiUser(Object user) {
    if (user is String) return user;
    if (user is List) {
      return user.map((item) {
        if (item is Map && item['type'] == 'image_url') {
          return '[image omitted]';
        }
        if (item is Map && item['type'] == 'text') {
          return item['text']?.toString() ?? '';
        }
        return item.toString();
      }).join('\n');
    }
    return user.toString();
  }

  Future<T> _withClient<T>(
    AppSettings settings,
    Future<T> Function(http.Client client) action, {
    ProxyScope scope = ProxyScope.nai,
  }) async {
    final client = createProxyHttpClient(settings, scope: scope);
    try {
      return await action(client);
    } finally {
      client.close();
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
      if (bytes.length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50) {
        return [bytes];
      }
      return [];
    }
  }

  String _errorText(http.Response res) {
    try {
      final body = jsonDecode(res.body);
      if (body is Map && body['message'] != null) {
        return 'Request failed (${res.statusCode}): ${body['message']}';
      }
    } catch (_) {}
    return 'Request failed (HTTP ${res.statusCode}).';
  }

  String _base(String value, String fallback) {
    final v = value.trim().isEmpty ? fallback : value.trim();
    return v.replaceAll(RegExp(r'/+$'), '');
  }

  String _naiBase(
    String value,
    String fallback,
    AppSettings settings,
  ) =>
      resolveNovelAiBaseUrl(value, fallback, settings);

  String _merge(String a, String b) {
    final seen = <String>{};
    final result = <String>[];
    for (final segment in [a, b]) {
      for (final part in segment.split(',').map((value) => value.trim())) {
        if (part.isEmpty) continue;
        if (seen.add(part.toLowerCase())) result.add(part);
      }
    }
    return result.join(', ');
  }

  String _qualityTags(String model) {
    return switch (_normalizeModel(model)) {
      'nai-diffusion-4-5-full' => 'very aesthetic, masterpiece, no text',
      'nai-diffusion-4-5-curated' =>
        'masterpiece, no text, -0.8::feet::, rating:general',
      'nai-diffusion-4-full' =>
        'no text, best quality, very aesthetic, absurdres',
      'nai-diffusion-4-curated' =>
        'rating:general, amazing quality, very aesthetic, absurdres',
      'nai-diffusion-3' =>
        'best quality, amazing quality, very aesthetic, absurdres',
      _ => '',
    };
  }

  String _ucPresetText(String model, int preset) {
    if (preset == 2 || preset == 3) return '';
    final heavy = preset == 0;
    return switch (_normalizeModel(model)) {
      'nai-diffusion-4-5-full' => heavy
          ? 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page'
          : 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
      'nai-diffusion-4-5-curated' => heavy
          ? 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page'
          : 'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
      'nai-diffusion-4-full' => heavy
          ? 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks'
          : 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing',
      'nai-diffusion-4-curated' => heavy
          ? 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts'
          : 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature',
      'nai-diffusion-3' => heavy
          ? 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]'
          : 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
      _ => '',
    };
  }

  String _normalizeModel(String model) => model.endsWith('-inpainting')
      ? model.substring(0, model.length - '-inpainting'.length)
      : model;

  String _stripBase64(String value) =>
      value.contains(',') ? value.split(',').last : value;

  String _imageMime(Uint8List bytes) {
    if (bytes.length >= 3 &&
        bytes[0] == 0xff &&
        bytes[1] == 0xd8 &&
        bytes[2] == 0xff) {
      return 'image/jpeg';
    }
    if (bytes.length >= 12 &&
        String.fromCharCodes(bytes.sublist(0, 4)) == 'RIFF' &&
        String.fromCharCodes(bytes.sublist(8, 12)) == 'WEBP') {
      return 'image/webp';
    }
    return 'image/png';
  }

  String _cleanPrompt(String raw) => raw
      .trim()
      .replaceFirst(
          RegExp(r'^```(?:text|txt|prompt|markdown)?\s*', caseSensitive: false),
          '')
      .replaceFirst(RegExp(r'\s*```$'), '')
      .replaceFirst(
          RegExp(r'^(?:output|prompt|result|答案|输出|结果)\s*[:：]\s*',
              caseSensitive: false),
          '')
      .replaceAll('\\n', ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  String _modeSystemPrompt(ReversePromptMode mode, {required bool reverse}) {
    final task =
        reverse ? 'infer from the image' : 'convert the user input into';
    switch (mode) {
      case ReversePromptMode.natural:
        return 'You are a NovelAI V4.5 prompt expert. Please $task a 100% English natural-language prompt. Output one line only, with no explanation and no Danbooru tag list. For multiple characters, use base scene | character 1 | character 2.';
      case ReversePromptMode.mixed:
        return 'You are a NovelAI V4.5 / Danbooru prompt expert. Please $task a mixed prompt: 80% Danbooru tags + 20% concise natural language. Output one line only.';
      case ReversePromptMode.tags:
        return 'You are a NovelAI V4.5 / Danbooru prompt expert. Please $task an English Danbooru-tag prompt. Output one line only, separated by English commas.';
    }
  }

  List<TagSuggestion> _parseTagPayload(Object? payload) {
    if (payload == null) return [];
    if (payload is List) {
      return payload.map(_tagFromAny).whereType<TagSuggestion>().toList();
    }
    if (payload is String) {
      try {
        return _parseTagPayload(jsonDecode(payload));
      } catch (_) {
        return payload
            .split(RegExp(r'[\n,]'))
            .map(_tagFromAny)
            .whereType<TagSuggestion>()
            .toList();
      }
    }
    if (payload is Map) {
      final content = payload['content'];
      if (content is List) {
        final text = content
            .map((e) => e is Map ? e['text'] : e)
            .whereType<String>()
            .join('\n');
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
      final tag = (item['tag'] ??
              item['name'] ??
              item['value'] ??
              item['label'] ??
              item['text'])
          ?.toString()
          .trim();
      if (tag == null || tag.isEmpty) return null;
      final count = int.tryParse(
              (item['count'] ?? item['post_count'] ?? item['posts'] ?? 0)
                  .toString()) ??
          0;
      final desc = (item['description'] ?? item['translation'] ?? item['zh'])
          ?.toString();
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
