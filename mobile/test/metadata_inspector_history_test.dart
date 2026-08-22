import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/metadata_inspector_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

class _SessionMetadataStorage extends Storage {
  final File target;
  ({File file, String name})? snapshot;

  _SessionMetadataStorage(this.target);

  @override
  Future<({File file, String name})> saveMetadataInspectorImage(
    Uint8List bytes,
    String originalName,
  ) async {
    await target.writeAsBytes(bytes);
    final current = (file: target, name: originalName);
    snapshot = current;
    return current;
  }

  @override
  Future<({File file, String name})?> getMetadataInspectorImage() async =>
      snapshot;
}

void main() {
  testWidgets('metadata inspector reads a grouped history image directly',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);

    final directory = Directory.systemTemp.createTempSync('metadata-history-');
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
    final bytes = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
    image.writeAsBytesSync(bytes);

    final storage = _SessionMetadataStorage(
      File('${directory.path}${Platform.pathSeparator}snapshot.png'),
    );
    final state = AppState(storage: storage)
      ..groups = const [
        HistoryGroup(id: 'characters', name: '角色图', createdAt: '2026-08-23'),
      ]
      ..history = [
        HistoryItem(
          id: 'grouped-image',
          filePath: image.path,
          date: '2026-08-23',
          createdAt: '2026-08-23T12:00:00',
          seed: 1,
          model: 'nai-diffusion-5-full',
          width: 832,
          height: 1216,
          prompt: '1girl',
          groupId: 'characters',
        ),
      ];
    addTearDown(state.dispose);

    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: const MaterialApp(
          home: MetadataInspectorScreen(
            onBack: _noop,
            onOpenGenerate: _noop,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('从分组记录选择'), findsOneWidget);
    expect(find.text('grouped.png'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('metadata-history-grouped-image')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);

    final inspected = await tester.runAsync(
      () => inspectHistoryImageMetadata(state, state.history.single),
    );

    expect(storage.snapshot?.name, 'grouped.png');
    expect(inspected?.name, 'grouped.png');
    expect(tester.takeException(), isNull);
  });
}

void _noop() {}
