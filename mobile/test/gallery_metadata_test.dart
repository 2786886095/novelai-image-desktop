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
