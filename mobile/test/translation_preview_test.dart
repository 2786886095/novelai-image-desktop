import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/translation.dart';
import 'package:novelai_mobile/screens/translation_preview_dialog.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class FakeTranslationApi extends NaiApi {
  final calls = <String?>[];
  bool fail = false;
  @override
  Future<AiTextResult> translateText(String text, AppSettings settings,
      {String? target, String baiduSecret = ''}) async {
    calls.add(target);
    return fail
        ? const AiTextResult(ok: false, message: 'fixture failure')
        : const AiTextResult(ok: true, message: 'ok', text: '译文样本');
  }
}

class TranslationStorage extends Storage {
  @override
  Future<String?> getBaiduSecret() async => null;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'legacy default follows UI and explicit selection survives serialization/storage',
      () async {
    final settings = AppSettings.fromJson({});
    expect(settings.translateTargetLanguage, 'system');
    for (final entry in {
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'en-US': 'en',
      'ja-JP': 'ja',
      'ko-KR': 'ko'
    }.entries) {
      expect(
          resolveTranslationTarget(settings.translateTargetLanguage, entry.key),
          entry.value);
      expect(
          translationText(entry.key).values.every((v) => v.isNotEmpty), isTrue);
    }
    for (final lang in translationLanguages) {
      expect(baiduTranslationTarget(lang.value), lang.baidu);
    }
    settings.translateTargetLanguage = 'ja';
    await TranslationStorage().setSettings(settings);
    final restored = await TranslationStorage().getSettings();
    expect(restored.translateTargetLanguage, 'ja');
    expect(resolveTranslationTarget(restored.translateTargetLanguage, 'en-US'),
        'ja');
  });
  Future<void> mount(WidgetTester tester, AppState state,
      {bool Function(String)? isCurrent,
      ValueChanged<String?>? onClose}) async {
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            home: Builder(
                builder: (context) => Scaffold(
                    body: TextButton(
                        onPressed: () async {
                          final result = await showDialog<String>(
                              context: context,
                              builder: (_) => TranslationPreviewDialog(
                                  source: 'original words',
                                  isCurrent: isCurrent ?? (_) => true));
                          onClose?.call(result);
                        },
                        child: const Text('open')))))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('preview keeps source; explicit apply is the only returned edit',
      (tester) async {
    final api = FakeTranslationApi(),
        state = AppState(api: api, storage: TranslationStorage());
    String? applied;
    await mount(tester, state, onClose: (v) => applied = v);
    expect(api.calls, isEmpty);
    await tester.tap(find.text('翻译'));
    await tester.pumpAndSettle();
    expect(api.calls, ['zh-CN']);
    expect(applied, isNull);
    expect(find.widgetWithText(TextField, 'original words'), findsOneWidget);
    expect(find.widgetWithText(TextField, '译文样本'), findsOneWidget);
    await tester.tap(find.text('应用译文'));
    await tester.pumpAndSettle();
    expect(applied, '译文样本');
    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
  testWidgets('stale source disables apply and failure never replaces source',
      (tester) async {
    final api = FakeTranslationApi(),
        state = AppState(api: api, storage: TranslationStorage());
    var current = true;
    String? applied;
    await mount(tester, state,
        isCurrent: (_) => current, onClose: (v) => applied = v);
    await tester.tap(find.text('翻译'));
    await tester.pumpAndSettle();
    current = false;
    state.notifyListeners();
    await tester.pump();
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '应用译文'))
            .onPressed,
        isNull);
    expect(find.text('原文已变化，请重新翻译后应用。'), findsOneWidget);
    api.fail = true;
    await tester.tap(find.text('重新翻译'));
    await tester.pumpAndSettle();
    expect(find.text('fixture failure'), findsOneWidget);
    expect(applied, isNull);
    expect(
        tester
            .widget<FilledButton>(find.widgetWithText(FilledButton, '应用译文'))
            .onPressed,
        isNull);
    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
  testWidgets(
      'language picker persists choice and cancel returns no edit on narrow screen',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final state =
        AppState(api: FakeTranslationApi(), storage: TranslationStorage());
    String? applied;
    await mount(tester, state, onClose: (v) => applied = v);
    await tester.tap(find.textContaining('跟随软件语言').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('日本語').last);
    await tester.pumpAndSettle();
    expect(state.settings.translateTargetLanguage, 'ja');
    expect((await TranslationStorage().getSettings()).translateTargetLanguage,
        'ja');
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(applied, isNull);
    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
}
