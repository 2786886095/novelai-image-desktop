import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/comic/comic_asset_store.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dev.fluttercommunity.plus/share');
  late Directory root;
  setUp(
      () => root = Directory.systemTemp.createTempSync('comic-share-result-'));
  tearDown(() async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    await root.delete(recursive: true);
  });

  for (final format in ['json', 'zip']) {
    for (final outcome in ['success', 'dismissed', 'unavailable']) {
      test('$format share $outcome preserves file and reports only selection',
          () async {
        final result = switch (outcome) {
          'success' => 'fixture.selected-destination',
          'dismissed' => '',
          _ => 'dev.fluttercommunity.plus/share/unavailable',
        };
        var calls = 0;
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, (call) async {
          expect(call.method, 'shareFiles');
          calls++;
          return result;
        });
        final source = File('${root.path}/selected.png');
        await source
            .writeAsBytes(img.encodePng(img.Image(width: 8, height: 8)));
        final project = ComicProject.empty(GenerateParams());
        project.panels.add(ComicPanel(
            id: 'p',
            index: 1,
            title: 'one',
            prompt: 'landscape',
            candidates: [
              ComicCandidate(
                  id: 'c',
                  historyItemId: 'h',
                  outputPath: source.path,
                  createdAt: 'today')
            ]));
        final assets = ComicAssetStore(root: () async => root);
        final receipt = format == 'json'
            ? await assets.exportProject(project, () {})
            : await assets.exportSelected(project, project.toJson(), () {});
        final bytes = await File(receipt['filePath']).readAsBytes();
        expect(calls, 1);
        expect(sha256.convert(bytes).toString(), receipt['sha256']);
        expect(bytes.length, receipt['bytes']);
        if (format == 'json') {
          expect(jsonDecode(utf8.decode(bytes)), isA<Map>());
        }
        // success means a destination was selected, not that a remote recipient saved it.
        expect(receipt['shared'], outcome == 'success');
        if (outcome != 'success') expect(receipt['shareError'], isNotEmpty);
        expect(source.existsSync(), true);
        debugPrint(
            'COMIC_SHARE_RESULT: $format/$outcome fileVerified=true shared=${receipt['shared']}');
      });
    }
  }
}
