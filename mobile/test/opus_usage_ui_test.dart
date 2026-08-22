import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('Opus users can inspect official V5 allowance progress',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 700);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..account = const AccountSummary(
        hasToken: true,
        tierName: 'Opus',
        tierLevel: 3,
        anlasBalance: 10000,
        opusUsageUpdatedAt: 1787356800000,
        opusUsage: OpusGenerationUsage(
          percent: 72.5,
          isNegative: false,
          timeUntilNextPercent: 6041.958,
        ),
      );
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: const GenerateScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('V5 73%'), findsOneWidget);

    await tester.tap(find.textContaining('V5 73%'));
    await tester.pumpAndSettle();
    expect(find.text('Opus 生成使用限制'), findsOneWidget);
    final progress = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator).last,
    );
    expect(progress.value, closeTo(0.725, 0.0001));
    expect(find.textContaining('1254 张图片'), findsOneWidget);
    expect(find.text('已从 NovelAI 官方接口实时同步'), findsOneWidget);
  });

  testWidgets('failed official refresh is labelled as stale, never live',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 700);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..account = const AccountSummary(
        hasToken: true,
        tierName: 'Opus',
        tierLevel: 3,
        anlasBalance: 10000,
        stale: true,
        opusUsageUpdatedAt: 1787356800000,
        opusUsage: OpusGenerationUsage(
          percent: 72.5,
          isNegative: false,
          timeUntilNextPercent: 6041.958,
        ),
      );
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: const GenerateScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('V5 73%'));
    await tester.pumpAndSettle();

    expect(find.text('官网同步失败，当前显示上次成功数据'), findsOneWidget);
    expect(find.text('已从 NovelAI 官方接口实时同步'), findsNothing);
  });

  testWidgets('V5 allowance stays hidden while a legacy model is selected',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 700);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..params.model = 'nai-diffusion-4-5-full'
      ..account = const AccountSummary(
        hasToken: true,
        tierName: 'Opus',
        tierLevel: 3,
        anlasBalance: 10000,
        opusUsage: OpusGenerationUsage(
          percent: 72.5,
          isNegative: false,
          timeUntilNextPercent: 6041.958,
        ),
      );
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: const GenerateScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('V5 73%'), findsNothing);
    expect(find.text('Opus · 10000'), findsOneWidget);
  });
}
