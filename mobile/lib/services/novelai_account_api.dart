import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../billing/anlas.dart';
import '../images/image_processing.dart';
import '../images/upscale_plan.dart';
import '../models/nai_models.dart';
import 'generation_scope.dart';
import 'nai_api.dart';
import 'nai_stream.dart';
import 'novelai_accounts.dart';
import 'novelai_bounded_http.dart';
import 'proxy_http_client.dart';

/// Account-bound transport adapter. NaiApi remains unchanged for non-image
/// tools and pure payload building; no inherited paid transport is invoked.
class NovelAiAccountApi extends NaiApi {
  final NovelAiAccounts accounts;
  final FutureOr<http.Client> Function(AppSettings, Uri) clientFactory;
  final Set<http.Client> _clients = {};
  int _operations = 0;
  int _cancelEpoch = 0;
  static final _epochZone = Object();
  void _checkCancelled() {
    final captured = Zone.current[_epochZone] as (NovelAiAccountApi, int)?;
    if (captured != null &&
        identical(captured.$1, this) &&
        captured.$2 != _cancelEpoch) {
      throw const GenerationCancelledException();
    }
    GenerationScope.current?.check();
  }

  bool get inFlight => _operations > 0;
  NovelAiAccountApi(this.accounts,
      {FutureOr<http.Client> Function(AppSettings, Uri)? clientFactory})
      : clientFactory = clientFactory ??
            ((s, u) =>
                createProxyHttpClientForUri(s, u, scope: ProxyScope.nai));

  Future<T> _run<T>(String token, AppSettings settings,
          Future<T> Function(NovelAiCredentialSnapshot, AppSettings) work) =>
      accounts.operation((snapshot) async {
        _operations++;
        final frozen = snapshot.settings(settings);
        try {
          GenerationScope.current?.credentials(token, frozen);
          final parent = Zone.current[_epochZone] as (NovelAiAccountApi, int)?;
          return await runZoned(() {
            _checkCancelled();
            return work(snapshot, frozen);
          }, zoneValues: {
            _epochZone: parent?.$1 == this ? parent : (this, _cancelEpoch)
          });
        } finally {
          _operations--;
        }
      }, expectedToken: token);

  Future<http.Response> _send(NovelAiCredentialSnapshot snapshot,
      AppSettings settings, http.BaseRequest request) async {
    _checkCancelled();
    snapshot.profile.validate(snapshot.token);
    GenerationScope.current?.credentials(snapshot.token, settings);
    request.followRedirects = false;
    request.maxRedirects = 0;
    request.headers['Authorization'] = 'Bearer ${snapshot.token}';
    if (request.method == 'GET') {
      void Function()? detach;
      try {
        return await novelAiBoundedRequest(
          openClient: () => clientFactory(settings, request.url),
          request: request,
          maxResponseBytes: 256 * 1024,
          bodyStatuses: const {200},
          onOpened: (client) {
            _checkCancelled();
            _clients.add(client);
            detach = GenerationScope.current?.attach(client.close);
          },
          onClosed: _clients.remove,
        ).then((response) {
          if (response.statusCode != 200) {
            throw NaiHttpException(response.statusCode,
                'NovelAI HTTP ${response.statusCode}；未自动重试或回退');
          }
          return response;
        });
      } on http.ClientException {
        throw const NaiNetworkException('No retry');
      } finally {
        detach?.call();
      }
    }
    final client = await clientFactory(settings, request.url);
    _clients.add(client);
    void Function()? detach;
    try {
      _checkCancelled();
      detach = GenerationScope.current?.attach(client.close);
      final response = await (() async {
        final response = await client.send(request);
        return http.Response.fromStream(response);
      })()
          .timeout(const Duration(seconds: 180));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        // Do not echo remote error bodies (they can contain credentials).
        throw NaiHttpException(response.statusCode,
            'NovelAI HTTP ${response.statusCode}；未自动重试或回退');
      }
      return response;
    } on http.ClientException {
      throw const NaiNetworkException('No retry');
    } finally {
      detach?.call();
      _clients.remove(client);
      client.close();
    }
  }

  Future<http.Response> _post(NovelAiCredentialSnapshot snapshot,
      AppSettings settings, String path, Map<String, dynamic> body) {
    final request = http.Request('POST', snapshot.imageRoute(path))
      ..headers['Content-Type'] = 'application/json'
      ..body = jsonEncode(body);
    return _send(snapshot, settings, request);
  }

  @override
  void cancelActiveGeneration() {
    _cancelEpoch++;
    for (final client in _clients.toList()) {
      client.close();
    }
    super.cancelActiveGeneration();
  }

  @override
  Future<AccountSummary> verifyToken(String token, AppSettings settings) async {
    final snapshot = NovelAiCredentialSnapshot(
        const NovelAiAccount(id: 'verify', label: 'Official', method: 'token'),
        token.trim());
    _operations++;
    try {
      final response = await _send(snapshot, snapshot.settings(settings),
          http.Request('GET', snapshot.imageRoute('/user/data')));
      return _parseAccountData(response.body);
    } finally {
      _operations--;
    }
  }

  @override
  Future<AccountSummary> fetchAccount(String token, AppSettings settings) =>
      _run(token, settings, (snapshot, frozen) async {
        if (snapshot.profile.relay) {
          return const AccountSummary(
              hasToken: true, tierName: '第三方 · 余额未知', stale: true);
        }
        try {
          final response = await _send(snapshot, frozen,
              http.Request('GET', snapshot.imageRoute('/user/data')));
          return _parseAccountData(response.body);
        } catch (_) {
          return const AccountSummary(hasToken: true, stale: true);
        }
      });
  @override
  Future<int?> requestOfficialGenerationPrice(
          String token, AppSettings settings, GenerateParams params) =>
      _run(token, settings, (snapshot, frozen) async {
        if (snapshot.profile.relay) {
          return null; // Unknown relay read-only/price routes: never probe.
        }
        try {
          final payload = await super
              .buildPayload(token, frozen, params, 1, GenerateExtras());
          final response = await _post(
              snapshot, frozen, '/ai/generate-image/request-price', payload);
          return extractOfficialAnlasPrice(jsonDecode(response.body));
        } catch (_) {
          return null;
        }
      });

  @override
  Future<Map<String, dynamic>> buildPayload(String token, AppSettings settings,
          GenerateParams params, int seed, GenerateExtras extras,
          {bool structuredCharacters = true}) =>
      _run(token, settings, (snapshot, frozen) async {
        final copy = extras.copy();
        if (copy.vibeImages.isNotEmpty && !params.supportsVibeTransfer) {
          throw const FormatException('当前模型不支持 Vibe Transfer');
        }
        final encoded = <VibeTransferItem>[];
        for (final vibe in copy.vibeImages) {
          vibe.validateModel(params.model);
          if (!params.model.contains('-4') ||
              vibe.matchingEncoding(params.model) != null) {
            encoded.add(vibe);
            continue;
          }
          final bytes = await processingImageBytes(
              base64Decode(vibe.base64.split(',').last));
          final response = await _post(snapshot, frozen, '/ai/encode-vibe', {
            'image': base64Encode(bytes),
            'information_extracted': vibe.infoExtracted,
            'model': params.model
          });
          encoded.add(VibeTransferItem(
              base64: vibe.base64,
              infoExtracted: vibe.infoExtracted,
              strength: vibe.strength,
              encodings: [
                VibeEncoding(
                    model: params.model,
                    infoExtracted: vibe.infoExtracted,
                    encoding: base64Encode(response.bodyBytes))
              ]));
        }
        copy.vibeImages = encoded;
        // All V4 vibes now carry matching encodings; the inherited pure builder
        // cannot invoke its legacy network encoder/retry path.
        return super.buildPayload(token, frozen, params, seed, copy,
            structuredCharacters: structuredCharacters);
      });

  Future<List<Uint8List>> _generate(NovelAiCredentialSnapshot snapshot,
      AppSettings frozen, Map<String, dynamic> payload) async {
    final p = Map<String, dynamic>.from(payload['parameters'] as Map);
    final refs =
        (p['director_reference_images'] as List?)?.cast<String>() ?? [];
    http.Response response;
    if (refs.isEmpty) {
      response = await _post(snapshot, frozen, '/ai/generate-image', payload);
    } else {
      final request = http.MultipartRequest(
          'POST', snapshot.imageRoute('/ai/generate-image'));
      p.remove('director_reference_images');
      for (final field in ['image', 'mask']) {
        final value = p[field];
        if (value is String && value.isNotEmpty) {
          request.files.add(http.MultipartFile.fromBytes(
              field, base64Decode(value.split(',').last),
              filename: field, contentType: MediaType('image', 'png')));
          p[field] = field;
        }
      }
      request.files.add(http.MultipartFile.fromString(
          'request', jsonEncode({...payload, 'parameters': p}),
          contentType: MediaType('application', 'json')));
      for (var i = 0; i < refs.length; i++) {
        request.files.add(http.MultipartFile.fromBytes(
            'director_ref_$i', base64Decode(refs[i].split(',').last),
            filename: 'blob', contentType: MediaType('image', 'png')));
      }
      response = await _send(snapshot, frozen, request);
    }
    return _images(response.bodyBytes);
  }

  @override
  Future<(List<Uint8List>, int)> generate(String token, AppSettings settings,
          GenerateParams params, GenerateExtras extras,
          {void Function(NaiGenerationPreview)? onPreview}) =>
      _run(token, settings, (snapshot, frozen) async {
        final p = params.normalized();
        final seed =
            p.seedMode != 'random' && p.seed > 0 ? p.seed : randomSeed();
        final payload =
            await buildPayload(token, frozen, p, seed, extras.copy());
        // Raw routes are common to official and explicitly configured relays. No
        // speculative streaming request followed by another billable submission.
        return (await _generate(snapshot, frozen, payload), seed);
      });
  @override
  Future<(List<Uint8List>, int)> img2img(
          String token,
          AppSettings settings,
          GenerateParams params,
          GenerateExtras extras,
          Uint8List imageBytes,
          I2IParams i2i) =>
      _run(token, settings, (snapshot, frozen) async {
        final p = params.normalized();
        final seed =
            p.seedMode != 'random' && p.seed > 0 ? p.seed : randomSeed();
        final strength = i2i.strength,
            enhance = i2i.upscaledEnhance,
            noiseSeed = i2i.extraNoiseSeed;
        final payload =
            await buildPayload(token, frozen, p, seed, extras.copy());
        payload['action'] = 'img2img';
        final parameters = payload['parameters'] as Map<String, dynamic>;
        parameters['image'] = base64Encode(resizeImageToSize(
            await processingImageBytes(imageBytes), p.width, p.height));
        parameters['strength'] = strength.clamp(0, 1);
        parameters['noise'] = 0;
        parameters['extra_noise_seed'] =
            noiseSeed > 0 ? noiseSeed : randomSeed();
        if (enhance && p.model.startsWith('nai-diffusion-5-')) {
          parameters['upscaled_enhance'] = true;
        }
        return (await _generate(snapshot, frozen, payload), seed);
      });
  @override
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
          double noise) =>
      _run(token, settings, (snapshot, frozen) async {
        final p = params.normalized();
        final seed =
            p.seedMode != 'random' && p.seed > 0 ? p.seed : randomSeed();
        final prepared = prepareInpaintAssets(
            await processingImageBytes(imageBytes),
            await processingImageBytes(maskBytes),
            targetWidth: p.width,
            targetHeight: p.height);
        p
          ..model = inpaintModel
          ..width = prepared.width
          ..height = prepared.height;
        final payload =
            await buildPayload(token, frozen, p, seed, GenerateExtras());
        payload['action'] = 'infill';
        final parameters = payload['parameters'] as Map<String, dynamic>;
        parameters.addAll({
          'image': base64Encode(prepared.imageBytes),
          'mask': base64Encode(prepared.maskBytes),
          'add_original_image': false,
          'inpaintImg2ImgStrength': strength.clamp(0, 1),
          'strength': 0.7,
          'noise': 0,
          'extra_noise_seed': max(0, seed - 1)
        });
        if (strength.clamp(0, 1) != 1) {
          parameters['img2img'] = {
            'strength': strength.clamp(0, 1),
            'color_correct': true
          };
        }
        final images = await _generate(snapshot, frozen, payload);
        return (
          images.map((b) => compositeInpaintResult(b, prepared)).toList(),
          seed,
          inpaintModel
        );
      });
  @override
  Future<Uint8List> upscale(String token, AppSettings settings,
          Uint8List imageBytes, int scale, String model) =>
      _run(token, settings, (snapshot, frozen) async {
        var input = await processingImageBytes(imageBytes);
        final dims = decodeImageDimensions(input);
        final plan = planUpscale(dims.$1, dims.$2, scale);
        if (plan.exceedsLimit) throw const FormatException('超分尺寸超过限制');
        input = resizeImageToSize(input, plan.inputWidth, plan.inputHeight);
        for (var pass = 0; pass < plan.passes; pass++) {
          final response = await _post(snapshot, frozen, '/ai/upscale',
              buildUpscalePayload(input, model));
          input = _images(response.bodyBytes).first;
          final actual = decodeImageDimensions(input);
          if (actual.$1 != plan.inputWidth * (1 << (pass + 1)) ||
              actual.$2 != plan.inputHeight * (1 << (pass + 1))) {
            throw const FormatException('超分返回尺寸与请求不符');
          }
        }
        return input;
      });
  @override
  Future<List<Uint8List>> augment(
          String token,
          AppSettings settings,
          Uint8List imageBytes,
          int width,
          int height,
          String tool,
          AugmentOptions options) =>
      _run(token, settings, (snapshot, frozen) async {
        final payload = <String, dynamic>{
          'width': width,
          'height': height,
          'req_type': tool,
          'defry': options.defry.clamp(0, 5).round()
        };
        if (tool == 'colorize') payload['prompt'] = options.colorizePrompt;
        if (tool == 'emotion') {
          payload['prompt'] =
              '${options.emotion};;${options.emotionLevel.clamp(0, 5).round()}';
        }
        payload['image'] = base64Encode(await processingImageBytes(imageBytes));
        return _images(
            (await _post(snapshot, frozen, '/ai/augment-image', payload))
                .bodyBytes);
      });
  List<Uint8List> _images(Uint8List bytes) {
    if (bytes.length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50) {
      return [bytes];
    }
    final images = ZipDecoder()
        .decodeBytes(bytes)
        .where((f) =>
            f.isFile &&
            RegExp(r'\.(png|webp|jpg|jpeg)$', caseSensitive: false)
                .hasMatch(f.name))
        .map((f) => Uint8List.fromList(f.content as List<int>))
        .toList();
    if (images.isEmpty) throw const FormatException('服务未返回图片；未重新提交');
    return images;
  }

  AccountSummary _parseAccountData(String body) {
    final data = jsonDecode(body) as Map<String, dynamic>;
    Map<String, dynamic>? map(Object? v) =>
        v is Map ? Map<String, dynamic>.from(v) : null;
    final direct = map(data['data']), info = map(data['information']);
    final sub = map(data['subscription']) ??
        map(info?['subscription']) ??
        map(direct?['subscription']) ??
        map(map(direct?['information'])?['subscription']) ??
        {};
    final steps = sub['trainingStepsLeft'];
    final balance = steps is Map
        ? ((steps['fixedTrainingStepsLeft'] ?? 0) as num).toInt() +
            ((steps['purchasedTrainingSteps'] ?? 0) as num).toInt()
        : steps is num
            ? steps.toInt()
            : null;
    final tier = sub['tier'] as int?;
    final usage = map(sub['usage']);
    final opus =
        usage?['percent'] is num && usage?['timeUntilNextPercent'] is num
            ? OpusGenerationUsage(
                percent: (usage!['percent'] as num).toDouble(),
                isNegative: usage['isNegative'] == true,
                timeUntilNextPercent:
                    max(0, (usage['timeUntilNextPercent'] as num).toDouble()))
            : null;
    return AccountSummary(
        hasToken: true,
        anlasBalance: balance,
        tierLevel: tier,
        tierName: switch (tier) {
          1 => 'Tablet',
          2 => 'Scroll',
          3 => 'Opus',
          _ => 'NovelAI'
        },
        hasActiveSubscription: sub['active'] as bool?,
        opusUsage: opus,
        opusUsageUpdatedAt:
            opus == null ? null : DateTime.now().millisecondsSinceEpoch);
  }
}
