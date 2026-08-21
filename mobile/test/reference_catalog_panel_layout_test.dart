import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/references/reference_catalog.dart';
import 'package:novelai_mobile/screens/reference_catalog_panel.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

const _game = ReferenceCatalogGame(
  id: '原神',
  names: {
    'zh-CN': '原神',
    'zh-TW': '原神',
    'ja-JP': '原神',
    'ko-KR': '원신',
    'en-US': 'Genshin Impact',
  },
  categories: ['游戏内角色图', '角色立绘'],
);

ReferenceCatalogAsset _asset(int index) => ReferenceCatalogAsset(
      id: 'genshin-$index',
      game: '原神',
      category: index.isEven ? '游戏内角色图' : '角色立绘',
      roleId: 'role-$index',
      names: {
        'zh-CN': '测试角色形态 $index',
        'zh-TW': '測試角色形態 $index',
        'ja-JP': 'テストキャラクター形態 $index',
        'ko-KR': '테스트 캐릭터 형태 $index',
        'en-US': 'Test Character Form $index',
      },
      gameNames: _game.names,
      searchAliases: const [],
      variant: 'form-$index',
      width: 1024,
      height: 1536,
      bytes: 2 * 1024 * 1024,
      downloadUrl: '',
      downloadMirrors: const {},
      thumbnailUrl: '',
      thumbnailMirrors: const {},
    );

final _catalog = ReferenceCatalog(
  generatedAt: '2026-08-21T00:00:00Z',
  games: const [_game],
  assets: List.generate(12, _asset),
);

void main() {
  for (final target in <({String name, Size size, String language, bool dark})>[
    (
      name: 'compact portrait zh-CN',
      size: const Size(360, 800),
      language: 'zh-CN',
      dark: false,
    ),
    (
      name: 'landscape phone ko-KR',
      size: const Size(800, 360),
      language: 'ko-KR',
      dark: true,
    ),
    (
      name: 'landscape tablet en-US',
      size: const Size(1280, 800),
      language: 'en-US',
      dark: false,
    ),
  ]) {
    testWidgets('selected series controls fit ${target.name}', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = target.size;
      addTearDown(tester.view.reset);

      final state = AppState();
      state.settings.language = target.language;
      addTearDown(state.dispose);

      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
            theme: StudioTheme.light(),
            darkTheme: StudioTheme.dark(),
            themeMode: target.dark ? ThemeMode.dark : ThemeMode.light,
            home: Scaffold(
              body: SingleChildScrollView(
                child: ReferenceCatalogPanel(
                  initialCatalog: _catalog,
                  initialGame: _game.id,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      expect(
        find.byKey(const ValueKey('reference-series-原神')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull, reason: target.name);
    });
  }
}
