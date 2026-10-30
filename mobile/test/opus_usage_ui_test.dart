import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';

Finder accountControl(String label, {bool partial = false}) {
  final android = find
      .byKey(const ValueKey('android-create-workspace'))
      .evaluate()
      .isNotEmpty;
  return android
      ? find.byTooltip(partial ? RegExp(RegExp.escape(label)) : label)
      : partial
          ? find.textContaining(label)
          : find.text(label);
}

void main() {
  testWidgets('Opus users can inspect official V5 allowance progress',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 700);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..params = GenerateParams(width: 1024, height: 1024, steps: 23)
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
    expect(accountControl('V5 73%', partial: true), findsOneWidget);

    await tester.ensureVisible(accountControl('V5 73%', partial: true));
    expect(
        accountControl('V5 73%', partial: true).hitTestable(), findsOneWidget);
    await tester.tap(accountControl('V5 73%', partial: true));
    await tester.pumpAndSettle();
    expect(find.text('Opus 生成使用限制'), findsOneWidget);
    final progress = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator).last,
    );
    expect(progress.value, closeTo(0.725, 0.0001));
    expect(find.textContaining('1254 张图片'), findsOneWidget);
    expect(find.text('已从 NovelAI 官方接口实时同步'), findsOneWidget);
  },
      variant:
          const TargetPlatformVariant({TargetPlatform.android, TargetPlatform.iOS}));

  testWidgets('failed official refresh is labelled as stale, never live',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 700);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..params = GenerateParams(width: 1024, height: 1024, steps: 23)
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
    await tester.ensureVisible(accountControl('V5 73%', partial: true));
    expect(
        accountControl('V5 73%', partial: true).hitTestable(), findsOneWidget);
    await tester.tap(accountControl('V5 73%', partial: true));
    await tester.pumpAndSettle();

    expect(find.text('官网同步失败，当前显示上次成功数据'), findsOneWidget);
    expect(find.text('已从 NovelAI 官方接口实时同步'), findsNothing);
  },
      variant:
          const TargetPlatformVariant({TargetPlatform.android, TargetPlatform.iOS}));

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

    expect(accountControl('V5 73%', partial: true), findsNothing);
    expect(accountControl('Opus · 10000'), findsOneWidget);
  },
      variant:
          const TargetPlatformVariant({TargetPlatform.android, TargetPlatform.iOS}));
}
