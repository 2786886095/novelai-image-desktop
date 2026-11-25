import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/widgets/image_import_sheet.dart';
import 'issues_42_46_test.dart' show fixture;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late File first, next, plain;
  late AppState app;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    dir = Directory.systemTemp.createTempSync('import-choices-test-');
    first = File('${dir.path}/first.png')..writeAsBytesSync(fixture());
    plain = File('${dir.path}/plain.png')..writeAsBytesSync(fixture(false));
    next = File('${dir.path}/next.png')
      ..writeAsBytesSync(
          img.encodePng(img.Image(width: 20, height: 40, textData: {
        'Software': 'NovelAI',
        'Source': 'NovelAI Diffusion V4.5 Full',
        'Comment':
            jsonEncode({'prompt': 'second prompt', 'seed': 19, 'steps': 14})
      })));
    app = AppState(storage: Storage());
  });
  tearDown(() {
    app.dispose();
    for (final f in [first, next, plain]) {
      f.deleteSync();
    }
    dir.deleteSync();
  });

  test(
      'only checked keys persist across state instances; current image supplies the values',
      () async {
    app.params.steps = 25;
    final a = await app.previewImageImport(first.path);
    expect(a.remembered, isEmpty);
    await app.confirmImageImport(
        a, ImageImportUse.parameters, {'positivePrompt', 'seed', 'characters'});
    expect(app.params.positivePrompt, 'restored scene');
    expect(app.params.seed, 9876);
    expect(app.params.steps, 25);
    expect(app.workbenchImage, isNull);
    app.dispose();
    app = AppState(storage: Storage());
    final b = await app.previewImageImport(next.path);
    expect(b.remembered, {'positivePrompt', 'seed', 'characters'});
    expect(b.fields.containsKey('characters'), isFalse);
    await app.confirmImageImport(b, ImageImportUse.image, b.remembered);
    expect(app.params.positivePrompt, 'second prompt');
    expect(app.params.seed, 19);
    expect(app.params.steps, isNot(14));
    expect(await Storage().getImageImportFields(),
        {'positivePrompt', 'seed', 'characters'});
    final empty = await app.previewImageImport(plain.path);
    expect(empty.fields, isEmpty);
    await app.confirmImageImport(empty, ImageImportUse.image, {});
    expect(await Storage().getImageImportFields(), b.remembered);
    final c = await app.previewImageImport(first.path);
    await app.confirmImageImport(c, ImageImportUse.image, {});
    expect(await Storage().getImageImportFields(), isEmpty);
    expect(app.params.positivePrompt, 'second prompt');
  });

  test(
      'reference roles respect effective model, preserve working image, and do not generate',
      () async {
    final b = await app.previewImageImport(first.path);
    expect(app.canUseImportedImage(b, ImageImportUse.precise, {}), isTrue);
    expect(app.canUseImportedImage(b, ImageImportUse.vibe, {}), isFalse);
    await app.confirmImageImport(b, ImageImportUse.precise, {});
    expect(app.params.model, 'nai-diffusion-5-full');
    expect(app.extras.preciseReferences.single.sourcePath, first.path);
    app.removePreciseReference(0);
    final withModel = await app.previewImageImport(first.path);
    await app.confirmImageImport(withModel, ImageImportUse.precise, {'model'});
    expect(app.extras.preciseReferences.single.base64,
        base64Encode(first.readAsBytesSync()));
    final c = await app.previewImageImport(plain.path);
    await app.confirmImageImport(c, ImageImportUse.vibe, {});
    expect(app.extras.vibeImages.single.sourcePath, plain.path);
    expect(app.workbenchImage, isNull);
    expect(app.busy, isFalse);
    expect(app.history, isEmpty);
  });

  test('a stale chooser cannot write parameters or the remembered mask',
      () async {
    final a = await app.previewImageImport(first.path);
    app.busy = true;
    app.busy = false;
    await expectLater(app.confirmImageImport(a, ImageImportUse.image, {'seed'}),
        throwsStateError);
    expect(app.workbenchImage, isNull);
    expect(await Storage().getImageImportFields(), isEmpty);
  });

  testWidgets('narrow sheet restores checkbox state; closing discards edits',
      (t) async {
    t.view.physicalSize = const Size(375, 700);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final image = (await t.runAsync(() async {
      await app.storage.setImageImportFields({'positivePrompt', 'seed'});
      return app.previewImageImport(first.path);
    }))!;
    await t.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () => showModalBottomSheet<void>(
                        context: context,
                        isScrollControlled: true,
                        builder: (_) =>
                            ImageImportSheet(app: app, image: image)),
                    child: const Text('open'))))));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    final checkbox = find.byKey(const ValueKey('import-field-positivePrompt'));
    await t.ensureVisible(checkbox);
    await t.pumpAndSettle();
    expect(t.widget<CheckboxListTile>(checkbox).value, isTrue);
    await t.tap(checkbox);
    await t.pumpAndSettle();
    expect(t.widget<CheckboxListTile>(checkbox).value, isFalse);
    await t.tap(find.byType(CloseButton));
    await t.pumpAndSettle();
    expect(
        await app.storage.getImageImportFields(), {'positivePrompt', 'seed'});
    expect(app.workbenchImage, isNull);
    expect(t.takeException(), isNull);
  });
}
