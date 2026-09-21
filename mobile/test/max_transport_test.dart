import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  test(
      'real mobile HTTP path sends MAX flag only for V5 and bounds upscale passes',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requests = <Map<String, dynamic>>[];
    final subscription = server.listen((request) async {
      final body = jsonDecode(await utf8.decoder.bind(request).join())
          as Map<String, dynamic>;
      requests.add(body);
      late img.Image output;
      if (request.uri.path.endsWith('/upscale')) {
        final input = img.decodePng(base64Decode(body['image'] as String))!;
        output = img.copyResize(input,
            width: input.width * 2, height: input.height * 2);
      } else {
        final p = body['parameters'] as Map;
        final scale = p['upscaled_enhance'] == true ? 2 : 1;
        output = img.Image(
            width: (p['width'] as int) * scale,
            height: (p['height'] as int) * scale);
      }
      request.response.headers.contentType = ContentType('image', 'png');
      request.response.add(img.encodePng(output));
      await request.response.close();
    });
    final settings = AppSettings(
        imageBaseUrl: 'http://127.0.0.1:${server.port}',
        proxyMode: 'direct',
        allowCustomEndpoint: true);
    expect(
        resolveNovelAiBaseUrl(
            settings.imageBaseUrl, 'https://image.novelai.net', settings),
        startsWith('http://127.0.0.1:'));
    final api = NaiApi();
    final input =
        Uint8List.fromList(img.encodePng(img.Image(width: 64, height: 64)));
    try {
      for (final model in ['nai-diffusion-5-full', 'nai-diffusion-4-5-full']) {
        final params = GenerateParams(
            model: model, width: 64, height: 64, positivePrompt: 'blue sky');
        final (images, _) = await api.img2img('fixture', settings, params,
            GenerateExtras(), input, I2IParams(upscaledEnhance: true));
        expect(images, isNotEmpty);
        expect((requests.last['parameters'] as Map)['upscaled_enhance'],
            model.startsWith('nai-diffusion-5-') ? true : null);
      }
      requests.clear();
      final result = await api.upscale(
          'fixture', settings, input, 0, 'nai-diffusion-5-full');
      expect(requests.length, 2);
      expect(img.decodePng(result)!.width, 256);
      for (final request in requests) {
        final image = img.decodePng(base64Decode(request['image'] as String))!;
        expect(image.width * image.height, lessThanOrEqualTo(3145728));
      }
    } finally {
      await subscription.cancel();
      await server.close(force: true);
    }
  }, timeout: const Timeout(Duration(seconds: 30)));
}
