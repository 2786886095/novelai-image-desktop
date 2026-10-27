import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/template_library.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Paths extends PathProviderPlatform {
  final String path;
  _Paths(this.path);
  @override
  Future<String?> getApplicationDocumentsPath() async => path;
  @override
  Future<String?> getApplicationSupportPath() async => path;
  @override
  Future<String?> getTemporaryPath() async => path;
}

class _Storage extends Storage {
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
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late MobileTemplateLibrary library;
  late DataBackupService service;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('template-library-backup-');
    PathProviderPlatform.instance = _Paths(dir.path);
    SharedPreferences.setMockInitialValues({});
    library = MobileTemplateLibrary(directoryProvider: () async => dir);
    await library.load();
    service = DataBackupService(_Storage(), templateLibrary: library);
  });
  tearDown(() async {
    library.dispose();
    await dir.delete(recursive: true);
  });
  test(
      'real backup contains exact library bytes, restores custom copies and creates rescue',
      () async {
    await library.create(
        slot: 'comic.jp-page',
        name: 'My pages',
        body: 'exact custom {{input}}',
        activate: true);
    final raw = await library.backupRaw();
    final backup = await service
        .createBackup({DataBackupCategory.promptPresets}, includeAssets: false);
    final archive =
        ZipDecoder().decodeBytes(await backup.readAsBytes(), verify: true);
    expect(archive.findFile('data/prompt-template-library.json')!.content, raw);
    await (await library.file).delete();
    // A new app/library instance models restoring into a fresh installation.
    // The running instance deliberately fails closed if its known file vanishes.
    library.dispose();
    library = MobileTemplateLibrary(directoryProvider: () async => dir);
    await library.load();
    service = DataBackupService(_Storage(), templateLibrary: library);
    expect(library.custom, isEmpty);
    final report = await service.importBackup(
        backup.path, {DataBackupCategory.promptPresets},
        confirmConfigurationOverwrite: false);
    expect(library.custom.single.body, 'exact custom {{input}}');
    expect(library.resolve('comic.jp-page').source, 'custom');
    expect(File(report.rescueBackupPath).existsSync(), isTrue);
  });
  test(
      'rescue backup preserves a corrupt library verbatim without silently repairing it',
      () async {
    final bad = utf8.encode('{invalid but recoverable bytes');
    await (await library.file).writeAsBytes(bad);
    await library.load();
    final backup = await service
        .createBackup({DataBackupCategory.promptPresets}, includeAssets: false);
    final archive =
        ZipDecoder().decodeBytes(await backup.readAsBytes(), verify: true);
    expect(archive.findFile('data/prompt-template-library.json')!.content, bad);
    await expectLater(
        service.importBackup(backup.path, {DataBackupCategory.promptPresets},
            confirmConfigurationOverwrite: false),
        throwsA(isA<FormatException>()));
    expect(await (await library.file).readAsBytes(), bad);
    expect(library.readOnly, isTrue);
  });
  test(
      'Japanese project and composer typed prefs survive backup without replacing existing comic keys',
      () async {
    final prefs = await SharedPreferences.getInstance();
    const keys = [
      'japanese_comic_project_v1',
      'japanese_comic_project_backup_v1',
      'japanese_comic_run_v1',
      'comic_prompt_draft_japanese_v1',
      'comic_prompt_draft_convert_v1'
    ];
    for (final key in keys) {
      await prefs.setString(key, 'payload:$key');
    }
    await prefs.setString('comic_project_v2', 'old project');
    final backup = await service
        .createBackup({DataBackupCategory.workspaceData}, includeAssets: false);
    for (final key in keys) {
      await prefs.remove(key);
    }
    await prefs.setString('comic_project_v2', 'current protected project');
    await service.importBackup(backup.path, {DataBackupCategory.workspaceData},
        confirmConfigurationOverwrite: false);
    for (final key in keys) {
      expect(prefs.getString(key), 'payload:$key');
    }
    expect(prefs.getString('comic_project_v2'), 'current protected project');
  });
}
