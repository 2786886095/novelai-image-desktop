import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/vibe_file.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  late Directory root;
  late File image;
  late AppState state;
  late List<int> pristineBytes;
  void seed(int count) {
    state.extras.vibeImages.clear();
    state.extras.vibeImages.addAll(List.generate(count,
        (_) => const VibeTransferItem(base64: 'owned', infoExtracted: .4, strength: .65)));
  }
  String bundle() => exportVibeFile([
        VibeTransferItem(base64: base64Encode(pristineBytes), infoExtracted: .4, strength: .65)
      ]);
  setUp(() {
    root = Directory.systemTemp.createTempSync('owned-reference-entry-');
    pristineBytes = img.encodePng(img.Image(width: 8, height: 12));
    image = File('${root.path}/owned.png')..writeAsBytesSync(pristineBytes);
    state = AppState(storage: Storage());
    state.referencePresets.add(ReferencePreset(
        id: 'owned-preset', name: 'Owned', group: '', kind: ReferencePresetKind.vibe,
        filePath: image.path, createdAt: '2026-10-03T00:00:00Z',
        infoExtracted: .4, strength: .65));
  });
  tearDown(() {
    expect(image.readAsBytesSync(), pristineBytes);
    state.dispose();
    final absolute = root.absolute.path;
    if (!absolute.startsWith(Directory.systemTemp.absolute.path)) {
      throw StateError('Owned temporary test root escaped');
    }
    root.deleteSync(recursive: true);
  });
  test('raw 15 plus1 accepts the sixteenth item', () async {
    seed(15); expect(await state.addVibeImage(image.path), isNull);
    expect(state.extras.vibeImages, hasLength(16));
  });
  test('raw 16 plus1 rejects without modifying existing items', () async {
    seed(16); final before = List.of(state.extras.vibeImages);
    expect(await state.addVibeImage(image.path), isNotNull);
    expect(state.extras.vibeImages, before);
  });
  test('raw concurrent read completions at15 share the same limit', () async {
    seed(15);
    final results = await Future.wait([state.addVibeImage(image.path), state.addVibeImage(image.path)]);
    expect(state.extras.vibeImages, hasLength(16));
    expect(results.where((value) => value == null), hasLength(1));
    expect(results.where((value) => value != null), hasLength(1));
  });
  test('preset 15 plus1 preserves saved parameter values', () async {
    seed(15); expect(await state.applyReferencePreset('owned-preset'), isNull);
    expect(state.extras.vibeImages, hasLength(16));
    expect(state.extras.vibeImages.last.infoExtracted, .4);
    expect(state.extras.vibeImages.last.strength, .65);
  });
  test('preset 16 plus1 rejects without modifying existing items', () async {
    seed(16); final before = List.of(state.extras.vibeImages);
    expect(await state.applyReferencePreset('owned-preset'), isNotNull);
    expect(state.extras.vibeImages, before);
  });
  test('preset concurrent reads at15 reject the extra item', () async {
    seed(15);
    final results = await Future.wait([state.applyReferencePreset('owned-preset'), state.applyReferencePreset('owned-preset')]);
    expect(state.extras.vibeImages, hasLength(16));
    expect(results.where((value) => value == null), hasLength(1));
  });
  test('mixed raw and preset pending reads use one shared capacity', () async {
    seed(15);
    final results = await Future.wait([state.addVibeImage(image.path), state.applyReferencePreset('owned-preset')]);
    expect(state.extras.vibeImages, hasLength(16));
    expect(results.where((value) => value == null), hasLength(1));
  });
  test('raw pending read rechecks capacity after a bundle import', () async {
    seed(15); final pending = state.addVibeImage(image.path);
    expect(state.importVibeFile(bundle()), isNull);
    expect(await pending, isNotNull);
    expect(state.extras.vibeImages, hasLength(16));
  });
  test('preset pending read rechecks capacity after a bundle import', () async {
    seed(15); final pending = state.applyReferencePreset('owned-preset');
    expect(state.importVibeFile(bundle()), isNull);
    expect(await pending, isNotNull);
    expect(state.extras.vibeImages, hasLength(16));
  });
}
