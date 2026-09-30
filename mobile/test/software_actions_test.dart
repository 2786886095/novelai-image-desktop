import 'package:novelai_mobile/agent/batch_actions.dart';
import 'package:novelai_mobile/agent/comic_actions.dart';
import 'package:novelai_mobile/agent/collection_actions.dart';
import 'package:novelai_mobile/agent/resource_actions.dart';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/agent/software_action_catalog.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class TestStorage extends Storage {
  final Directory root;
  TestStorage(this.root);
  Future<void> save(String name, Object data) async {
    await File('${root.path}/$name.json')
        .writeAsString(jsonEncode(data), flush: true);
  }

  @override
  Future<void> writeGroups(List<HistoryGroup> value) =>
      save('groups', value.map((x) => x.toJson()).toList());
  @override
  Future<void> writeHistory(List<HistoryItem> value) =>
      save('history', value.map((x) => x.toJson()).toList());
  @override
  Future<void> setReferencePresetLibrary(ReferencePresetLibrary value) =>
      save('references', value.toJson());
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late AppState app;
  late SoftwareActions service;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('studio-actions-mobile-');
    app = AppState(storage: TestStorage(dir));
    service = SoftwareActions(app);
  });
  tearDown(() {
    app.dispose();
    dir.deleteSync(recursive: true);
  });
  Future<Map<String, dynamic>> call(Map<String, dynamic> args) =>
      service.execute('langbai_software_action', args);
  test('live AppState mutations persist, read back and reject stale revisions',
      () async {
    var r = await call({'action': 'history.groups.list'});
    final old = r['revision'];
    r = await call({
      'action': 'history.groups.create',
      'name': 'Mobile',
      'expectedRevision': old
    });
    final id = r['readback'][0]['id'];
    expect(r['executed'], true);
    expect(app.groups.single.name, 'Mobile');
    expect(await File('${dir.path}/groups.json').readAsString(),
        contains('Mobile'));
    await expectLater(
        call({
          'action': 'history.groups.rename',
          'id': id,
          'name': 'bad',
          'expectedRevision': old
        }),
        throwsStateError);
    r = await call({
      'action': 'history.groups.rename',
      'id': id,
      'name': 'Renamed',
      'expectedRevision': r['revision']
    });
    expect(r['readback'][0]['name'], 'Renamed');
    r = await call({
      'action': 'history.groups.delete',
      'id': id,
      'expectedRevision': r['revision']
    });
    expect(r['total'], 0);
    expect(
        jsonDecode(await File('${dir.path}/groups.json').readAsString()), []);
  });
  test('reference group readback exposes names and persists', () async {
    var r = await call({'action': 'references.groups.list'});
    r = await call({
      'action': 'references.groups.create',
      'name': 'Mobile refs',
      'expectedRevision': r['revision']
    });
    expect(r['readback'], ['Mobile refs']);
    expect(
        jsonDecode(
            await File('${dir.path}/references.json').readAsString())['groups'],
        ['Mobile refs']);
    r = await call({
      'action': 'references.groups.delete',
      'name': 'Mobile refs',
      'expectedRevision': r['revision']
    });
    expect(r['total'], 0);
  });
  test(
      'only catalog actions accepted; paging bounded; no model-supplied confirmation',
      () async {
    expect(
        (await service.execute('langbai_software_capabilities', {}))['actions'],
        {
          ...softwareActionCatalog,
          ...resourceActionCatalog,
          ...collectionActionCatalog,
          ...comicActionCatalog,
          ...batchActionCatalog
        });
    await expectLater(call({'action': 'shell.exec'}), throwsStateError);
    await expectLater(
        call({'action': 'history.items.list', 'limit': 51}), throwsStateError);
    await expectLater(
        call({
          'action': 'history.groups.delete',
          'id': 'x',
          'expectedRevision': 'old',
          'confirmed': true
        }),
        throwsStateError);
  });
}
