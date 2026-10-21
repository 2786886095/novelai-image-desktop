// Host-only controller authoring regression. No native receipt/certification.
// Storage is controlled here; the integration entry keeps real native Storage.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/main.dart' show HomeShell;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';
import 'package:novelai_mobile/ui/studio_shell.dart';
import 'package:provider/provider.dart';
import '../integration_test/native_ui_scenarios.dart' show loadNativeNavigation;

AppSettings _closedSettings() => AppSettings(
    proxyMode: 'custom',
    proxyUrl: 'http://127.0.0.1:1',
    proxyForNai: true,
    proxyForAi: true,
    proxyForUpdate: true,
    proxyForTranslate: true,
    proxyForMcp: true,
    apiBaseUrl: 'http://127.0.0.1:1',
    imageBaseUrl: 'http://127.0.0.1:1',
    allowCustomEndpoint: true,
    allowCustomEndpointFallback: false,
    language: 'en-US',
    reduceMotion: true);

class _NavigationStorage extends Storage {
  AppSettings saved = _closedSettings();
  final calls = <String>[];
  bool seen = false;
  bool failLoadedHistory = false;
  int historyReads = 0;
  String? token;
  @override
  Future<void> setSettings(AppSettings settings) async {
    calls.add('setSettings');
    saved = AppSettings.fromJson(settings.toJson());
  }

  @override
  Future<AppSettings> getSettings() async {
    calls.add('getSettings');
    return AppSettings.fromJson(saved.toJson());
  }

  @override
  Future<void> markNetworkOnboardingSeen() async {
    calls.add('markNetworkOnboardingSeen');
    seen = true;
  }

  @override
  Future<bool> hasSeenNetworkOnboarding() async {
    calls.add('hasSeenNetworkOnboarding');
    return seen;
  }

  @override
  Future<String?> getToken() async => token;
  @override
  Future<GenerateParams> getParams() async {
    calls.add('getParams');
    return GenerateParams(
        width: 64,
        height: 64,
        positivePrompt: 'PERSISTED_NATIVE_FIXTURE',
        model: 'nai-diffusion-5-full');
  }

  @override
  Future<List<CharCaptionItem>> getCharacterPrompts() async => [];
  @override
  Future<List<HistoryItem>> getHistory() async {
    calls.add('getHistory');
    historyReads++;
    if (failLoadedHistory && historyReads > 1) {
      throw StateError('HOST_ONLY_DURABLE_HISTORY_READ_FAILED');
    }
    return [];
  }

  @override
  Future<List<TextToolHistoryItem>> getConvertHistory() async => [];
  @override
  Future<List<TextToolHistoryItem>> getReverseHistory() async => [];
  @override
  Future<List<HistoryGroup>> getGroups() async => [];
  @override
  Future<Set<String>?> getAitagCompatibleParams() async => null;
  @override
  Future<ReferencePresetLibrary> getReferencePresetLibrary() async =>
      const ReferencePresetLibrary();
}

class _NoDiskTags extends OfflineTagStore {
  @override
  Future<OfflineTagStatus> status() async => const OfflineTagStatus();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  // Warm the real 399KB asset outside WidgetTester's fake-async zone. Its
  // UTF-8 compute isolate must finish; no asset or channel is substituted.
  setUpAll(() async {
    await PromptTemplateLibrary.load();
  });
  testWidgets(
      'unloaded native context stays spinner; real load opens HomeShell',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.reset);
    final storage = _NavigationStorage();
    final app =
        AppState(api: NaiApi(), storage: storage, offlineTags: _NoDiskTags())
          ..settings = _closedSettings();
    addTearDown(app.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: app, child: const MaterialApp(home: HomeShell())));
    await tester.pump();
    expect(app.booted, isFalse);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.byType(StudioAdaptiveShell), findsNothing);
    // ignore: avoid_print
    print(
        'HOST_NAV_BASELINE booted=false spinner=true destinations=0; not-native-certification');

    await tester.runAsync(() => loadNativeNavigation(app, storage).timeout(
        const Duration(seconds: 12),
        onTimeout: () => throw StateError(
            'Host-only boot stalled; storage calls: ${storage.calls}')));
    expect(app.booted, isTrue);
    expect(app.needsNetworkOnboarding, isFalse);
    expect(storage.calls.indexOf('setSettings'),
        lessThan(storage.calls.indexOf('getSettings')));
    expect(storage.calls.indexOf('markNetworkOnboardingSeen'),
        lessThan(storage.calls.indexOf('hasSeenNetworkOnboarding')));
    expect(storage.calls.where((c) => c == 'getParams').length, 2);
    expect(storage.calls.where((c) => c == 'getHistory').length, 2);
    expect(
        storage.calls,
        containsAll([
          'getSettings',
          'getParams',
          'getHistory',
          'hasSeenNetworkOnboarding'
        ]));
    expect(app.params.positivePrompt, 'PERSISTED_NATIVE_FIXTURE');
    // The native entry writes its navigation drafts after load, never before.
    app.params.positivePrompt = 'NATIVE_NAV_PROMPT';
    app.convertInput = 'NATIVE_NAV_CONVERT';
    await tester.pump();
    expect(find.byType(StudioAdaptiveShell), findsOneWidget);
    final shell =
        tester.widget<StudioAdaptiveShell>(find.byType(StudioAdaptiveShell));
    expect(shell.destinations.length, 15);
    expect(app.params.positivePrompt, 'NATIVE_NAV_PROMPT');
    expect(app.convertInput, 'NATIVE_NAV_CONVERT');
    expect(app.settings.proxyUrl, 'http://127.0.0.1:1');
    expect(app.settings.proxyForUpdate, isTrue);
    // ignore: avoid_print
    print(
        'HOST_NAV_MODIFIED booted=true spinner=false destinations=15 real-AppState.load=true; not-native-certification');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    // Drain only already-started read-only update retries; no token can quote
    // or generate. Widget tests do not certify the native TLS/socket path.
    for (var i = 0; i < 100 && app.updateChecking; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  });

  for (final settings in [
    _closedSettings()..proxyMode = 'direct',
    _closedSettings()..proxyUrl = 'http://public.invalid:8080',
    _closedSettings()..proxyForUpdate = false,
  ]) {
    test('navigation boot rejects an uncontained route before storage or load',
        () async {
      final storage = _NavigationStorage();
      final app =
          AppState(api: NaiApi(), storage: storage, offlineTags: _NoDiskTags())
            ..settings = settings;
      addTearDown(app.dispose);
      await expectLater(
          loadNativeNavigation(app, storage), throwsA(isA<StateError>()));
      expect(app.booted, isFalse);
      expect(storage.calls, isEmpty);
    });
  }
  test('a caught production load failure cannot certify navigation bootstrap',
      () async {
    final storage = _NavigationStorage()..failLoadedHistory = true;
    final app =
        AppState(api: NaiApi(), storage: storage, offlineTags: _NoDiskTags())
          ..settings = _closedSettings();
    addTearDown(app.dispose);
    await expectLater(
        loadNativeNavigation(app, storage), throwsA(isA<StateError>()));
    // The real production finally sets booted on a read error. The helper must
    // additionally reject the failed status and incomplete durable readback.
    expect(app.booted, isTrue);
    expect(app.status, contains('HOST_ONLY_DURABLE_HISTORY_READ_FAILED'));
    expect(storage.historyReads, 2);
  });
  test('navigation boot refuses a leftover account before actual load',
      () async {
    final storage = _NavigationStorage()..token = 'HOST_ONLY_STALE_FIXTURE';
    final app =
        AppState(api: NaiApi(), storage: storage, offlineTags: _NoDiskTags())
          ..settings = _closedSettings();
    addTearDown(app.dispose);
    await expectLater(
        loadNativeNavigation(app, storage), throwsA(isA<StateError>()));
    expect(app.booted, isFalse);
    expect(storage.calls, isNot(contains('getSettings')));
  });
}
