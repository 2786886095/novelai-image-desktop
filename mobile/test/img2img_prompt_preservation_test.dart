import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/images/png_metadata.dart';

void main() {
  test('explicit metadata restore remains available as a separate operation',
      () {
    SharedPreferences.setMockInitialValues({});
    final app = AppState();
    addTearDown(app.dispose);
    app.params.stylePrompt = 'current style';
    app.params.positivePrompt = 'current scene';
    app.workbenchImportedParams = parseImportedGenerateParams({
      'Software': 'NovelAI',
      'Description': 'watercolor, original scene',
      'Comment': jsonEncode({'seed': 123, 'steps': 16}),
    });
    expect(app.params.positivePrompt, 'current scene');
    app.applyWorkbenchMetadata();
    expect(app.params.positivePrompt, 'watercolor, original scene');
    expect(app.params.stylePrompt, '');
    expect(app.params.seed, 123);
  });
  for (final locked in [false, true]) {
    testWidgets(
        'changing img2img input preserves all edited prompts (locked=$locked)',
        (t) async {
      SharedPreferences.setMockInitialValues({});
      t.view.physicalSize = const Size(1200, 1000);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final dir =
          Directory.systemTemp.createTempSync('nai-img2img-regression-');
      addTearDown(() async {
        await t.pumpWidget(const SizedBox());
        PaintingBinding.instance.imageCache.clear();
        PaintingBinding.instance.imageCache.clearLiveImages();
        await t.runAsync(() async {
          for (var retry = 0; retry < 20; retry++) {
            try {
              dir.deleteSync(recursive: true);
              return;
            } on FileSystemException {
              if (retry == 19) rethrow;
            }
            await Future<void>.delayed(const Duration(milliseconds: 50));
          }
        });
      });
      final paths = List.generate(3, (i) {
        final image = img.Image(
            width: 8 + i,
            height: 8,
            textData: i == 2
                ? null
                : {
                    'Software': 'NovelAI',
                    'Description': 'artist:example, watercolor, old scene $i',
                    'Comment': jsonEncode({
                      'prompt': 'artist:example, watercolor, old scene $i',
                      'uc': 'old negative',
                      'width': 832,
                      'height': 1216,
                      'seed': 9876,
                      'steps': 16,
                      'scale': 8
                    })
                  });
        return (File('${dir.path}/input-$i.png')
              ..writeAsBytesSync(img.encodePng(image)))
            .path;
      });
      final app = AppState();
      addTearDown(app.dispose);
      app.settings.language = 'en-US';
      app.settings.lockStylePrompt = locked;
      app.params
        ..stylePrompt = '1.2::artist:current::, ink'
        ..positivePrompt = 'mountains, a blue house'
        ..negativePrompt = 'blur'
        ..seed = 42
        ..steps = 28;
      final character =
          CharCaptionItem(prompt: 'traveler, red coat', negativePrompt: 'hat');
      app.extras.charCaptions = [character];
      var picked = 0;
      const channel = MethodChannel('plugins.flutter.io/image_picker');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'pickImage');
        return paths[picked++];
      });
      addTearDown(() => TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null));
      await t.pumpWidget(ChangeNotifierProvider.value(
          value: app, child: const MaterialApp(home: GenerateScreen())));
      await t.pumpAndSettle();
      for (var i = 0; i < 3; i++) {
        final button = find.text('Load image');
        await t.ensureVisible(button);
        await t.runAsync(() async {
          await t.tap(button);
          for (var attempt = 0;
              attempt < 50 && app.workbenchImage?.filePath != paths[i];
              attempt++) {
            await Future<void>.delayed(const Duration(milliseconds: 10));
          }
        });
        await t.pumpAndSettle();
        expect(app.workbenchImage?.filePath, paths[i]);
        expect(app.params.stylePrompt, '1.2::artist:current::, ink');
        expect(app.params.positivePrompt, 'mountains, a blue house');
        expect(app.params.negativePrompt, 'blur');
        expect(app.params.seed, 42);
        expect(app.params.steps, 28);
        expect(app.extras.charCaptions.single, same(character));
        expect(app.workbenchImportedParams != null, i != 2);
      }
      expect(t.takeException(), isNull);
    });
  }
}
