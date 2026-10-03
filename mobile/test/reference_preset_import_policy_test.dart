// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

class ImportPolicyPicker extends FilePicker {
  FileType? requestedType;
  List<String>? requestedExtensions;
  int calls = 0;
  @override
  Future<FilePickerResult?> pickFiles(
      {String? dialogTitle,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Function(FilePickerStatus)? onFileLoading,
      bool allowCompression = true,
      int compressionQuality = 30,
      bool allowMultiple = false,
      bool withData = false,
      bool withReadStream = false,
      bool lockParentWindow = false,
      bool readSequential = false}) async {
    calls++;
    requestedType = type;
    requestedExtensions = allowedExtensions;
    return null; // Native provider cancellation, never import a different file.
  }
}

class ImportPolicyPaths extends PathProviderPlatform {
  final String root;
  ImportPolicyPaths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FilePicker.platform = ImportPolicyPicker();
  for (final target in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
    (TargetPlatform.windows, const Size(1200, 800))
  ]) {
    testWidgets(
        'reference import policy ${target.$1.name} ${target.$2}, cancel is atomic',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      debugDefaultTargetPlatformOverride = target.$1;
      tester.view.physicalSize = target.$2;
      tester.view.devicePixelRatio = 1;
      final oldPicker = FilePicker.platform;
      final picker = ImportPolicyPicker();
      FilePicker.platform = picker;
      final app = AppState();
      app.referencePresetGroups.add('ORIGINAL');
      final before = jsonEncode(ReferencePresetLibrary(
              groups: app.referencePresetGroups, presets: app.referencePresets)
          .toJson());
      addTearDown(() {
        FilePicker.platform = oldPicker;
        debugDefaultTargetPlatformOverride = null;
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        app.dispose();
      });
      try {
        await tester.pumpWidget(ChangeNotifierProvider.value(
            value: app,
            child: MaterialApp(
                theme: StudioTheme.light(),
                home: const Scaffold(
                    body: SafeArea(
                        child:
                            ReferencePresetLibraryPanel(showClose: false))))));
        await tester.pumpAndSettle();
        final button = find.text('导入');
        expect(button, findsOneWidget);
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pumpAndSettle();
        expect(picker.calls, 1);
        final mobile = target.$1 == TargetPlatform.android ||
            target.$1 == TargetPlatform.iOS;
        print(
            'REFERENCE_IMPORT_POLICY: platform=${target.$1.name},viewport=${target.$2},type=${picker.requestedType},extensions=${picker.requestedExtensions},cancelStateUnchanged=${before == jsonEncode(ReferencePresetLibrary(groups: app.referencePresetGroups, presets: app.referencePresets).toJson())};0network/0credits');
        expect(picker.requestedType, mobile ? FileType.any : FileType.custom);
        expect(picker.requestedExtensions, mobile ? isNull : ['nairp', 'zip']);
        expect(
            jsonEncode(ReferencePresetLibrary(
                    groups: app.referencePresetGroups,
                    presets: app.referencePresets)
                .toJson()),
            before);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        debugDefaultTargetPlatformOverride = null;
      }
    });
  }
  for (final invalid in ['not-zip', 'wrong-format', 'wrong-version']) {
    test(
        'real $invalid archive validation preserves durable original library and pixels',
        () async {
      SharedPreferences.setMockInitialValues({});
      final root =
          Directory.systemTemp.createTempSync('reference-import-invalid-qa-');
      final oldPaths = PathProviderPlatform.instance;
      PathProviderPlatform.instance = ImportPolicyPaths(root.path);
      final storage = Storage();
      final app = AppState(storage: storage);
      addTearDown(() {
        app.dispose();
        PathProviderPlatform.instance = oldPaths;
        if (root.existsSync()) root.deleteSync(recursive: true);
      });
      final bytes = img.encodePng(img.Image(width: 8, height: 12));
      final originalPath = await storage.persistReferencePresetImage(
          presetId: 'original', bytes: bytes);
      final preset = ReferencePreset(
          id: 'original',
          name: 'Original',
          group: 'ORIGINAL',
          kind: ReferencePresetKind.precise,
          filePath: originalPath,
          createdAt: '2026-10-02T00:00:00');
      app.referencePresets.add(preset);
      app.referencePresetGroups.add('ORIGINAL');
      final before = ReferencePresetLibrary(
          groups: app.referencePresetGroups, presets: app.referencePresets);
      await storage.setReferencePresetLibrary(before);
      final input = File('${root.path}/invalid.nairp');
      if (invalid == 'not-zip') {
        input.writeAsStringSync('QA invalid archive');
      } else {
        final archive = Archive();
        final manifest = utf8.encode(jsonEncode({
          'format': invalid == 'wrong-format'
              ? 'QA-invalid'
              : 'langbai-reference-presets',
          'version': invalid == 'wrong-version' ? 99 : 1,
          'groups': ['NEW'],
          'presets': []
        }));
        archive
            .addFile(ArchiveFile('manifest.json', manifest.length, manifest));
        input.writeAsBytesSync(ZipEncoder().encode(archive)!);
      }
      expect(await app.importReferencePresets(input.path), isNotNull);
      expect(
          jsonEncode(ReferencePresetLibrary(
                  groups: app.referencePresetGroups,
                  presets: app.referencePresets)
              .toJson()),
          jsonEncode(before.toJson()));
      expect(jsonEncode((await storage.getReferencePresetLibrary()).toJson()),
          jsonEncode(before.toJson()));
      expect(File(originalPath).readAsBytesSync(), bytes);
      expect(
          Directory('${root.path}/reference-presets')
              .listSync()
              .whereType<File>()
              .length,
          1);
      print(
          'REFERENCE_INVALID_IMPORT: input=$invalid,rejected=true,memoryDurableOriginalPixelsPreserved=true,newImageCopies=0;0network/0credits');
    });
  }
}
