import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
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
      AppSettings settings, http.BaseRequest request,
      {bool allowReadStatus = false}) async {
    _checkCancelled();
    snapshot.profile.validate(snapshot.token);
    GenerationScope.current?.credentials(snapshot.token, settings);
    request.followRedirects = false;
    request.maxRedirects = 0;
    request.headers['Authorization'] = 'Bearer ${snapshot.token}';
    final readOnly = request.method == 'GET';
    void Function()? detach;
    try {
      // Bound client/proxy opening, headers and body together. Never collect an
      // unbounded paid/error response before checking its HTTP status.
      final response = await novelAiBoundedRequest(
        openClient: () => clientFactory(settings, request.url),
        request: request,
        timeout: Duration(seconds: readOnly ? 8 : 180),
        maxResponseBytes: readOnly ? 256 * 1024 : 128 * 1024 * 1024,
        bodyStatuses: readOnly
            ? const {200}
            : {for (var status = 200; status < 300; status++) status},
        onOpened: (client) {
          _checkCancelled();
          _clients.add(client);
          detach = GenerationScope.current?.attach(client.close);
        },
        onClosed: _clients.remove,
      );
      _checkCancelled();
      if (readOnly
          ? response.statusCode != 200 && !allowReadStatus
          : response.statusCode < 200 || response.statusCode >= 300) {
        // Redirect/error bodies are cancelled without reading or disclosure.
        throw NaiHttpException(response.statusCode,
            'NovelAI HTTP ${response.statusCode}；未自动重试或回退');
      }
      return response;
    } on http.ClientException {
      _checkCancelled();
      throw const NaiNetworkException('No retry');
    } catch (_) {
      _checkCancelled();
      rethrow;
    } finally {
      detach?.call();
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

  /// Same declared read-only routes as desktop. Never sends a paid request.
  Future<AccountSummary> verifyCandidate(
      NovelAiCredentialSnapshot snapshot, AppSettings settings) async {
    snapshot.profile.validate(snapshot.token);
    _operations++;
    try {
      final frozen = snapshot.settings(settings);
      final urls = [
        snapshot.imageRoute('/user/data'),
        if (snapshot.profile.relay)
          Uri.parse('${snapshot.profile.apiBaseUrl}/user/subscription'),
        if (snapshot.profile.relay) _relayModelsUri(snapshot.profile.apiBaseUrl),
      ];
      var nativeHtml = false;
      for (var i = 0; i < urls.length; i++) {
        final response = await _send(
            snapshot, frozen, http.Request('GET', urls[i]),
            allowReadStatus: true);
        final status = response.statusCode;
        if ([404, 405, 501].contains(status) && i + 1 < urls.length) continue;
        if (nativeHtml && [404, 405, 501].contains(status)) {
          throw const FormatException('NAI_ACCOUNT_VALIDATION:invalid-response:200');
        }
        if (status != 200) {
          final code = [401, 403].contains(status)
              ? 'auth'
              : [301, 302, 303, 307, 308, 404, 405, 501].contains(status)
                  ? 'unsupported'
                  : 'http';
          throw FormatException('NAI_ACCOUNT_VALIDATION:$code:$status');
        }
        if (snapshot.profile.relay && i < 2 &&
            RegExp(r'^\s*(?:<!doctype\s+html|<html(?:\s|>))', caseSensitive: false).hasMatch(response.body)) {
          nativeHtml = true;
          continue;
        }
        try {
          if (snapshot.profile.relay && i == 2) {
            final models = _novelAiRelayModelIds(jsonDecode(response.body));
            if (models.isEmpty) {
              throw const FormatException('NAI_ACCOUNT_VALIDATION:unsupported:200');
            }
            // New API token quota is not Anlas and is deliberately not converted.
            return const AccountSummary(hasToken: true, hasActiveSubscription: false);
          }
          return _parseAccountData(response.body,
              relay: snapshot.profile.relay);
        } on FormatException catch (error) {
          if (error.message == 'NAI_ACCOUNT_VALIDATION:unsupported:200') rethrow;
          throw const FormatException(
              'NAI_ACCOUNT_VALIDATION:invalid-response:200');
        } catch (_) {
          throw const FormatException('NAI_ACCOUNT_VALIDATION:invalid-response:200');
        }
      }
      throw const FormatException('NAI_ACCOUNT_VALIDATION:unsupported:0');
    } finally {
      _operations--;
    }
  }

  static Uri _relayModelsUri(String base) {
    final prefix = base.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$prefix${prefix.endsWith('/v1') ? '/models' : '/v1/models'}');
  }

  static List<String> _novelAiRelayModelIds(Object? body) {
    if (body is! Map || body['object'] != 'list' || body['data'] is! List ||
        (body['data'] as List).length > 10000 || body['success'] == false || body['error'] != null) {
      throw const FormatException('Invalid model list');
    }
    final rows = body['data'] as List;
    if (!rows.every((r) => r is Map && r['id'] is String && (r['id'] as String).length <= 256)) {
      throw const FormatException('Invalid model identity');
    }
    final allowed = {...naiModels.map((m) => m.value), ...naiInpaintModels.map((m) => m.value)};
    return rows.map((r) => (r as Map)['id'] as String).where(allowed.contains).toSet().toList();
  }

  @override
  Future<AccountSummary> verifyToken(String token, AppSettings settings) =>
      verifyCandidate(
          NovelAiCredentialSnapshot(
              const NovelAiAccount(
                  id: 'verify', label: 'Official', method: 'token'),
              token.trim()),
          settings);

  @override
  Future<AccountSummary> fetchAccount(String token, AppSettings settings) =>
      _run(token, settings, (snapshot, frozen) async {
        try {
          return await verifyCandidate(snapshot, frozen);
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
          input = (await _images(response.bodyBytes)).first;
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
  Future<List<Uint8List>> _images(Uint8List bytes) =>
      decodeNovelAiNativeResponse(bytes, checkCancelled: _checkCancelled);

  AccountSummary _parseAccountData(String body, {bool relay = false}) {
    final data = jsonDecode(body);
    Map<String, dynamic>? map(Object? v) =>
        v is Map ? Map<String, dynamic>.from(v) : null;
    final top = map(data);
    if (top == null) throw const FormatException('Invalid account response');
    final direct = map(top['data']), info = map(top['information']);
    final sub = map(top['subscription']) ??
        map(info?['subscription']) ??
        map(direct?['subscription']) ??
        map(map(direct?['information'])?['subscription']) ??
        top;
    num? finite(Object? value) {
      final n = value is num
          ? value
          : value is String
              ? num.tryParse(value)
              : null;
      return n != null && n.isFinite ? n : null;
    }

    int? credits(Object? value) {
      final n = finite(value);
      return n != null && n >= 0 && n.round() <= 9007199254740991
          ? n.round()
          : null;
    }

    final tierValue = finite(sub['tier']);
    if (tierValue == null ||
        tierValue < 0 ||
        tierValue != tierValue.round() ||
        tierValue > 9007199254740991 ||
        (sub.containsKey('active') && sub['active'] is! bool)) {
      throw const FormatException('Invalid subscription');
    }
    final tier = tierValue.toInt(), steps = sub['trainingStepsLeft'];
    final fixed =
        steps is Map ? credits(steps['fixedTrainingStepsLeft']) : null;
    final purchased =
        steps is Map ? credits(steps['purchasedTrainingSteps']) : null;
    final balance = steps is Map
        ? (fixed != null || purchased != null
            ? credits((fixed ?? 0) + (purchased ?? 0))
            : null)
        : credits(steps);
    final usage = map(sub['usage']);
    final percent = finite(usage?['percent']),
        seconds = finite(usage?['timeUntilNextPercent']);
    final opus = !relay && percent != null && seconds != null
        ? OpusGenerationUsage(
            percent: percent.toDouble(),
            isNegative: usage?['isNegative'] == true,
            timeUntilNextPercent: max(0, seconds.toDouble()))
        : null;
    return AccountSummary(
        hasToken: true,
        anlasBalance: balance,
        tierLevel: tier,
        tierName: switch (tier) {
          0 => 'Paper',
          1 => 'Tablet',
          2 => 'Scroll',
          3 => 'Opus',
          _ => '未知'
        },
        hasActiveSubscription: !relay && sub['active'] != false && tier > 0,
        opusUsage: opus,
        opusUsageUpdatedAt:
            opus == null ? null : DateTime.now().millisecondsSinceEpoch);
  }
}
