// Actual iOS UIDocumentPicker + security-scoped bookmark journey.
// A bounded CI OS driver creates/selects the exact nonce folder in an external
// Files provider. No supplied grant, fake channel, app-container substitute,
// managed-folder fallback, or host-only run can certify this native entry.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as path;
import 'package:path_provider/path_provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/screens/settings_screen.dart';
import 'package:novelai_mobile/services/ios_output_folder.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'native_foreground.dart';
import 'native_scenario_support.dart';
import 'native_ui_actions.dart';
import 'native_settings_disclosure.dart';

final suite = NativeScenarios(1);
Future<void> main() => suite.run(_run);

Future<void> _run() async {
  require(Platform.isIOS, 'Independent iOS document-picker entry only');
  final c = await NativeContext.create('ios-output-folder');
  final nonce = '$pid-${DateTime.now().microsecondsSinceEpoch}';
  final expectedFolder = 'NativeOutput-$nonce';
  final originalRoot = c.app.settings.imageOutputDir;
  try {
    // Verify the actual app container from two independent native path-provider
    // locations. Reject Library/tmp as well as Documents and their OS aliases.
    final documents = await getApplicationDocumentsDirectory();
    final library = await getLibraryDirectory();
    final documentsReal = await documents.resolveSymbolicLinks();
    final libraryReal = await library.resolveSymbolicLinks();
    final appContainerReal = await documents.parent.resolveSymbolicLinks();
    require(
        path.basename(documentsReal) == 'Documents' &&
            path.basename(libraryReal) == 'Library' &&
            await library.parent.resolveSymbolicLinks() == appContainerReal,
        'Cannot bind the actual iOS app container; no external-folder claim');
    final previousGrants = await IosOutputFolder.status();
    require(
        !previousGrants.any((g) =>
            g['path'] is String &&
            path.basename(g['path'] as String) == expectedFolder),
        'Nonce output folder was already remembered before the real picker');
    await nativeUiMount(c.app, const SettingsScreen());
    final choose = await nativeSettingsControl(
      sectionTitle:
          settingsScreenTextFor(c.app.settings.language).storageSection,
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
              'Use the real iOS UIDocumentPicker Files interface to create/select this exact disposable folder in an external local provider outside this app container, then confirm selection without relaunching the client.',
          'deadlineSeconds': 180,
        })}');
    await nativeUiTap(choose!);
    final deadline = DateTime.now().add(const Duration(seconds: 180));
    while (c.app.settings.imageOutputDir == originalRoot) {
      require(DateTime.now().isBefore(deadline),
          'No actual iOS document-picker selection completed');
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    await nativeForegroundBarrier(renderBootstrap: false);
    final selected = c.app.settings.imageOutputDir;
    require(
        IosOutputFolder.isFolderPath(selected) &&
            path.basename(selected) == expectedFolder,
        'Actual selected folder did not match the nonce request');
    final selectedReal = await Directory(selected).resolveSymbolicLinks();
    require(
        selectedReal != appContainerReal &&
            !path.isWithin(appContainerReal, selectedReal) &&
            selectedReal != documentsReal &&
            selectedReal != libraryReal,
        'An app-container folder cannot substitute for an external picker grant');
    while ((await Storage().getSettings()).imageOutputDir != selected) {
      require(DateTime.now().isBefore(deadline),
          'Production settings did not persist the native picker result');
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    final grants = await IosOutputFolder.status();
    require(
        grants.where((g) => g['path'] == selected).length == 1 &&
            grants.any((g) =>
                g['path'] == selected &&
                g['available'] == true &&
                g['bookmarkSaved'] == true),
        'Actual UIDocumentPicker did not create one active saved native bookmark');
    await c.app.setSettings((s) {
      s.imageNameTemplate = 'native-ios-output';
    });
    await c.storage.writeGroups([
      HistoryGroup(
          id: nonce,
          name: 'Native iOS group',
          createdAt: DateTime.now().toUtc().toIso8601String())
    ]);
    final a = png(64, 64, 61), b = png(64, 64, 193);
    final first = await c.storage.saveImage(a, c.app.params, 1, groupId: nonce);
    final second =
        await c.storage.saveImage(b, c.app.params, 2, groupId: nonce);
    require(first.id != second.id && first.filePath != second.filePath,
        'Selected-folder duplicate stems overwrote an original');
    final measured = <Map<String, Object>>[];
    for (final pair in [(first, a), (second, b)]) {
      final item = pair.$1;
      require(
          IosOutputFolder.isWithin(selected, item.filePath) &&
              item.filePath.contains('/${item.date}/Native iOS group/') &&
              item.groupId == nonce,
          'Production output did not retain the selected date/group layout');
      require(await IosOutputFolder.probe(item.filePath),
          'Native coordinated probe did not confirm the saved original');
      final actual = await IosOutputFolder.read(item.filePath);
      final historyConsumerBytes = await Storage().readImage(item.filePath);
      require(
          digest(actual) == digest(pair.$2) &&
              digest(historyConsumerBytes) == digest(pair.$2),
          'Coordinated native/history reads differ from exact saved PNG bytes');
      measured.add({
        'id': item.id,
        'bytes': actual.length,
        'expectedSha256': digest(pair.$2),
        'actualSha256': digest(actual),
        'historyReadSha256': digest(historyConsumerBytes)
      });
    }
    final history = await Storage().getHistory();
    require(
        [first, second].every((item) => history.any((saved) =>
            saved.id == item.id &&
            saved.filePath == item.filePath &&
            saved.groupId == nonce &&
            saved.date == item.date)),
        'Fresh persisted history lost the actual selected-folder association');
    final finalGrants = await IosOutputFolder.status();
    require(
        finalGrants.any((g) =>
            g['path'] == selected &&
            g['available'] == true &&
            g['bookmarkSaved'] == true),
        'Native bookmark was unavailable after coordinated writes and reads');
    suite.check('output-management', 'folder-choice-history-link', {
      'productionSettingsButtonHitTest': true,
      'actualUIDocumentPickerNonceFolderSelected': expectedFolder,
      'outsideEntireApplicationContainer': true,
      'noRememberedNonceGrantBeforePicker': true,
      'activeSavedNativeBookmarkBeforeAndAfterIO': true,
      'productionSettingsPersistedThroughFreshStorage': true,
      'actualOutputCount': 2,
      'uniquePathsAndExactPngBytes': measured,
      'dateAndGroupLayoutPreserved': true,
      'freshHistoryActualPathAssociation': true,
      'iosActiveSavedBookmarkAndCoordinatedRead': true,
      'scope':
          'Current native process and selected external local Files provider only; cold grant restoration, provider moves/revocation and all historical export/delete consumers are not certified by this entry.',
    });
  } finally {
    // Only the isolated OS driver owns its exact nonce-folder cleanup. Never
    // remove a selected external tree from a Dart test or restore a fake grant.
    await nativeUiMount(c.app, const SizedBox.shrink());
    await c.close();
  }
}
