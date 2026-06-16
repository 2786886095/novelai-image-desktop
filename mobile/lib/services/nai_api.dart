import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:http/http.dart' as http;

import '../models/nai_models.dart';

/// Dart port of electron/ipc/nai.ts — Phase 1 covers token verification and
/// text-to-image generation. The payload shape mirrors the desktop client so
/// V4/V4.5 (v4_prompt) and legacy V3 (sm/sm_dyn) both work.
class NaiApi {
  static const _apiBase = 'https://api.novelai.net';
  static const _imageBase = 'https://image.novelai.net';

  final _rng = Random.secure();

  int _randomSeed() => 1 + _rng.nextInt(2147483646);

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

  /// Verify a persistent API token and read the account summary.
  Future<AccountSummary> verifyToken(String token) async {
    final t = token.trim();
    if (t.isEmpty) return const AccountSummary(hasToken: false);

    final info = await http.get(
      Uri.parse('$_apiBase/user/information'),
      headers: {'Authorization': 'Bearer $t'},
    ).timeout(const Duration(seconds: 15));
    if (info.statusCode == 401) {
      throw Exception('Token 无效或已过期。');
    }
    if (info.statusCode >= 400) {
      throw Exception('Token 验证失败（HTTP ${info.statusCode}）。');
    }

    return fetchAccount(t);
  }

  Future<AccountSummary> fetchAccount(String token) async {
    try {
      final res = await http.get(
        Uri.parse('$_apiBase/user/data'),
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
      );
    } catch (_) {
      return const AccountSummary(hasToken: true, tierName: '已验证');
    }
  }

  String _qualityTags(String model) {
    if (model.startsWith('nai-diffusion-4-5')) {
      return 'location, very aesthetic, masterpiece, no text';
    }
    if (model.startsWith('nai-diffusion-4')) {
      return 'no text, best quality, very aesthetic, absurdres';
    }
    return 'best quality, amazing quality, very aesthetic, absurdres';
  }

  String _merge(String a, String b) {
    final left = a.trim();
    final right = b.trim();
    if (left.isEmpty) return right;
    if (right.isEmpty) return left;
    return '$left, $right';
  }

  Map<String, dynamic> buildPayload(GenerateParams p, int seed) {
    final effectivePrompt = p.qualityToggle
        ? _merge(p.positivePrompt, _qualityTags(p.model))
        : p.positivePrompt;
    final effectiveNegative = p.negativePrompt;

    final parameters = <String, dynamic>{
      'params_version': 3,
      'width': p.width,
      'height': p.height,
      'scale': p.cfgScale,
      'sampler': p.sampler,
      'steps': p.steps,
      'n_samples': 1,
      'seed': seed,
      'noise_schedule': p.noiseSchedule.isEmpty ? 'native' : p.noiseSchedule,
      'uc': effectiveNegative,
      'negative_prompt': effectiveNegative,
      'ucPreset': p.ucPreset,
      'cfg_rescale': p.cfgRescale,
      'legacy': false,
      'legacy_v3_extend': false,
      'dynamic_thresholding': p.cfgRescale > 0,
      'qualityToggle': p.qualityToggle,
    };

    if (p.variety) parameters['variety'] = true;

    if (p.isV4Plus) {
      parameters['use_coords'] = false;
      parameters['v4_prompt'] = {
        'caption': {'base_caption': effectivePrompt, 'char_captions': []},
        'use_coords': false,
        'use_order': true,
      };
      parameters['v4_negative_prompt'] = {
        'caption': {'base_caption': effectiveNegative, 'char_captions': []},
        'use_coords': false,
        'use_order': false,
        'legacy_uc': !p.isV45,
      };
    } else {
      parameters['sm'] = p.smea;
      parameters['sm_dyn'] = p.smea && p.smeaDyn;
    }

    return {
      'input': effectivePrompt,
      'model': p.model,
      'action': 'generate',
      'parameters': parameters,
    };
  }

  /// Generate an image. Returns raw PNG bytes (first image in the zip) plus the
  /// actual seed used. Retries transient 429/5xx with backoff.
  Future<(Uint8List, int)> generate(String token, GenerateParams p) async {
    final seed = p.seed > 0 ? p.seed : _randomSeed();
    final payload = buildPayload(p, seed);

    final bytes = await _postWithRetry(token, payload);
    final images = _extractImages(bytes);
    if (images.isEmpty) {
      throw Exception('API 返回成功，但压缩包中没有图片。');
    }
    return (images.first, seed);
  }

  Future<Uint8List> _postWithRetry(
    String token,
    Map<String, dynamic> payload, {
    int retries = 3,
  }) async {
    var attempt = 0;
    while (true) {
      try {
        final res = await http
            .post(
              Uri.parse('$_imageBase/ai/generate-image'),
              headers: {
                'Authorization': 'Bearer $token',
                'Content-Type': 'application/json',
                'Accept': 'application/zip, application/octet-stream',
              },
              body: jsonEncode(payload),
            )
            .timeout(const Duration(seconds: 180));
        if (res.statusCode == 200 || res.statusCode == 201) {
          return res.bodyBytes;
        }
        final retryable = res.statusCode == 429 ||
            res.statusCode == 500 ||
            res.statusCode == 502 ||
            res.statusCode == 503 ||
            res.statusCode == 524;
        if (!retryable || attempt >= retries) {
          throw Exception(_errorText(res));
        }
        final retryAfter = int.tryParse(res.headers['retry-after'] ?? '');
        final waitMs =
            (retryAfter != null && retryAfter > 0) ? retryAfter * 1000 : 2000 * (1 << attempt);
        attempt++;
        await Future.delayed(Duration(milliseconds: min(waitMs, 30000)));
      } on Exception {
        if (attempt >= retries) rethrow;
        attempt++;
        await Future.delayed(Duration(milliseconds: 2000 * (1 << (attempt - 1))));
      }
    }
  }

  String _errorText(http.Response res) {
    try {
      final body = jsonDecode(res.body);
      if (body is Map && body['message'] != null) {
        return '生成失败（${res.statusCode}）：${body['message']}';
      }
    } catch (_) {}
    return '生成失败（HTTP ${res.statusCode}）。';
  }

  List<Uint8List> _extractImages(Uint8List zipBytes) {
    try {
      final archive = ZipDecoder().decodeBytes(zipBytes);
      final out = <Uint8List>[];
      for (final file in archive) {
        if (file.isFile && file.content is List<int>) {
          final data = file.content as List<int>;
          if (data.isNotEmpty) out.add(Uint8List.fromList(data));
        }
      }
      return out;
    } catch (_) {
      // Not a zip — some endpoints return the PNG directly.
      if (zipBytes.length > 8 && zipBytes[0] == 0x89 && zipBytes[1] == 0x50) {
        return [zipBytes];
      }
      return [];
    }
  }
}
