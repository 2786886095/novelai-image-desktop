import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/services/gallery_favorites.dart';
import 'package:novelai_mobile/agent/collection_actions.dart';
import 'package:novelai_mobile/agent/operation_policy.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/screens/gallery_favorites_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late GalleryFavoritesStore store;
  late CollectionActions actions;
  final item = {
    'source': 'danbooru',
    'id': '123',
    'title': 'fixture',
    'images': <dynamic>[]
  };
  setUp(() {
    SharedPreferences.setMockInitialValues({'unrelated': 'preserved'});
    store = GalleryFavoritesStore();
    actions = CollectionActions(store: store);
  });
  tearDown(() => store.dispose());
  testWidgets(
      'default Agent service updates the actual favorites screen without reopening',
      (tester) async {
    final app = AppState();
    final service = SoftwareActions(app);
    try {
      final before = await tester.runAsync(() => service.execute(
          'langbai_software_action', {'action': 'favorites.online.list'}));
      await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
          value: app,
          child: const MaterialApp(home: GalleryFavoritesScreen())));
      await tester.pumpAndSettle();
      expect(find.text('fixture'), findsNothing);
      final added = await tester
          .runAsync(() => service.execute('langbai_software_action', {
                'action': 'favorites.online.add',
                'item': item,
                'expectedRevision': before!['revision']
              }));
      await tester.pumpAndSettle();
      expect(find.text('fixture'), findsOneWidget);
      await tester.runAsync(() => service.execute('langbai_software_action', {
            'action': 'favorites.online.remove',
            'id': 'danbooru:123',
            'expectedRevision': added!['revision']
          }));
      await tester.pumpAndSettle();
      expect(find.text('fixture'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      app.dispose();
    }
  });
  test(
      'save/read/remove uses actual persistent store and notifies the existing UI',
      () async {
    var updates = 0;
    store.addListener(() => updates++);
    final before = await actions.execute({'action': 'favorites.online.list'});
    final added = await actions.execute({
      'action': 'favorites.online.add',
      'item': item,
      'expectedRevision': before['revision']
    });
    expect(added['total'], 1);
    expect(updates, greaterThan(0));
    expect(store.items.single.key, 'danbooru:123');
    final fresh = GalleryFavoritesStore();
    await fresh.load();
    expect(fresh.items.single.title, 'fixture');
    fresh.dispose();
    final dup = await actions.execute({
      'action': 'favorites.online.add',
      'item': item,
      'expectedRevision': added['revision']
    });
    expect(dup['total'], 1);
    final removed = await actions.execute({
      'action': 'favorites.online.remove',
      'id': 'danbooru:123',
      'expectedRevision': dup['revision']
    });
    expect(removed['total'], 0);
    expect((await SharedPreferences.getInstance()).getString('unrelated'),
        'preserved');
  });
  test('UI changes invalidate Agent revisions inside the same write queue',
      () async {
    final before = await actions.execute({'action': 'favorites.online.list'});
    await store.toggle(GalleryFavorite.fromJson({...item, 'savedAt': 1}));
    await expectLater(
        actions.execute({
          'action': 'favorites.online.remove',
          'id': 'danbooru:123',
          'expectedRevision': before['revision']
        }),
        throwsStateError);
    expect(store.items.length, 1);
  });
  test('corrupt store rejects changes and preserves original bytes', () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(galleryFavoritesKey, '{bad');
    await expectLater(actions.execute({'action': 'favorites.online.list'}),
        throwsFormatException);
    expect(prefs.getString(galleryFavoritesKey), '{bad');
  });
  test(
      'add has no confirmation, remove has one operation policy, desktop-only controls not advertised',
      () {
    expect(
        requiresAgentConfirmation(
            'langbai_software_action', {'action': 'favorites.online.add'}),
        false);
    expect(
        requiresAgentConfirmation(
            'langbai_software_action', {'action': 'favorites.online.remove'}),
        true);
    expect(collectionActionCatalog.containsKey('navigation.setOrder'), false);
    expect(collectionActionCatalog.containsKey('favorites.local.add'), false);
  });
  test('sanitizes item to bookmark fields and rejects invalid pagination',
      () async {
    final before = await actions.execute({'action': 'favorites.online.list'});
    await actions.execute({
      'action': 'favorites.online.add',
      'item': {...item, 'apiKey': 'not-stored'},
      'expectedRevision': before['revision']
    });
    expect(
        (await SharedPreferences.getInstance()).getString(galleryFavoritesKey),
        isNot(contains('not-stored')));
    expect(
        jsonDecode((await SharedPreferences.getInstance())
            .getString(galleryFavoritesKey)!)['items'],
        hasLength(1));
    await expectLater(
        actions.execute({'action': 'favorites.online.list', 'limit': 100}),
        throwsStateError);
  });
}
