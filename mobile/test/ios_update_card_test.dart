// Host UI authoring, not native proof: real TLS + production card/files; native
// Bundle status is explicitly a host fixture, never promoted to device evidence.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/ios_update_card.dart';
import 'package:novelai_mobile/services/ios_update.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import '../integration_test/native_ios_update_tls_fixture.dart';
import 'ios_update_test.dart' show hostStatus;

Future<void> _until(WidgetTester t, bool Function() done) async {
  for (var i = 0; i < 300; i++) {
    await t.pump(const Duration(milliseconds: 20));
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    if (done()) return;
  }
  // ignore: avoid_print
  print(
      'IOS_CARD_DIAGNOSTIC ${t.widgetList<Text>(find.byType(Text)).map((w) => w.data).toList()}');
  fail('Actual update widget did not reach bounded state');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final cancel in [false, true]) {
    testWidgets(
        'actual iOS card ${cancel ? 'cancel and dispose' : 'verify and stale context'} boundary',
        (t) async {
      t.view.physicalSize = const Size(600, 1000);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final previous = HttpOverrides.current;
      HttpOverrides.global = null;
      final fixture = (await t.runAsync(NativeIosUpdateTlsFixture.open))!;
      fixture.trustInDisposableProcess();
      final root = (await t
          .runAsync(() => Directory.systemTemp.createTemp('ios-card-host-')))!;
      final app = AppState()
        ..settings = AppSettings(
            proxyMode: 'custom',
            proxyUrl: fixture.proxyUrl,
            proxyForUpdate: true,
            language: 'en-US');
      final client =
          createProxyHttpClient(app.settings, scope: ProxyScope.update);
      final info = (await t.runAsync(() =>
          checkAppUpdateWithClient(client, isAndroid: false, isIOS: true)))!;
      app.updateInfo = info;
      final coordinator = IosUpdateCoordinator(
          directory: () async => root, invoke: (_) async => hostStatus());
      try {
        await t.pumpWidget(ChangeNotifierProvider.value(
            value: app,
            child: MaterialApp(
                home:
                    Scaffold(body: IosUpdateCard(coordinator: coordinator)))));
        expect(find.textContaining('unsigned'), findsOneWidget);
        if (cancel) fixture.mode = 'hold';
        await t.tap(find.byKey(const ValueKey('ios-update-download')));
        await t.pump();
        if (cancel) {
          await _until(
              t,
              () => fixture.requests
                  .any((r) => (r['path'] as String).endsWith('.ipa')));
          await t.tap(find.byKey(const ValueKey('ios-update-cancel')));
          await _until(t, () => !coordinator.busy);
          expect(root.listSync(), isEmpty);
          expect(
              find.text('Cancelled; original data unchanged'), findsOneWidget);
          await t.tap(find.byKey(const ValueKey('ios-update-download')));
          await t.pump();
          await _until(t, () => coordinator.busy);
          await t.pumpWidget(const SizedBox.shrink());
          await _until(t, () => !coordinator.busy);
          expect(root.listSync(), isEmpty);
        } else {
          await _until(
              t,
              () => find
                  .byKey(const ValueKey('ios-update-ready-path'))
                  .evaluate()
                  .isNotEmpty);
          expect(find.text('Verified, not installed'), findsOneWidget);
          expect(root.listSync().length, 1);
          app.updateInfo = const UpdateInfo(
              hasUpdate: true,
              currentVersion: appVersion,
              latestVersion: '98.0.0');
          app.notifyListeners();
          await t.pump();
          expect(find.byKey(const ValueKey('ios-update-ready-path')),
              findsNothing);
          expect(find.text('Verified, not installed'), findsNothing);
          app.updateInfo = info;
          app.notifyListeners();
          await t.pump();

          final file = root.listSync().single as File;
          expect(file.readAsBytesSync(), fixture.artifact);
          await t.runAsync(file.delete);
          fixture.mode = 'hold';
          final count = fixture.requests.length;
          await t.tap(find.byKey(const ValueKey('ios-update-download')));
          await t.pump();
          await _until(
              t,
              () => fixture.requests
                  .skip(count)
                  .any((r) => (r['path'] as String).endsWith('.ipa')));
          app.updateInfo = const UpdateInfo(
              hasUpdate: true,
              currentVersion: appVersion,
              latestVersion: '98.0.0');
          app.notifyListeners();
          await t.pump();
          await t.tap(find.byKey(const ValueKey('ios-update-cancel')));
          await _until(t, () => !coordinator.busy);
          expect(find.byKey(const ValueKey('ios-update-ready-path')),
              findsNothing);
          expect(root.listSync(), isEmpty);
        }
        expect(t.takeException(), isNull);
      } finally {
        await t.pumpWidget(const SizedBox.shrink());
        await t.runAsync(fixture.close);
        client.close();
        app.dispose();
        await t.runAsync(() => root.delete(recursive: true));
        HttpOverrides.global = previous;
      }
    });
  }
}
