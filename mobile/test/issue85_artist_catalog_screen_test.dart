import 'package:flutter/foundation.dart';
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/services/artist_catalog_service.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';

void androidTestWidgets(String name, WidgetTesterCallback body) {
  testWidgets(name, (tester) async {
    final previous = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    try { await body(tester); } finally { debugDefaultTargetPlatformOverride = previous; }
  });
}

bool _hasKoreanFont = false;
class _Artists extends ArtistTagService {
  bool? random; int? count; int reads = 0;
  Completer<ArtistCatalogInfo>? download;
  @override
  Future<ArtistCatalogSelection> localCatalog({int count = 1000, bool random = false, int seed = 0}) async {
    this.count = count; this.random = random; reads++;
    return ArtistCatalogSelection(List.generate(count.clamp(1, 20000), (i) => ArtistTagRecord(i + 1, 'fixture_$i', 20000 - i)),
      ArtistCatalogInfo(738103, DateTime(2026, 9, 9), downloaded: download?.isCompleted ?? false));
  }
  @override
  Future<ArtistCatalogInfo> updateCatalog(AppSettings settings, {void Function(int, int?)? progress}) {
    progress?.call(10, 100); download = Completer<ArtistCatalogInfo>(); return download!.future;
  }
  @override
  void cancelCatalogUpdate() {
    if (download != null && !download!.isCompleted) download!.completeError(const FormatException('fixture cancellation'));
  }
}

Future<void> reveal(WidgetTester t, Finder target) async {
  final scroller = find.descendant(of: find.byKey(const PageStorageKey<String>('random-artist-lab-scroll')), matching: find.byType(Scrollable)).first;
  final p = t.state<ScrollableState>(scroller).position;
  for (var i = 0; i < 50 && target.evaluate().isEmpty; i++) {
    p.jumpTo((p.pixels + 350).clamp(0, p.maxScrollExtent)); await t.pumpAndSettle();
  }
  expect(target, findsWidgets); await t.ensureVisible(target.first); await t.pumpAndSettle();
}
Future<void> capture(WidgetTester t, String name) async {
  final dir = Platform.environment['RESULT_SCREENSHOTS']; if (dir == null) return;
  await t.runAsync(() async {
    final boundary = t.renderObject<RenderRepaintBoundary>(find.byKey(const ValueKey('capture85')));
    final image = await boundary.toImage(); final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(dir).create(recursive: true); await File('$dir/$name.png').writeAsBytes(bytes!.buffer.asUint8List()); image.dispose();
  });
}
Future<void> _mount(WidgetTester t, AppState app, _Artists service, {bool dark = false}) async {
  var surface = androidStudioTheme(dark ? StudioTheme.dark() : StudioTheme.light());
  if (_hasKoreanFont && app.settings.language == 'ko-KR') {
    surface = surface.copyWith(textTheme: surface.textTheme.apply(fontFamily: 'AuditKo'),
      primaryTextTheme: surface.primaryTextTheme.apply(fontFamily: 'AuditKo'));
  }
  await t.pumpWidget(RepaintBoundary(key: const ValueKey('capture85'), child: ChangeNotifierProvider.value(value: app,
    child: MaterialApp(debugShowCheckedModeBanner: false, theme: surface,
      home: RandomArtistLabScreen(onBack: () {}, artistService: service)))));
  await t.pumpAndSettle();
}
void main() {
  setUpAll(() async {
    await (FontLoader('Roboto')..addFont(rootBundle.load('assets/ui-fonts/LXGWWenKaiLite-Regular.ttf'))).load();
    // System font is used only by host captures, never bundled or copied into the APK.
    final koreanFont = File(Platform.environment['STUDIO_AUDIT_KOREAN_FONT'] ?? 'C:/Windows/Fonts/malgun.ttf');
    if (koreanFont.existsSync()) {
      await (FontLoader('AuditKo')..addFont(Future.value(ByteData.sublistView(koreanFont.readAsBytesSync())))).load();
      _hasKoreanFont = true;
    }
    await (FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    for (final dark in [false, true]) {
      for (final width in [320.0, 420.0]) {
        androidTestWidgets('mirror controls fit $language $dark at $width', (t) async {
          t.view.devicePixelRatio = 1; t.view.physicalSize = Size(width, 900); addTearDown(t.view.reset);
          SharedPreferences.setMockInitialValues({'artist_lab_random_v1_wholePool': dark});
          final app = AppState(); app.settings.language = language; addTearDown(app.dispose);
          final service = _Artists(); await _mount(t, app, service, dark: dark);
          expect(find.byKey(const ValueKey('artist-catalog-mode')), findsOneWidget);
          expect(find.byKey(const ValueKey('artist-catalog-info')), findsOneWidget);
          expect(find.byKey(const ValueKey('artist-catalog-refresh')), findsOneWidget);
          expect(service.random, dark); expect(t.takeException(), isNull);
          await capture(t, 'issue85-$language-${dark ? 'dark-random' : 'light-ranked'}-${width.toInt()}');
        });
      }
    }
  }
  androidTestWidgets('mode and selection size save and reopen, redraw stays offline', (t) async {
    t.view.devicePixelRatio = 1; t.view.physicalSize = const Size(420, 900); addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({}); final app = AppState(); addTearDown(app.dispose); final s = _Artists();
    await _mount(t, app, s); expect(s.random, false);
    await t.tap(find.byKey(const ValueKey('artist-catalog-mode'))); await t.pumpAndSettle();
    await t.tap(find.text('全库随机（等概率、不重复）').last); await t.pumpAndSettle(); expect(s.random, true);
    final count = find.byKey(const PageStorageKey<String>('artist-text-poolSize'));
    await t.enterText(count, '123');
    await t.tap(find.byKey(const ValueKey('artist-catalog-redraw'))); await t.pumpAndSettle(); expect(s.count, 123);
    expect((await SharedPreferences.getInstance()).getBool('artist_lab_random_v1_wholePool'), true);
    expect((await SharedPreferences.getInstance()).getInt('artist_lab_random_v1_poolSize'), 123);
    await t.pumpWidget(const SizedBox()); await t.pumpAndSettle(); await _mount(t, app, s);
    expect(s.random, true); expect(s.count, 123);
  });
  androidTestWidgets('explicit confirm, progress and cancellation preserve previous selection', (t) async {
    t.view.devicePixelRatio = 1; t.view.physicalSize = const Size(420, 900); addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({}); final app = AppState(); addTearDown(app.dispose); final s = _Artists();
    await _mount(t, app, s); final before = s.reads;
    await t.tap(find.byKey(const ValueKey('artist-catalog-refresh'))); await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget); expect(s.download, isNull);
    await capture(t, 'issue85-confirm-dialog');
    await t.tap(find.widgetWithText(FilledButton, '下载／更新镜像')); await t.pump();
    expect(s.download, isNotNull);
    final cancel = find.byKey(const ValueKey('artist-catalog-cancel')); await reveal(t, cancel);
    await capture(t, 'issue85-download-progress'); await t.tap(cancel); await t.pumpAndSettle();
    expect(s.reads, before); expect(find.byKey(const ValueKey('artist-catalog-info')), findsOneWidget);
    expect(t.widget<OutlinedButton>(find.byKey(const ValueKey('artist-catalog-refresh'))).onPressed, isNotNull);
    expect(t.takeException(), isNull);
  });
  androidTestWidgets('successful update selects local mirror without changing recipe mode', (t) async {
    t.view.devicePixelRatio = 1; t.view.physicalSize = const Size(420, 900); addTearDown(t.view.reset);
    SharedPreferences.setMockInitialValues({'artist_lab_random_v1_wholePool': true});
    final app = AppState(); addTearDown(app.dispose); final s = _Artists(); await _mount(t, app, s);
    await t.tap(find.byKey(const ValueKey('artist-catalog-refresh'))); await t.pumpAndSettle();
    await t.tap(find.widgetWithText(FilledButton, '下载／更新镜像')); await t.pump();
    s.download!.complete(ArtistCatalogInfo(738103, DateTime(2026, 9, 9), downloaded: true)); await t.pumpAndSettle();
    expect(s.random, true); expect((await SharedPreferences.getInstance()).getString('artist_lab_random_v1_poolSource'), 'local');
    expect(find.text('已下载镜像 · 后续抽取不联网'), findsOneWidget); expect(t.takeException(), isNull);
  });
}
