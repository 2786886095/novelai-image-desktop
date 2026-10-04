import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/local_favorites_screen.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';

List<String> exceptions(WidgetTester tester) {
  final result = <String>[];
  Object? value;
  while ((value = tester.takeException()) != null) {
    result.add(value.toString());
  }
  return result;
}

void main() {
  for (final fixture in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
    (TargetPlatform.windows, const Size(1200, 800)),
  ]) {
    for (final action in ['grid', 'largeText', 'cancel', 'save', 'preview']) {
      testWidgets('local favorites ${fixture.$1.name} ${fixture.$2} $action',
          (tester) async {
        debugDefaultTargetPlatformOverride = fixture.$1;
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = fixture.$2;
        SharedPreferences.setMockInitialValues({});
        final directory =
            Directory.systemTemp.createTempSync('local-favorite-ui-');
        UnifiedStorage.active = directory;
        final bytes = base64Decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
        final saved = Directory(p.join(directory.path, 'images', 'favorites'))
          ..createSync(recursive: true);
        final items = [
          for (var i = 1; i <= 2; i++)
            LocalFavorite(
                id: 'qa-fav-$i',
                sourceId: 'qa-image-$i',
                prefix: '20261002_832x1216_0$i',
                name: '',
                extension: '.png',
                fileName: '20261002_832x1216_0$i.png',
                sha256: sha256.convert(bytes).toString(),
                bytes: bytes.length)
        ];
        for (final item in items) {
          File('${saved.path}/${item.fileName}').writeAsBytesSync(bytes);
        }
        final index = File('${directory.path}/data/local-favorites.json');
        index.parent.createSync(recursive: true);
        index.writeAsStringSync(jsonEncode({
          'version': 1,
          'directory': '',
          'items': items.map((e) => e.toJson()).toList()
        }));
        final state = AppState();
        state.settings.language = 'zh-CN';
        addTearDown(() async {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          tester.view.reset();
          debugDefaultTargetPlatformOverride = null;
          UnifiedStorage.active = null;
          state.dispose();
          PaintingBinding.instance.imageCache
            ..clear()
            ..clearLiveImages();
          await tester.runAsync(() async {
            for (var attempt = 0; directory.existsSync(); attempt++) {
              try {
                directory.deleteSync(recursive: true);
              } on FileSystemException {
                if (attempt >= 9) rethrow;
                await Future<void>.delayed(const Duration(milliseconds: 100));
              }
            }
          });
        });
        await tester.runAsync(() async {
          await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
              value: state,
              child: MaterialApp(
                  builder: (context, child) => MediaQuery(
                      data: MediaQuery.of(context).copyWith(
                          textScaler:
                              TextScaler.linear(action == 'largeText' ? 2 : 1)),
                      child: child!),
                  home: const LocalFavoritesScreen())));
          for (final item in items) {
            final provider = FileImage(File(p.join(saved.path, item.fileName)));
            final context = tester.element(find.byType(LocalFavoritesScreen));
            await precacheImage(provider, context);
            await precacheImage(ResizeImage(provider, width: 440), context);
          }
          await Future<void>.delayed(const Duration(milliseconds: 60));
        });
        await tester.pumpAndSettle();
        final initial = exceptions(tester);
        if (action == 'grid' || action == 'largeText') {
          debugPrint(
              'LOCAL_FAVORITES=${fixture.$1.name}/${fixture.$2}/$action/errors=${initial.length}');
          expect(initial, isEmpty,
              reason:
                  'Favorite cards must fit available grid height and accessibility text.');
          expect(find.text(items.last.fileName), findsOneWidget);
        } else {
          // Isolate dialog/preview behavior from the separately asserted grid layout.
          debugPrint(
              'LOCAL_FAVORITES_INITIAL=${fixture.$1.name}/${fixture.$2}/$action/gridErrors=${initial.length}');
          if (action != 'preview') {
            await tester.tap(find.text('网格'));
            await tester.pumpAndSettle();
            await tester.tap(find.text('瀑布流').last);
            await tester.pumpAndSettle();
          }
          final setupErrors = exceptions(tester);
          expect(setupErrors, isEmpty,
              reason:
                  'Masonry fixture must be usable before the tested action.');
          if (action == 'cancel' || action == 'save') {
            await tester.runAsync(() =>
                tester.tap(find.byIcon(Icons.drive_file_rename_outline).first));
            await tester.pumpAndSettle();
            final field = find.descendant(
                of: find.byType(AlertDialog), matching: find.byType(TextField));
            final width = tester.getSize(field).width;
            if (action == 'save') {
              await tester.enterText(field, 'QA_FAVORITE_RENAMED');
            }
            await tester.runAsync(() async {
              await tester.tap(find.text(action == 'save' ? '保存' : '取消'));
            });
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 60));
            await tester.pump(const Duration(milliseconds: 400));
            await tester.runAsync(() async {
              await Future<void>.delayed(const Duration(milliseconds: 60));
            });
            await tester.pumpAndSettle();
            final errors = exceptions(tester);
            final persisted = await tester
                .runAsync(() => MobileLocalFavorites.instance.list());
            debugPrint(
                'LOCAL_FAVORITES=${fixture.$1.name}/${fixture.$2}/$action/errors=${errors.length}/fieldUsable=${width >= 140}/names=${persisted!.items.map((e) => e.name).toList()}');
            expect(errors, isEmpty,
                reason:
                    'Naming controller must survive the closing route transition.');
            expect(width, greaterThanOrEqualTo(140),
                reason: 'Prefix must not collapse the name input.');
            expect(persisted.items.last.name,
                action == 'save' ? 'QA_FAVORITE_RENAMED' : '');
            for (final item in persisted.items) {
              expect(File('${saved.path}/${item.fileName}').readAsBytesSync(),
                  bytes);
            }
          } else {
            await tester.tap(find
                .byWidgetPredicate(
                    (widget) => widget is InkWell && widget.child is Image)
                .first);
            await tester.pumpAndSettle();
            final full = find.byWidgetPredicate(
                (w) => w is Dialog && w.backgroundColor == Colors.black);
            final shared = full.evaluate().length == 1;
            debugPrint(
                'LOCAL_FAVORITES=${fixture.$1.name}/${fixture.$2}/preview/shared=$shared');
            expect(shared, isTrue,
                reason:
                    'Favorites must use the same black fullscreen image viewer.');
            expect(find.byTooltip('关闭'), findsOneWidget);
            expect(find.byTooltip('分享'), findsOneWidget);
            expect(find.text('1 / 2'), findsOneWidget);
            await tester.tap(find.byTooltip('下一张'));
            await tester.pumpAndSettle();
            expect(find.text('2 / 2'), findsOneWidget);
            await tester.tap(find.byTooltip('上一张'));
            await tester.pumpAndSettle();
            expect(find.text('1 / 2'), findsOneWidget);
            final pixel = find.descendant(of: full, matching: find.byType(RawImage)).last;
            final render = tester.renderObject<RenderImage>(pixel);
            debugPrint('FAVORITE_IMAGE_HIT=image=${render.image?.width}x${render.image?.height}/box=${render.size}/origin=${render.localToGlobal(Offset.zero)}/tap=${tester.getCenter(pixel)}');
            await tester.tap(pixel);
            await tester.pumpAndSettle();
            expect(full, findsOneWidget);
            await tester.tap(find.byTooltip('关闭'));
            await tester.pumpAndSettle();
            expect(full, findsNothing);
            expect(find.text('本地原图'), findsOneWidget);
            expect(exceptions(tester), isEmpty);
          }
        }
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
        debugDefaultTargetPlatformOverride = null;
      });
    }
  }
}
