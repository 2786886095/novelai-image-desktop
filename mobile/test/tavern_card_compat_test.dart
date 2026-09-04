import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/tavern_card_service.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';

class _CardPathProvider extends PathProviderPlatform {
  final String root;
  _CardPathProvider(this.root);

  @override
  Future<String?> getTemporaryPath() async => root;
}

void main() {
  test('imports Character Card V3 and preserves unknown extensions', () {
    final card = normalizeExternalCharacter({
      'spec': 'chara_card_v3',
      'spec_version': '3.0',
      'data': {
        'name': 'Alice',
        'description': 'Clockmaker',
        'first_mes': 'Hello',
        'extensions': {
          'third_party': {'keep': true},
          'langbai_novelai_studio': {
            'visual': {'positivePrompt': '1girl, silver hair'}
          },
        },
      },
    });

    expect(card.name, 'Alice');
    expect(card.visual.positivePrompt, '1girl, silver hair');
    expect(card.extensions['third_party'], {'keep': true});

    final exported = tavernCharacterToV3(card);
    final data = Map<String, dynamic>.from(exported['data'] as Map);
    final extensions = Map<String, dynamic>.from(data['extensions'] as Map);
    expect(extensions['third_party'], {'keep': true});
    expect(extensions, contains('langbai_novelai_studio'));
  });

  test('same-name imports receive a SillyTavern-style numeric suffix', () {
    expect(uniqueTavernName(['Alice'], 'Alice'), 'Alice (1)');
    expect(uniqueTavernName(['Alice', 'Alice (1)'], 'Alice'), 'Alice (2)');
  });

  test('JSON lorebooks may contain a description without becoming a character', () {
    expect(isTavernLorebookJson({
      'name': 'Moon City',
      'description': 'World information',
      'entries': <Object>[],
    }), isTrue);
    expect(isTavernLorebookJson({
      'spec': 'chara_card_v3',
      'data': {'name': 'Alice', 'entries': <Object>[]},
      'entries': <Object>[],
    }), isFalse);
  });

  test('PNG and CHARX exports convert JPEG data URLs to real PNG assets', () async {
    final root = await Directory.systemTemp.createTemp('tavern-card-test-');
    final previous = PathProviderPlatform.instance;
    PathProviderPlatform.instance = _CardPathProvider(root.path);
    addTearDown(() async {
      PathProviderPlatform.instance = previous;
      if (await root.exists()) await root.delete(recursive: true);
    });

    final image = image_lib.Image(width: 3, height: 2)
      ..setPixelRgba(0, 0, 120, 80, 220, 255);
    final jpeg = image_lib.encodeJpg(image, quality: 90);
    final character = TavernCharacter(
      name: 'JPEG Avatar',
      avatarDataUrl: 'data:image/jpeg;base64,${base64Encode(jpeg)}',
    );
    const service = TavernCardService();

    final pngFile = await service.exportCharacter(character, 'png');
    final pngBytes = await pngFile.readAsBytes();
    expect(pngBytes.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10]);
    expect(image_lib.decodePng(pngBytes), isNotNull);
    expect(utf8.decode(pngBytes, allowMalformed: true), contains('ccv3'));

    final charxFile = await service.exportCharacter(character, 'charx');
    final archive = ZipDecoder().decodeBytes(await charxFile.readAsBytes());
    expect(archive.findFile('card.json'), isNotNull);
    final avatar = archive.findFile('assets/icon/images/avatar.png');
    expect(avatar, isNotNull);
    expect(
      image_lib.decodePng(Uint8List.fromList(avatar!.content as List<int>)),
      isNotNull,
    );
  });
}
