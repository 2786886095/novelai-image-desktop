import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/metadata_recovery.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/screens/metadata_inspector_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_dropdown.dart';
import 'package:provider/provider.dart';

class _SnapshotStorage extends Storage {
  final File image;
  _SnapshotStorage(this.image);
  @override
  Future<({File file, String name})?> getMetadataInspectorImage() async =>
      (file: image, name: 'same-local.png');
}
// This widget fixture tests ONLY selection/UI, not the official execution engine.
// Actual engine/device evidence is deliberately recorded independently.
class _SelectionReader extends MetadataRecoveryReader {
  final modes = <MetadataRecoveryMode>[];
  ImageMetadataReport? lastReport;
  @override
  Future<ImageMetadataReport> read(Uint8List bytes,
      {MetadataRecoveryMode mode = MetadataRecoveryMode.online}) async {
    modes.add(mode);
    if (mode == MetadataRecoveryMode.online) {
      throw const MetadataRecoveryFailure('asset_integrity_changed');
    }
    return lastReport = inspectImageMetadata(parseImageTextMetadata(bytes));
  }
}
void main() {
  testWidgets('shared selector defaults online and explicit offline re-reads same local image', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    final image = File('${Directory.current.parent.path}/shared/official-image-metadata-fixtures/rgba-8-plain.png');
    final state = AppState(storage: _SnapshotStorage(image));
    addTearDown(state.dispose);
    final reader = _SelectionReader();
    await tester.pumpWidget(ChangeNotifierProvider.value(value: state,
        child: MaterialApp(home: MetadataInspectorScreen(onBack: () {}, onOpenGenerate: () {}, recoveryReader: reader))));
    // File read uses a real asynchronous OS handle outside the widget fake clock.
    for (var attempt = 0; attempt < 20 && reader.modes.isEmpty; attempt++) {
      await tester.pump();
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    }
    await tester.pumpAndSettle();
    final selector = find.byKey(const ValueKey('metadata-recovery-mode'));
    expect(tester.widget<StudioDropdownButtonFormField<MetadataRecoveryMode>>(selector).value,
        MetadataRecoveryMode.online);
    expect(reader.modes, [MetadataRecoveryMode.online]);
    expect(find.byKey(const ValueKey('metadata-recovery-error')), findsOneWidget);
    expect(find.textContaining('未切换离线'), findsOneWidget);
    expect(find.textContaining('asset_integrity_changed'), findsOneWidget);
    expect(find.text('same-local.png'), findsOneWidget);
    await tester.tap(selector); await tester.pumpAndSettle();
    await tester.tap(find.text('离线：本机解析器').last); await tester.pumpAndSettle();
    expect(reader.modes, [MetadataRecoveryMode.online, MetadataRecoveryMode.offline]);
    expect(tester.widget<StudioDropdownButtonFormField<MetadataRecoveryMode>>(selector).value,
        MetadataRecoveryMode.offline);
    expect(find.byKey(const ValueKey('metadata-recovery-error')), findsNothing);
    expect(find.text('same-local.png'), findsOneWidget);
    expect(reader.lastReport?.imported.seed, 424242);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    PaintingBinding.instance.imageCache..clear()..clearLiveImages();
  });
}
