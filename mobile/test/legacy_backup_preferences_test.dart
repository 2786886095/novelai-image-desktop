import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/legacy_backup_preferences.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Paths extends PathProviderPlatform {
  _Paths(this.root);
  final String root;
  @override Future<String?> getApplicationDocumentsPath() async => root;
  @override Future<String?> getTemporaryPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('legacy snapshot makes a normal importable backup without using live prefs', () async {
    final root = await Directory.systemTemp.createTemp('snapshot-backup-test-');
    addTearDown(() => root.delete(recursive: true));
    PathProviderPlatform.instance = _Paths(root.path);
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({'fixture_motto':'live'});
    final supplied = Platform.environment['STUDIO_BACKUP_SNAPSHOT_FIXTURE'];
    final fixture = supplied == null
        ? await Directory('${root.path}/fixture').create()
        : Directory(supplied);
    if (supplied == null) {
      await File('${fixture.path}/index.tsv').writeAsString(
          'app_settings\tstring\tvalue-0\nhistory_index_v2\toversized\t\n'
          'fixture_motto\tstring\tvalue-2\nfixture_enabled\tboolean\ttrue\n');
      await File('${fixture.path}/value-0').writeAsString('{"language":"ja-JP"}');
      await File('${fixture.path}/value-2').writeAsString('画师 & notes <a>');
    }
    final snapshot = await LegacyBackupPreferences.open(fixture);
    final storage = Storage();
    final service = DataBackupService(storage);
    const requested = {DataBackupCategory.configuration, DataBackupCategory.workspaceData};
    final backup = await UnifiedStorage.withBackupSnapshot(snapshot, () async {
      expect((await storage.getSettings()).language, 'ja-JP');
      final prefs = await UnifiedStorage.preferences();
      await expectLater(prefs.setString('fixture_motto', 'never written'), throwsStateError);
      await expectLater(service.createBackup({DataBackupCategory.imageHistory},
          lowMemory: true, includeAssets: false),
          throwsA(isA<LegacyBackupValueUnavailable>()
              .having((e) => e.scope, 'scope', 'history')));
      return service.createBackup(requested, lowMemory: true, includeAssets: false);
    });
    final inspected = await service.inspect(backup.path);
    expect(inspected.categories.map((x) => x.category).toSet(), requested);
    final originalLive = await SharedPreferences.getInstance();
    expect(originalLive.getString('fixture_motto'), 'live');
    final zip = ZipDecoder().decodeBytes(await backup.readAsBytes());
    final workspace = jsonDecode(utf8.decode(zip.findFile('data/mobile-state.json')!.content)) as Map;
    expect(workspace['fixture_motto'], '画师 & notes <a>');
    expect(workspace['fixture_enabled'], true);
    expect(workspace, isNot(contains('history_index_v2')));
    await originalLive.remove('fixture_motto'); // Restore into a fresh workspace.
    final restored = await service.importBackup(backup.path, requested,
        confirmConfigurationOverwrite: true);
    expect(restored.imported, greaterThan(0));
    expect((await storage.getSettings()).language, 'ja-JP');
    expect(originalLive.getString('fixture_motto'), '画师 & notes <a>');
    stdout.writeln('ROUNDTRIP: legacy selected settings and workspace restored; oversized selected history refused; live settings untouched until explicit import');
  });
}
