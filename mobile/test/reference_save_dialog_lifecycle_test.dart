// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

class OwnedSaveRowPaths extends PathProviderPlatform {
  final String root;
  OwnedSaveRowPaths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final target in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
    (TargetPlatform.windows, const Size(1200, 800)),
  ]) {
    for (final kind in ReferencePresetKind.values) {
      for (final action in ['cancel', 'save']) {
        testWidgets('reference row save lifecycle ${target.$1.name} ${target.$2} ${kind.name} $action', (tester) async {
          SharedPreferences.setMockInitialValues({});
          final root = (await tester.runAsync(() async => Directory.systemTemp.createTempSync('owned-row-save-')))!;
          final file = File('${root.path}/owned.png');
          await tester.runAsync(() async => file.writeAsBytesSync(img.encodePng(img.Image(width: 8, height: 12))));
          final original = file.readAsBytesSync();
          final oldPaths = PathProviderPlatform.instance;
          PathProviderPlatform.instance = OwnedSaveRowPaths(root.path);
          debugDefaultTargetPlatformOverride = target.$1;
          tester.view.physicalSize = target.$2;
          tester.view.devicePixelRatio = 1;
          final app = AppState(storage: Storage());
          app.referencePresetGroups.add('ORIGINAL');
          if (kind == ReferencePresetKind.vibe) {
            app.extras.vibeImages.add(VibeTransferItem(base64: base64Encode(original), sourcePath: file.path, infoExtracted: .4, strength: .6));
          }
          if (kind == ReferencePresetKind.precise) {
            app.extras.preciseReferences.add(PreciseReferenceItem(base64: base64Encode(original), sourcePath: file.path, width: 8, height: 12, type: 'character&style', strength: .7, fidelity: .3, informationExtracted: .8));
          }
          final before = jsonEncode(ReferencePresetLibrary(groups: app.referencePresetGroups, presets: app.referencePresets).toJson());
          final extrasBefore = jsonEncode(app.extras.toJson());
          addTearDown(() async {
            tester.view.resetPhysicalSize();
            tester.view.resetDevicePixelRatio();
            PathProviderPlatform.instance = oldPaths;
            app.dispose();
            PaintingBinding.instance.imageCache.clear();
            PaintingBinding.instance.imageCache.clearLiveImages();
            await tester.runAsync(() async {
              for (var attempt = 0; root.existsSync(); attempt++) {
                try { await root.delete(recursive: true); }
                on FileSystemException {
                  if (attempt >= 20) rethrow;
                  await Future<void>.delayed(const Duration(milliseconds: 100));
                }
              }
            });
          });
          try {
            // Permanent coverage opens the public complete production screen;
            // no private export or evaluator bridge is present in TARGET.
            await tester.pumpWidget(ChangeNotifierProvider.value(value: app, child: MaterialApp(theme: StudioTheme.light(), home: const GenerateScreen())));
            await tester.pumpAndSettle();
            final section = find.text('参考图');
            final list = find.descendant(of: find.byType(GenerateScreen), matching: find.byType(ListView)).first;
            final scrollable = find.descendant(of: list, matching: find.byType(Scrollable)).first;
            await tester.scrollUntilVisible(section, 400, scrollable: scrollable);
            expect(section, findsOneWidget);
            await tester.ensureVisible(section);
            await tester.pumpAndSettle();
            // The persistent generate footer can occlude an aligned-to-bottom title.
            for (var attempt=0; section.hitTestable().evaluate().isEmpty && attempt<6; attempt++) {
              await tester.drag(list,const Offset(0,-120));
              await tester.pumpAndSettle();
            }
            expect(section.hitTestable(),findsOneWidget);
            await tester.tap(section);
            await tester.pumpAndSettle();
            final save = find.byTooltip('保存为预设');
            expect(save, findsOneWidget);
            await tester.ensureVisible(save);
            await tester.pumpAndSettle();
            expect(save.hitTestable(), findsOneWidget);
            await tester.tap(save);
            await tester.pumpAndSettle();
            final fields = find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField));
            expect(fields, findsNWidgets(2));
            if (action == 'save') {
              await tester.enterText(fields.at(0), 'OWNED_ROW_SAVE');
              await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('ORIGINAL')));
            }
            await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text(action == 'cancel' ? '取消' : '保存')));
            await tester.pump();
            if (action == 'save') {
              for (var attempt = 0; app.referencePresets.isEmpty && attempt < 200; attempt++) {
                await tester.runAsync(() async => Future<void>.delayed(const Duration(milliseconds: 20)));
                await tester.pump(const Duration(milliseconds: 5));
              }
            }
            await tester.pump(const Duration(milliseconds: 60));
            await tester.runAsync(() async => Future<void>.delayed(const Duration(milliseconds: 250)));
            await tester.pump(const Duration(milliseconds: 400));
            final errors = <String>[];
            Object? error;
            while ((error = tester.takeException()) != null) { errors.add(error.toString()); }
            print('REFERENCE_SAVE_ROW_LIFECYCLE platform=${target.$1.name} viewport=${target.$2} kind=${kind.name} action=$action errors=$errors presetCount=${app.referencePresets.length};0network/0credits');
            expect(errors, isEmpty, reason: 'existing reference save controllers must remain alive until animated teardown');
            expect(file.readAsBytesSync(), original);
            expect(jsonEncode(app.extras.toJson()), extrasBefore);
            if (action == 'cancel') {
              expect(jsonEncode(ReferencePresetLibrary(groups: app.referencePresetGroups, presets: app.referencePresets).toJson()), before);
            } else {
              expect(app.referencePresets, hasLength(1));
              final preset = app.referencePresets.single;
              expect(preset.name, 'OWNED_ROW_SAVE');
              expect(preset.group, 'ORIGINAL');
              expect(preset.kind, kind);
              if (kind == ReferencePresetKind.vibe) {
                expect(preset.infoExtracted, .4);
                expect(preset.strength, .6);
              } else {
                expect(preset.preciseType, 'character&style');
                expect(preset.strength, .7);
                expect(preset.fidelity, .3);
                expect(preset.informationExtracted, .8);
              }
            }
          } finally {
            await tester.pumpWidget(const SizedBox.shrink());
            debugDefaultTargetPlatformOverride = null;
          }
        });
      }
    }
  }
}
