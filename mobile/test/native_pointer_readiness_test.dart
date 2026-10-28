// Host mechanism regression only. The transient barrier is controlled here;
// it is not a claimed reproduction of the actual iOS native failure's cause.
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/novelai_accounts_screen.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/state/app_state.dart';
import '../integration_test/native_ui_actions.dart' as actions;

class _DriveResult {
  final Object? error;
  final int frames;
  const _DriveResult(this.error, this.frames);
}

Future<_DriveResult> _drive(WidgetTester tester, Future<void> operation) async {
  var complete = false;
  Object? failure;
  operation.then<void>((_) {
    complete = true;
  }, onError: (Object error, StackTrace _) {
    failure = error;
    complete = true;
  });
  var frames = 0;
  while (!complete && frames < 24) {
    frames++;
    await tester.pump(const Duration(milliseconds: 50));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
  }
  expect(complete, isTrue,
      reason: 'Pointer mechanism exceeded bounded host frames');
  return _DriveResult(failure, frames);
}

Future<AppState> _app() async {
  String? document;
  final accounts = NovelAiAccounts(
      read: () async => document,
      write: (value) async {
        document = value;
      });
  final settings = AppSettings(
      language: 'en-US',
      proxyMode: 'custom',
      proxyUrl: 'http://127.0.0.1:1',
      proxyForNai: true,
      proxyForAi: true,
      proxyForUpdate: true,
      proxyForTranslate: true,
      proxyForMcp: true,
      allowCustomEndpointFallback: false);
  await accounts.load(
      legacyToken: () async => null, legacySettings: () async => settings);
  final first = await accounts.add(
      label: 'Fixture A',
      method: 'relay',
      token: 'host-fixture-only-a',
      apiBaseUrl: 'https://relay-a.native.invalid',
      imageBaseUrl: 'https://relay-a.native.invalid');
  await accounts.add(
      label: 'Fixture B',
      method: 'relay',
      token: 'host-fixture-only-b',
      apiBaseUrl: 'https://relay-b.native.invalid',
      imageBaseUrl: 'https://relay-b.native.invalid');
  await accounts.activate(first.id);
  return AppState(
      api: NovelAiAccountApi(accounts),
      storage: NovelAiAccountStorage(accounts))
    ..settings = settings;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final mode in ['ready', 'transient', 'persistent']) {
    testWidgets('strict production selector pointer readiness: $mode',
        (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(393, 852);
      addTearDown(tester.view.reset);
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final app = await _app();
      final covered = ValueNotifier(mode != 'ready');
      Timer? release;
      var pointerEvents = 0;
      try {
        await tester.pumpWidget(ChangeNotifierProvider.value(
            value: app,
            child: MaterialApp(
                home: Center(
                    child: SizedBox(
                        width: 360,
                        height: 740,
                        child: Builder(
                            builder: (context) => MediaQuery(
                                data: MediaQuery.of(context).copyWith(
                                    size: const Size(360, 740),
                                    disableAnimations: true),
                                child: Listener(
                                    onPointerDown: (_) => pointerEvents++,
                                    onPointerUp: (_) => pointerEvents++,
                                    child: ValueListenableBuilder<bool>(
                                        valueListenable: covered,
                                        builder: (context, blocked, _) =>
                                            Stack(children: [
                                              const Positioned.fill(
                                                  child: Scaffold(
                                                      body:
                                                          NovelAiAccountSelector(
                                                              showManage:
                                                                  false))),
                                              if (blocked)
                                                const Positioned.fill(
                                                    child: ModalBarrier(
                                                        dismissible: false,
                                                        color: Colors
                                                            .transparent)),
                                            ]))))))))));
        await tester.pump();
        final target =
            actions.nativeUiElements((w) => w is DropdownButton<String>).single;
        final initialAccount = app.naiAccounts.active!.profile.id;
        expect(app.naiAccountLocked, isFalse);
        if (mode == 'transient') {
          release = Timer(
              const Duration(milliseconds: 150), () => covered.value = false);
        }
        final diagnostics = <String>[];
        final result =
            await runZoned(() => _drive(tester, actions.nativeUiTap(target)),
                zoneSpecification:
                    ZoneSpecification(print: (self, parent, zone, line) {
          if (line.startsWith('FEATURE_NATIVE_POINTER_TARGET:')) {
            diagnostics.add(line);
          }
          parent.print(zone, line);
        }));
        expect(diagnostics.length, mode == 'ready' ? 0 : 2);
        for (final literal in diagnostics) {
          for (final secret in [
            'Fixture A',
            'Fixture B',
            'host-fixture-only',
            'native.invalid'
          ]) {
            expect(literal, isNot(contains(secret)));
          }
          final packet =
              jsonDecode(literal.substring(literal.indexOf(':') + 1)) as Map;
          expect(packet.keys.toSet(), {
            'kind',
            'phase',
            'attempt',
            'widgetType',
            'viewId',
            'devicePixelRatio',
            'physicalSize',
            'logicalViewSize',
            'boxSize',
            'globalCenter',
            'centerInView',
            'routePresent',
            'routeCurrent',
            'routeAnimating',
            'hitTargetTypes'
          });
          expect(packet['kind'], 'diagnostic');
          expect(packet['widgetType'], 'DropdownButton<String>');
          for (final key in [
            'centerInView',
            'routePresent',
            'routeCurrent',
            'routeAnimating'
          ]) {
            expect(packet[key], isA<bool>());
          }
        }
        if (mode == 'persistent') {
          expect(
              result.error,
              isA<StateError>().having(
                  (e) => e.message,
                  'message',
                  contains(
                      'Native target is not on the actual pointer hit path')));
          expect(pointerEvents, 0,
              reason: 'Blocked target must dispatch no pointer events');
          expect(app.naiAccounts.active!.profile.id, initialAccount);
          expect(
              actions
                  .nativeUiElements((w) =>
                      w is Text && (w.data?.startsWith('Fixture B ·') ?? false))
                  .where((element) => ModalRoute.of(element) is PopupRoute),
              isEmpty);
          expect(result.frames, lessThanOrEqualTo(12));
        } else {
          expect(result.error, isNull);
          expect(pointerEvents, 2);
          expect(
              actions
                  .nativeUiElements((w) =>
                      w is Text && (w.data?.startsWith('Fixture B ·') ?? false))
                  .where((element) => ModalRoute.of(element) is PopupRoute),
              isNotEmpty);
          expect(app.naiAccounts.active!.profile.id, initialAccount,
              reason: 'Opening selector is not account activation');
          if (mode == 'ready') {
            expect(result.frames, lessThanOrEqualTo(6),
                reason:
                    'Already ready targets must not incur all retry frames');
          }
        }
        // ignore: avoid_print
        print('HOST_ONLY pointer readiness mode=$mode frames=${result.frames} '
            'events=$pointerEvents error=${result.error?.runtimeType}; not native certification');
      } finally {
        release?.cancel();
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        app.dispose();
        covered.dispose();
        debugDefaultTargetPlatformOverride = null;
      }
    });
  }
}
