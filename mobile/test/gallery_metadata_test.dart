import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

class _MemoryMetadataStorage extends Storage {
  Uint8List? savedBytes;
  String? savedName;

  @override
  Future<void> setParams(GenerateParams params) async {}

  @override
  Future<void> setCharacterPrompts(List<CharCaptionItem> captions) async {}

  @override
  Future<({File file, String name})> saveMetadataInspectorImage(
    Uint8List bytes,
    String originalName,
  ) async {
    savedBytes = Uint8List.fromList(bytes);
    savedName = originalName;
    return (file: File(originalName), name: originalName);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  for (final applyMetadata in [false, true]) {
    test(
        'image load preserves parameters unless explicitly restored: $applyMetadata',
        () async {
      final directory =
          Directory.systemTemp.createTempSync('workbench-metadata-');
      addTearDown(() => directory.deleteSync(recursive: true));
      final image =
          File('${directory.path}${Platform.pathSeparator}source.png');
      image.writeAsBytesSync(_metadataPng());
      final state = AppState(storage: _MemoryMetadataStorage());
      addTearDown(state.dispose);
      state.params
        ..positivePrompt = 'keep my prompt'
        ..seed = 1234
        ..steps = 20
        ..cfgScale = 5
        ..width = 1024
        ..height = 1024;

      await state.setWorkbenchPath(image.path, applyMetadata: applyMetadata);

      expect(state.workbenchImage?.filePath, image.path);
      expect(state.workbenchImportedParams?.seed, 20261002);
      expect(state.params.positivePrompt,
          applyMetadata ? 'embedded mountain lake' : 'keep my prompt');
      expect(state.params.seed, applyMetadata ? 20261002 : 1234);
      expect(state.params.steps, applyMetadata ? 28 : 20);
      expect(state.params.cfgScale, applyMetadata ? 6 : 5);
      expect(state.params.width, applyMetadata ? 832 : 1024);
      expect(state.params.height, applyMetadata ? 1216 : 1024);
    });
  }

  testWidgets('grouped history image can be opened in metadata inspector',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(900, 1200);
    addTearDown(tester.view.reset);

    final directory = Directory.systemTemp.createTempSync('gallery-metadata-');
    addTearDown(() async {
      PaintingBinding.instance.imageCache
        ..clear()
        ..clearLiveImages();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      try {
        directory.deleteSync(recursive: true);
      } catch (_) {}
    });
    final image = File('${directory.path}${Platform.pathSeparator}grouped.png');
    // Valid 1x1 PNG keeps Image.file decoding deterministic in the widget test.
    final bytes = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
    image.writeAsBytesSync(bytes);

    final storage = _MemoryMetadataStorage();
    final state = AppState(storage: storage)
      ..groups = const [
        HistoryGroup(id: 'group-1', name: '角色图', createdAt: '2026-08-22')
      ]
      ..selectedGroupId = 'group-1'
      ..history = [
        HistoryItem(
          id: 'image-1',
          filePath: image.path,
          date: '2026-08-22',
          createdAt: '2026-08-22T12:00:00',
          seed: 42,
          model: 'nai-diffusion-5-full',
          width: 832,
          height: 1216,
          prompt: '1girl',
          groupId: 'group-1',
        ),
      ];
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          home: GalleryScreen(onOpenMetadata: () {}),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('grouped.png'), findsOneWidget);
    await tester.tap(find.text('grouped.png'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final metadataButton = find.byIcon(Icons.data_object_outlined);
    expect(metadataButton, findsOneWidget);

    await tester.runAsync(() => stageHistoryImageForMetadata(
          state,
          state.history.single,
        ));
    expect(storage.savedName, 'grouped.png');
    expect(storage.savedBytes, orderedEquals(bytes));
  });
}

Uint8List _metadataPng() {
  final png = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  final payload = <int>[
    ...ascii.encode('tEXt'),
    ...utf8.encode('Comment'),
    0,
    ...utf8.encode(jsonEncode({
      'prompt': 'embedded mountain lake',
      'seed': 20261002,
      'steps': 28,
      'scale': 6,
      'width': 832,
      'height': 1216
    }))
  ];
  final chunk = BytesBuilder()
    ..add((ByteData(4)..setUint32(0, payload.length - 4)).buffer.asUint8List())
    ..add(payload);
  var crc = 0xffffffff;
  for (final byte in payload) {
    crc ^= byte;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xedb88320 : crc >> 1;
    }
  }
  chunk.add((ByteData(4)..setUint32(0, crc ^ 0xffffffff)).buffer.asUint8List());
  return Uint8List.fromList([
    ...png.sublist(0, png.length - 12),
    ...chunk.toBytes(),
    ...png.sublist(png.length - 12)
  ]);
}
