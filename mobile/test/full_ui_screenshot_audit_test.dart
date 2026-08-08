import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/batch/batch_redraw_controller.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/ai_log_screen.dart';
import 'package:novelai_mobile/screens/aitag_gallery_screen.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/screens/metadata_inspector_screen.dart';
import 'package:novelai_mobile/screens/prompt_codex_screen.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';
import 'package:novelai_mobile/services/aitag_service.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/services/prompt_codex_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _enabled = bool.fromEnvironment('FULL_UI_AUDIT');
const _auditPlatform = String.fromEnvironment(
  'FULL_UI_AUDIT_PLATFORM',
  defaultValue: 'android',
);
const _auditOutputOverride = String.fromEnvironment('FULL_UI_AUDIT_OUTPUT');
const _auditTargetPlatform = _auditPlatform == 'ios'
    ? TargetPlatform.iOS
    : TargetPlatform.android;
const _locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];
const _themes = ['light', 'dark'];
const _fontZh = 'AuditZh';
const _fontEn = 'AuditEn';
const _fontJa = 'AuditJa';
const _fontKo = 'AuditKo';
const _fontMaterialIcons = 'MaterialIcons';

typedef _SurfaceBuilder = Widget Function(AppState state);

class _FakePromptCodexService extends PromptCodexService {
  final PromptCodexSnapshot snapshot = PromptCodexSnapshot(
    generatedAt: '2026-08-08T00:00:00.000Z',
    sourceSite: 'https://nai4.top',
    permissionNote: 'free',
    books: const [
      PromptCodexBook(
        id: 'regular',
        title: '所长常规NovalAI个人法典',
        sourceUrl: 'https://nai4.top',
        adult: false,
      ),
      PromptCodexBook(
        id: 'adult-upper',
        title: '所长色色NovalAI个人法典(上)',
        sourceUrl: 'https://nai4.top',
        adult: true,
      ),
    ],
    entries: List.generate(
      12,
      (index) => PromptCodexEntry(
        id: 'regular-$index',
        bookId: 'regular',
        section: index.isEven ? '编纂者常用画师组' : '各种风格',
        category: index.isEven ? 'artist' : 'style',
        title: '示例条目 ${index + 1}',
        prompt:
            '1.2::artist:test_$index ::, cinematic lighting, detailed background, year 2025,',
        adult: false,
        sourceUrl: 'https://nai4.top',
      ),
    ),
  );

  @override
  Future<PromptCodexSnapshot> load() async => snapshot;

  @override
  Future<PromptCodexSnapshot> update() async => snapshot;
}

class _FakeArtistService extends ArtistTagService {
  @override
  Future<List<ArtistTagRecord>> popular(
    AppSettings settings, {
    int limit = 1000,
    bool force = false,
  }) async =>
      List.generate(
        80,
        (index) => ArtistTagRecord(index + 1, 'artist_$index', 2000 - index),
      );
}

class _FakeAitagService extends AitagService {
  _FakeAitagService() {
    availableYears = const [2026, 2025, 2024];
    availableMonths = const ['2026-08', '2026-07', '2026-06'];
  }

  @override
  Future<void> loadConfig() async {}

  @override
  Future<AitagSearchResult> search({
    int page = 1,
    String query = '',
    String prompt = '',
    String sort = 'new',
    String? timeRange,
  }) async =>
      AitagSearchResult(
        page: page,
        total: 4,
        items: List.generate(
          4,
          (index) => AitagWork(
            id: index + 1,
            userId: 'artist',
            title: 'AITag work ${index + 1}',
            caption: 'sample caption',
            tags: const ['1girl', 'night', 'blue theme'],
            createDate: '2026-08-08',
            aiType: 'NovelAI',
            totalView: 1200,
            totalBookmarks: 88,
            imageCount: 0,
          ),
        ),
      );

  @override
  Future<AitagWorkDetail> work(int id) async => AitagWorkDetail(
        work: AitagWork(
          id: id,
          userId: 'artist',
          title: 'AITag work $id',
          caption: 'sample caption',
          tags: const ['1girl'],
          createDate: '2026-08-08',
          aiType: 'NovelAI',
          totalView: 1200,
          totalBookmarks: 88,
          imageCount: 0,
        ),
        images: const [],
      );
}

String _repoRoot() {
  final current = Directory.current.path.replaceAll('\\', '/');
  return current.endsWith('/mobile')
      ? current.substring(0, current.length - 7)
      : current;
}

String _auditOutputRoot() => _auditOutputOverride.trim().isNotEmpty
    ? _auditOutputOverride.replaceAll('\\', '/')
    : '${_repoRoot()}/.tmp/ui-audit-current';

String _flutterRoot() {
  var directory = File(Platform.resolvedExecutable).parent;
  for (var index = 0; index < 4; index++) {
    directory = directory.parent;
  }
  return directory.path.replaceAll('\\', '/');
}

String _fontFamilyFor(String localeCode) =>
    switch (normalizeAppLocaleCode(localeCode)) {
      'en-US' => _fontEn,
      'ja-JP' => _fontJa,
      'ko-KR' => _fontKo,
      _ => _fontZh,
    };

Future<void> _loadFont(String family, List<String> candidates) async {
  final loader = FontLoader(family);
  var loaded = false;
  for (final path in candidates) {
    final file = File(path);
    if (!file.existsSync()) continue;
    loader.addFont(file.readAsBytes().then(ByteData.sublistView));
    loaded = true;
  }
  if (loaded) await loader.load();
}

Future<void> _loadAuditFonts() async {
  await _loadFont(_fontZh, ['C:/Windows/Fonts/msyh.ttc']);
  await _loadFont(_fontEn, ['C:/Windows/Fonts/arial.ttf']);
  await _loadFont(_fontJa, ['C:/Windows/Fonts/YuGothR.ttc']);
  await _loadFont(_fontKo, ['C:/Windows/Fonts/malgun.ttf']);
  await _loadFont(_fontMaterialIcons, [
    '${_flutterRoot()}/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
    '${_repoRoot()}/mobile/build/unit_test_assets/fonts/MaterialIcons-Regular.otf',
  ]);
}

Future<void> _savePng(GlobalKey boundaryKey, String path) async {
  final boundary =
      boundaryKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 1);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  if (bytes == null) throw StateError('Failed to encode $path');
  final output = File(path);
  await output.parent.create(recursive: true);
  await output.writeAsBytes(bytes.buffer.asUint8List());
}

Future<void> _saveRenderViewPng(String path) async {
  final renderView = RendererBinding.instance.renderViews.first;
  final layer = renderView.debugLayer;
  if (layer == null) throw StateError('Render view has no composited layer.');
  final scene = layer.buildScene(ui.SceneBuilder());
  final image = await scene.toImage(
    renderView.paintBounds.width.ceil(),
    renderView.paintBounds.height.ceil(),
  );
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  scene.dispose();
  if (bytes == null) throw StateError('Failed to encode $path');
  final output = File(path);
  await output.parent.create(recursive: true);
  await output.writeAsBytes(bytes.buffer.asUint8List());
}

Future<void> _saveBoundaryFinderPng(
  WidgetTester tester,
  Finder finder,
  String path,
) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(finder);
  final image = await boundary.toImage(pixelRatio: 1);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  if (bytes == null) throw StateError('Failed to encode $path');
  final output = File(path);
  await output.parent.create(recursive: true);
  await output.writeAsBytes(bytes.buffer.asUint8List());
}

Widget _batch(AppState state, BatchRedrawStep step) {
  final controller = BatchRedrawController(state)
    ..project = BatchRedrawProject.empty(state.params)
    ..loaded = true
    ..step = step;
  return BatchRedrawScreen(onBack: () {}, controller: controller);
}

Widget _comic(AppState state, ComicStep step) {
  final controller = ComicController(state)
    ..project = ComicProject.empty(state.params)
    ..loaded = true
    ..step = step;
  return ComicScreen(onBack: () {}, controller: controller);
}

List<({String name, _SurfaceBuilder build})> _surfaces() => [
      (name: 'home', build: (_) => const HomeShell()),
      (name: 'generate', build: (_) => const GenerateScreen()),
      (
        name: 'inpaint',
        build: (_) => const ToolsScreen(kind: ToolPageKind.inpaint)
      ),
      (
        name: 'upscale',
        build: (_) => const ToolsScreen(kind: ToolPageKind.upscale)
      ),
      (
        name: 'postprocess',
        build: (_) => const ToolsScreen(kind: ToolPageKind.postprocess)
      ),
      (
        name: 'reverse',
        build: (_) => const InspectScreen(kind: InspectPageKind.reverse)
      ),
      (
        name: 'convert',
        build: (_) => const InspectScreen(kind: InspectPageKind.convert)
      ),
      (
        name: 'metadata',
        build: (_) =>
            MetadataInspectorScreen(onBack: () {}, onOpenGenerate: () {}),
      ),
      (name: 'tools-hub', build: (_) => const ToolsHubScreen()),
      (name: 'gallery', build: (_) => const GalleryScreen()),
      (name: 'ai-log', build: (_) => const AiLogScreen()),
      (name: 'settings', build: (_) => const SettingsScreen()),
      (
        name: 'prompt-codex',
        build: (_) => PromptCodexScreen(
              onBack: () {},
              service: _FakePromptCodexService(),
            ),
      ),
      (
        name: 'aitag',
        build: (_) =>
            AitagGalleryScreen(onBack: () {}, service: _FakeAitagService()),
      ),
      (
        name: 'random-artist',
        build: (_) => RandomArtistLabScreen(
              onBack: () {},
              artistService: _FakeArtistService(),
            ),
      ),
      for (final step in BatchRedrawStep.values)
        (name: 'batch-${step.name}', build: (state) => _batch(state, step)),
      for (final step in ComicStep.values)
        (name: 'comic-${step.name}', build: (state) => _comic(state, step)),
    ];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  if (!_enabled) {
    test('full UI screenshot audit is opt-in', () {},
        skip: 'Run with --dart-define=FULL_UI_AUDIT=true');
    return;
  }

  setUpAll(_loadAuditFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  final primaryViewports = <(String, Size)>[
    ('phone-portrait', const Size(390, 844)),
    ('tablet-landscape', const Size(1280, 800)),
  ];
  final orientationViewports = <(String, Size)>[
    ('phone-landscape', const Size(800, 360)),
    ('tablet-portrait', const Size(800, 1280)),
  ];

  for (final locale in _locales) {
    for (final themeName in _themes) {
      for (final viewport in primaryViewports) {
        for (final surface in _surfaces()) {
          testWidgets(
              'captures $locale $themeName ${viewport.$1} ${surface.name}',
              (tester) async {
            tester.view.devicePixelRatio = 1;
            tester.view.physicalSize = viewport.$2;
            addTearDown(tester.view.reset);
            final state = AppState()
              ..settings.language = locale
              ..settings.theme = themeName
              ..booted = true
              ..needsNetworkOnboarding = false
              ..account = const AccountSummary(
                  hasToken: true, tierName: 'Opus', anlasBalance: 9049);
            final boundaryKey = GlobalKey();
            final baseTheme =
                themeName == 'dark' ? StudioTheme.dark() : StudioTheme.light();
            final fontFamily = _fontFamilyFor(locale);
            await tester.pumpWidget(
              ChangeNotifierProvider.value(
                value: state,
                child: MaterialApp(
                  locale: appLocaleInfoFor(locale).locale,
                  supportedLocales:
                      supportedAppLocales.map((item) => item.locale),
                  localizationsDelegates: const [
                    GlobalMaterialLocalizations.delegate,
                    GlobalWidgetsLocalizations.delegate,
                    GlobalCupertinoLocalizations.delegate,
                  ],
                  theme: baseTheme.copyWith(
                    textTheme: baseTheme.textTheme.apply(
                      fontFamily: fontFamily,
                      fontFamilyFallback: const [_fontZh],
                    ),
                    primaryTextTheme: baseTheme.primaryTextTheme.apply(
                      fontFamily: fontFamily,
                      fontFamilyFallback: const [_fontZh],
                    ),
                  ),
                  home: RepaintBoundary(
                    key: boundaryKey,
                    child: surface.build(state),
                  ),
                ),
              ),
            );
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 180));
            expect(tester.takeException(), isNull,
                reason: '$locale $themeName ${viewport.$1} ${surface.name}');
            final output =
                '${_auditOutputRoot()}/mobile/$_auditPlatform/$themeName/$locale/${viewport.$1}/${surface.name}.png';
            await tester.runAsync(() => _savePng(boundaryKey, output));
            await tester.pumpWidget(const SizedBox.shrink());
            state.dispose();
          }, variant: TargetPlatformVariant.only(_auditTargetPlatform));
        }
      }
    }
  }

  for (final viewport in orientationViewports) {
    for (final surface in _surfaces()) {
      testWidgets('captures zh-CN light ${viewport.$1} ${surface.name}',
          (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = viewport.$2;
        addTearDown(tester.view.reset);
        final state = AppState()
          ..settings.language = 'zh-CN'
          ..settings.theme = 'light'
          ..booted = true
          ..needsNetworkOnboarding = false
          ..account = const AccountSummary(
              hasToken: true, tierName: 'Opus', anlasBalance: 9049);
        final boundaryKey = GlobalKey();
        final theme = StudioTheme.light();
        await tester.pumpWidget(
          ChangeNotifierProvider.value(
            value: state,
            child: MaterialApp(
              theme: theme.copyWith(
                textTheme: theme.textTheme.apply(fontFamily: _fontZh),
                primaryTextTheme:
                    theme.primaryTextTheme.apply(fontFamily: _fontZh),
              ),
              home: RepaintBoundary(
                key: boundaryKey,
                child: surface.build(state),
              ),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 180));
        expect(tester.takeException(), isNull,
            reason: 'zh-CN light ${viewport.$1} ${surface.name}');
        final output =
            '${_auditOutputRoot()}/mobile/$_auditPlatform/light/zh-CN/${viewport.$1}/${surface.name}.png';
        await tester.runAsync(() => _savePng(boundaryKey, output));
        await tester.pumpWidget(const SizedBox.shrink());
        state.dispose();
      }, variant: TargetPlatformVariant.only(_auditTargetPlatform));
    }
  }

  for (final locale in _locales) {
    for (final themeName in _themes) {
      for (final viewport in primaryViewports) {
        testWidgets(
            'captures style image manager $locale $themeName ${viewport.$1}',
            (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = viewport.$2;
          addTearDown(tester.view.reset);
          final iconPath = '${_repoRoot()}/build/icon.png';
          final preset = StylePromptPreset(
            id: 'audit-style',
            name: 'Audit style',
            prompt: 'masterpiece, cinematic lighting,',
            createdAt: '2026-08-08T00:00:00.000Z',
            previewImages: [
              StylePromptPreviewImage(
                id: 'audit-image',
                name: 'style-reference.png',
                filePath: iconPath,
                createdAt: '2026-08-08T00:00:00.000Z',
              ),
            ],
          );
          final state = AppState()
            ..settings.language = locale
            ..settings.theme = themeName
            ..settings.stylePromptPresets = [preset]
            ..params.stylePrompt = preset.prompt
            ..booted = true
            ..needsNetworkOnboarding = false
            ..account = const AccountSummary(
                hasToken: true, tierName: 'Opus', anlasBalance: 9049);
          final boundaryKey = GlobalKey();
          final baseTheme =
              themeName == 'dark' ? StudioTheme.dark() : StudioTheme.light();
          final fontFamily = _fontFamilyFor(locale);
          await tester.pumpWidget(
            ChangeNotifierProvider.value(
              value: state,
              child: MaterialApp(
                locale: appLocaleInfoFor(locale).locale,
                supportedLocales:
                    supportedAppLocales.map((item) => item.locale),
                localizationsDelegates: const [
                  GlobalMaterialLocalizations.delegate,
                  GlobalWidgetsLocalizations.delegate,
                  GlobalCupertinoLocalizations.delegate,
                ],
                theme: baseTheme.copyWith(
                  textTheme: baseTheme.textTheme.apply(
                    fontFamily: fontFamily,
                    fontFamilyFallback: const [_fontZh],
                  ),
                  primaryTextTheme: baseTheme.primaryTextTheme.apply(
                    fontFamily: fontFamily,
                    fontFamilyFallback: const [_fontZh],
                  ),
                ),
                builder: (context, child) => RepaintBoundary(
                  key: boundaryKey,
                  child: child ?? const SizedBox.shrink(),
                ),
                home: const GenerateScreen(),
              ),
            ),
          );
          await tester.pumpAndSettle(const Duration(milliseconds: 120));
          final imageButton = find.byIcon(Icons.photo_library_outlined);
          if (imageButton.evaluate().isEmpty) {
            final generateList = find.byKey(
              const ValueKey('generate-single-layout'),
            );
            final scrollTarget = generateList.evaluate().isNotEmpty
                ? generateList
                : find.byType(ListView).last;
            for (var attempt = 0;
                attempt < 10 && imageButton.evaluate().isEmpty;
                attempt++) {
              await tester.drag(scrollTarget, const Offset(0, -320));
              await tester.pump(const Duration(milliseconds: 80));
            }
          }
          expect(imageButton, findsWidgets);
          await tester.tap(find.textContaining('/3').last);
          await tester.pump(const Duration(milliseconds: 420));
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 120)),
          );
          await tester.pump();
          expect(
            find.text(generateScreenTextFor(locale).stylePresetImageManager),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull,
              reason: 'style manager $locale $themeName ${viewport.$1}');
          final output =
              '${_auditOutputRoot()}/mobile/$_auditPlatform/$themeName/$locale/${viewport.$1}/style-image-manager.png';
          await tester.runAsync(() => _saveRenderViewPng(output));
          final managerOutput =
              '${_auditOutputRoot()}/mobile/$_auditPlatform/$themeName/$locale/${viewport.$1}/style-image-manager-panel.png';
          await tester.runAsync(
            () => _saveBoundaryFinderPng(
              tester,
              find.byKey(const ValueKey('style-image-manager-sheet')),
              managerOutput,
            ),
          );
          await tester.pumpWidget(const SizedBox.shrink());
          state.dispose();
        }, variant: TargetPlatformVariant.only(_auditTargetPlatform));
      }
    }
  }
}
