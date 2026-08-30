import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
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
  Future<void> setTagKey(String value) async {}
  @override
  Future<void> setBaiduSecret(String value) async {}
}

HistoryItem _item(String id, String path, int seed) => HistoryItem(
      id: id,
      filePath: path,
      date: '2026-08-30',
      createdAt: '2026-08-30T12:00:00.000Z',
      seed: seed,
      model: 'nai-diffusion-5-full',
      width: 832,
      height: 1216,
      prompt: 'test',
      params: GenerateParams(seed: seed).toJson(),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late _BackupStorage storage;
  late DataBackupService service;

  setUp(() {
    root = Directory.systemTemp.createTempSync('data-backup-test-');
    PathProviderPlatform.instance = _BackupPathProvider(root.path);
    SharedPreferences.setMockInitialValues({});
    storage = _BackupStorage();
    service = DataBackupService(storage);
  });

  tearDown(() {
    if (root.existsSync()) root.deleteSync(recursive: true);
  });

  test('creates and inspects the shared versioned archive', () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('batch_redraw_project_v1', jsonEncode({'name': 'A'}));
    await storage.setSettings(AppSettings(theme: 'dark'));
    await storage.setParams(GenerateParams(seed: 42, seedMode: 'fixed'));

    final file = await service.createBackup({
      DataBackupCategory.configuration,
      DataBackupCategory.workspaceData,
    });
    final inspection = await service.inspect(file.path);

    expect(file.existsSync(), isTrue);
    expect(inspection.sourcePlatform, isNotEmpty);
    expect(
      inspection.categories.map((item) => item.category),
      containsAll([
        DataBackupCategory.configuration,
        DataBackupCategory.workspaceData,
      ]),
    );
  });

  test('skips identical image bytes and suffixes same-name different bytes',
      () async {
    final sourceA = Directory('${root.path}/source-a')..createSync();
    final sourceB = Directory('${root.path}/source-b')..createSync();
    final first = File('${sourceA.path}/same.png')..writeAsBytesSync([1, 2, 3]);
    final second = File('${sourceB.path}/same.png')
      ..writeAsBytesSync([4, 5, 6]);
    await storage.writeHistory([
      _item('source-1', first.path, 1),
      _item('source-2', second.path, 2),
    ]);
    final archive =
        await service.createBackup({DataBackupCategory.imageHistory});

    final destination = Directory('${root.path}/images/2026-08-30')
      ..createSync(recursive: true);
    final existing = File('${destination.path}/same.png')
      ..writeAsBytesSync([1, 2, 3]);
    await storage.writeHistory([_item('existing', existing.path, 9)]);

    final report = await service.importBackup(
      archive.path,
      {DataBackupCategory.imageHistory},
      confirmConfigurationOverwrite: false,
    );
    final restored = await storage.getHistory();

    expect(report.skipped, greaterThanOrEqualTo(1));
    expect(report.renamed, 1);
    expect(
        File('${destination.path}/same (1).png').readAsBytesSync(), [4, 5, 6]);
    expect(restored.length, 2);
    expect(File(report.rescueBackupPath).existsSync(), isTrue);
  });

  test('exports mobile artist favorites in the shared flattened shape',
      () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'artist_lab_random_v1_favorites',
      jsonEncode([
        {
          'recipe': {
            'id': 'mobile-favorite',
            'pairId': 'mobile-pair',
            'variant': 'plain',
            'prompt': '0.42::artist:foo_bar ::,',
            'basePrompt': '0.42::artist:foo_bar ::,',
            'artistPrompt': '0.42::artist:foo_bar ::,',
            'artists': ['foo_bar'],
            'mutations': [],
            'franchiseStyles': [],
          },
          'sequence': 3,
          'seed': 123,
          'status': 'done',
          'liked': true,
        }
      ]),
    );

    final file = await service.createBackup(
      {DataBackupCategory.artistLibrary},
      includeAssets: false,
    );
    final archive =
        ZipDecoder().decodeBytes(await file.readAsBytes(), verify: true);
    final payload = jsonDecode(utf8.decode(List<int>.from(
      archive.findFile('data/artist-library.json')!.content as List,
    ))) as Map<String, dynamic>;
    final favorite = ((payload['collections'] as Map)['random'] as List).single
        as Map<String, dynamic>;

    expect(favorite['id'], 'mobile-favorite');
    expect(favorite['pairId'], 'mobile-pair');
    expect(favorite['generationSeed'], 123);
    expect((favorite['artists'] as List).single,
        {'name': 'foo_bar', 'weight': 0.42});
  });

  test('imports a desktop artist favorite into the mobile nested shape',
      () async {
    final archive = Archive();
    void addJson(String name, Object value) {
      final bytes = utf8.encode(jsonEncode(value));
      archive.addFile(ArchiveFile(name, bytes.length, bytes));
    }

    addJson('manifest.json', {
      'format': DataBackupService.format,
      'version': DataBackupService.formatVersion,
      'createdAt': '2026-08-30T12:00:00.000Z',
      'source': {'platform': 'win32', 'appVersion': 'test'},
      'categories': [
        {'category': 'artistLibrary', 'items': 1, 'bytes': 0}
      ],
    });
    addJson('data/artist-library.json', {
      'version': 1,
      'collections': {
        'random': [
          {
            'id': 'desktop-favorite',
            'pairId': 'desktop-pair',
            'variant': 'plain',
            'prompt': '0.75::artist:desktop_artist ::,',
            'basePrompt': '0.75::artist:desktop_artist ::,',
            'artists': [
              {'name': 'desktop_artist', 'weight': 0.75}
            ],
            'auxiliary': [],
            'mutations': [],
            'franchiseStyles': [],
            'sequence': 4,
            'status': 'done',
            'generationSeed': 456,
            'liked': true,
          }
        ],
        'v5-repair': [],
        'artist-string-draw': [],
      },
    });
    final encoded = ZipEncoder().encode(archive)!;
    final file = File('${root.path}/desktop.naisbackup')
      ..writeAsBytesSync(encoded);

    final report = await service.importBackup(
      file.path,
      {DataBackupCategory.artistLibrary},
      confirmConfigurationOverwrite: false,
    );
    final prefs = await SharedPreferences.getInstance();
    final favorite = (jsonDecode(
      prefs.getString('artist_lab_random_v1_favorites')!,
    ) as List)
        .single as Map<String, dynamic>;
    final recipe = Map<String, dynamic>.from(favorite['recipe'] as Map);

    expect(report.imported, greaterThanOrEqualTo(1));
    expect(recipe['id'], 'desktop-favorite');
    expect(recipe['artists'], ['desktop_artist']);
    expect(recipe['artistPrompt'], '0.75::artist:desktop_artist ::');
    expect(favorite['seed'], 456);
  });
}
