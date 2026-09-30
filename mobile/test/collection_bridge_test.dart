import 'dart:convert';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/collection_actions.dart';
import 'package:novelai_mobile/agent/software_actions.dart';
import 'package:novelai_mobile/services/gallery_favorites.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('plugins.flutter.io/shared_preferences');
  late Directory root;
  late File disk;
  late GalleryFavoritesStore store;
  late AppState app;
  late SoftwareActions actions;
  var fail = false;
  final item = {
    'source': 'danbooru',
    'id': '123',
    'title': 'fixture',
    'images': <dynamic>[]
  };
  setUp(() async {
    HttpOverrides.global = null;
    SharedPreferences.resetStatic();
    fail = false;
    root = await Directory.systemTemp.createTemp('agent-collection-bridge-');
    disk = File('${root.path}/prefs.json');
    await disk.writeAsString(jsonEncode({'flutter.unrelated': 'retained'}));
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      final values =
          Map<String, dynamic>.from(jsonDecode(await disk.readAsString()));
      if (call.method.startsWith('getAll')) return values;
      if (call.method == 'setString') {
        if (fail) return false;
        values[call.arguments['key']] = call.arguments['value'];
        await disk.writeAsString(jsonEncode(values), flush: true);
        return true;
      }
      throw StateError('Unexpected preferences call ${call.method}');
    });
    store = GalleryFavoritesStore();
    app = AppState();
    actions =
        SoftwareActions(app, collections: CollectionActions(store: store));
  });
  tearDown(() async {
    app.dispose();
    store.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    SharedPreferences.resetStatic();
    await root.delete(recursive: true);
  });
  Future<Map<String, dynamic>> execute(Map<String, dynamic> args) =>
      actions.execute('langbai_software_action', args);
  test(
      'failed platform write does not become a phantom saved bookmark on next read',
      () async {
    final before = await execute({'action': 'favorites.online.list'});
    fail = true;
    await expectLater(
        execute({
          'action': 'favorites.online.add',
          'item': item,
          'expectedRevision': before['revision']
        }),
        throwsStateError);
    expect(store.items, isEmpty);
    final reopened = GalleryFavoritesStore();
    await reopened.load();
    expect(reopened.items, isEmpty);
    reopened.dispose();
    expect((await execute({'action': 'favorites.online.list'}))['total'], 0);
    expect(await disk.readAsString(), isNot(contains('danbooru')));
    fail = false;
    expect(
        (await execute({
          'action': 'favorites.online.add',
          'item': item,
          'expectedRevision': before['revision']
        }))['total'],
        1);
  });
  test(
      'external persisted edits refresh UI and invalidate stale Agent revisions',
      () async {
    final before = await execute({'action': 'favorites.online.list'});
    var updates = 0;
    store.addListener(() => updates++);
    final values = jsonDecode(await disk.readAsString());
    values['flutter.$galleryFavoritesKey'] = jsonEncode({
      'version': 1,
      'items': [
        {...item, 'savedAt': 1}
      ]
    });
    await disk.writeAsString(jsonEncode(values), flush: true);
    final after = await execute({'action': 'favorites.online.list'});
    expect(after['total'], 1);
    expect(updates, 1);
    await expectLater(
        execute({
          'action': 'favorites.online.remove',
          'id': 'danbooru:123',
          'expectedRevision': before['revision']
        }),
        throwsStateError);
  });
  test(
      'actual HTTP one approval, denial, stale UI edit, durable replay and restart readback',
      () async {
    var removals = 0;
    final bridge = LocalAgentBridge(
        journal: Directory('${root.path}/journal'),
        execute: (tool, args) async {
          if (args['action'] == 'favorites.online.remove') removals++;
          return AgentToolResult(
              ok: true,
              title: 'collection',
              output: jsonEncode(await actions.execute(tool, args)));
        });
    final client = HttpClient();
    await bridge.start();
    Future<Map<String, dynamic>> call(
        String tool, Map<String, dynamic> args, String id) async {
      final req = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      req.headers.set('Authorization', 'Bearer ${bridge.token}');
      req.write(jsonEncode({
        'tool': tool,
        'args': args,
        'sessionId': 'collection',
        'callId': id
      }));
      final res = await req.close();
      expect(res.statusCode, id == 'stale' ? 500 : 200);
      return Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(res).join()));
    }

    Future<Map<String, dynamic>> approval(String label) async {
      for (var i = 0; i < 100; i++) {
        final r = await call('studio_image_approval', {}, '$label-$i');
        if (r['data'] is Map) return Map<String, dynamic>.from(r['data']);
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
      throw StateError('No approval');
    }

    try {
      final read = await call('langbai_software_action',
          {'action': 'favorites.online.list'}, 'read');
      final add = {
        'action': 'favorites.online.add',
        'item': item,
        'expectedRevision': read['data']['revision']
      };
      final saved = await call('langbai_software_action', add, 'add');
      expect(saved['ok'], true);
      expect(
          (await call('studio_image_approval', {}, 'no-add-approval'))['data'],
          null);
      final args = {
        'action': 'favorites.online.remove',
        'id': 'danbooru:123',
        'expectedRevision': saved['data']['revision']
      };
      final denied = call('langbai_software_action', args, 'denied');
      final first = await approval('deny');
      expect(store.items, hasLength(1));
      await call('studio_resolve_image_approval',
          {'id': first['id'], 'approved': false}, 'deny-resolve');
      expect((await denied)['ok'], false);
      expect(removals, 0);
      final stale = call('langbai_software_action', args, 'stale');
      final second = await approval('stale');
      await store.toggle(
          GalleryFavorite.fromJson({...item, 'id': '456', 'savedAt': 2}));
      await call('studio_resolve_image_approval',
          {'id': second['id'], 'approved': true}, 'stale-resolve');
      expect((await stale)['ok'], false);
      expect(store.items, hasLength(2));
      final fresh = await execute({'action': 'favorites.online.list'});
      final remove = {...args, 'expectedRevision': fresh['revision']};
      final pending = call('langbai_software_action', remove, 'remove');
      final third = await approval('remove');
      await call('studio_resolve_image_approval',
          {'id': third['id'], 'approved': true}, 'remove-resolve');
      final removed = await pending;
      expect(removed['ok'], true);
      expect(store.items.single.id, '456');
      final executed = removals;
      expect(await call('langbai_software_action', remove, 'remove'), removed);
      expect(removals, executed);
      expect(
          (await call(
              'studio_image_approval', {}, 'no-replay-approval'))['data'],
          null);
      final restart = GalleryFavoritesStore();
      await restart.load();
      expect(restart.items.single.id, '456');
      restart.dispose();
      expect(jsonDecode(await disk.readAsString())['flutter.unrelated'],
          'retained');
    } finally {
      client.close(force: true);
      await bridge.close();
    }
  });
}
