import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/aitag_gallery_screen.dart';
import 'package:novelai_mobile/services/aitag_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

class _FakeAitagService extends AitagService {
  @override
  Future<void> loadConfig() async {
    availableYears = const [2026, 2025];
    availableMonths = const ['2026-08', '2026-07'];
  }

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
        total: 8,
        items: List.generate(
          8,
          (index) => AitagWork(
            id: index + 1,
            userId: 'artist',
            title: 'AITag work ${index + 1}',
            caption: 'sample',
            tags: const ['1girl', 'night'],
            createDate: '2026-08-08',
            aiType: 'NovelAI',
            totalView: 100,
            totalBookmarks: 10,
            imageCount: 0,
          ),
        ),
      );
}

void main() {
  for (final viewport in <(String, Size)>[
    ('phone portrait', const Size(390, 844)),
    ('phone landscape', const Size(800, 360)),
    ('tablet landscape', const Size(1280, 800)),
  ]) {
    testWidgets('AITag gallery scrolls and fits ${viewport.$1}',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = viewport.$2;
      addTearDown(tester.view.reset);
      final state = AppState()
        ..booted = true
        ..needsNetworkOnboarding = false;
      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
            theme: StudioTheme.light(),
            home: AitagGalleryScreen(
              onBack: () {},
              service: _FakeAitagService(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(Scrollbar), findsOneWidget);
      expect(find.text('AITag work 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      state.dispose();
    });
  }
}
