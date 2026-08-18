import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';

class _TestPathProvider extends PathProviderPlatform {
  final String root;
  _TestPathProvider(this.root);

  @override
  Future<String?> getApplicationDocumentsPath() async => root;

  @override
  Future<String?> getTemporaryPath() async => root;
}

class _MemoryPresetStorage extends Storage {
  final Directory root;
  ReferencePresetLibrary library = const ReferencePresetLibrary();
  List<ReferencePreset> lastExported = [];
  List<String> lastExportedGroups = [];

  _MemoryPresetStorage(this.root);

  @override
  Future<ReferencePresetLibrary> getReferencePresetLibrary() async => library;

  @override
  Future<void> setReferencePresetLibrary(ReferencePresetLibrary value) async {
    library = value;
  }

  @override
  Future<String> persistReferencePresetImage({
    required String presetId,
    required List<int> bytes,
    String sourcePath = '',
  }) async {
    final file = File('${root.path}/$presetId.png');
    await file.writeAsBytes(bytes);
    return file.path;
  }

  @override
  Future<void> deleteReferencePresetImage(ReferencePreset preset) async {
    final file = File(preset.filePath);
    if (file.existsSync()) await file.delete();
  }

  @override
  Future<File> exportReferencePresetArchive({
    required List<ReferencePreset> presets,
    required List<String> groups,
    String label = 'reference-presets',
  }) async {
    lastExported = List.of(presets);
    lastExportedGroups = List.of(groups);
    return File('${root.path}/export.nairp')..writeAsStringSync('test');
  }
}

void main() {
  test('new vibe references default information and strength to one', () {
    const item = VibeTransferItem(base64: 'image');
    expect(item.infoExtracted, 1);
    expect(item.strength, 1);
  });

  late Directory root;
  late _MemoryPresetStorage storage;
  late AppState state;

  setUp(() {
    root = Directory.systemTemp.createTempSync('reference-preset-test-');
    storage = _MemoryPresetStorage(root);
    state = AppState(storage: storage);
  });

  tearDown(() {
    state.dispose();
    if (root.existsSync()) root.deleteSync(recursive: true);
  });

  test('vibe preset copies image and restores its saved strengths', () async {
    const bytes = [1, 2, 3, 4];
    state.extras.vibeImages.add(VibeTransferItem(
      base64: base64Encode(bytes),
      infoExtracted: 0.42,
      strength: 0.81,
      sourcePath: 'missing-original.png',
    ));

    expect(
      await state.saveVibeReferencePreset(
        0,
        name: '夜景风格',
        group: '常用',
      ),
      isNull,
    );
    final preset = state.referencePresets.single;
    expect(File(preset.filePath).readAsBytesSync(), bytes);
    expect(state.referencePresetGroups, contains('常用'));

    state.removeVibeImage(0);
    expect(await state.applyReferencePreset(preset.id), isNull);
    expect(state.extras.vibeImages.single.infoExtracted, 0.42);
    expect(state.extras.vibeImages.single.strength, 0.81);
    expect(base64Decode(state.extras.vibeImages.single.base64), bytes);
  });

  test('arbitrary local image can be added as a named precise preset',
      () async {
    final source = File('${root.path}/picked.png')
      ..writeAsBytesSync(
          image_lib.encodePng(image_lib.Image(width: 20, height: 30)));

    expect(
      await state.saveReferencePresetFromPath(
        source.path,
        kind: ReferencePresetKind.precise,
        name: '立绘参考',
        group: '角色',
        preciseType: 'character&style',
        strength: 0.74,
        fidelity: 0.88,
        informationExtracted: 0.92,
      ),
      isNull,
    );
    final preset = state.referencePresets.single;
    expect(preset.name, '立绘参考');
    expect(preset.group, '角色');
    expect((preset.width, preset.height), (20, 30));
    expect(preset.preciseType, 'character&style');
    expect(preset.informationExtracted, 0.92);
    expect(File(preset.filePath).existsSync(), isTrue);
  });

  test('precise preset restores official controls and fixes legacy info to one',
      () async {
    state.extras.preciseReferences.add(PreciseReferenceItem(
      base64: base64Encode(const [8, 9, 10]),
      type: 'character&style',
      strength: 0.73,
      fidelity: 0.64,
      informationExtracted: 0.91,
      width: 832,
      height: 1216,
    ));

    expect(
      await state.savePreciseReferencePreset(
        0,
        name: '角色 A',
        group: '角色',
      ),
      isNull,
    );
    final preset = state.referencePresets.single;
    state.removePreciseReference(0);
    expect(await state.applyReferencePreset(preset.id), isNull);
    final restored = state.extras.preciseReferences.single;
    expect(restored.type, 'character&style');
    expect(restored.strength, 0.73);
    expect(restored.fidelity, 0.64);
    expect(restored.informationExtracted, 1);
    expect((restored.width, restored.height), (832, 1216));
  });

  test('single, group and full export select the expected presets', () async {
    state.extras.vibeImages.add(VibeTransferItem(
      base64: base64Encode(const [1]),
    ));
    await state.saveVibeReferencePreset(0, name: 'A', group: 'G1');
    state.extras.preciseReferences.add(PreciseReferenceItem(
      base64: base64Encode(const [2]),
    ));
    await state.savePreciseReferencePreset(0, name: 'B', group: 'G2');

    await state.exportReferencePresets(
        presetId: state.referencePresets.first.id);
    expect(storage.lastExported.map((item) => item.name), ['A']);

    await state.exportReferencePresets(group: 'G2');
    expect(storage.lastExported.map((item) => item.name), ['B']);
    expect(storage.lastExportedGroups, ['G2']);

    await state.exportReferencePresets();
    expect(storage.lastExported, hasLength(2));
    expect(storage.lastExportedGroups, containsAll(['G1', 'G2']));
  });

  test('saved preset can be moved into a new or existing group', () async {
    state.extras.vibeImages.add(VibeTransferItem(
      base64: base64Encode(const [3, 4, 5]),
    ));
    await state.saveVibeReferencePreset(0, name: '夜景', group: '常用');
    final id = state.referencePresets.single.id;

    expect(await state.moveReferencePresetToGroup(id, '待整理'), isNull);
    expect(state.referencePresets.single.group, '待整理');
    expect(state.referencePresetGroups, containsAll(['常用', '待整理']));
    expect(storage.library.presets.single.group, '待整理');

    expect(await state.moveReferencePresetToGroup(id, ''), isNull);
    expect(state.referencePresets.single.group, isEmpty);
  });

  test('real archive round-trip includes image bytes and all parameters',
      () async {
    PathProviderPlatform.instance = _TestPathProvider(root.path);
    final actual = Storage();
    final source = File('${root.path}/source.webp')
      ..writeAsBytesSync(const [11, 22, 33, 44]);
    final preset = ReferencePreset(
      id: 'original',
      name: 'Imported character',
      group: 'Characters',
      kind: ReferencePresetKind.precise,
      filePath: source.path,
      createdAt: '2026-08-17T00:00:00.000Z',
      preciseType: 'character&style',
      strength: 0.75,
      fidelity: 0.85,
      informationExtracted: 0.95,
      width: 832,
      height: 1216,
    );

    final archive = await actual.exportReferencePresetArchive(
      presets: [preset],
      groups: const ['Characters'],
    );
    final imported = await actual.importReferencePresetArchive(archive.path);

    expect(imported.groups, ['Characters']);
    expect(imported.presets, hasLength(1));
    final restored = imported.presets.single;
    expect(restored.id, isNot('original'));
    expect(restored.name, preset.name);
    expect(restored.preciseType, 'character&style');
    expect(restored.strength, 0.75);
    expect(restored.fidelity, 0.85);
    expect(restored.informationExtracted, 0.95);
    expect((restored.width, restored.height), (832, 1216));
    expect(File(restored.filePath).readAsBytesSync(), const [11, 22, 33, 44]);
  });
}
