import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/models/style_library.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/style_library_screen.dart';

void main() {
  late Directory fixtureDir;
  late File previewFile;
  setUpAll(() async {
    fixtureDir = await Directory.systemTemp.createTemp('style-refine-test-');
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawColor(const Color(0xff7047d8), BlendMode.src);
    final picture = recorder.endRecording();
    final image = await picture.toImage(16, 16);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    picture.dispose();
    previewFile = File('${fixtureDir.path}/preview.png');
    await previewFile.writeAsBytes(bytes!.buffer.asUint8List());
    for (final pair in [
      ('StyleAudit', 'C:/Windows/Fonts/msyh.ttc'),
      (
        'MaterialIcons',
        'F:/flutter/bin/cache/artifacts/material_fonts/materialicons-regular.otf'
      )
    ]) {
      final file = File(pair.$2);
      if (file.existsSync()) {
        await (FontLoader(pair.$1)
              ..addFont(file.readAsBytes().then(ByteData.sublistView)))
            .load();
      }
    }
  });
  tearDownAll(() async {
    assert(fixtureDir.absolute.path
        .startsWith(Directory.systemTemp.absolute.path));
    await fixtureDir.delete(recursive: true);
  });
  for (final size in [const Size(390, 844), const Size(1024, 768)]) {
    testWidgets('style manager edit, decimal rating, drag and import at $size',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      SharedPreferences.setMockInitialValues({});
      final app = AppState();
      app.settings.language = 'zh-CN';
      app.settings.stylePromptPresets = List.generate(
          3,
          (i) => StylePromptPreset(
              id: '$i',
              name: '风格$i',
              prompt: 'artist:fixture_$i',
              createdAt: '2026-09-01',
              rating: i + 1));
      final key = GlobalKey();
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app,
          child: MaterialApp(
              theme: ThemeData(
                  fontFamily: 'StyleAudit',
                  colorScheme:
                      ColorScheme.fromSeed(seedColor: const Color(0xff7047d8))),
              home: RepaintBoundary(
                  key: key, child: const StyleLibraryScreen()))));
      await tester.pumpAndSettle();
      expect(find.text('风格管理'), findsOneWidget);
      expect(tester.takeException(), isNull);
      final handles = find.byIcon(Icons.drag_handle);
      final start = tester.getCenter(handles.first),
          end = tester.getCenter(find.byKey(const ValueKey('2')));
      final gesture = await tester.startGesture(start);
      await tester.pump();
      await gesture.moveBy(const Offset(0, 30));
      await tester.pump();
      await gesture.moveTo(end);
      await tester.pump(const Duration(milliseconds: 300));
      await gesture.moveBy(const Offset(0, 2));
      await tester.pump(const Duration(milliseconds: 300));
      await gesture.up();
      await tester.pumpAndSettle();
      expect(app.settings.stylePromptPresetSort, 'custom');
      expect(sortStyles(app.settings.stylePromptPresets, 'custom').first.id,
          isNot('0'));
      await tester.tap(find.text('编辑').first);
      await tester.pumpAndSettle();
      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), '测试风格');
      await tester.enterText(fields.at(1), '1.5::artist:fixture::');
      await tester.enterText(
          find.byKey(const ValueKey('style-rating-input')), '4.2');
      await tester.pump();
      await tester.ensureVisible(find.text('保存'));
      await tester.tap(find.text('保存'));
      await tester.pumpAndSettle();
      final saved =
          app.settings.stylePromptPresets.firstWhere((p) => p.name == '测试风格');
      expect(saved.rating, 4.2);
      expect(saved.prompt, '1.5::artist:fixture::');
      await tester.tap(find.byTooltip('新建风格'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, '取消内容');
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(app.settings.stylePromptPresets.length, 3);
      await tester.tap(find.byTooltip('批量导入'));
      await tester.pumpAndSettle();
      await tester.enterText(
          find.byType(TextField).first, '批量A\tartist:a\n批量B\tartist:b');
      await tester.tap(find.text('导入'));
      await tester.pumpAndSettle();
      expect(app.settings.stylePromptPresets.length, 5);
      await tester.runAsync(() async {
        final image = await (key.currentContext!.findRenderObject()
                as RenderRepaintBoundary)
            .toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        image.dispose();
        (File('../artifacts/style-cover-26/mobile-${size.width.toInt()}.png')
              ..parent.createSync(recursive: true))
            .writeAsBytesSync(bytes!.buffer.asUint8List());
      });
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      app.dispose();
    });
  }

  testWidgets('nine previews, selected image, confirmation and rating range',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    final app = AppState();
    app.settings.language = 'zh-CN';
    app.settings.stylePromptPresets = [
      StylePromptPreset(
          id: 'images',
          coverImageId: 'im3',
          name: '多图风格',
          prompt: 'artist:fixture',
          createdAt: '',
          previewImages: List.generate(
              9,
              (i) => StylePromptPreviewImage(
                  id: 'im$i',
                  name: 'preview$i.png',
                  filePath: previewFile.path,
                  createdAt: '')))
    ];
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app, child: const MaterialApp(home: StyleLibraryScreen())));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('style-preview-images-3')), findsOneWidget);
    expect(find.byKey(const ValueKey('style-preview-images-0')), findsNothing);
    expect(find.text('预览图 · 9'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('style-preview-images-3')));
    await tester.pumpAndSettle();
    expect(find.text('4 / 9'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.chevron_right));
    await tester.pumpAndSettle();
    expect(find.text('5 / 9'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    await tester.tap(find.text('编辑'));
    await tester.pumpAndSettle();
    expect(find.text('搜索名称或提示词'), findsNothing);
    expect(find.text('风格管理'), findsNothing);
    await tester.ensureVisible(find.byKey(const ValueKey('style-set-cover-im5')));
    await tester.tap(find.byKey(const ValueKey('style-set-cover-im5')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('保存'));
    await tester.tap(find.text('保存'));
    await tester.pumpAndSettle();
    expect(app.settings.stylePromptPresets.single.coverImageId, 'im5');
    final stored = await app.storage.getSettings();
    expect(stored.stylePromptPresets.single.coverImageId, 'im5');
    expect(find.byKey(const ValueKey('style-preview-images-5')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('style-preview-images-5')));
    await tester.pumpAndSettle();
    expect(find.text('6 / 9'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();
    await tester.tap(find.text('编辑'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('style-set-cover-im0')));
    await tester.tap(find.byKey(const ValueKey('style-set-cover-im0')));
    await tester.pumpAndSettle();
    final rating = find.byKey(const ValueKey('style-rating-input'));
    for (final value in ['', '-0.1', '5.1', 'NaN']) {
      await tester.enterText(rating, value);
      await tester.pump();
      await tester.ensureVisible(find.text('保存'));
      expect(
          tester
              .widget<FilledButton>(find.widgetWithText(FilledButton, '保存'))
              .onPressed,
          isNull);
    }
    await tester.enterText(rating, '4.2');
    await tester.pump();
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '保存'))
            .onPressed,
        isNotNull);
    final remove = find.widgetWithText(TextButton, '删除').first;
    await tester.ensureVisible(remove);
    await tester.tap(remove);
    await tester.pumpAndSettle();
    expect(find.text('删除这张预览图？'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, '取消'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextButton, '删除'), findsNWidgets(9));
    await tester.tap(remove);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '删除'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextButton, '删除'), findsNWidgets(8));
    // Cancel the entire editor: existing metadata and files must remain intact.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(app.settings.stylePromptPresets.single.previewImages.length, 9);
    expect(app.settings.stylePromptPresets.single.coverImageId, 'im5');
    expect(previewFile.existsSync(), isTrue);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    app.dispose();
  });
}
