import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

const _locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];
const _fontZh = 'AuditZh';
const _fontEn = 'AuditEn';
const _fontJa = 'AuditJa';
const _fontKo = 'AuditKo';
const _fontMaterialIcons = 'MaterialIcons';

const _captures = <({
  String name,
  Widget Function() screen,
  Size size,
})>[
  (
    name: 'generate-phone',
    screen: GenerateScreen.new,
    size: Size(390, 844),
  ),
  (
    name: 'generate-phone-landscape',
    screen: GenerateScreen.new,
    size: Size(800, 360),
  ),
  (
    name: 'settings-phone',
    screen: SettingsScreen.new,
    size: Size(390, 844),
  ),
  (
    name: 'generate-tablet-landscape',
    screen: GenerateScreen.new,
    size: Size(1280, 800),
  ),
  (
    name: 'settings-tablet-landscape',
    screen: SettingsScreen.new,
    size: Size(1280, 800),
  ),
];

String _repoRoot() {
  final current = Directory.current.path.replaceAll('\\', '/');
  return current.endsWith('/mobile')
      ? current.substring(0, current.length - 7)
      : current;
}

File _outputFile(String locale, String name) {
  return File(
      '${_repoRoot()}/docs/assets/i18n-audit/android/$locale/$name.png');
}

Future<void> _pumpCapture(
  WidgetTester tester,
  GlobalKey boundaryKey,
  AppState state,
  String localeCode,
  Widget screen,
) async {
  state.settings.language = localeCode;
  state.account = const AccountSummary(
      hasToken: true, tierName: 'Opus', anlasBalance: 9049);
  state.generationQuote = const AnlasQuote(
    ok: true,
    amount: 0,
    source: AnlasQuoteSource.estimateFormula,
    message: 'screenshot audit quote',
  );

  final locale = appLocaleInfoFor(localeCode).locale;
  final theme = StudioTheme.light();
  final fontFamily = _fontFamilyFor(localeCode);
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: state,
      child: MaterialApp(
        locale: locale,
        supportedLocales: supportedAppLocales.map((item) => item.locale),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: theme.copyWith(
          textTheme: theme.textTheme.apply(fontFamily: fontFamily),
          primaryTextTheme:
              theme.primaryTextTheme.apply(fontFamily: fontFamily),
        ),
        home: RepaintBoundary(
          key: boundaryKey,
          child: screen,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 120));
}

Future<void> _loadAuditFonts() async {
  await _loadFont(_fontZh, ['C:/Windows/Fonts/msyh.ttc']);
  await _loadFont(_fontEn, ['C:/Windows/Fonts/arial.ttf']);
  await _loadFont(_fontJa, ['C:/Windows/Fonts/YuGothR.ttc']);
  await _loadFont(_fontKo, ['C:/Windows/Fonts/malgun.ttf']);
  await _loadFont(_fontMaterialIcons, [
    'F:/flutter/bin/cache/artifacts/material_fonts/materialicons-regular.otf',
    '${_repoRoot()}/mobile/build/unit_test_assets/fonts/MaterialIcons-Regular.otf',
  ]);
}

Future<void> _loadFont(String family, List<String> candidates) async {
  final loader = FontLoader(family);
  var loaded = false;
  for (final path in candidates) {
    final file = File(path);
    if (!file.existsSync()) continue;
    loader.addFont(file.readAsBytes().then(ByteData.sublistView));
    loaded = true;
  }
  if (loaded) {
    await loader.load();
  }
}

String _fontFamilyFor(String localeCode) {
  return switch (normalizeAppLocaleCode(localeCode)) {
    'en-US' => _fontEn,
    'ja-JP' => _fontJa,
    'ko-KR' => _fontKo,
    _ => _fontZh,
  };
}

Future<void> _savePng(GlobalKey boundaryKey, File output) async {
  final boundary =
      boundaryKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 1);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  if (bytes == null) {
    throw StateError('Failed to encode screenshot ${output.path}');
  }
  await output.parent.create(recursive: true);
  await output.writeAsBytes(bytes.buffer.asUint8List());
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(_loadAuditFonts);

  for (final locale in _locales) {
    for (final capture in _captures) {
      testWidgets('captures $locale ${capture.name}', (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = capture.size;
        addTearDown(tester.view.reset);

        final state = AppState();
        addTearDown(state.dispose);
        final boundaryKey = GlobalKey();
        await _pumpCapture(
          tester,
          boundaryKey,
          state,
          locale,
          capture.screen(),
        );
        expect(tester.takeException(), isNull,
            reason: '$locale ${capture.name}');
        final output = _outputFile(locale, capture.name);
        await tester.runAsync(() => _savePng(boundaryKey, output));
        expect(output.existsSync(), isTrue, reason: output.path);
      });
    }
  }
}
