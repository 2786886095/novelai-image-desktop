import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

// Exercise the real AppState -> Storage -> JSON path. Only the platform
// preferences plugin is mocked; no history/group storage methods are mocked.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<AppState> reopen() async {
    final prefs = await SharedPreferences.getInstance();
    final persisted = {for (final key in prefs.getKeys()) key: prefs.get(key)!};
    SharedPreferences.setMockInitialValues(persisted);
    final state = AppState(storage: Storage());
    addTearDown(state.dispose);
    state.history = await state.storage.getHistory();
    state.groups = await state.storage.getGroups();
    return state;
  }

  Future<AppState> seed({String? groupId, int count = 1}) async {
    final storage = Storage();
    await storage.writeGroups(const [
      HistoryGroup(id: 'a', name: 'A', createdAt: '2026-09-24'),
      HistoryGroup(id: 'test', name: 'test', createdAt: '2026-09-24'),
    ]);
    await storage.writeHistory(List.generate(
        count,
        (i) => HistoryItem(
              id: 'image-$i',
              filePath: '/images/2026-09-24/A/image-$i.png',
              date: '2026-09-24',
              createdAt: '2026-09-24T10:00:00',
              seed: i,
              model: 'nai-diffusion-5-full',
              width: 832,
              height: 1216,
              prompt: 'test',
              groupId: groupId,
            )));
    return reopen();
  }

  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final original in <String?>[null, 'a']) {
    test('assignment from $original survives a fresh storage instance',
        () async {
      final state = await seed(groupId: original);
      state.current = state.history.first;
      await state.moveHistory('image-0', 'test');
      expect(state.current!.groupId, 'test');
      final loaded = await reopen();
      expect(loaded.history.single.groupId, 'test');
      expect(loaded.history.single.filePath, state.history.single.filePath);
      expect(loaded.groups.any((g) => g.id == 'test'), isTrue);
    });
  }

  test('explicitly ungrouping survives reload', () async {
    final state = await seed(groupId: 'a');
    await state.moveHistory('image-0', null);
    expect((await reopen()).history.single.groupId, isNull);
  });

  test('rename and delete do not restore old folder groups', () async {
    final state = await seed(groupId: 'a');
    await state.renameGroup('a', 'Renamed');
    final renamed = await reopen();
    expect(renamed.history.single.groupId, 'a');
    expect(renamed.groups.first.name, 'Renamed');
    await renamed.deleteGroup('a');
    final deleted = await reopen();
    expect(deleted.history.single.groupId, isNull);
    expect(deleted.groups.map((g) => g.id), ['test']);
  });

  test('large-library isolate encoding preserves assignments on reload',
      () async {
    final state = await seed(count: 250);
    await state.moveHistory('image-0', 'test');
    await state.moveHistory('image-249', 'a');
    final loaded = await reopen();
    expect(loaded.history.length, 250);
    expect(loaded.history.first.groupId, 'test');
    expect(loaded.history.last.groupId, 'a');
    expect(loaded.history[1].groupId, isNull);
  });
}
