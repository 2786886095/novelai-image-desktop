import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/local_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late File original;
  late MobileLocalFavorites store;
  HistoryItem history() => HistoryItem(
      id: 'history-1',
      filePath: original.path,
      date: '2026-09-28',
      createdAt: '2026-09-28T12:00:00Z',
      seed: 1,
      model: 'nai-diffusion-5-full',
      width: 10,
      height: 15,
      prompt: '1girl');

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    UnifiedStorage.active = null;
    root = await Directory.systemTemp.createTemp('mobile-favorites-');
    original = File('${root.path}${Platform.pathSeparator}original.png');
    await original.writeAsBytes([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    store = MobileLocalFavorites(rootOverride: root);
  });
  tearDown(() async {
    store.dispose();
    await root.delete(recursive: true);
  });

  test('copies original bytes into flat directory and persists one bookmark',
      () async {
    final item = await store.add(history());
    expect(item.prefix, '20260928_10x15_01');
    expect(
        await File('${root.path}/images/favorites/${item.fileName}')
            .readAsBytes(),
        await original.readAsBytes());
    expect((await store.add(history())).id, item.id);
    expect((await MobileLocalFavorites(rootOverride: root).list()).items.length,
        1);
    await original.delete();
    expect(
        await File('${root.path}/images/favorites/${item.fileName}')
            .readAsBytes(),
        [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    expect(UnifiedStorage.dataKeys[localFavoritesKey],
        'data/local-favorites.json');
  });

  test('rename changes only suffix; remove keeps both original and copy',
      () async {
    final item = await store.add(history());
    final renamed = await store.rename(item.id, '黄昏海边');
    expect(renamed.fileName, '20260928_10x15_01_黄昏海边.png');
    await expectLater(
        store.rename(item.id, '../outside'), throwsFormatException);
    expect(await original.exists(), isTrue);
    await store.remove(item.id);
    expect((await store.list()).items, isEmpty);
    expect(
        await File('${root.path}/images/favorites/${renamed.fileName}')
            .exists(),
        isTrue);
  });

  test('directory migration copies favorites and retains old originals',
      () async {
    final item = await store.add(history());
    final old = await store.file(item);
    final next = Directory('${root.path}/custom');
    await store.setDirectory(next.path);
    expect((await store.list()).directory, await next.resolveSymbolicLinks());
    expect(await File('${next.path}/${item.fileName}').readAsBytes(),
        await old.readAsBytes());
    expect(await old.exists(), isTrue);
  });

  test('collision rejects directory switch without losing previous index',
      () async {
    final item = await store.add(history());
    final next = await Directory('${root.path}/custom').create();
    await File('${next.path}/${item.fileName}').writeAsString('different');
    await expectLater(
        store.setDirectory(next.path), throwsA(isA<FileSystemException>()));
    expect((await store.list()).directory, isNot(next.path));
    expect(await (await store.file(item)).exists(), isTrue);
  });
}
