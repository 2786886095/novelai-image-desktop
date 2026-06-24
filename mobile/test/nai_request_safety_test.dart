import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  test('img2img resizes the source to the requested output dimensions',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    Map<String, dynamic>? received;
    server.listen((request) async {
      received = jsonDecode(await utf8.decoder.bind(request).join())
          as Map<String, dynamic>;
      final png = Uint8List.fromList(
        image_lib.encodePng(image_lib.Image(width: 64, height: 96)),
      );
      final zip = ZipEncoder().encode(
        Archive()..addFile(ArchiveFile('image.png', png.length, png)),
      )!;
      request.response
        ..statusCode = 200
        ..headers.contentType = ContentType.binary
        ..add(zip);
      await request.response.close();
    });
    final source = Uint8List.fromList(
      image_lib.encodePng(image_lib.Image(width: 32, height: 32)),
    );

    await NaiApi().img2img(
      'test-token',
      AppSettings(
        imageBaseUrl: 'http://${server.address.host}:${server.port}',
        allowCustomEndpoint: true,
        proxyMode: 'direct',
      ),
      GenerateParams(
        positivePrompt: 'test',
        width: 64,
        height: 96,
      ),
      GenerateExtras(),
      source,
      I2IParams(),
    );

    final parameters = received!['parameters'] as Map<String, dynamic>;
    final sentImage = image_lib.decodeImage(base64Decode(parameters['image']))!;
    expect((sentImage.width, sentImage.height), (64, 96));
  });

  test('img2img with precise reference uploads image as a multipart part',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    Map<String, dynamic>? received;
    String? multipartBody;
    server.listen((request) async {
      final contentType = request.headers.contentType!;
      final boundary = contentType.parameters['boundary']!;
      final bodyBytes = await request.fold<List<int>>(
        <int>[],
        (buffer, chunk) => buffer..addAll(chunk),
      );
      multipartBody = latin1.decode(bodyBytes);
      final requestPart = RegExp(
        'name="request".*?\\r\\n\\r\\n'
        '(.*?)\\r\\n--${RegExp.escape(boundary)}',
        caseSensitive: false,
        dotAll: true,
      ).firstMatch(multipartBody!)!;
      received = jsonDecode(
        utf8.decode(latin1.encode(requestPart.group(1)!)),
      ) as Map<String, dynamic>;
      final png = Uint8List.fromList(
        image_lib.encodePng(image_lib.Image(width: 64, height: 96)),
      );
      final zip = ZipEncoder().encode(
        Archive()..addFile(ArchiveFile('image.png', png.length, png)),
      )!;
      request.response
        ..statusCode = 200
        ..headers.contentType = ContentType.binary
        ..add(zip);
      await request.response.close();
    });
    final source = Uint8List.fromList(
      image_lib.encodePng(image_lib.Image(width: 32, height: 32)),
    );
    final precise = base64Encode(
      image_lib.encodePng(image_lib.Image(width: 64, height: 64)),
    );

    await NaiApi().img2img(
      'test-token',
      AppSettings(
        imageBaseUrl: 'http://${server.address.host}:${server.port}',
        allowCustomEndpoint: true,
        proxyMode: 'direct',
      ),
      GenerateParams(
        positivePrompt: 'test',
        width: 64,
        height: 96,
      ),
      GenerateExtras(
        preciseReferences: [
          PreciseReferenceItem(
            base64: precise,
            type: 'character&style',
          ),
        ],
      ),
      source,
      I2IParams(),
    );

    expect(multipartBody, contains('name="request"'));
    expect(multipartBody, contains('name="image"'));
    expect(multipartBody, contains('name="director_ref_0"'));
    final parameters = received!['parameters'] as Map<String, dynamic>;
    expect(parameters['image'], 'image');
    expect(parameters.containsKey('director_reference_images'), isFalse);
    expect(
      ((parameters['director_reference_images_cached'] as List).single
          as Map)['data'],
      'director_ref_0',
    );
  });

  test('V4 character 400 falls back once to pipe prompts', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    final payloads = <Map<String, dynamic>>[];
    server.listen((request) async {
      final body = jsonDecode(await utf8.decoder.bind(request).join())
          as Map<String, dynamic>;
      payloads.add(body);
      if (payloads.length == 1) {
        request.response
          ..statusCode = 400
          ..headers.contentType = ContentType.json
          ..write('{"statusCode":400,"message":"invalid character captions"}');
      } else {
        final png = Uint8List.fromList(
          image_lib.encodePng(image_lib.Image(width: 64, height: 64)),
        );
        final zip = ZipEncoder().encode(
          Archive()..addFile(ArchiveFile('image.png', png.length, png)),
        )!;
        request.response
          ..statusCode = 200
          ..headers.contentType = ContentType.binary
          ..add(zip);
      }
      await request.response.close();
    });

    final result = await NaiApi().generate(
      'test-token',
      AppSettings(
        imageBaseUrl: 'http://${server.address.host}:${server.port}',
        allowCustomEndpoint: true,
        proxyMode: 'direct',
      ),
      GenerateParams(positivePrompt: 'two people'),
      GenerateExtras(charCaptions: [CharCaptionItem(prompt: 'girl')]),
    );
    expect(result.$1, hasLength(1));
    expect(payloads, hasLength(2));
    final firstParameters = payloads.first['parameters'] as Map;
    final firstCaption =
        (firstParameters['v4_prompt'] as Map)['caption'] as Map;
    expect(firstCaption['char_captions'], hasLength(1));
    final secondParameters = payloads.last['parameters'] as Map;
    final secondCaption =
        (secondParameters['v4_prompt'] as Map)['caption'] as Map;
    expect(secondCaption['char_captions'], isEmpty);
    expect(payloads.last['input'], contains('| girl'));
  });

  test('inpaint changes model only after an explicit unsupported-action error',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    final models = <String>[];
    var requests = 0;
    server.listen((request) async {
      requests++;
      final body = jsonDecode(await utf8.decoder.bind(request).join())
          as Map<String, dynamic>;
      models.add(body['model'] as String);
      if (requests == 1) {
        request.response
          ..statusCode = 400
          ..headers.contentType = ContentType.json
          ..write(jsonEncode({
            'statusCode': 400,
            'message':
                "Model nai-diffusion-4-5-curated doesn't support action infill",
          }));
      } else {
        final png = Uint8List.fromList(
          image_lib.encodePng(image_lib.Image(width: 64, height: 64)),
        );
        final zip = ZipEncoder().encode(
          Archive()..addFile(ArchiveFile('image.png', png.length, png)),
        )!;
        request.response
          ..statusCode = 200
          ..headers.contentType = ContentType.binary
          ..add(zip);
      }
      await request.response.close();
    });

    final image = Uint8List.fromList(
      image_lib.encodePng(image_lib.Image(width: 64, height: 64)),
    );
    final mask = Uint8List.fromList(
      image_lib.encodePng(image_lib.Image(width: 64, height: 64)),
    );
    final api = NaiApi();
    final result = await api.inpaint(
      'test-token',
      AppSettings(
        imageBaseUrl: 'http://${server.address.host}:${server.port}',
        allowCustomEndpoint: true,
        proxyMode: 'direct',
      ),
      GenerateParams(positivePrompt: 'test'),
      image,
      mask,
      'nai-diffusion-4-5-curated-inpainting',
      64,
      64,
      0.55,
      0,
    );

    expect(requests, 2);
    expect(models, [
      'nai-diffusion-4-5-curated-inpainting',
      'nai-diffusion-4-5-full-inpainting',
    ]);
    expect(result.$1, hasLength(1));
    expect(result.$3, 'nai-diffusion-4-5-full-inpainting');
  });

  test('inpaint never retries HTTP 500', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    var requests = 0;
    server.listen((request) async {
      requests++;
      await request.drain<void>();
      request.response
        ..statusCode = 500
        ..headers.contentType = ContentType.json
        ..write('{"statusCode":500,"message":"Internal Server Error"}');
      await request.response.close();
    });
    final image = Uint8List.fromList(
      image_lib.encodePng(image_lib.Image(width: 64, height: 64)),
    );
    final api = NaiApi();

    await expectLater(
      api.inpaint(
        'test-token',
        AppSettings(
          imageBaseUrl: 'http://${server.address.host}:${server.port}',
          allowCustomEndpoint: true,
          proxyMode: 'direct',
        ),
        GenerateParams(positivePrompt: 'test'),
        image,
        image,
        'nai-diffusion-4-5-curated-inpainting',
        64,
        64,
        0.55,
        0,
      ),
      throwsA(isA<NaiHttpException>()),
    );
    expect(requests, 1);
  });

  test('director request retries rate limits only, not HTTP 500', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    var requests = 0;
    server.listen((request) async {
      requests++;
      await request.drain<void>();
      request.response
        ..statusCode = 500
        ..headers.contentType = ContentType.json
        ..write('{"statusCode":500,"message":"Internal Server Error"}');
      await request.response.close();
    });
    final api = NaiApi();

    await expectLater(
      api.augment(
        'test-token',
        AppSettings(
          imageBaseUrl: 'http://${server.address.host}:${server.port}',
          allowCustomEndpoint: true,
          proxyMode: 'direct',
        ),
        Uint8List.fromList([1, 2, 3]),
        64,
        64,
        'declutter',
        AugmentOptions(),
      ),
      throwsA(isA<NaiHttpException>()),
    );
    expect(requests, 1);
  });
}
