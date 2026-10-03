import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/local_favorites_screen.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:path/path.dart' as p;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

List<String> takeErrors(WidgetTester tester) {
  final errors = <String>[];
  Object? error;
  while ((error = tester.takeException()) != null) errors.add('$error');
  return errors;
}

Future<void> settleIo(WidgetTester tester) async {
  await tester.runAsync(() async {
    await MobileLocalFavorites.instance.list();
    await Future<void>.delayed(const Duration(milliseconds: 100));
  });
  await tester.pumpAndSettle();
}

void main() {
  for (final fixture in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
    (TargetPlatform.windows, const Size(1200, 800)),
  ]) {
    for (final action in [
      'empty',
      'otherDate',
      'retainedDate',
      'pageRegrowth'
    ]) {
      testWidgets(
          'local favorites controls ${fixture.$1.name} ${fixture.$2} $action',
          (tester) async {
        debugDefaultTargetPlatformOverride = fixture.$1;
        try {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = fixture.$2;
          SharedPreferences.setMockInitialValues({});
          final root =
              Directory.systemTemp.createTempSync('favorite-controls-');
          UnifiedStorage.active = root;
          final saved = Directory(p.join(root.path, 'images', 'favorites'))
            ..createSync(recursive: true);
          final bytes = base64Decode(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
          final count = action == 'empty'
              ? 1
              : action == 'pageRegrowth'
                  ? 13
                  : 2;
          final items = [
            for (var i = 1; i <= count; i++)
              LocalFavorite(
                  id: 'qa-control-$i',
                  sourceId: 'qa-source-$i',
                  prefix:
                      '${action == 'otherDate' && i == 1 ? '20261001' : '20261002'}_832x1216_${i.toString().padLeft(2, '0')}',
                  name: '',
                  extension: '.png',
                  fileName:
                      '${action == 'otherDate' && i == 1 ? '20261001' : '20261002'}_832x1216_${i.toString().padLeft(2, '0')}.png',
                  sha256: sha256.convert(bytes).toString(),
                  bytes: bytes.length)
          ];
          for (final item in items)
            File(p.join(saved.path, item.fileName)).writeAsBytesSync(bytes);
          final original = File(p.join(root.path, 'qa-original.png'))
            ..writeAsBytesSync(bytes);
          final index = File(p.join(root.path, 'data', 'local-favorites.json'));
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
              for (var attempt = 0; root.existsSync(); attempt++) {
                try {
                  root.deleteSync(recursive: true);
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
                child: const MaterialApp(home: LocalFavoritesScreen())));
            final context = tester.element(find.byType(LocalFavoritesScreen));
            for (final item in items) {
              final provider =
                  FileImage(File(p.join(saved.path, item.fileName)));
              await precacheImage(ResizeImage(provider, width: 440), context);
            }
            await Future<void>.delayed(const Duration(milliseconds: 100));
          });
          await tester.pumpAndSettle();
          expect(takeErrors(tester), isEmpty);
          if (action == 'pageRegrowth') {
            await tester.tap(find.text('每页张数 24'));
            await tester.pumpAndSettle();
            await tester.tap(find.text('每页张数 12').last);
            await tester.pumpAndSettle();
            expect(find.text('1 / 2'), findsOneWidget);
            await tester.tap(find.byTooltip('下一张'));
            await tester.pumpAndSettle();
            expect(find.text('2 / 2'), findsOneWidget);
          } else {
            await tester.tap(find.text('全部'));
            await tester.pumpAndSettle();
            await tester.tap(find.text('20261002').last);
            await tester.pumpAndSettle();
          }
          final removed = action == 'pageRegrowth' ? items.first : items.last;
          // Operate the actual card button; do not mutate private screen state.
          await tester.runAsync(() => tester.tap(find.byTooltip('移出收藏').first));
          await settleIo(tester);
          final removeErrors = takeErrors(tester);
          final persisted = (await tester
              .runAsync(() => MobileLocalFavorites.instance.list()))!;
          expect(persisted.items.any((e) => e.id == removed.id), isFalse);
          expect(persisted.items.length, count - 1);
          // Bookmark removal must leave both the owned original and copied PNG unchanged.
          expect(original.readAsBytesSync(), bytes);
          for (final item in items)
            expect(File(p.join(saved.path, item.fileName)).readAsBytesSync(),
                bytes);
          if (action == 'pageRegrowth') {
            expect(removeErrors, isEmpty);
            expect(find.text('2 / 2'), findsNothing);
            await tester.runAsync(() => MobileLocalFavorites.instance.add(
                HistoryItem(
                    id: 'qa-regrowth-original',
                    filePath: original.path,
                    date: '2026-10-02',
                    createdAt: '2026-10-02T00:00:00Z',
                    seed: 1,
                    model: 'nai-diffusion-4-5-full',
                    width: 832,
                    height: 1216,
                    prompt: 'owned QA')));
            await settleIo(tester);
            final errors = takeErrors(tester);
            final firstPage = find.text('1 / 2').evaluate().length == 1;
            print(
                'FAVORITES_CONTROLS=${fixture.$1.name}/${fixture.$2}/$action/errors=${errors.length}/firstPage=$firstPage');
            expect(errors, isEmpty);
            expect(firstPage, isTrue,
                reason:
                    'A contracted page must not silently jump back after regrowth.');
          } else {
            final dateValues = find
                .byWidgetPredicate((w) =>
                    w is DropdownButton<String> &&
                    w.value != 'grid' &&
                    w.value != 'masonry')
                .evaluate()
                .map((e) => (e.widget as DropdownButton<String>).value)
                .toList();
            final expectedDate = action == 'retainedDate' ? '20261002' : '';
            print(
                'FAVORITES_CONTROLS=${fixture.$1.name}/${fixture.$2}/$action/errors=${removeErrors.length}/dateValues=${jsonEncode(dateValues)}/expectedDate=$expectedDate');
            expect(removeErrors, isEmpty,
                reason:
                    'Removing the last item for a selected date must reconcile the dropdown before rebuild.');
            expect(dateValues, [expectedDate]);
            if (action == 'empty')
              expect(find.text('还没有收藏图片'), findsOneWidget);
            else
              expect(find.text(items.first.fileName), findsOneWidget);
          }
        } finally {
          debugDefaultTargetPlatformOverride = null;
        }
      });
    }
  }
}
