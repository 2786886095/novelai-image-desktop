import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/completion_sound_settings.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

void main() {
  test(
      'unified directory is nested under data storage rather than another top-level card',
      () {
    final main = File('lib/screens/settings_screen.dart').readAsStringSync();
    final data =
        File('lib/screens/resource_database_settings.dart').readAsStringSync();
    final folder =
        File('lib/screens/unified_storage_settings.dart').readAsStringSync();
    expect(main.contains('const UnifiedStorageSettings()'), isFalse);
    expect(data.contains('const UnifiedStorageSettings()'), isTrue);
    expect(folder.contains('return Card('), isFalse);
  });
  for (final dark in [false, true]) {
    for (final lang in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      for (final size in [
        const Size(320, 640),
        const Size(430, 932),
        const Size(844, 390)
      ]) {
        testWidgets('sound section consistent $lang dark=$dark $size',
            (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = size;
          addTearDown(tester.view.reset);
          final app = AppState();
          app.settings.language = lang;
          await tester.pumpWidget(ChangeNotifierProvider.value(
              value: app,
              child: MaterialApp(
                  theme: dark ? StudioTheme.dark() : StudioTheme.light(),
                  home: const Scaffold(
                      body: SingleChildScrollView(
                          child: CompletionSoundSettings())))));
          final tileFinder = find.byType(ExpansionTile);
          final tile = tester.widget<ExpansionTile>(tileFinder);
          final card = tester.widget<Card>(find.byType(Card));
          final context = tester.element(tileFinder);
          expect(card.margin, const EdgeInsets.only(top: 12));
          expect(card.clipBehavior, Clip.antiAlias);
          expect(tile.leading, isNull);
          expect((tile.title as Text).style,
              Theme.of(context).textTheme.titleMedium);
          expect(tile.shape, const Border());
          expect(tile.collapsedShape, const Border());
          expect(
              tile.childrenPadding, const EdgeInsets.fromLTRB(12, 16, 12, 12));
          expect(find.byType(Slider), findsNothing);
          await tester.tap(tileFinder);
          await tester.pumpAndSettle();
          expect(find.byType(Slider), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          app.dispose();
        });
      }
    }
  }
}
