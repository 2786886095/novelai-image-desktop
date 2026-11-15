import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:novelai_mobile/images/metadata_edit.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/screens/nax_gallery_screen.dart';
import 'package:novelai_mobile/tags/multilingual_tag_packs.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'app assets and desktop use identical data and NAX collection identifiers',
      () {
    final mobileManifest = File(MultilingualTagPacks.manifestPath);
    expect(mobileManifest.readAsBytesSync(),
        File('../shared/multilingual-tag-packs.json').readAsBytesSync());
    final dynamic manifest = jsonDecode(mobileManifest.readAsStringSync());
    expect((manifest['packs'] as Map).keys, tagPackNames.keys);
    final desktopNax = File('../src/nax-gallery.ts').readAsStringSync();
    for (final (model, title, id) in naxCollections) {
      expect(desktopNax, contains('["$model", "$title", "$id"]'));
      expect(naxCollectionUrl(id).host, 'nax.moe');
    }
    expect(naxCollections.length, 15);
  });

  test(
      'checksum gate accepts split byte stream and rejects corruption and excess',
      () async {
    final work = await Directory.systemTemp.createTemp('tag-test-');
    try {
      final expected = sha256.convert([1, 2, 3, 4]).toString();
      final result = File('${work.path}/data');
      await MultilingualTagPacks.copyVerified(
          Stream.fromIterable([
            [1],
            [2, 3, 4]
          ]),
          result,
          4,
          expected);
      expect(await result.readAsBytes(), [1, 2, 3, 4]);
      await expectLater(
          MultilingualTagPacks.copyVerified(
              Stream.value([1, 2, 3, 9]), result, 4, expected),
          throwsFormatException);
      await expectLater(
          MultilingualTagPacks.copyVerified(
              Stream.value([1, 2, 3, 4, 5]), result, 4, expected),
          throwsFormatException);
    } finally {
      await work.delete(recursive: true);
    }
  });

  test(
      'clears both recognized signature and hidden payload without clearing unrelated pixels',
      () {
    const w = 18, h = 14;
    final rgba = Uint8List(w * h * 4)..fillRange(0, w * h * 4, 255);
    final payload = [...ascii.encode('stealth_pnginfo'), 0, 0, 0, 8, 123];
    for (var i = 0; i < payload.length * 8; i++) {
      final p = ((i % h) * w + i ~/ h) * 4 + 3;
      rgba[p] = (rgba[p] & 254) | ((payload[i ~/ 8] >> (7 - i % 8)) & 1);
    }
    eraseMetadataCarriers(rgba, w, h);
    for (var i = 0; i < payload.length * 8; i++) {
      final p = ((i % h) * w + i ~/ h) * 4 + 3;
      expect(rgba[p], 254);
      expect(rgba[p - 1], 255);
    }
    expect(rgba.last, 255);
  });

  testWidgets('NovelAI and SD round trip, and original remains unchanged',
      (tester) async {
    await tester.runAsync(() async {
      final rgba = Uint8List(30 * 30 * 4)..fillRange(0, 30 * 30 * 4, 255);
      final original =
          encodeMetadataPng(rgba, 30, 30, {'parameters': 'old text'});
      final before = Uint8List.fromList(original);
      final novelai = await rewriteGenerationMetadata(
          original, MetadataEditKind.novelai, '{"prompt":"蓝眼睛"}');
      expect(
          parseImageTextMetadata(novelai), containsPair('Description', '蓝眼睛'));
      expect(parseImageTextMetadata(novelai)['parameters'], isNull);
      final sd = await rewriteGenerationMetadata(
          novelai, MetadataEditKind.sd, 'blue eyes\nSteps: 25');
      expect(
          parseImageTextMetadata(sd), {'parameters': 'blue eyes\nSteps: 25'});
      final stripped =
          await rewriteGenerationMetadata(sd, MetadataEditKind.remove, '');
      expect(parseImageTextMetadata(stripped), isEmpty);
      expect(original, before);
      expect(() => editedGenerationMetadata(MetadataEditKind.novelai, '[]'),
          throwsFormatException);
    });
  });
}
