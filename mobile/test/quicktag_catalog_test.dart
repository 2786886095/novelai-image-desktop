import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:novelai_mobile/screens/quicktag_navigation.dart';
import 'package:novelai_mobile/services/quicktag.dart';

void main() {
  final fixture = jsonDecode(
          File('../shared/quicktag-catalog-fixtures.json').readAsStringSync())
      as Map;
  final catalog = List<Map<String, dynamic>>.from(fixture['catalog']);
  test('all sections and filtered counts match desktop', () {
    final full = quickCatalogNavigation(catalog, false),
        safe = quickCatalogNavigation(catalog, true);
    expect(full['catalogTotal'], 6);
    expect(full['catalogEntries'], 7);
    expect((full['groups'] as List).map((g) => g['id']),
        ['codex', 'string', 'composition', 'pack', 'future-type']);
    expect((safe['groups'] as List).first,
        {'id': 'codex', 'count': 2, 'visible': 1, 'entries': 2});
    expect(safe['hiddenCollections'], 1);
  });
  test('source order, empty branches, unlisted paths and aliases are preserved',
      () {
    final categories = quickCategories(
        List<Map<String, dynamic>>.from(fixture['entries']),
        tree: fixture['tree'],
        empty: fixture['emptyCategories']);
    expect(categories.map((c) => c['path']), fixture['expectedPaths']);
    expect(categories.map((c) => c['count']), [1, 1, 1, 0, 0, 0, 1]);
    expect(quickResolveCollection(catalog, 'old-style'), 'style');
    expect(
        () => quickResolveCollection([
              ...catalog,
              {
                'id': 'duplicate',
                'aliases': ['old-style']
              }
            ], 'old-style'),
        throwsFormatException);
  });

  for (final dark in [false, true]) {
    testWidgets('group and deep directory selection on phone dark=$dark',
        (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var type = '';
      var selected = 'style';
      var path = <String>[];
      final cats = quickCategories(
          List<Map<String, dynamic>>.from(fixture['entries']),
          tree: fixture['tree'],
          empty: fixture['emptyCategories']);
      await tester.pumpWidget(MaterialApp(
          theme:
              ThemeData(brightness: dark ? Brightness.dark : Brightness.light),
          home: Scaffold(
              body: SingleChildScrollView(
                  child: StatefulBuilder(
                      builder: (context, setState) => QuickTagNavigation(
                              navigation: {
                                ...quickCatalogNavigation(catalog, false),
                                'collectionType': type,
                                'categoryPath': path,
                                'categories': cats,
                                'release': 'test',
                                'failedCollections': const <String>[]
                              },
                              collectionId: selected,
                              language: 'zh-CN',
                              loading: false,
                              searchAll: false,
                              pageSize: 12,
                              onPageSize: (_) {},
                              onScope: (_) {},
                              onGroup: (v) => setState(() => type = v),
                              onSelect: (id, p) => setState(() {
                                    selected = id;
                                    path = p;
                                  })))))));
      await tester.tap(find.widgetWithText(ChoiceChip, '画风 1'));
      await tester.pumpAndSettle();
      expect(type, 'string');
      await tester.tap(find.byTooltip('Clothes'));
      await tester.pumpAndSettle();
      expect(find.text('Coats'), findsOneWidget);
      await tester.tap(find.byTooltip('Clothes › Coats'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Blue'));
      await tester.pumpAndSettle();
      expect(path, ['Clothes', 'Coats', 'Blue']);
      await tester.enterText(find.byType(TextField), 'Empty');
      await tester.pumpAndSettle();
      expect(find.widgetWithText(TextButton, 'Empty'), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    });
  }
}
