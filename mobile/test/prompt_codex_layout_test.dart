import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/prompt_codex_screen.dart';
import 'package:novelai_mobile/services/prompt_codex_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

class _FakePromptCodexService extends PromptCodexService {
  final PromptCodexSnapshot snapshot = PromptCodexSnapshot(
    generatedAt: '2026-07-23T00:00:00.000Z',
    sourceSite: 'https://nai4.top',
    permissionNote: 'free',
    books: const [
      PromptCodexBook(
        id: 'regular',
        title: '所长常规NovalAI个人法典',
        sourceUrl: 'https://nai4.top',
        adult: false,
      ),
    ],
    entries: List.generate(
      8,
      (index) => PromptCodexEntry(
        id: 'regular-$index',
        bookId: 'regular',
        section: '各种风格',
        category: 'style',
        title: '风格 $index',
        prompt: 'artist:test_$index, dramatic lighting, detailed background',
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

void main() {
  for (final viewport in <(String, Size)>[
    ('phone portrait', const Size(360, 800)),
    ('phone landscape', const Size(800, 360)),
    ('tablet landscape', const Size(1280, 800)),
  ]) {
    testWidgets('prompt codex fits ${viewport.$1}', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = viewport.$2;
      addTearDown(tester.view.reset);
      final state = AppState();
      addTearDown(state.dispose);
      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
            theme: StudioTheme.light(),
            home: PromptCodexScreen(
              onBack: () {},
              service: _FakePromptCodexService(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
      expect(find.textContaining('风格 0'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
