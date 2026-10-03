// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker_platform_interface/image_picker_platform_interface.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

class OwnedAddPicker extends ImagePickerPlatform {
  final String path;
  OwnedAddPicker(this.path);
  @override
  Future<XFile?> getImageFromSource({required ImageSource source, ImagePickerOptions options = const ImagePickerOptions()}) async => XFile(path);
}
class OwnedAddPaths extends PathProviderPlatform {
  final String root;
  OwnedAddPaths(this.root);
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
    for (final action in ['cancel', 'save']) {
      testWidgets('reference add-dialog lifecycle ${target.$1.name} ${target.$2} $action', (tester) async {
        SharedPreferences.setMockInitialValues({});
        final root = (await tester.runAsync(() async => Directory.systemTemp.createTempSync('owned-add-lifecycle-')))!;
        final image = File('${root.path}/owned.png');
        await tester.runAsync(() async => image.writeAsBytesSync(img.encodePng(img.Image(width: 8, height: 12))));
        final originalBytes = image.readAsBytesSync();
        final oldPicker = ImagePickerPlatform.instance;
        final oldPaths = PathProviderPlatform.instance;
        ImagePickerPlatform.instance = OwnedAddPicker(image.path);
        PathProviderPlatform.instance = OwnedAddPaths(root.path);
        debugDefaultTargetPlatformOverride = target.$1;
        tester.view.physicalSize = target.$2;
        tester.view.devicePixelRatio = 1;
        final app = AppState(storage: Storage());
        app.referencePresetGroups.add('ORIGINAL');
        final before = jsonEncode(ReferencePresetLibrary(groups: app.referencePresetGroups, presets: app.referencePresets).toJson());
        addTearDown(() async {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
          ImagePickerPlatform.instance = oldPicker;
          PathProviderPlatform.instance = oldPaths;
          app.dispose();
          PaintingBinding.instance.imageCache.clear();
          PaintingBinding.instance.imageCache.clearLiveImages();
          await tester.runAsync(() async {
            for (var attempt = 0; root.existsSync(); attempt++) {
              try {
                await root.delete(recursive: true);
              } on FileSystemException {
                if (attempt >= 20) rethrow;
                await Future<void>.delayed(const Duration(milliseconds: 100));
              }
            }
          });
        });
        try {
          await tester.pumpWidget(ChangeNotifierProvider.value(value: app, child: MaterialApp(theme: StudioTheme.light(), home: const Scaffold(body: SafeArea(child: ReferencePresetLibraryPanel(standalone: true, showClose: false, allowedKind: ReferencePresetKind.precise))))));
          await tester.pump();
          await tester.tap(find.text('本机预设'));
          await tester.pumpAndSettle();
          final add = find.text('新建参考图预设');
          expect(add, findsOneWidget);
          await tester.ensureVisible(add);
          await tester.tap(add);
          await tester.pumpAndSettle();
          final fields = find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField));
          expect(fields, findsNWidgets(2));
          if (action == 'save') {
            await tester.ensureVisible(fields.at(0));
            await tester.enterText(fields.at(0), 'OWNED_ADD');
            await tester.ensureVisible(fields.at(1));
            await tester.enterText(fields.at(1), 'ORIGINAL');
          }
          // Flutter's route continuation lives in FakeAsync but file reads and
          // writes need the real IO loop. Advance both until durable publication.
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
          print('REFERENCE_ADD_LIFECYCLE platform=${target.$1.name} viewport=${target.$2} action=$action errors=$errors presetCount=${app.referencePresets.length};0network/0credits');
          expect(errors, isEmpty, reason: 'new preset dialog controllers must live until animated subtree teardown');
          expect(image.readAsBytesSync(), originalBytes);
          if (action == 'cancel') {
            expect(jsonEncode(ReferencePresetLibrary(groups: app.referencePresetGroups, presets: app.referencePresets).toJson()), before);
          } else {
            expect(app.referencePresets, hasLength(1));
            expect(app.referencePresets.single.name, 'OWNED_ADD');
            expect(app.referencePresets.single.group, 'ORIGINAL');
          }
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          debugDefaultTargetPlatformOverride = null;
        }
      });
    }
  }
}
