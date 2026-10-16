// Real system picker / permission interaction is mandatory. An external OS UI
// driver must create/select NativeOutput-<nonce> after the emitted request.
// No fake FilePicker, platform channel, supplied folder path or managed-folder
// substitution is accepted. Host analyze never executes/certifies this entry.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/services/ios_output_folder.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/storage_permission.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'native_foreground.dart';
import 'native_scenario_support.dart';
import 'native_ui_actions.dart';
import 'native_settings_disclosure.dart';

final suite = NativeScenarios(1);
Future<void> main() => suite.run(_run);

Future<void> _run() async {
  require(Platform.isAndroid, 'Independent Android folder entry only');
  final c = await NativeContext.create('output-folder');
  final nonce = '$pid-${DateTime.now().microsecondsSinceEpoch}';
  final expectedFolder = 'NativeOutput-$nonce';
  final managed = (await UnifiedStorage.documents()).path;
  final originalRoot = c.app.settings.imageOutputDir;
  try {
    await nativeUiMount(c.app, const SettingsScreen());
    // The production storage section is collapsed. Expose it through its
    // real disclosure before locating the original native chooser button.
    final choose = await nativeSettingsControl(
      sectionTitle: settingsScreenTextFor(c.app.settings.language).storageSection,
      targetKey: const ValueKey('image-output-choose'),
    );
    require(choose != null, 'Actual generated-output chooser was not exposed');
    print('NATIVE_FOLDER_PICKER_REQUEST:${jsonEncode({
          'sourceSha': sourceSha,
          'profileSha': profileSha,
          'nativePid': pid,
          'platform': Platform.operatingSystem,
          'nonce': nonce,
          'requiredFolderName': expectedFolder,
          'requiredAction':
              'Use the real OS directory picker to create/select this disposable folder outside the client sandbox; complete any actual Android all-files permission screen and return without relaunching.',
          'deadlineSeconds': 180,
        })}');
    await nativeUiTap(choose!);
    final deadline = DateTime.now().add(const Duration(seconds: 180));
    while (c.app.settings.imageOutputDir == originalRoot) {
      require(DateTime.now().isBefore(deadline),
          'No actual OS folder selection/permission completion received');
      if (nativeUiElements((w) => w is Text && w.data == 'File access required').isNotEmpty &&
          nativeUiElements((w) => w is Text && w.data == 'Authorize').isNotEmpty) {
        // Real production Flutter dialog hit-test; never substitute its callback.
        await nativeUiTextTap('Authorize');
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    while (!await StoragePermission.hasAllFilesAccess()) {
      require(DateTime.now().isBefore(deadline), 'Actual OS all-files permission not granted');
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    await nativeForegroundBarrier(renderBootstrap: false);
    final selected = c.app.settings.imageOutputDir;
    require(selected.endsWith('/$expectedFolder'),
        'Driver did not choose the nonce-scoped disposable folder');
    final selectedReal = await Directory(selected).resolveSymbolicLinks();
    final managedReal = await Directory(managed).resolveSymbolicLinks();
    require(
        selectedReal != managedReal &&
            !selectedReal.startsWith('$managedReal/'),
        'An app-managed folder cannot substitute for external native selection');
    require((await Storage().getSettings()).imageOutputDir == selected,
        'Actual picker result was not persisted by production settings');
    if (Platform.isAndroid) {
      require(await StoragePermission.hasAllFilesAccess(),
          'Real Android external folder permission is not granted');
    } else {
      final grants = await IosOutputFolder.status();
      require(
          grants.any((g) =>
              g['path'] == selected &&
              g['available'] == true &&
              g['bookmarkSaved'] == true),
          'Native document picker did not persist an active bookmark');
    }
    await c.app.setSettings((s) {
      s.imageNameTemplate = 'native-output';
    });
    await c.storage.writeGroups([
      HistoryGroup(
          id: nonce,
          name: 'Native group',
          createdAt: DateTime.now().toUtc().toIso8601String())
    ]);
    final a = png(64, 64, 61), b = png(64, 64, 193);
    final first = await c.storage.saveImage(a, c.app.params, 1, groupId: nonce);
    final second =
        await c.storage.saveImage(b, c.app.params, 2, groupId: nonce);
    require(first.id != second.id && first.filePath != second.filePath,
        'Selected-folder duplicate names overwrote an original');
    for (final pair in [(first, a), (second, b)]) {
      final item = pair.$1;
      require(
          IosOutputFolder.isWithin(selected, item.filePath) &&
              item.filePath.contains('/${item.date}/Native group/'),
          'Generated output did not use selected date/group layout');
      final actual = Platform.isIOS
          ? await IosOutputFolder.read(item.filePath)
          : await File(item.filePath).readAsBytes();
      require(digest(actual) == digest(pair.$2),
          'Actual selected-folder bytes differ or are inaccessible');
    }
    final history = await Storage().getHistory();
    require(
        [first, second].every((item) => history.any(
            (saved) => saved.id == item.id && saved.filePath == item.filePath)),
        'Fresh persisted history lost the actual selected output association');
    suite.check('output-management', 'folder-choice-history-link', {
      'productionSettingsButtonHitTest': true,
      'actualNativePickerNonceFolderSelected': expectedFolder,
      'outsideApplicationDocuments': true,
      'permissionAndSettingsPersistenceObserved': true,
      'actualOutputCount': 2,
      'uniquePathsAndExactPngBytes': true,
      'dateAndGroupLayoutPreserved': true,
      'freshHistoryActualPathAssociation': true,
      'iosActiveSavedBookmarkAndCoordinatedRead': Platform.isIOS,
      'scope':
          'Current native process and chosen local provider only; cold restoration, provider moves/revocation and all historical export/delete consumers need separate actual OS scenarios.',
    });
  } finally {
    // Do not remove arbitrary selected trees. Only the isolated device/OS
    // driver owns cleanup of its exact nonce folder after evidence collection.
    await nativeUiMount(c.app, const SizedBox.shrink());
    await c.close();
  }
}
