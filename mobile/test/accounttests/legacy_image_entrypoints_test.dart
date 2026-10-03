import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/images/image_processing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  for (final operation in ['generate', 'img2img', 'inpaint', 'upscale', 'augment']) {
    for (final valid in [true, false]) {
      test('legacy actual HTTP entrypoint $operation valid=$valid', () async {
        final previous = HttpOverrides.current;
        HttpOverrides.global = null;
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        final posts = <String>[];
        var rejectedHostOrCredential = false;
        final input = Uint8List.fromList(img.encodePng(img.Image(width: 16, height: 16)));
        final maskImage = img.Image(width: 16, height: 16);
        for (var y = 0; y < 16; y++) {
          for (var x = 0; x < 16; x++) {
            maskImage.setPixelRgb(x, y, 255, 255, 255);
          }
        }
        final mask = Uint8List.fromList(img.encodePng(maskImage));
        final responseImage = Uint8List.fromList(img.encodePng(img.Image(
            width: operation == 'upscale' ? 32 : 64,
            height: operation == 'upscale' ? 32 : 64)));
        final reply = valid ? responseImage : Uint8List.fromList(utf8.encode('OWNED NON IMAGE RESPONSE'));
        final subscription = server.listen((request) async {
          rejectedHostOrCredential |= request.method != 'POST' ||
              request.headers.value(HttpHeaders.authorizationHeader) != 'Bearer QA_ONLY_PLACEHOLDER_TOKEN';
          posts.add(request.uri.path);
          await request.drain<void>();
          request.response.statusCode = 200;
          request.response.add(reply);
          await request.response.close();
        });
        final base = 'http://127.0.0.1:${server.port}';
        final settings = AppSettings(apiBaseUrl: base, imageBaseUrl: base,
            allowCustomEndpoint: true, allowCustomEndpointFallback: false,
            proxyMode: 'direct', streamPreviewEnabled: false);
        final params = GenerateParams()..width = 64..height = 64;
        final api = NaiApi();
        Object? error;
        var images = <Uint8List>[];
        try {
          const token = 'QA_ONLY_PLACEHOLDER_TOKEN';
          switch (operation) {
            case 'generate':
              images = (await api.generate(token, settings, params, GenerateExtras())).$1;
            case 'img2img':
              images = (await api.img2img(token, settings, params, GenerateExtras(), input, I2IParams())).$1;
            case 'inpaint':
              images = (await api.inpaint(token, settings, params, input, mask,
                  'nai-diffusion-4-5-full-inpainting', 64, 64, .5, 0)).$1;
            case 'upscale':
              images = [await api.upscale(token, settings, input, 2, 'nai-diffusion-5-full')];
            case 'augment':
              images = await api.augment(token, settings, input, 16, 16, 'lineart', AugmentOptions());
          }
        } catch (caught) {
          error = caught;
        } finally {
          await subscription.cancel();
          await server.close(force: true);
          HttpOverrides.global = previous;
        }
        final expectedRoute = switch (operation) {
          'upscale' => '/ai/upscale',
          'augment' => '/ai/augment-image',
          _ => '/ai/generate-image',
        };
        final actualDecoded = images.every((image) {
          final size = decodeImageDimensions(image);
          return size.$1 > 0 && size.$2 > 0;
        });
        final passed = !rejectedHostOrCredential && posts.length == 1 &&
            posts.single == expectedRoute && images.length == (valid ? 1 : 0) &&
            ((error == null) == valid) && (!valid || actualDecoded);
        debugPrint('NOVELAI_LEGACY_ENTRYPOINT=${jsonEncode({'operation': operation, 'valid': valid,
            'posts': posts, 'count': images.length, 'errorType': error?.runtimeType.toString() ?? '',
            'actualDecoded': actualDecoded, 'passed': passed})}');
        expect(passed, true);
      });
    }
  }
}
