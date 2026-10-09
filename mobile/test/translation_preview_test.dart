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
      {String? target, String? sourceLanguage, String baiduSecret = ''}) async {
    calls.add(target);
    return fail
        ? const AiTextResult(ok: false, message: 'fixture failure')
        : const AiTextResult(
            ok: true, message: 'ok', text: '译文样本', sourceLanguage: 'en');
  }
}

class TranslationStorage extends Storage {
  bool failSave = false;
  @override
  Future<void> setSettings(AppSettings settings) async {
    if (failSave) throw StateError('fixture setting save failed');
    await super.setSettings(settings);
  }

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
    expect(settings.translateRealtime, isFalse);
    expect(settings.translateSourceLanguage, 'auto');
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
    settings.translateRealtime = true;
    settings.translateSourceLanguage = 'en';
    await TranslationStorage().setSettings(settings);
    final restored = await TranslationStorage().getSettings();
    expect(restored.translateTargetLanguage, 'ja');
    expect(restored.translateRealtime, isTrue);
    expect(restored.translateSourceLanguage, 'en');
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
  testWidgets(
      'editable source and result keep external anchor until explicit apply',
      (tester) async {
    final api = FakeTranslationApi(),
        state = AppState(api: api, storage: TranslationStorage());
    String? applied;
    final anchors = <String>[];
    await mount(tester, state,
        isCurrent: (v) {
          anchors.add(v);
          return v == 'original words';
        },
        onClose: (v) => applied = v);
    expect(tester.widget<TextField>(find.byType(TextField).first).readOnly,
        isFalse);
    await tester.enterText(find.byType(TextField).first, 'edited source');
    await tester.tap(find.text('翻译'));
    await tester.pumpAndSettle();
    expect(state.busy, isFalse);
    await tester.enterText(find.byType(TextField).last, '人工译文');
    expect(applied, isNull);
    await tester.tap(find.text('应用译文'));
    await tester.pumpAndSettle();
    expect(applied, '人工译文');
    expect(anchors.every((v) => v == 'original words'), isTrue);
    expect(api.calls, isNotEmpty);
    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
  testWidgets(
      'live opt-in translates after pause; swap exchanges texts and saved languages',
      (tester) async {
    final api = FakeTranslationApi(),
        state = AppState(api: api, storage: TranslationStorage());
    state.settings.translateRealtime = true;
    state.settings.translateSourceLanguage = 'en';
    await mount(tester, state);
    api.calls.clear();
    await tester.enterText(find.byType(TextField).first, 'new source');
    await tester.pump(const Duration(milliseconds: 599));
    final actual = state.api as FakeTranslationApi;
    expect(actual.calls, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pumpAndSettle();
    expect(actual.calls, ['zh-CN']);
    expect(state.busy, isFalse);
    await tester.tap(find.byIcon(Icons.swap_horiz));
    await tester.pumpAndSettle();
    expect(actual.calls, ['zh-CN']);
    expect(state.settings.translateSourceLanguage, 'zh-CN');
    expect(state.settings.translateTargetLanguage, 'en');
    expect(find.widgetWithText(TextField, '译文样本'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'new source'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
  testWidgets(
      'preview switch is default off, persists, cancels auto work and reopens saved',
      (tester) async {
    final api = FakeTranslationApi(), storage = TranslationStorage();
    final state = AppState(api: api, storage: storage);
    String? applied;
    await mount(tester, state, onClose: (v) => applied = v);
    final toggle = find.byKey(const ValueKey('translation-live-toggle'));
    expect(tester.widget<SwitchListTile>(toggle).value, isFalse);
    await tester.enterText(find.byType(TextField).first, 'manual only');
    await tester.pump(const Duration(seconds: 2));
    expect(api.calls, isEmpty);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(state.settings.translateRealtime, isTrue);
    expect((await storage.getSettings()).translateRealtime, isTrue);
    expect(api.calls, ['zh-CN']);
    expect(applied, isNull);
    api.calls.clear();
    await tester.enterText(find.byType(TextField).first, 'cancel pending');
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 2));
    expect(api.calls, isEmpty);
    expect(state.settings.translateRealtime, isFalse);
    expect((await storage.getSettings()).translateRealtime, isFalse);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(applied, isNull);
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(toggle).value, isTrue);
    await state.setSettings((s) => s.translateRealtime = false);
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(toggle).value, isFalse);
    expect(state.busy, isFalse);
    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
  testWidgets(
      'preview switch restores UI and app preference on failed setting save',
      (tester) async {
    final api = FakeTranslationApi(), storage = TranslationStorage();
    final state = AppState(api: api, storage: storage);
    await mount(tester, state);
    storage.failSave = true;
    final toggle = find.byKey(const ValueKey('translation-live-toggle'));
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(toggle).value, isFalse);
    expect(state.settings.translateRealtime, isFalse);
    expect(find.textContaining('fixture setting save failed'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(api.calls, isEmpty);
    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
  for (final size in [
    const Size(360, 800),
    const Size(390, 844),
    const Size(900, 900)
  ]) {
    testWidgets('editable translation layout at 200% text scale $size',
        (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final state =
          AppState(api: FakeTranslationApi(), storage: TranslationStorage());
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
              builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context)
                      .copyWith(textScaler: const TextScaler.linear(2)),
                  child: child!),
              home: Scaffold(
                  body: TranslationPreviewDialog(
                      source: 'original words', isCurrent: (_) => true)))));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('translation-live-toggle')),
          findsOneWidget);
      expect(find.byIcon(Icons.swap_horiz), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(find.byType(TextField), findsNWidgets(2));
      await tester.pumpWidget(const SizedBox());
      state.dispose();
    });
  }
}
