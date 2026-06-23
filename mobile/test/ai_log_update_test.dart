import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/update_service.dart';

void main() {
  test('semantic version comparison handles v prefix and missing segments', () {
    expect(compareVersions('v0.10.0', '0.9.9'), 1);
    expect(compareVersions('0.9.9', '0.9.9+27'), -1);
    expect(compareVersions('1.0', '1.0.0'), 0);
  });

  test('AI log records calls and omits reverse-image base64', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(server.close);
    server.listen((request) async {
      await utf8.decoder.bind(request).join();
      request.response
        ..statusCode = 200
        ..headers.contentType = ContentType.json
        ..write(jsonEncode({
          'choices': [
            {
              'message': {'content': '1girl, solo'}
            }
          ]
        }));
      await request.response.close();
    });
    final api = NaiApi();
    final settings = AppSettings(
      proxyMode: 'direct',
      visionApiUrl: 'http://127.0.0.1:${server.port}',
      visionApiModel: 'local-test',
    );
    final result = await api.reversePrompt(
      settings: settings,
      apiKey: 'local-key',
      image: Uint8List.fromList([0x89, 0x50, 0x4e, 0x47]),
      mode: ReversePromptMode.tags,
      scope: ReversePromptScope.full,
      hint: '',
      knownCharacter: false,
      systemTemplate: 'Return tags.',
    );
    expect(result.ok, isTrue);
    expect(api.aiCallLog, hasLength(1));
    expect(api.aiCallLog.single.userText, contains('[图片已省略]'));
    expect(api.aiCallLog.single.userText, isNot(contains('iVBOR')));
    api.clearAiCallLog();
    expect(api.aiCallLog, isEmpty);
  });
}
