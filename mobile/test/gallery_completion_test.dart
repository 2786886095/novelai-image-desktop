import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/gallery_favorites_screen.dart';
import 'package:novelai_mobile/services/gallery_favorites.dart';
import 'package:novelai_mobile/services/gallery_labels.dart';
import 'package:novelai_mobile/services/tags_gallery.dart';
import 'package:novelai_mobile/ui/character_editing.dart';

GalleryFavorite sample(String source, {String id = '1', int time = 1}) =>
    GalleryFavorite(source: source, id: id, title: 'item $id', savedAt: time,
        prompt: 'rem (re:zero), 0::dress::', negativePrompt: '',
        images: const [{'url': 'https://example.com/a.webp', 'thumb': ''}]);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('all sources persist independently; concurrent saves and removal survive restart', () async {
    SharedPreferences.setMockInitialValues({});
    final store = GalleryFavoritesStore();
    final sources = ['aitag', 'artist-ranking', 'danbooru', 'safebooru', 'gelbooru', 'quicktag', 'tags-gallery'];
    await Future.wait(sources.map((s) => store.toggle(sample(s))));
    expect(store.items.length, 7);
    final restart = GalleryFavoritesStore();
    await restart.load();
    expect(restart.items.map((e) => e.key).toSet(), sources.map((s) => '$s:1').toSet());
    expect(restart.items.first.prompt, 'rem (re:zero), 0::dress::');
    await restart.toggle(sample('aitag'));
    final after = GalleryFavoritesStore();
    await after.load();
    expect(after.items.length, 6);
    expect(after.items.any((e) => e.source == 'aitag'), isFalse);
    store.dispose(); restart.dispose(); after.dispose();
  });
  test('corrupt library is not overwritten and URLs cannot execute scripts', () async {
    SharedPreferences.setMockInitialValues({galleryFavoritesKey: '{broken'});
    final store = GalleryFavoritesStore();
    await store.load();
    expect(store.error, isNotNull);
    await expectLater(store.toggle(sample('aitag')), throwsA(isA<FormatException>()));
    expect((await SharedPreferences.getInstance()).getString(galleryFavoritesKey), '{broken');
    expect(validGalleryUrl('javascript:alert(1)'), '');
    expect(validGalleryUrl('file:///private'), '');
    final j = sample('aitag').toJson();
    j['images'] = [{'url': 'javascript:x', 'thumb': ''}];
    expect(GalleryFavorite.fromJson(j).images, isEmpty);
    store.dispose();
  });
  test('sorting does not mutate the stored collection', () {
    final rows = [sample('aitag', id: 'b', time: 1), sample('danbooru', id: 'a', time: 2)];
    expect(orderFavorites(rows, 'name').first.id, 'a');
    expect(orderFavorites(rows, 'name-desc').first.id, 'b');
    expect(orderFavorites(rows, 'newest').first.savedAt, 2);
    expect(orderFavorites(rows, 'oldest').first.savedAt, 1);
    expect(rows.first.id, 'b');
  });
  test('official names have exact qualifiers and desktop/mobile dictionaries match', () {
    expect(galleryLabelData, jsonDecode(File('../shared/gallery-labels.json').readAsStringSync()));
    expect(localizedGalleryTag('rem (re:zero)', 'zh-CN'), '蕾姆');
    expect(localizedGalleryTag('rem (unknown)', 'zh-CN'), 'rem (unknown)');
    expect(localizedGalleryTag('rem (re:zero)', 'ko-KR'), 'rem (re:zero)');
    expect(galleryTagQuery('蕾姆', 'zh-CN'), 'rem (re:zero)');
  });
  test('server name/count sort survives pagination crossing a source page', () async {
    final calls = <Uri>[];
    final client = MockClient((r) async {
      calls.add(r.url);
      final start = r.url.queryParameters['p'] == '2' ? 100 : 0;
      return http.Response('<main>hits=200${List.generate(100, (i) => '<a aria-label="Open detail: tag ${start+i}" href="/hair/tag_${start+i}"></a>').join()}</main>', 200);
    });
    final service = TagsGalleryClient(client);
    final page = await service.search('hair', 9, 12, '', 'name');
    expect(page.items.length, 12);
    expect(calls.length, 2);
    expect(calls.every((u) => u.queryParameters['s'] == 'name'), isTrue);
    expect(tagsGalleryUrl('hair', 1, '', 'count').queryParameters['s'], 'count');
    client.close();
  });
  testWidgets('whole card moves with a gap; drop restores original expanded states', (t) async {
    var items = ['A', 'B', 'C'];
    final folded = {'A': false, 'B': true, 'C': false};
    await t.pumpWidget(MaterialApp(home: Scaffold(body: StatefulBuilder(builder: (c, set) =>
      SizedBox(width: 400, child: CharacterReorderList(
        count: items.length, keyFor: (i) => ValueKey(items[i]), dragLabel: 'Drag',
        onReorder: (from, to) => set(() { final next = [...items]; next.insert(to, next.removeAt(from)); items = next; }),
        itemBuilder: (c, i, compact, handle) => Container(
          height: compact || folded[items[i]]! ? 64 : 120,
          margin: const EdgeInsets.only(bottom: 8), color: Colors.white,
          child: Column(children: [Row(children: [handle, Text(items[i])]),
            if (!compact && !folded[items[i]]!) Text('details ${items[i]}')]))
      ))))));
    expect(find.text('details A'), findsOneWidget);
    final handle = find.byIcon(Icons.menu).first;
    final gesture = await t.startGesture(t.getCenter(handle));
    await t.pump();
    await t.pump(const Duration(milliseconds: 600));
    expect(find.text('details A'), findsNothing);
    await gesture.moveBy(const Offset(0, 12));
    await t.pump();
    expect(find.byWidgetPredicate((w) => w is Material && w.elevation == 8), findsOneWidget);
    await gesture.moveTo(const Offset(180, 300));
    await t.pump(const Duration(milliseconds: 300));
    await gesture.up();
    await t.pumpAndSettle();
    expect(items, ['B', 'C', 'A']);
    expect(find.text('details A'), findsOneWidget);
    expect(find.text('details B'), findsNothing);
    expect(find.text('details C'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('shared library is usable at phone width and searches localized names', (t) async {
    SharedPreferences.setMockInitialValues({});
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final state = AppState();
    state.settings.language = 'zh-CN';
    addTearDown(state.dispose);
    final store = GalleryFavoritesStore.instance;
    await store.load();
    for (final source in ['aitag', 'artist-ranking', 'danbooru', 'safebooru', 'gelbooru', 'quicktag', 'tags-gallery']) {
      await store.toggle(GalleryFavorite(source: source, id: 'ui-1',
          title: source == 'tags-gallery' ? 'rem (re:zero)' : source, savedAt: 1));
    }
    await t.pumpWidget(ChangeNotifierProvider.value(value: state,
        child: const MaterialApp(home: GalleryFavoritesScreen())));
    await t.pumpAndSettle();
    expect(find.text('收藏库 · 7'), findsOneWidget);
    expect(t.takeException(), isNull);
    await t.enterText(find.byType(TextField), '蕾姆');
    await t.pumpAndSettle();
    expect(find.text('蕾姆'), findsWidgets);
    expect(find.byType(GalleryFavoriteButton), findsOneWidget);
    await t.tap(find.byType(GalleryFavoriteButton));
    await t.pumpAndSettle();
    expect(store.items.length, 6);
    expect(find.byType(GalleryFavoriteButton), findsNothing);
    expect(t.takeException(), isNull);
  });
}
