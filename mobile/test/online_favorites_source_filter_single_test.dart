import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/gallery_favorites_screen.dart';
import 'package:novelai_mobile/services/gallery_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

List<String> errorsOf(WidgetTester tester) {
  final errors = <String>[];
  Object? error;
  while ((error = tester.takeException()) != null) {
    errors.add(error.toString());
  }
  return errors;
}

void main() {
  const fixture = (TargetPlatform.android, Size(360, 800));
  testWidgets('online favorites last-source detail removal restores all sources', (tester) async {
    final directory = Directory.systemTemp.createTempSync('online-favorite-source-');
    final state = AppState();
    state.settings.language = 'zh-CN';
    debugDefaultTargetPlatformOverride = fixture.$1;
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = fixture.$2;
    UnifiedStorage.active = directory;
    const removed = GalleryFavorite(source: 'aitag', id: 'qa-removed', title: 'QA_REMOVE_SOURCE', savedAt: 3);
    const other = GalleryFavorite(source: 'danbooru', id: 'qa-other', title: 'QA_OTHER_SOURCE', savedAt: 1);
    final initial = [removed, other];
    SharedPreferences.setMockInitialValues({galleryFavoritesKey: jsonEncode({'version': 1, 'items': initial.map((i) => i.toJson()).toList()})});
    final store = GalleryFavoritesStore.instance;
    await store.load();
    store.items = initial;
    store.error = null;
    try {
      await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(value: state,
          child: const MaterialApp(home: GalleryFavoritesScreen())));
      await tester.pumpAndSettle();
      final sourceControl = find.byType(StudioDropdownButton<String>).at(1);
      await tester.tap(sourceControl);
      await tester.pumpAndSettle();
      await tester.tap(find.text('aitag').last);
      await tester.pumpAndSettle();
      expect(tester.widget<StudioDropdownButton<String>>(sourceControl).value, 'aitag');
      expect(find.text('QA_OTHER_SOURCE'), findsNothing);
      final card = find.ancestor(of: find.text('QA_REMOVE_SOURCE'), matching: find.byType(Card));
      expect(card, findsOneWidget);
      await tester.tap(find.descendant(of: card, matching: find.byIcon(Icons.image_not_supported_outlined)));
      await tester.pumpAndSettle();
      expect(find.byType(BackButton), findsOneWidget);
      final favorite = find.byType(GalleryFavoriteButton);
      await tester.tap(find.descendant(of: favorite, matching: find.byType(IconButton)));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(BackButton));
      await tester.pumpAndSettle();
      final persisted = await store.snapshot();
      expect((persisted['items'] as List).any((i) => i['id'] == removed.id), isFalse);
      final control = tester.widget<StudioDropdownButton<String>>(sourceControl);
      final valid = control.items!.any((i) => i.value == control.value);
      final errors = errorsOf(tester);
      final otherVisible = find.text('QA_OTHER_SOURCE').evaluate().length;
      debugPrint('ONLINE_FAVORITES_SOURCE=${fixture.$1.name}/${fixture.$2}/keep=false/detail=true/value=${control.value}/valid=$valid/other=$otherVisible/errors=${errors.length}');
      expect(errors, isEmpty);
      expect(valid, isTrue, reason: 'Deleting the last bookmark of a selected source must not leave a blank unusable source filter.');
      expect(control.value, 'all');
      expect(otherVisible, 1);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      errorsOf(tester);
      tester.view.reset();
      debugDefaultTargetPlatformOverride = null;
      UnifiedStorage.active = null;
      state.dispose();
      if (directory.existsSync()) {
        directory.deleteSync(recursive: true);
      }
    }
  });
}
