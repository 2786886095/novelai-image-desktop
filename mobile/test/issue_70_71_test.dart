import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/translation_preview_dialog.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class ProbeApi extends NaiApi {
  Completer<AiTextResult>? pending;
  final calls = <List<String?>>[];
  @override
  Future<AiTextResult> translateText(String text, AppSettings settings,
      {String? target, String? sourceLanguage, String baiduSecret = ''}) async {
    calls.add([text, target, sourceLanguage]);
    if (pending != null) return pending!.future;
    return AiTextResult(
        ok: true,
        message: 'ok',
        text: target == 'en' ? 'black jacket' : '黑色夹克',
        sourceLanguage: sourceLanguage == 'auto' ? 'en' : sourceLanguage);
  }
}

class ProbeStorage extends Storage {
  bool failSave = false;
  Completer<void>? hold;
  @override
  Future<void> setSettings(AppSettings s) async {
    if (hold != null) await hold!.future;
    if (failSave) throw StateError('fixture setting save failed');
    await super.setSettings(s);
  }

  @override
  Future<String?> getBaiduSecret() async => null;
}

Future<void> host(WidgetTester tester, AppState state,
    {double scale = 1}) async {
  var source = 'black jacket';
  await tester.pumpWidget(ChangeNotifierProvider.value(
      value: state,
      child: MaterialApp(
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(scale)),
              child: child!),
          home: Builder(
              builder: (context) => Scaffold(
                  body: TextButton(
                      child: const Text('open'),
                      onPressed: () async {
                        final next = await showDialog<String>(
                            context: context,
                            builder: (_) => TranslationPreviewDialog(
                                source: source, isCurrent: (s) => s == source));
                        if (next != null) source = next;
                      }))))));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final from in ['en', 'auto']) {
    testWidgets(
        '#70 apply swapped output and reopen with matching language pair ($from)',
        (tester) async {
      final api = ProbeApi(),
          state = AppState(api: ProbeApi(), storage: ProbeStorage());
      // AppState retains the supplied instance; use it for all observations.
      final actual = state.api as ProbeApi;
      state.settings.translateSourceLanguage = from;
      state.settings.translateTargetLanguage = 'zh-CN';
      await host(tester, state);
      await tester.tap(find.text('翻译'));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.swap_horiz));
      await tester.pumpAndSettle();
      expect(state.settings.translateSourceLanguage, 'zh-CN');
      expect(state.settings.translateTargetLanguage, 'en');
      await tester.tap(find.text('应用译文'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      debugPrint('ISSUE70_REOPEN: ${jsonEncode({
            'from': from,
            'savedSource': state.settings.translateSourceLanguage,
            'savedTarget': state.settings.translateTargetLanguage,
            'input': tester
                .widget<TextField>(find.byType(TextField).first)
                .controller!
                .text,
            'providerCalls': actual.calls.length
          })}');
      expect(state.settings.translateSourceLanguage, 'en');
      expect(state.settings.translateTargetLanguage, 'zh-CN');
      expect(actual.calls.length, 1);
      expect(api.calls, isEmpty);
      await tester.tap(find.text('翻译'));
      await tester.pumpAndSettle();
      expect(actual.calls.last, ['black jacket', 'zh-CN', 'en']);
      await tester.pumpWidget(const SizedBox());
      state.dispose();
    });
  }
  for (final width in [360.0, 390.0, 430.0, 1100.0]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      testWidgets(
          '#71 status never shifts fields/footer ${width}x1000 scale=$scale',
          (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final api = ProbeApi(),
            state = AppState(api: ProbeApi(), storage: ProbeStorage());
        final actual = state.api as ProbeApi;
        await host(tester, state, scale: scale);
        List<double> geometry() => [
              tester.getTopLeft(find.byType(TextField).first).dy,
              tester.getTopLeft(find.byType(TextField).last).dy,
              tester.getTopLeft(find.widgetWithText(FilledButton, '应用译文')).dy
            ];
        final idle = geometry();
        actual.pending = Completer<AiTextResult>();
        await tester.tap(find.text('翻译'));
        await tester.pump();
        final busy = geometry();
        actual.pending!.complete(const AiTextResult(
            ok: false,
            message:
                'fixture very long translation error which can wrap onto several lines; 原文保持不变。'));
        await tester.pumpAndSettle();
        final failed = geometry();
        debugPrint('ISSUE71_GEOMETRY: ${jsonEncode({
              'width': width,
              'scale': scale,
              'idle': idle,
              'busy': busy,
              'failed': failed
            })}');
        expect(busy, idle);
        expect(failed, idle);
        actual.pending = Completer<AiTextResult>();
        await tester.tap(find.text('翻译'));
        await tester.pump();
        actual.pending!.complete(const AiTextResult(
            ok: true, message: 'ok', text: '黑色夹克', sourceLanguage: 'en'));
        await tester.pumpAndSettle();
        final completed = geometry();
        debugPrint('ISSUE71_COMPLETED_GEOMETRY: ${jsonEncode({
              'width': width,
              'scale': scale,
              'idle': idle,
              'completed': completed
            })}');
        expect(completed, idle);
        expect(tester.takeException(), isNull);
        expect(api.calls, isEmpty);
        await tester.pumpWidget(const SizedBox());
        state.dispose();
      });
    }
  }
  testWidgets(
      '#70 pending apply cannot be dismissed and failed save preserves prompt',
      (tester) async {
    final storage = ProbeStorage(),
        state = AppState(api: ProbeApi(), storage: ProbeStorage());
    final actual = state.storage as ProbeStorage;
    await host(tester, state);
    await tester.tap(find.text('翻译'));
    await tester.pumpAndSettle();
    actual.hold = Completer<void>();
    actual.failSave = true;
    await tester.tap(find.text('应用译文'));
    await tester.pump();
    expect(find.byType(TranslationPreviewDialog), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pump();
    expect(find.byType(TranslationPreviewDialog), findsOneWidget);
    actual.hold!.complete();
    await tester.pumpAndSettle();
    expect(find.textContaining('fixture setting save failed'), findsOneWidget);
    expect(
        tester.widget<TextField>(find.byType(TextField).first).controller!.text,
        'black jacket');
    expect(state.settings.translateSourceLanguage, 'auto');
    expect(state.settings.translateTargetLanguage, 'system');
    expect(storage.failSave, isFalse);
    await tester.pumpWidget(const SizedBox());
    state.dispose();
  });
}
