// ignore_for_file: avoid_print, prefer_interpolation_to_compose_strings
// Production history-cache race regression; host prefs fixture only.
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';

HistoryItem item(String id, {String prompt = 'p'}) => HistoryItem(
    id: id,
    filePath: '$id.png',
    date: '2026-10-17',
    createdAt: '2026-10-17T00:00:00Z',
    seed: 1,
    model: 'nai-diffusion-5-full',
    width: 64,
    height: 64,
    prompt: prompt);
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'old async history read must not rewind same-instance cache after a newer commit',
      () async {
    final large = jsonEncode(List.generate(
        12000, (i) => item('old-$i', prompt: 'x' * 400).toJson()));
    SharedPreferences.setMockInitialValues({'history_index_v2': large});
    UnifiedStorage.active = null;
    final storage = Storage(), pending = storage.getHistory();
    await Future<void>.delayed(Duration.zero);
    await storage.writeHistory([item('newly-saved')]);
    final old = await pending;
    final cache = await storage.getHistory();
    await storage.mutateHistory((rows) => rows..add(item('next-saved')));
    final disk = await Storage().getHistory();
    print('HISTORY_READ_RACE=' +
        jsonEncode({
          'oldReadCount': old.length,
          'cacheContainsNew': cache.any((h) => h.id == 'newly-saved'),
          'diskContainsNew': disk.any((h) => h.id == 'newly-saved'),
          'diskCount': disk.length
        }));
    expect(disk.any((h) => h.id == 'newly-saved'), true,
        reason:
            'A completed stale read must not erase an already committed item on the next mutation');
    expect(cache.any((h) => h.id == 'newly-saved'), true);
    expect(disk.map((h) => h.id).toSet(), {'newly-saved', 'next-saved'});
  });
  test(
      'failed old isolate decode must not empty the same-instance committed cache',
      () async {
    final valid = jsonEncode(List.generate(
        12000, (i) => item('old-$i', prompt: 'x' * 400).toJson()));
    SharedPreferences.setMockInitialValues(
        {'history_index_v2': valid.substring(0, valid.length - 1)});
    UnifiedStorage.active = null;
    final storage = Storage(), pending = storage.getHistory();
    await Future<void>.delayed(Duration.zero);
    await storage.writeHistory([item('newly-saved')]);
    await pending;
    final cache = await storage.getHistory();
    await storage.mutateHistory((rows) => rows..add(item('next-saved')));
    final disk = await Storage().getHistory();
    print('HISTORY_FAILED_READ_RACE=' +
        jsonEncode({
          'cacheContainsNew': cache.any((h) => h.id == 'newly-saved'),
          'diskContainsNew': disk.any((h) => h.id == 'newly-saved'),
          'diskCount': disk.length
        }));
    expect(cache.map((h) => h.id).toSet(), {'newly-saved'});
    expect(disk.map((h) => h.id).toSet(), {'newly-saved', 'next-saved'});
  });
  for (final corrupt in [false, true]) {
    test(
        'stale ${corrupt ? 'failed' : 'successful'} isolate read cannot clear a different instance commit',
        () async {
      final valid = jsonEncode(List.generate(
          12000, (i) => item('old-$i', prompt: 'x' * 400).toJson()));
      final large = corrupt ? valid.substring(0, valid.length - 1) : valid;
      SharedPreferences.setMockInitialValues({'history_index_v2': large});
      UnifiedStorage.active = null;
      final reader = Storage(),
          writer = Storage(),
          pending = reader.getHistory();
      await Future<void>.delayed(Duration.zero);
      await writer.writeHistory([item('newly-saved')]);
      await pending;
      final cache = await reader.getHistory();
      await reader.mutateHistory((rows) => rows..add(item('next-saved')));
      final disk = await Storage().getHistory();
      print('HISTORY_CROSS_INSTANCE_RACE=' +
          jsonEncode({
            'corruptOldSnapshot': corrupt,
            'cacheContainsNew': cache.any((h) => h.id == 'newly-saved'),
            'diskContainsNew': disk.any((h) => h.id == 'newly-saved'),
            'diskCount': disk.length
          }));
      expect(cache.map((h) => h.id).toSet(), {'newly-saved'});
      expect(disk.map((h) => h.id).toSet(), {'newly-saved', 'next-saved'});
    });
  }
}
