import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as path;
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/agent/history_exports.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';

class DiskHistory extends Storage {
  final Directory root;
  bool fail = false;
  Completer<void>? gate;
  DiskHistory(this.root);
  @override
  Future<List<HistoryItem>> getHistory() async => (jsonDecode(
              await File(path.join(root.path, 'history.json')).readAsString())
          as List)
      .map((x) => HistoryItem.fromJson(Map<String, dynamic>.from(x)))
      .toList();
  @override
  Future<void> writeHistory(List<HistoryItem> items) async {
    if (fail) throw StateError('synthetic persist failure');
    await File(path.join(root.path, 'history.json')).writeAsString(
        jsonEncode(items.map((x) => x.toJson()).toList()),
        flush: true);
  }

  @override
  Future<HistoryItem> renameHistoryFile(HistoryItem item, String name) async {
    await gate?.future;
    return super.renameHistoryFile(item, name);
  }
}

HistoryItem row(String id, String file, {String? group}) => HistoryItem(
    id: id,
    filePath: file,
    date: '2026-09-28',
    createdAt: '2026-09-28',
    seed: 0,
    model: 'fixture',
    width: 2,
    height: 3,
    prompt: 'synthetic',
    groupId: group,
    params: {'apiKey': 'not-exported'});
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late DiskHistory storage;
  late AppState app;
  late SoftwareActions service;
  final shared = <String>[];
  HistoryExports exports() => HistoryExports(
      root: () async => Directory(path.join(root.path, 'exports')),
      open: (file) async {
        shared.add(file.path);
      });
  setUp(() async {
    root = await Directory.systemTemp.createTemp('studio-history-agent-');
    storage = DiskHistory(root);
    await storage.writeHistory([]);
    app = AppState(storage: storage);
    service = SoftwareActions(app, exports: exports());
    shared.clear();
  });
  tearDown(() async {
    app.dispose();
    await root.delete(recursive: true);
  });
  Future<String> add(String id, {String? group}) async {
    final file = File(path.join(root.path, '$id.png'));
    await file.writeAsString('original metadata $id');
    app.history.add(row(id, file.path, group: group));
    await storage.writeHistory(app.history);
    return file.path;
  }

  Future<Map<String, dynamic>> call(Map<String, dynamic> args) =>
      service.execute('langbai_software_action', args);
  test('Agent rename persists the real new path and rejects stale replay',
      () async {
    final source = await add('rename'),
        state = await call({'action': 'history.items.list'});
    final args = {
      'action': 'history.items.rename',
      'id': 'rename',
      'name': 'Evening',
      'expectedRevision': state['revision']
    };
    final reply = await call(args);
    expect(reply['result']['filePath'], path.join(root.path, 'Evening.png'));
    expect(File(source).existsSync(), false);
    expect(File(app.history.single.filePath).readAsStringSync(),
        'original metadata rename');
    expect((await storage.getHistory()).single.filePath,
        app.history.single.filePath);
    await expectLater(call(args), throwsStateError);
  });
  test('rename retains shared files and avoids existing targets', () async {
    final source = await add('shared');
    app.history.add(row('second', source));
    await storage.writeHistory(app.history);
    await File(path.join(root.path, 'New.png')).writeAsString('occupied');
    await app.renameHistory('shared', 'New');
    expect(File(source).readAsStringSync(), 'original metadata shared');
    expect(
        File(path.join(root.path, 'New.png')).readAsStringSync(), 'occupied');
    expect(path.basename(app.history.first.filePath), 'New-2.png');
  });
  test('persistence failure keeps the old record, current image and source',
      () async {
    final source = await add('fail');
    app.current = app.history.single;
    storage.fail = true;
    await expectLater(app.renameHistory('fail', 'Changed'), throwsStateError);
    expect(app.history.single.filePath, source);
    expect(app.current?.filePath, source);
    expect(File(source).existsSync(), true);
    expect(File(path.join(root.path, 'Changed.png')).existsSync(), false);
    expect((await storage.getHistory()).single.filePath, source);
  });
  test(
      'insertion while rename waits does not overwrite another row; delete is excluded',
      () async {
    await add('one');
    storage.gate = Completer<void>();
    final pending = app.renameHistory('one', 'New');
    await Future<void>.delayed(Duration.zero);
    await expectLater(app.deleteHistory('one'), throwsStateError);
    final newer = File(path.join(root.path, 'newer.png'))
      ..writeAsStringSync('newer');
    app.history.insert(0, row('newer', newer.path));
    storage.gate!.complete();
    await pending;
    expect(app.history.first.id, 'newer');
    expect(app.history.first.filePath, newer.path);
    expect(path.basename(app.history.last.filePath), 'New.png');
    expect((await storage.getHistory()).map((x) => x.id), ['newer', 'one']);
  });
  test(
      'group export has correct CRC, original bytes and durable receipts, and shares only a verified ID',
      () async {
    app.groups.add(
        const HistoryGroup(id: 'g', name: 'Group', createdAt: '2026-09-28'));
    await add('in', group: 'g');
    await add('out');
    final before = await call({'action': 'history.items.list'});
    final reply = await call({
          'action': 'history.groups.export',
          'group': 'g',
          'expectedRevision': before['revision']
        }),
        receipt = Map<String, dynamic>.from(reply['result']);
    final bytes = await File(receipt['filePath']).readAsBytes();
    expect(sha256.convert(bytes).toString(), receipt['sha256']);
    expect(receipt['count'], 1);
    final zip = ZipDecoder().decodeBytes(bytes, verify: true);
    final images = zip.where((x) => x.name.endsWith('.png')).toList();
    expect(images.length, 1);
    expect(utf8.decode(images.single.content as List<int>),
        'original metadata in');
    expect(utf8.decode(zip.findFile('project.json')!.content as List<int>),
        isNot(contains('not-exported')));
    service = SoftwareActions(app, exports: exports());
    final list = await call({'action': 'history.exports.list'});
    expect(list['readback'].single['id'], receipt['id']);
    final opened = await call({
      'action': 'history.exports.open',
      'id': receipt['id'],
      'expectedRevision': list['revision']
    });
    expect(opened['result']['opened'], true);
    expect(shared, [receipt['filePath']]);
    await File(receipt['filePath']).writeAsString('corrupted');
    final changed = await call({'action': 'history.exports.list'});
    await expectLater(
        call({
          'action': 'history.exports.open',
          'id': receipt['id'],
          'expectedRevision': changed['revision']
        }),
        throwsStateError);
    expect(shared.length, 1);
  });
  test('missing source never creates a partial successful export', () async {
    final file = await add('missing');
    await File(file).delete();
    final state = await call({'action': 'history.items.list'});
    await expectLater(
        call({
          'action': 'history.groups.export',
          'group': '',
          'expectedRevision': state['revision']
        }),
        throwsStateError);
    expect((await call({'action': 'history.exports.list'}))['total'], 0);
  });
  test(
      'actual HTTP bridge performs ordinary rename once without approval, and journal replay is idempotent',
      () async {
    HttpOverrides.global = null;
    await add('http');
    var executions = 0;
    final bridge = LocalAgentBridge(
        journal: Directory(path.join(root.path, 'journal')),
        execute: (tool, args) async {
          if (args['action'] == 'history.items.rename') executions++;
          return AgentToolResult(
              ok: true,
              title: 'history',
              output: jsonEncode(await service.execute(tool, args)));
        });
    final client = HttpClient();
    await bridge.start();
    Future<Map<String, dynamic>> http(
        String tool, Map<String, dynamic> args, String id) async {
      final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      req.headers.set('Authorization', 'Bearer ${bridge.token}');
      req.write(jsonEncode(
          {'tool': tool, 'args': args, 'sessionId': 'history', 'callId': id}));
      final res = await req.close();
      return Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(res).join()));
    }

    try {
      final state = await http(
          'langbai_software_action', {'action': 'history.items.list'}, 'read');
      final args = {
        'action': 'history.items.rename',
        'id': 'http',
        'name': 'HTTP',
        'expectedRevision': state['data']['revision']
      };
      final response = await http('langbai_software_action', args, 'rename');
      expect(response['ok'], true);
      expect(
          (await http('langbai_software_action', args, 'rename'))['ok'], true);
      expect(executions, 1);
      expect(
          (await http('studio_image_approval', {}, 'approval'))['data'], null);
    } finally {
      client.close(force: true);
      await bridge.close();
    }
  });
}
