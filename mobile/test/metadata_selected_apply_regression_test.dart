// Host authoring regressions only. Native engine/OS proof comes from independent entries.
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/images/metadata_recovery.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/metadata_inspector_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';

Future<void> settleIo(WidgetTester t, bool Function() done) async {
  for (var i = 0; i < 100; i++) {
    await t.pump();
    await t
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
    if (done()) {
      await t.pump();
      return;
    }
  }
  fail('Real file/parser operation did not settle');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    root =
        await Directory.systemTemp.createTemp('metadata-selected-regression-');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('plugins.flutter.io/path_provider'),
            (_) async => root.path);
  });
  tearDown(() async {
    PaintingBinding.instance.imageCache
      ..clear()
      ..clearLiveImages();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('plugins.flutter.io/path_provider'), null);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    if (root.existsSync()) root.deleteSync(recursive: true);
  });
  for (final charactersOnly in [false, true]) {
    testWidgets(
        'visible metadata selection applies only ${charactersOnly ? 'characters' : 'positive'} and preserves every unchecked field',
        (t) async {
      t.view.physicalSize = const Size(1200, 2000);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final storage = Storage();
      final bytes =
          File('../shared/official-image-metadata-fixtures/rgba-8-plain.png')
              .readAsBytesSync();
      await t.runAsync(
          () => storage.saveMetadataInspectorImage(bytes, 'source.png'));
      final app = AppState(storage: storage)..settings.language = 'en-US';
      app.params
        ..positivePrompt = 'old positive'
        ..negativePrompt = 'old negative'
        ..seed = 123456
        ..seedMode = 'fixed';
      app.extras.charCaptions = [CharCaptionItem(prompt: 'old character')];
      addTearDown(app.dispose);
      try {
        final reader = MetadataRecoveryReader(
            fetchAsset: (id) async =>
                Uint8List(MetadataRecoveryReader.assetFor(id).bytes));
        var navigations = 0;
        await t.pumpWidget(ChangeNotifierProvider.value(
            value: app,
            child: MaterialApp(
                home: MetadataInspectorScreen(
                    onBack: () {},
                    onOpenGenerate: () {
                      navigations++;
                    },
                    recoveryReader: reader))));
        await settleIo(
            t,
            () => find
                .byKey(const ValueKey('metadata-recovery-error'))
                .evaluate()
                .isNotEmpty);
        expect(
            t
                .widget<StudioDropdownButtonFormField<MetadataRecoveryMode>>(
                    find.byKey(const ValueKey('metadata-recovery-mode')))
                .value,
            MetadataRecoveryMode.online);
        await t.tap(find.byKey(const ValueKey('metadata-recovery-mode')));
        await t.pumpAndSettle();
        await t.tap(find.text('Offline: local parser').last);
        await t.pump(const Duration(milliseconds: 300));
        await settleIo(
            t,
            () =>
                find
                    .byKey(const ValueKey('metadata-selection-clear'))
                    .evaluate()
                    .isNotEmpty ||
                find.textContaining('blue sky,').evaluate().isNotEmpty);
        final clear = find.byKey(const ValueKey('metadata-selection-clear'));
        expect(clear, findsOneWidget,
            reason:
                'Actual page must expose field selection rather than applying all');
        await t.ensureVisible(clear);
        await t.tap(clear);
        await t.pump();
        expect(
            t
                .widget<FilledButton>(
                    find.byKey(const ValueKey('metadata-apply-selected')))
                .onPressed,
            isNull);
        final selected = find.byKey(ValueKey(
            'metadata-select-${charactersOnly ? 'characters' : 'positivePrompt'}'));
        await t.ensureVisible(selected);
        await t.tap(selected);
        await t.pump();
        final apply = find.byKey(const ValueKey('metadata-apply-selected'));
        await t.ensureVisible(apply);
        await t.tap(apply);
        await t.pump();
        // ignore: avoid_print
        print(
            'METADATA_SELECTION kind=${charactersOnly ? 'characters' : 'positive'} positive=${app.params.positivePrompt} negative=${app.params.negativePrompt} seed=${app.params.seed} character=${app.extras.charCaptions.single.prompt} navigations=$navigations');
        expect(navigations, 1);
        expect(app.params.positivePrompt,
            charactersOnly ? 'old positive' : 'blue sky, 白色衣服');
        expect(app.params.negativePrompt, 'old negative');
        expect(app.params.seed, 123456);
        expect(app.extras.charCaptions.single.prompt,
            charactersOnly ? isNot('old character') : 'old character');
        await t.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)));
        expect((await t.runAsync(() => storage.getParams()))!.negativePrompt,
            'old negative');
        expect(
            await t.runAsync(() async =>
                (await storage.getMetadataInspectorImage())!
                    .file
                    .readAsBytes()),
            bytes);
        expect(t.takeException(), isNull);
        await t.pumpWidget(const SizedBox.shrink());
      } finally {
        await t.pumpWidget(const SizedBox.shrink());
        PaintingBinding.instance.imageCache
          ..clear()
          ..clearLiveImages();
        await t.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 50)));
      }
    });
  }
}
