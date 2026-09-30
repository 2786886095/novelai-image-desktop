import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/resource_actions.dart';
import 'package:novelai_mobile/agent/operation_policy.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/services/resource_database_service.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:path/path.dart' as path;

class Paths extends PathProviderPlatform {
  final String root;
  Paths(this.root);
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

class Port implements ResourcePort {
  bool installed = false, valid = false, previous = true;
  String version = '';
  int cached = 2, starts = 0;
  Completer<Map<String, dynamic>>? pending;
  @override
  Future<Map<String, dynamic>> overview() async => {
        'resources': [
          {
            'id': 'tagCatalog',
            'installed': installed,
            'valid': valid,
            'version': version,
            'hasPrevious': previous,
            'resumableBytes': 0,
            'downloading': false
          }
        ],
        'cache': {'memoryEntries': cached}
      };
  @override
  Future<Map<String, dynamic>> install(String id) {
    starts++;
    pending = Completer();
    return pending!.future;
  }

  @override
  bool pause(String id) {
    if (pending == null || pending!.isCompleted) return false;
    pending!.complete({'paused': true});
    return true;
  }

  void finish() {
    installed = true;
    valid = true;
    version = 'new';
    pending!.complete({});
  }

  @override
  Future<void> restore(String id) async {
    installed = true;
    valid = true;
    version = 'old';
  }

  @override
  Future<void> delete(String id) async {
    installed = false;
    valid = false;
    previous = false;
  }

  @override
  void clearCache() {
    cached = 0;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('download returns running, pause is honest and duplicate does not start',
      () async {
    final port = Port(),
        actions = ResourceActions(port),
        state = await actions.snapshot();
    final args = {
      'action': 'resources.download',
      'id': 'tagCatalog',
      'expectedRevision': state['revision']
    };
    final started = await actions.execute(args);
    expect(started['result']['started'], true);
    expect(started['jobs'].single['state'], 'running');
    await expectLater(actions.execute(args), throwsStateError);
    expect(port.starts, 1);
    await actions.execute({...args, 'action': 'resources.pause'});
    await Future<void>.delayed(Duration.zero);
    expect((await actions.snapshot())['jobs'].single['state'], 'paused');
  });
  test(
      'stale/unknown fields fail; completion, restore/delete/cache are read back',
      () async {
    final port = Port(), actions = ResourceActions(port);
    await expectLater(
        actions.execute({
          'action': 'resources.download',
          'id': 'tagCatalog',
          'expectedRevision': 'bad'
        }),
        throwsStateError);
    expect(port.starts, 0);
    await expectLater(
        actions.execute({'action': 'resources.list', 'confirmed': true}),
        throwsStateError);
    final before = await actions.snapshot();
    await actions.execute({
      'action': 'resources.download',
      'id': 'tagCatalog',
      'expectedRevision': before['revision']
    });
    port.finish();
    await Future<void>.delayed(Duration.zero);
    expect((await actions.snapshot())['jobs'].single['state'], 'complete');
    for (final action in [
      'resources.restore',
      'resources.delete',
      'resources.clearCache'
    ]) {
      final state = await actions.snapshot();
      await actions.execute({
        'action': action,
        'expectedRevision': state['revision'],
        if (action != 'resources.clearCache') 'id': 'tagCatalog'
      });
    }
    expect(port.version, 'old');
    expect(port.installed, false);
    expect(port.cached, 0);
    for (final entry in resourceActionCatalog.entries) {
      expect(
          requiresAgentConfirmation(
              'langbai_software_action', {'action': entry.key}),
          entry.value['effect'] == 'confirm');
    }
  });
  test(
      'actual core excludes concurrent operations and pauses before any network request',
      () async {
    final root = await Directory.systemTemp.createTemp('resource-core-'),
        prior = PathProviderPlatform.instance;
    PathProviderPlatform.instance = Paths(root.path);
    final service = ResourceDatabaseService.shared;
    try {
      final download = service.install(ResourceDatabaseId.tagCatalog);
      expect(service.operation(ResourceDatabaseId.tagCatalog), 'download');
      await expectLater(
          service.install(ResourceDatabaseId.tagCatalog), throwsStateError);
      await expectLater(service.restorePrevious(ResourceDatabaseId.tagCatalog),
          throwsStateError);
      await expectLater(
          service.delete(ResourceDatabaseId.tagCatalog), throwsStateError);
      expect(service.pause(ResourceDatabaseId.tagCatalog), true);
      expect(await download, 'Download paused');
      expect(service.lastProgress(ResourceDatabaseId.tagCatalog)?.phase,
          ResourceDownloadPhase.paused);
      expect(service.operation(ResourceDatabaseId.tagCatalog), null);
    } finally {
      PathProviderPlatform.instance = prior;
      await root.delete(recursive: true);
    }
  });
  test(
      'actual delete only removes selected resource files and retains images and other database',
      () async {
    final root = await Directory.systemTemp.createTemp('resource-files-'),
        prior = PathProviderPlatform.instance;
    PathProviderPlatform.instance = Paths(root.path);
    try {
      final dir = Directory(path.join(root.path, 'resources', 'autocomplete'));
      await dir.create(recursive: true);
      for (final name in [
        'tag_catalog.db',
        'tag_catalog.db.previous',
        'tag_catalog.db.part',
        'tag_catalog.db.installing',
        'cooccurrence-v2.db',
        'picture.png'
      ]) {
        await File(path.join(dir.path, name)).writeAsString('fixture $name');
      }
      await ResourceDatabaseService.shared
          .delete(ResourceDatabaseId.tagCatalog);
      expect(dir.listSync().map((f) => path.basename(f.path)).toSet(),
          {'cooccurrence-v2.db', 'picture.png'});
    } finally {
      PathProviderPlatform.instance = prior;
      await root.delete(recursive: true);
    }
  });
  test(
      'real HTTP installation asks once and receipt replay does not start twice',
      () async {
    HttpOverrides.global = null;
    final root = await Directory.systemTemp.createTemp('resource-http-'),
        port = Port(),
        actions = ResourceActions(port),
        client = HttpClient();
    final bridge = LocalAgentBridge(
        journal: root,
        execute: (tool, args) async => AgentToolResult(
            ok: true,
            title: 'resources',
            output: jsonEncode(await actions.execute(args))));
    await bridge.start();
    Future<Map<String, dynamic>> call(
        String tool, Map<String, dynamic> args, String id) async {
      final r = await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));
      r.headers.set('Authorization', 'Bearer ${bridge.token}');
      r.write(jsonEncode(
          {'tool': tool, 'args': args, 'sessionId': 'r', 'callId': id}));
      final response = await r.close();
      expect(response.statusCode, 200);
      return Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(response).join()));
    }

    try {
      final before = await call(
          'langbai_software_action', {'action': 'resources.list'}, 'read');
      final args = {
        'action': 'resources.download',
        'id': 'tagCatalog',
        'expectedRevision': before['data']['revision']
      };
      final start = call('langbai_software_action', args, 'start');
      Map<String, dynamic>? approval;
      for (var n = 0; n < 50 && approval == null; n++) {
        approval = (await call('studio_image_approval', {}, 'poll-$n'))['data'];
        if (approval == null) {
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      }
      expect(approval, isNotNull);
      expect(port.starts, 0);
      await call('studio_resolve_image_approval',
          {'id': approval!['id'], 'approved': true}, 'approve');
      expect((await start)['ok'], true);
      expect(port.starts, 1);
      expect(
          (await call('langbai_software_action', args, 'start'))['ok'], true);
      expect(port.starts, 1);
      expect((await call('studio_image_approval', {}, 'empty'))['data'], null);
      port.finish();
      await Future<void>.delayed(Duration.zero);
    } finally {
      client.close(force: true);
      await bridge.close();
      await root.delete(recursive: true);
    }
  });
}
