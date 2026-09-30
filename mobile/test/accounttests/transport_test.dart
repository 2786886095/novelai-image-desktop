import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/generation_scope.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'accounts_test.dart' show memoryVault;

final png = Uint8List.fromList(im.encodePng(im.Image(width: 64, height: 64)));
Future<(NovelAiAccounts, NovelAiAccount)> relayVault() async {
  final v = await memoryVault(legacy: 'official-A');
  final p = await v.add(
      label: 'Relay',
      method: 'relay',
      token: 'relay-B',
      apiBaseUrl: 'https://relay.example/novelai',
      imageBaseUrl: 'https://relay.example/novelai/ai/generate-image');
  await v.activate(p.id);
  return (v, p);
}

void main() {
  test(
      'selected relay performs real raw request; no GET/quote probe or official fallback',
      () async {
    final (vault, _) = await relayVault();
    final calls = <http.Request>[];
    final api = NovelAiAccountApi(vault,
        clientFactory: (_, __) => MockClient((r) async {
              calls.add(r);
              return http.Response.bytes(png, 200);
            }));
    final settings = AppSettings()..allowCustomEndpointFallback = true;
    final summary = await api.fetchAccount('relay-B', settings);
    expect(summary.anlasBalance, isNull);
    expect(
        await api.requestOfficialGenerationPrice(
            'relay-B', settings, GenerateParams()),
        isNull);
    expect(calls, isEmpty);
    final result = await api.generate('relay-B', settings,
        GenerateParams(positivePrompt: 'test'), GenerateExtras());
    expect(result.$1.single, png);
    expect(calls.single.url.toString(),
        'https://relay.example/novelai/ai/generate-image');
    expect(calls.single.headers['Authorization'], 'Bearer relay-B');
    expect(calls.single.followRedirects, false);
    expect(calls.single.maxRedirects, 0);
    expect(jsonDecode(calls.single.body)['action'], 'generate');
  });
  for (final status in [301, 302, 307, 308, 400, 401, 403, 422, 429, 500]) {
    test('HTTP $status never resubmits, changes model or leaks relay token',
        () async {
      final (vault, _) = await relayVault();
      var calls = 0;
      final api = NovelAiAccountApi(vault,
          clientFactory: (_, __) => MockClient((r) async {
                calls++;
                expect(r.url.host, 'relay.example');
                return http.Response('secret response body', status, headers: {
                  'location': 'https://image.novelai.net/ai/generate-image',
                  'retry-after': '1'
                });
              }));
      await expectLater(
          api.generate('relay-B', AppSettings(),
              GenerateParams(positivePrompt: 'test'), GenerateExtras()),
          throwsA(isA<NaiHttpException>().having(
              (e) => e.message, 'redacted', isNot(contains('secret')))));
      expect(calls, 1);
      expect(api.inFlight, false);
      expect(vault.locked, false);
    });
  }
  test('inflight snapshot denies switching even while client creation awaits',
      () async {
    final (vault, _) = await relayVault();
    final gate = Completer<void>();
    final entered = Completer<void>();
    final settings = AppSettings();
    final api = NovelAiAccountApi(vault, clientFactory: (s, u) async {
      entered.complete();
      await gate.future;
      expect(s.imageBaseUrl, 'https://relay.example/novelai');
      return MockClient((r) async {
        expect(r.url.host, 'relay.example');
        expect(r.headers['Authorization'], 'Bearer relay-B');
        return http.Response.bytes(png, 200);
      });
    });
    final result = api.generate('relay-B', settings,
        GenerateParams(positivePrompt: 'test'), GenerateExtras());
    await entered.future;
    settings.imageBaseUrl = 'https://wrong.example';
    await expectLater(vault.activate('legacy-v1'), throwsStateError);
    gate.complete();
    await result;
    await vault.activate('legacy-v1');
    expect(vault.active!.token, 'official-A');
    await expectLater(
        api.generate('relay-B', settings, GenerateParams(), GenerateExtras()),
        throwsStateError);
  });
  test('cancelled GenerationScope releases leases and prevents requests',
      () async {
    final (vault, _) = await relayVault();
    var calls = 0;
    final api = NovelAiAccountApi(vault, clientFactory: (_, __) {
      calls++;
      return MockClient((_) async => http.Response.bytes(png, 200));
    });
    final scope = GenerationScope()..cancel();
    await expectLater(
        scope.run(() => api.generate(
            'relay-B', AppSettings(), GenerateParams(), GenerateExtras())),
        throwsStateError);
    expect(calls, 0);
    expect(vault.locked, false);
    expect(api.inFlight, false);
  });
  test('all tools use selected raw routes, not disabled preview', () async {
    final (vault, _) = await relayVault();
    final calls = <http.Request>[];
    final api = NovelAiAccountApi(vault,
        clientFactory: (_, __) => MockClient((r) async {
              calls.add(r);
              if (r.url.path.endsWith('/upscale')) {
                final body = jsonDecode(r.body);
                final input =
                    im.decodePng(base64Decode(body['image'] as String))!;
                return http.Response.bytes(
                    im.encodePng(im.Image(
                        width: input.width * 2, height: input.height * 2)),
                    200);
              }
              return http.Response.bytes(png, 200);
            }));
    final mask = im.Image(width: 64, height: 64);
    im.fill(mask, color: im.ColorRgb8(255, 255, 255));
    final maskBytes = Uint8List.fromList(im.encodePng(mask));
    final p = GenerateParams(width: 64, height: 64, positivePrompt: 'test');
    await api.img2img(
        'relay-B', AppSettings(), p, GenerateExtras(), png, I2IParams());
    await api.inpaint('relay-B', AppSettings(), p, png, maskBytes,
        'nai-diffusion-5-full-inpainting', 64, 64, 1, 0);
    await api.upscale('relay-B', AppSettings(), png, 2, p.model);
    await api.augment(
        'relay-B', AppSettings(), png, 64, 64, 'colorize', AugmentOptions());
    expect(calls.map((r) => r.url.path).toList(), [
      '/novelai/ai/generate-image',
      '/novelai/ai/generate-image',
      '/novelai/ai/upscale',
      '/novelai/ai/augment-image'
    ]);
    for (final r in calls) {
      expect(r.headers['Authorization'], 'Bearer relay-B');
      expect(r.followRedirects, false);
    }
  });
  test(
      'official token verification is GET-only on fixed HTTPS despite mutable settings',
      () async {
    final vault = await memoryVault(legacy: 'official-A');
    final api = NovelAiAccountApi(vault,
        clientFactory: (_, __) => MockClient((r) async {
              expect(r.method, 'GET');
              expect(r.url.toString(), 'https://image.novelai.net/user/data');
              expect(r.followRedirects, false);
              return http.Response(
                  '{"subscription":{"tier":3,"active":true,"trainingStepsLeft":{"fixedTrainingStepsLeft":10,"purchasedTrainingSteps":20}}}',
                  200);
            }));
    final account = await api.verifyToken(
        'new-official', AppSettings()..imageBaseUrl = 'https://relay.example');
    expect(account.anlasBalance, 30);
    expect(account.tierLevel, 3);
  });
  test('cancel during asynchronous client creation prevents any paid submit',
      () async {
    final (vault, _) = await relayVault();
    final gate = Completer<void>(), entered = Completer<void>();
    var calls = 0;
    final api = NovelAiAccountApi(vault, clientFactory: (_, __) async {
      entered.complete();
      await gate.future;
      return MockClient((r) async {
        calls++;
        return http.Response.bytes(png, 200);
      });
    });
    final pending = api.generate(
        'relay-B', AppSettings(), GenerateParams(), GenerateExtras());
    await entered.future;
    api.cancelActiveGeneration();
    gate.complete();
    await expectLater(pending, throwsA(isA<GenerationCancelledException>()));
    expect(calls, 0);
    expect(api.inFlight, false);
    expect(vault.locked, false);
  });
  test('V4 raw vibe uses selected encoder once before one generation',
      () async {
    final (vault, _) = await relayVault();
    final routes = <String>[];
    final api = NovelAiAccountApi(vault,
        clientFactory: (_, __) => MockClient((r) async {
              routes.add(r.url.path);
              expect(r.url.host, 'relay.example');
              expect(r.headers['Authorization'], 'Bearer relay-B');
              return http.Response.bytes(png, 200);
            }));
    await api.generate(
        'relay-B',
        AppSettings(),
        GenerateParams(model: 'nai-diffusion-4-5-full'),
        GenerateExtras(
            vibeImages: [VibeTransferItem(base64: base64Encode(png))]));
    expect(routes, ['/novelai/ai/encode-vibe', '/novelai/ai/generate-image']);
  });
}
