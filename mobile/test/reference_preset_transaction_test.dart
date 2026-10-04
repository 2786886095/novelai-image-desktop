import 'package:flutter/foundation.dart';
import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
// ignore: depend_on_referenced_packages
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'dart:convert';
import 'package:archive/archive.dart';
import 'package:image/image.dart' as image_lib;
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class FailingLibraryStorage extends Storage {
  final Directory root;
  final ReferencePresetLibrary durable;
  FailingLibraryStorage(this.root, this.durable);
  @override
  Future<ReferencePresetLibrary> getReferencePresetLibrary() async => durable;
  @override
  Future<void> setReferencePresetLibrary(ReferencePresetLibrary library) async {
    throw StateError('QA forced preset metadata write failure');
  }

  @override
  Future<String> persistReferencePresetImage(
      {required String presetId,
      required List<int> bytes,
      String sourcePath = ''}) async {
    final file = File('${root.path}/$presetId.png');
    await file.writeAsBytes(bytes, flush: true);
    return file.path;
  }

  @override
  Future<ReferencePresetImport> importReferencePresetArchive(
      String filePath) async {
    final original = durable.presets.single;
    final path = await persistReferencePresetImage(
        presetId: 'imported',
        bytes: await File(original.filePath).readAsBytes());
    return ReferencePresetImport(groups: [
      'NEW'
    ], presets: [
      original.copyWith(
          id: 'imported', name: 'Imported QA', group: 'NEW', filePath: path)
    ]);
  }

  @override
  Future<void> deleteReferencePresetImage(ReferencePreset preset) async {
    final file = File(preset.filePath);
    if (await file.exists()) await file.delete();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final operation in [
    'save-path',
    'save-vibe',
    'save-precise',
    'move-group',
    'add-group',
    'delete-preset',
    'delete-group',
    'save-download',
    'import'
  ]) {
    test(
        'failed $operation preserves existing memory, durable metadata and image',
        () async {
      const fixture = String.fromEnvironment('REFERENCE_QA_IMAGE');
      final bytes = fixture.isEmpty
          ? Uint8List.fromList(
              image_lib.encodePng(image_lib.Image(width: 384, height: 512)))
          : await File(fixture).readAsBytes();
      final originalHash = sha256.convert(bytes).toString();
      final root = Directory.systemTemp.createTempSync('reference-failure-qa-');
      final source = File('${root.path}/source.png')..writeAsBytesSync(bytes);
      final sourcePath = fixture.isEmpty ? source.path : fixture;
      final existing = File('${root.path}/original.png');
      await existing.writeAsBytes(bytes, flush: true);
      final preset = ReferencePreset(
          id: 'original',
          name: 'Original QA',
          group: 'ORIGINAL',
          kind: ReferencePresetKind.precise,
          filePath: existing.path,
          createdAt: '2026-10-02T00:00:00',
          width: 384,
          height: 512);
      final durable =
          ReferencePresetLibrary(groups: ['ORIGINAL'], presets: [preset]);
      final storage = FailingLibraryStorage(root, durable);
      final app = AppState(storage: storage);
      app.referencePresets.add(preset);
      app.referencePresetGroups.add('ORIGINAL');
      app.extras.vibeImages.add(VibeTransferItem(
          base64: base64Encode(bytes), sourcePath: sourcePath));
      app.extras.preciseReferences.add(PreciseReferenceItem(
          base64: base64Encode(bytes),
          sourcePath: sourcePath,
          width: 384,
          height: 512));
      final before = jsonEncode(durable.toJson());
      addTearDown(() {
        app.dispose();
        if (root.existsSync()) root.deleteSync(recursive: true);
      });
      Object? error;
      try {
        switch (operation) {
          case 'save-path':
            error = await app.saveReferencePresetFromPath(sourcePath,
                kind: ReferencePresetKind.precise,
                name: 'NEW QA',
                group: 'NEW');
            break;
          case 'save-vibe':
            error = await app.saveVibeReferencePreset(0,
                name: 'NEW QA', group: 'NEW');
            break;
          case 'save-precise':
            error = await app.savePreciseReferencePreset(0,
                name: 'NEW QA', group: 'NEW');
            break;
          case 'move-group':
            error = await app.moveReferencePresetToGroup('original', 'NEW');
            break;
          case 'add-group':
            error = await app.addReferencePresetGroup('NEW');
            break;
          case 'delete-preset':
            await app.deleteReferencePreset('original');
            break;
          case 'delete-group':
            await app.deleteReferencePresetGroup('ORIGINAL');
            break;
          case 'save-download':
            error = await app.saveDownloadedPreciseReferencePreset(
                bytes: bytes,
                sourceId: 'qa/source',
                name: 'NEW QA',
                group: 'NEW',
                width: 384,
                height: 512);
            break;
          case 'import':
            error = await app.importReferencePresets('simulated-owned.nairp');
            break;
        }
      } catch (e) {
        error = e;
      }
      final memory = ReferencePresetLibrary(
          groups: app.referencePresetGroups, presets: app.referencePresets);
      final retained = existing.existsSync() &&
          sha256.convert(existing.readAsBytesSync()).toString() == originalHash;
      final originalPath = existing.absolute.path.replaceAll('\\', '/');
      final copied = root
          .listSync()
          .whereType<File>()
          .where((f) =>
              f.absolute.path.replaceAll('\\', '/') != originalPath &&
              f.absolute.path.replaceAll('\\', '/') !=
                  source.absolute.path.replaceAll('\\', '/'))
          .length;
      debugPrint(
          'REFERENCE_FAILURE_OBSERVED: operation=$operation,error=$error,memoryPresets=${app.referencePresets.length},memoryGroups=${app.referencePresetGroups},durablePresets=${storage.durable.presets.length},originalImageRetained=$retained,newImageCopies=$copied,memoryUnchanged=${jsonEncode(memory.toJson()) == before}; no network/no native state changes/0credits');
      expect(error, isNotNull,
          reason: 'Failed metadata write must not be reported as success');
      expect(jsonEncode(memory.toJson()), before,
          reason:
              'Failed library mutation must not publish memory-only changes');
      expect(jsonEncode(storage.durable.toJson()), before);
      expect(retained, isTrue,
          reason: 'Failed delete must keep previously durable image');
      expect(copied, 0,
          reason: 'Failed additions must remove newly copied image only');
      expect(sha256.convert(await File(sourcePath).readAsBytes()).toString(),
          originalHash);
    });
  }
  for (final sameSource in [false, true]) {
    test(
        'overlapping downloaded saves preserve ${sameSource ? 'one duplicate' : 'both distinct'} and hide pending writes',
        () async {
      final root = Directory.systemTemp.createTempSync('reference-overlap-qa-');
      final storage = BlockingLibraryStorage(root);
      final app = AppState(storage: storage);
      final bytes = Uint8List.fromList(
          image_lib.encodePng(image_lib.Image(width: 8, height: 12)));
      addTearDown(() {
        app.dispose();
        if (root.existsSync()) root.deleteSync(recursive: true);
      });
      final first = app.saveDownloadedPreciseReferencePreset(
          bytes: bytes,
          sourceId: 'QA/A',
          name: 'A',
          group: 'QA',
          width: 8,
          height: 12);
      await storage.entered.future;
      expect(app.referencePresets, isEmpty,
          reason: 'Metadata not committed yet');
      final second = app.saveDownloadedPreciseReferencePreset(
          bytes: bytes,
          sourceId: sameSource ? 'QA/A' : 'QA/B',
          name: 'B',
          group: 'QA',
          width: 8,
          height: 12);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final visibleWhilePending = app.referencePresets.length;
      storage.release.complete();
      expect(await first, isNull);
      expect(await second, isNull);
      final ids = app.referencePresets.map((p) => p.sourceId).toList();
      debugPrint(
          'REFERENCE_OVERLAP_OBSERVED: sameSource=$sameSource,pendingVisible=$visibleWhilePending,memory=$ids,durable=${storage.durable.presets.map((p) => p.sourceId).toList()},copies=${root.listSync().whereType<File>().length};0network/0credits');
      expect(visibleWhilePending, 0,
          reason: 'Later commit must not overtake first pending commit');
      expect(ids.toSet(), sameSource ? {'QA/A'} : {'QA/A', 'QA/B'});
      expect(
          jsonEncode(storage.durable.toJson()),
          jsonEncode(ReferencePresetLibrary(
                  groups: app.referencePresetGroups,
                  presets: app.referencePresets)
              .toJson()));
      expect(root.listSync().whereType<File>().length, sameSource ? 1 : 2);
    });
  }
  test('partial production archive import cleans only new image copies',
      () async {
    final root =
        Directory.systemTemp.createTempSync('reference-partial-import-qa-');
    final storage = PartialImportStorage(root);
    addTearDown(() {
      if (root.existsSync()) root.deleteSync(recursive: true);
    });
    final bytes = image_lib.encodePng(image_lib.Image(width: 8, height: 12));
    final original = File('${root.path}/original.png')..writeAsBytesSync(bytes);
    final archive = Archive();
    final presets = [
      for (var i = 0; i < 2; i++)
        {
          'id': 'QA-$i',
          'name': 'QA-$i',
          'group': 'QA',
          'kind': 'precise',
          'asset': 'images/$i.png'
        }
    ];
    final manifest = utf8.encode(jsonEncode({
      'format': 'langbai-reference-presets',
      'version': 1,
      'groups': ['QA'],
      'presets': presets
    }));
    archive.addFile(ArchiveFile('manifest.json', manifest.length, manifest));
    for (var i = 0; i < 2; i++) {
      archive.addFile(ArchiveFile('images/$i.png', bytes.length, bytes));
    }
    final input = File('${root.path}/owned.nairp')
      ..writeAsBytesSync(ZipEncoder().encode(archive)!);
    await expectLater(
        storage.importReferencePresetArchive(input.path), throwsStateError);
    final copied = root
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('-copied.png'))
        .length;
    debugPrint(
        'REFERENCE_PARTIAL_IMPORT_OBSERVED: newCopies=$copied,originalRetained=${original.existsSync()},sourceArchiveRetained=${input.existsSync()};0network/0credits');
    expect(copied, 0);
    expect(original.readAsBytesSync(), bytes);
    expect(
        ZipDecoder()
            .decodeBytes(input.readAsBytesSync(), verify: true)
            .files
            .length,
        3);
  });
  for (final silentSuccess in [false, true]) {
    test(
        'production storage rejects ${silentSuccess ? 'mismatched readback' : 'false write'} and reloads original metadata',
        () async {
      final before = jsonEncode(
          const ReferencePresetLibrary(groups: ['ORIGINAL']).toJson());
      SharedPreferences.setMockInitialValues(
          {'reference_preset_library_v1': before});
      final oldStore = SharedPreferencesStorePlatform.instance;
      SharedPreferencesStorePlatform.instance =
          RefusingPreferenceStore(before, silentSuccess);
      UnifiedStorage.active = null;
      addTearDown(() {
        SharedPreferencesStorePlatform.instance = oldStore;
        SharedPreferences.setMockInitialValues({});
        UnifiedStorage.active = null;
      });
      await expectLater(
          Storage().setReferencePresetLibrary(
              const ReferencePresetLibrary(groups: ['NEW'])),
          throwsStateError);
      final prefs = await SharedPreferences.getInstance();
      await prefs.reload();
      expect(prefs.getString('reference_preset_library_v1'), before);
      debugPrint(
          'REFERENCE_STORAGE_OBSERVED: silentSuccess=$silentSuccess,failedWriteRejected=true,originalMetadataRetained=true;0network/0credits');
    });
  }
  test(
      'failed mutation does not poison next save or emit premature notification',
      () async {
    final root = Directory.systemTemp.createTempSync('reference-retry-qa-');
    final storage = RetryLibraryStorage(root);
    final app = AppState(storage: storage);
    final source = File('${root.path}/source.png')
      ..writeAsBytesSync(
          image_lib.encodePng(image_lib.Image(width: 8, height: 12)));
    addTearDown(() {
      app.dispose();
      if (root.existsSync()) root.deleteSync(recursive: true);
    });
    var notifications = 0;
    app.addListener(() {
      notifications++;
      expect(
          jsonEncode(ReferencePresetLibrary(
                  groups: app.referencePresetGroups,
                  presets: app.referencePresets)
              .toJson()),
          jsonEncode(storage.durable.toJson()));
    });
    expect(
        await app.saveReferencePresetFromPath(source.path,
            kind: ReferencePresetKind.precise, name: 'First', group: 'FIRST'),
        isNotNull);
    expect(app.referencePresets, isEmpty);
    expect(app.referencePresetGroups, isEmpty);
    expect(notifications, 0);
    storage.fail = false;
    expect(
        await app.saveReferencePresetFromPath(source.path,
            kind: ReferencePresetKind.precise, name: 'Retry', group: 'RETRY'),
        isNull);
    expect(app.referencePresets.single.name, 'Retry');
    expect(app.referencePresetGroups, ['RETRY']);
    expect(notifications, 1);
    expect(root.listSync().whereType<File>().length, 2);
    debugPrint(
        'REFERENCE_RETRY_OBSERVED: failedChangesDiscarded=true,retryPassed=true,notifications=$notifications;0network/0credits');
  });
}

class BlockingLibraryStorage extends Storage {
  final Directory root;
  ReferencePresetLibrary durable = const ReferencePresetLibrary();
  final entered = Completer<void>(), release = Completer<void>();
  int writes = 0;
  BlockingLibraryStorage(this.root);
  @override
  Future<void> setReferencePresetLibrary(ReferencePresetLibrary library) async {
    if (++writes == 1) {
      entered.complete();
      await release.future;
    }
    durable = library;
  }

  @override
  Future<String> persistReferencePresetImage(
      {required String presetId,
      required List<int> bytes,
      String sourcePath = ''}) async {
    final f = File('${root.path}/$presetId.png');
    await f.writeAsBytes(bytes, flush: true);
    return f.path;
  }
}

class PartialImportStorage extends Storage {
  final Directory root;
  int copies = 0;
  PartialImportStorage(this.root);
  @override
  Future<String> persistReferencePresetImage(
      {required String presetId,
      required List<int> bytes,
      String sourcePath = ''}) async {
    if (++copies == 2) {
      throw StateError('QA forced second imported image failure');
    }
    final f = File('${root.path}/$presetId-copied.png');
    await f.writeAsBytes(bytes, flush: true);
    return f.path;
  }

  @override
  Future<void> deleteReferencePresetImage(ReferencePreset preset) async {
    final f = File(preset.filePath);
    if (f.existsSync()) await f.delete();
  }
}

class RefusingPreferenceStore extends InMemorySharedPreferencesStore {
  final bool silentSuccess;
  RefusingPreferenceStore(String before, this.silentSuccess)
      : super.withData({'flutter.reference_preset_library_v1': before});
  @override
  Future<bool> setValue(String valueType, String key, Object value) async =>
      silentSuccess;
}

class RetryLibraryStorage extends BlockingLibraryStorage {
  bool fail = true;
  RetryLibraryStorage(super.root);
  @override
  Future<void> setReferencePresetLibrary(ReferencePresetLibrary library) async {
    if (fail) throw StateError('QA forced first save failure');
    durable = library;
  }

  @override
  Future<void> deleteReferencePresetImage(ReferencePreset preset) async {
    final file = File(preset.filePath);
    if (file.existsSync()) await file.delete();
  }
}
