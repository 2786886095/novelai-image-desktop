// Host-only reproduction of the isolated native selector mount's iOS inset.
// Real production selector + nativeUiMount + strict nativeUiTap; not a device receipt.
import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/state/app_state.dart';
import '../integration_test/native_ui_actions.dart' as actions;
import '../integration_test/native_ui_scenarios.dart'
    show mountNativeAccountSelector;

Future<Object?> _drive(WidgetTester tester, Future<void> operation) async {
  var complete = false;
  Object? failure;
  operation.then((_) {
    complete = true;
  }, onError: (Object e, StackTrace _) {
    failure = e;
    complete = true;
  });
  for (var frame = 0; frame < 48 && !complete; frame++) {
    await tester.pump(const Duration(milliseconds: 50));
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 1)));
  }
  expect(complete, isTrue, reason: 'Bounded host scheduler did not finish');
  return failure;
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
  final a = await accounts.add(
      label: 'Fixture A',
      method: 'relay',
      token: 'HOST_ONLY_SYNTHETIC_A',
      apiBaseUrl: 'https://relay-a.native.invalid',
      imageBaseUrl: 'https://relay-a.native.invalid');
  await accounts.add(
      label: 'Fixture B',
      method: 'relay',
      token: 'HOST_ONLY_SYNTHETIC_B',
      apiBaseUrl: 'https://relay-b.native.invalid',
      imageBaseUrl: 'https://relay-b.native.invalid');
  await accounts.activate(a.id);
  return AppState(
      api: NovelAiAccountApi(accounts),
      storage: NovelAiAccountStorage(accounts))
    ..settings = settings;
}

Map<String, Object?> _geometry(Element target) {
  final box = target.findRenderObject()! as RenderBox;
  final center = box.localToGlobal(box.size.center(Offset.zero));
  final hit = HitTestResult();
  GestureBinding.instance.hitTestInView(hit, center, View.of(target).viewId);
  final descendants = <RenderObject>{};
  void collect(RenderObject object) {
    descendants.add(object);
    object.visitChildren(collect);
  }

  collect(box);
  return {
    'center': [center.dx, center.dy],
    'box': [box.size.width, box.size.height],
    'targetOnHitPath': hit.path.any((e) => descendants.contains(e.target)),
    'hitTargetTypes':
        hit.path.take(12).map((e) => e.target.runtimeType.toString()).toList()
  };
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final input in <(TargetPlatform, double)>[
    (TargetPlatform.iOS, 59),
    (TargetPlatform.iOS, 0),
    (TargetPlatform.android, 59),
  ]) {
    testWidgets(
        'native account selector inset ${input.$1.name} top${input.$2.toInt()}',
        (tester) async {
      tester.view.devicePixelRatio = 3;
      tester.view.physicalSize = const Size(1179, 2556);
      tester.view.padding = FakeViewPadding(top: input.$2 * 3);
      tester.view.viewPadding = FakeViewPadding(top: input.$2 * 3);
      addTearDown(tester.view.reset);
      debugDefaultTargetPlatformOverride = input.$1;
      final app = await _app();
      var pointerEvents = 0;
      void route(PointerEvent event) {
        if (event.pointer > 9300 &&
            (event is PointerDownEvent || event is PointerUpEvent)) {
          pointerEvents++;
        }
      }

      GestureBinding.instance.pointerRouter.addGlobalRoute(route);
      final diagnostics = <Map<String, dynamic>>[];
      try {
        expect(await _drive(tester, mountNativeAccountSelector(app)), isNull);
        final target =
            actions.nativeUiElements((w) => w is DropdownButton<String>).single;
        expect(Theme.of(target).platform, input.$1);
        expect(
            MediaQuery.paddingOf(
                    actions.nativeUiElements((w) => w is Scaffold).single)
                .top,
            input.$2);
        final geometry = _geometry(target);
        final initial = app.naiAccounts.active!.profile.id;
        final error =
            await runZoned(() => _drive(tester, actions.nativeUiTap(target)),
                zoneSpecification:
                    ZoneSpecification(print: (self, parent, zone, line) {
          if (line.startsWith('FEATURE_NATIVE_POINTER_TARGET:')) {
            diagnostics.add(jsonDecode(line.substring(line.indexOf(':') + 1))
                as Map<String, dynamic>);
          }
          parent.print(zone, line);
        }));
        final menu = actions
            .nativeUiElements((w) =>
                w is Text && (w.data?.startsWith('Fixture B ·') ?? false))
            .where((e) => ModalRoute.of(e) is PopupRoute)
            .length;
        // Diagnostics precede the mandatory success assertions, so rollback
        // records the original strict eight-frame failure and zero dispatches.
        // ignore: avoid_print
        print('HOST_SELECTOR_SAFEAREA:${jsonEncode({
              'platform': input.$1.name,
              'topLogicalInset': input.$2,
              'logicalView': [393, 852],
              'dpr': 3,
              'nativeMountSize': [360, 740],
              'geometry': geometry,
              'pointerEvents': pointerEvents,
              'popupMenuMatches': menu,
              'error': error?.toString(),
              'diagnosticAttempts':
                  diagnostics.map((e) => e['attempt']).toList(),
              'nativeCertificationGranted': false
            })}');
        if (error != null) {
          expect(error, isA<StateError>());
          expect(error.toString(),
              contains('Native target is not on the actual pointer hit path'));
          expect(pointerEvents, 0);
          expect(diagnostics.last['attempt'], 8);
        }
        expect(error, isNull);
        expect(geometry['targetOnHitPath'], isTrue);
        expect(pointerEvents, 2);
        expect(menu, 1);
        expect(app.naiAccounts.active!.profile.id, initial,
            reason:
                'Opening the menu must not silently activate another account');
        expect(tester.takeException(), isNull);
      } finally {
        GestureBinding.instance.pointerRouter.removeGlobalRoute(route);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        app.dispose();
        debugDefaultTargetPlatformOverride = null;
      }
    });
  }
}
