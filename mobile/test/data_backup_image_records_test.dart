import 'dart:convert';
import 'dart:io';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:crypto/crypto.dart';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _BackupPathProvider extends PathProviderPlatform {
  final String root;
  _BackupPathProvider(this.root);

  @override
  Future<String?> getApplicationDocumentsPath() async => root;

  @override
  Future<String?> getTemporaryPath() async => root;
}

class _BackupStorage extends Storage {
  @override
  Future<String?> getToken() async => '';
  @override
  Future<String?> getVisionKey() async => '';
  @override
  Future<String?> getConvertKey() async => '';
  @override
  Future<String?> getAgentApiKey() async => '';
  @override
  Future<String?> getTagKey() async => '';
  @override
  Future<String?> getBaiduSecret() async => '';

  @override
  Future<void> setToken(String value) async {}
  @override
  Future<void> setVisionKey(String value) async {}
  @override
  Future<void> setConvertKey(String value) async {}
  @override
  Future<void> setAgentApiKey(String value) async {}
  @override
  Future<void> setTagKey(String value) async {}
  @override
  Future<void> setBaiduSecret(String value) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late _BackupStorage storage;
  late DataBackupService service;
  const supplied = String.fromEnvironment('NATIVE_IMAGE_RECORDS_BACKUP');
  final capsule = File(supplied.isEmpty
      ? 'test/fixtures/native_image_records.naisbackup'
      : supplied);
  setUp(() {
    root = Directory.systemTemp.createTempSync('image-records-test-');
    PathProviderPlatform.instance = _BackupPathProvider(root.path);
    SharedPreferences.setMockInitialValues({});
    storage = _BackupStorage();
    service = DataBackupService(storage);
  });
  tearDown(() {
    if (root.existsSync()) root.deleteSync(recursive: true);
  });
  Future<Map<String, dynamic>> input(
      [void Function(Map<String, dynamic>)? change]) async {
    final zip = ZipDecoder().decodeBytes(capsule.readAsBytesSync());
    final entry =
        zip.files.singleWhere((v) => v.name == 'data/image-history.json');
    final data = jsonDecode(utf8.decode(entry.content as List<int>))
        as Map<String, dynamic>;
    change?.call(data);
    final output = Archive();
    for (final v in zip.files) {
      if (!v.isFile) continue;
      final bytes = v.name == entry.name
          ? utf8.encode(jsonEncode(data))
          : v.content as List<int>;
      output.addFile(ArchiveFile(v.name, bytes.length, bytes));
    }
    final target = File('${root.path}/fixed-input.naisbackup')
      ..writeAsBytesSync(ZipEncoder().encode(output)!);
    return {'file': target.path, 'data': data};
  }

  Future<void> restore(Map<String, dynamic> v) async {
    await service.importBackup(
        v['file'] as String, {DataBackupCategory.imageHistory},
        confirmConfigurationOverwrite: false);
  }

  Map<String, dynamic> shape(Map<String, dynamic> v) => {
        for (final k in [
          'date',
          'createdAt',
          'seed',
          'model',
          'width',
          'height',
          'prompt',
          'feature',
          'params',
          'groupId'
        ])
          k: v[k]
      };
  test(
      'restores both complete native exported generation records and repeats without duplicating',
      () async {
    final v = await input();
    await restore(v);
    final rows = await storage.getHistory();
    final data = v['data'] as Map<String, dynamic>;
    final actual = rows.map((e) => shape(e.toJson())).toList()
      ..sort((a, b) => (a['seed'] as int).compareTo(b['seed'] as int));
    final expected = (data['items'] as List)
        .map((e) => shape(Map<String, dynamic>.from(e as Map)))
        .toList()
      ..sort((a, b) => (a['seed'] as int).compareTo(b['seed'] as int));
    expect(actual, expected);
    expect(rows.map((e) => e.filePath).toSet(), hasLength(2));
    for (final row in rows)
      expect(sha256.convert(File(row.filePath).readAsBytesSync()).toString(),
          '6f800ec89b639e174fdcd89e75f3e5cd42e0ed108fdc9654b58f57cbdcf2ef05');
    await restore(v);
    expect(await storage.getHistory(), hasLength(2));
  });
  test(
      'same asset and identical metadata with a new source ID remain one record',
      () async {
    final v = await input((d) {
      final items = d['items'] as List;
      items[1] = {...items[0] as Map, 'id': 'other-id'};
    });
    await restore(v);
    expect(await storage.getHistory(), hasLength(1));
    await restore(v);
    expect(await storage.getHistory(), hasLength(1));
  });
  test(
      'same source ID and pixels with changed metadata preserve two unique local IDs',
      () async {
    final v = await input((d) {
      final items = d['items'] as List;
      items[1]['id'] = items[0]['id'];
    });
    await restore(v);
    final rows = await storage.getHistory();
    expect(rows, hasLength(2));
    expect(rows.map((v) => v.id).toSet(), hasLength(2));
    await restore(v);
    expect(await storage.getHistory(), hasLength(2));
  });
  test('a changed actual seed alone is a distinct record', () async {
    final v = await input((d) {
      final items = d['items'] as List;
      items[1] = {
        ...items[0] as Map,
        'id': 'seed-only',
        'actualSeed': 17,
        'seed': 17
      };
    });
    await restore(v);
    expect((await storage.getHistory()).map((v) => v.seed), [7, 17]);
  });
  test(
      'parameter key ordering and remapped group IDs do not defeat de-duplication',
      () async {
    final v = await input((d) {
      d['items'] = (d['items'] as List).take(1).toList();
    });
    await restore(v);
    final groups = (await storage.getGroups()).map((v) => v.toJson()).toList();
    groups[0]['id'] = 'local-group';
    await storage.writeGroups(groups.map(HistoryGroup.fromJson).toList());
    final rows = (await storage.getHistory()).map((v) => v.toJson()).toList();
    rows[0]['groupId'] = 'local-group';
    rows[0]['params'] = Map.fromEntries(
        (rows[0]['params'] as Map<String, dynamic>).entries.toList().reversed);
    await storage.writeHistory(rows.map(HistoryItem.fromJson).toList());
    await restore(v);
    expect(await storage.getHistory(), hasLength(1));
  });
  test('legacy omitted timestamps remain repeat-importable without duplicates',
      () async {
    final v = await input((d) {
      d['items'] = (d['items'] as List).take(1).toList();
      final item = (d['items'] as List).single as Map;
      item.remove('date');
      item.remove('createdAt');
    });
    await restore(v);
    await restore(v);
    expect(await storage.getHistory(), hasLength(1));
  });
}
