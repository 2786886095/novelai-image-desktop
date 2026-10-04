import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const locales = {
    'zh-CN': ['查看文件路径', '复制路径', '文件路径已复制'],
    'zh-TW': ['查看檔案路徑', '複製路徑', '檔案路徑已複製'],
    'en-US': ['View file path', 'Copy path', 'File path copied'],
    'ja-JP': ['ファイルパスを表示', 'パスをコピー', 'ファイルパスをコピーしました'],
    'ko-KR': ['파일 경로 보기', '경로 복사', '파일 경로를 복사했습니다'],
  };
  for (final entry in locales.entries) {
    test('file path labels ${entry.key}', () {
      final observed = [
        'gallery.viewFilePath',
        'gallery.copyFilePath',
        'gallery.filePathCopied'
      ].map((key) => mobileUiTextFor(entry.key, key)).toList();
      debugPrint('GALLERY_FILE_PATH=labels/${entry.key}/${observed.join('|')}');
      expect(observed, entry.value);
    });
  }

  for (final fixture in [
    (
      id: 'android-phone',
      size: const Size(360, 800),
      language: 'zh-CN',
      platform: TargetPlatform.android,
      missing: false,
      long: false
    ),
    (
      id: 'ios-phone-long',
      size: const Size(390, 844),
      language: 'en-US',
      platform: TargetPlatform.iOS,
      missing: false,
      long: true
    ),
    (
      id: 'ipad',
      size: const Size(1024, 768),
      language: 'zh-TW',
      platform: TargetPlatform.iOS,
      missing: false,
      long: false
    ),
    (
      id: 'android-missing',
      size: const Size(360, 800),
      language: 'zh-CN',
      platform: TargetPlatform.android,
      missing: true,
      long: false
    ),
  ]) {
    testWidgets('gallery full path view copy close ${fixture.id}',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = fixture.size;
      addTearDown(tester.view.reset);
      final directory = Directory.systemTemp.createTempSync('gallery-path-');
      final filename =
          fixture.long ? '${'QA_very_long_path_' * 8}图.png' : 'QA 空格图.png';
      final image = File('${directory.path}${Platform.pathSeparator}$filename');
      final png = base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
      image.writeAsBytesSync(png);
      addTearDown(() async {
        PaintingBinding.instance.imageCache
          ..clear()
          ..clearLiveImages();
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (directory.existsSync()) directory.deleteSync(recursive: true);
      });
      String? clipboard;
      tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') {
          clipboard = (call.arguments as Map)['text'] as String;
        }
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null));
      final state = AppState();
      state.settings.language = fixture.language;
      state.history = [
        HistoryItem(
            id: 'qa-path',
            filePath: image.path,
            date: '2026-10-02',
            createdAt: '2026-10-02T09:50:00',
            seed: 20261002,
            model: 'nai-diffusion-5-full',
            width: 832,
            height: 1216,
            prompt: 'QA gallery path fixture. No generation.')
      ];
      addTearDown(state.dispose);
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
              theme: ThemeData(platform: fixture.platform),
              home: const GalleryScreen())));
      await tester.pumpAndSettle();
      await tester.tap(find.text(filename));
      await tester.pumpAndSettle();
      // The gallery deliberately prunes files missing before a tile is opened.
      // Simulate external deletion after opening the still-valid detail sheet.
      if (fixture.missing) image.deleteSync();
      // Detail actions are below the image; ListView builds them lazily.
      for (var scroll = 0; scroll < 4; scroll++) {
        await tester.drag(find.byType(ListView).last, const Offset(0, -400));
        await tester.pumpAndSettle();
      }
      final view = find.byKey(const ValueKey('gallery-view-file-path'));
      final available = view.evaluate().isNotEmpty;
      debugPrint('GALLERY_FILE_PATH=${fixture.id}/available=$available');
      expect(view, findsOneWidget);
      await tester.ensureVisible(view);
      await tester.pumpAndSettle();
      await tester.tap(view);
      await tester.pumpAndSettle();
      final path = find.byKey(const ValueKey('gallery-full-file-path'));
      expect(tester.widget<SelectableText>(path).data, image.absolute.path);
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.tap(find.text(locales[fixture.language]![1]));
      await tester.pumpAndSettle();
      expect(clipboard, image.absolute.path);
      expect(find.text(locales[fixture.language]![2]), findsOneWidget);
      expect(find.byType(AlertDialog), findsOneWidget);
      await tester.tap(find.descendant(
          of: find.byType(AlertDialog),
          matching:
              find.text(mobileUiTextFor(fixture.language, 'common.close'))));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(state.history.single.filePath, image.path);
      if (!fixture.missing) expect(image.readAsBytesSync(), png);
      expect(tester.takeException(), isNull);
      debugPrint(
          'GALLERY_FILE_PATH=${fixture.id}/absolute=true/copied=true/detailRetained=true/bytesUnchanged=true');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}
