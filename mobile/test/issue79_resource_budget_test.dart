import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as im;
import 'package:path/path.dart' as p;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/history/converted_history.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _Paths extends PathProviderPlatform {
  final String root; _Paths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async => root;
}
Uint8List _webp() => im.encodeWebP(im.Image(width: 8, height: 8), lossless: true);
HistoryItem _row(String path, [String id = 'row']) => HistoryItem(id: id,
  filePath: path, date: '2026-10-31', createdAt: '2026-10-31T00:00:00Z',
  seed: 7, model: 'fixture', width: 8, height: 8, prompt: 'fixture', params: {});
class _PendingStorage extends Storage {
  int calls = 0, active = 0, maximumActive = 0;
  @override bool get historyReconcilePending => calls < 3;
  @override Future<Set<String>> reconcileMissingHistory() async {
    calls++; active++; maximumActive = active > maximumActive ? active : maximumActive;
    await Future<void>.delayed(const Duration(milliseconds: 5)); active--; return {};
  }
  @override Future<List<HistoryItem>> getHistory() async => [];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root; late Storage storage;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('issue79-resource-budget-');
    SharedPreferences.setMockInitialValues({}); UnifiedStorage.active = null;
    PathProviderPlatform.instance = _Paths(root.path);
    storage = Storage(); await storage.setSettings(AppSettings(saveToGallery: false, imageOutputDir: root.path));
  });
  tearDown(() async {
    expect(root.parent.absolute.path, Directory.systemTemp.absolute.path);
    expect(p.basename(root.path), startsWith('issue79-resource-budget-'));
    if (await root.exists()) await root.delete(recursive: true);
  });
  test('payload budget defers a second image without modifying bytes; a new slice can recover it', () async {
    final bytes = _webp(); final first = _row('${root.path}/a.png'); final second = _row('${root.path}/b.png', 'b');
    File('${root.path}/a.webp').writeAsBytesSync(bytes); final b = File('${root.path}/b.webp')..writeAsBytesSync(bytes);
    final scan = ConvertedHistoryScan(maxReadBytes: bytes.length);
    expect((await findConvertedHistoryWebp(first, roots: [root], coordinated: false, scan: scan)).state, ConvertedHistoryState.recovered);
    expect(scan.readBytes, bytes.length); expect(scan.remainingBytes, 0);
    expect((await findConvertedHistoryWebp(second, roots: [root], coordinated: false, scan: scan)).state, ConvertedHistoryState.blocked);
    expect(b.readAsBytesSync(), bytes);
    expect((await findConvertedHistoryWebp(second, roots: [root], coordinated: false)).state, ConvertedHistoryState.recovered);
  });
  test('a changing directory makes the operation-local negative snapshot inconclusive, not deletion', () async {
    final scan = ConvertedHistoryScan();
    expect((await findConvertedHistoryWebp(_row('${root.path}/a.png'), roots: [root], coordinated: false, scan: scan)).state, ConvertedHistoryState.missing);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    File('${root.path}/b.webp').writeAsBytesSync(_webp());
    final row = _row('${root.path}/b.png', 'b');
    expect((await findConvertedHistoryWebp(row, roots: [root], coordinated: false, scan: scan)).state, ConvertedHistoryState.blocked);
    expect((await findConvertedHistoryWebp(row, roots: [root], coordinated: false)).state, ConvertedHistoryState.recovered);
  });
  test('a row explicitly removed between slices is never revived by the saved sweep IDs', () async {
    final rows = [for (var i = 0; i < 33; i++) _row('${root.path}/image$i.png', 'row$i')];
    for (var i = 0; i < 32; i++) { File('${root.path}/image$i.webp').writeAsBytesSync([1, 2, 3]); }
    File('${root.path}/image32.webp').writeAsBytesSync(_webp());
    await storage.writeHistory(rows); await storage.reconcileMissingHistory(); expect(storage.historyReconcilePending, isTrue);
    await storage.mutateHistory((live) => live.where((row) => row.id != 'row32').toList());
    for (var i = 0; i < 33 && storage.historyReconcilePending; i++) { await storage.reconcileMissingHistory(); }
    expect(storage.historyReconcilePending, isFalse);
    expect((await storage.getHistory()).any((row) => row.id == 'row32'), isFalse);
  });
  testWidgets('visible Gallery drains only the finite pending sweep without overlapping calls', (tester) async {
    final pending = _PendingStorage();
    // Use one actual AppState reconciliation path, with storage work boundaries
    // controlled here. This is scheduling proof, not a native/file fixture.
    final state = AppState(storage: pending)..booted = true;
    state.settings.language = 'en-US';
    await tester.pumpWidget(ChangeNotifierProvider.value(value: state, child: const MaterialApp(home: GalleryScreen())));
    for (var i = 0; i < 5; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await tester.pump(const Duration(milliseconds: 110));
    }
    expect(pending.calls, 3); expect(pending.maximumActive, 1);
    await tester.pump(const Duration(seconds: 1));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    expect(pending.calls, 3);
    await tester.pumpWidget(const SizedBox.shrink()); state.dispose(); expect(tester.takeException(), isNull);
  });
  testWidgets('inactive Gallery cancels its pending continuation', (tester) async {
    final pending = _PendingStorage();
    final app = AppState(storage: pending)..booted = true; app.settings.language = 'en-US';
    Widget screen(bool enabled) => ChangeNotifierProvider.value(value: app,
      child: MaterialApp(home: TickerMode(enabled: enabled, child: const GalleryScreen())));
    await tester.pumpWidget(screen(true));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    expect(pending.calls, 1);
    await tester.pumpWidget(screen(false)); await tester.pump(const Duration(milliseconds: 300));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    expect(pending.calls, 1);
    await tester.pumpWidget(const SizedBox.shrink()); app.dispose(); expect(tester.takeException(), isNull);
  });
}
