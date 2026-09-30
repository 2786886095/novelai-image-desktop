import 'package:image/image.dart' as img;
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/comic_generation_actions.dart';
import 'package:novelai_mobile/agent/session_controls.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/generation_scope.dart';
import 'package:novelai_mobile/state/app_state.dart';

class LaunchStorage extends Storage {
  String token = 'fixture-token';
  bool failProject = false;
  @override
  Future<String?> getToken() async => token;
  @override
  Future<void> setComicProject(ComicProject p) async {
    if (failProject) throw StateError('disk full');
    await super.setComicProject(p);
  }
}

class LaunchApp extends AppState {
  int calls = 0;
  final List<GenerateExtras> received = [];
  Future<void> Function()? network;
  LaunchApp(LaunchStorage storage) : super(storage: storage);
  @override
  Future<HistoryItem> generateComicPanel(
      {required GenerateParams panelParams,
      required GenerateExtras panelExtras,
      required String projectTitle,
      String? historyGroupId}) async {
    GenerationScope.current
        ?.credentials(await storage.getToken() ?? '', settings);
    calls++;
    received.add(panelExtras.copy());
    await network?.call();
    return HistoryItem(
        id: 'image-$calls',
        filePath: 'fixture-$calls.png',
        createdAt: 'today',
        date: 'today',
        model: panelParams.model,
        width: panelParams.width,
        height: panelParams.height,
        seed: 1,
        prompt: panelParams.positivePrompt,
        params: panelParams.toJson(),
        groupId: 'comic');
  }
}

Future<void> waitFor(bool Function() condition) async {
  for (var i = 0; i < 300; i++) {
    if (condition()) return;
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  throw StateError('fixture condition timeout');
}

Future<void> seedComic(LaunchApp app, {int each = 1}) async {
  await app.comic.load();
  app.comic.project
    ..initialGenerationCount = each
    ..panels = [
      for (var i = 0; i < 2; i++)
        ComicPanel(
            id: 'p$i',
            index: i + 1,
            title: 'Panel $i',
            prompt: 'forest $i',
            params: app.params.copy())
    ];
  await app.comic.flush();
}

Map<String, dynamic> startArgs(LaunchApp app,
        {String mode = 'initial', List<String> panels = const []}) =>
    {
      'action': 'comic.generation.start',
      'mode': mode,
      'panelIds': panels,
      'expectedRevision': app.comic.revision
    };
void deliver(ComicGenerationActions actions, Map<String, dynamic> args,
        AgentToolResult result,
        {bool delivered = true, String session = 'one'}) =>
    actions.afterResponse(
        'langbai_software_action',
        args,
        session,
        'call',
        {'ok': result.ok, 'data': result.ok ? jsonDecode(result.output) : null},
        delivered);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late LaunchStorage storage;
  late LaunchApp app;
  late AgentSessionControls sessions;
  late Directory root;
  late ComicGenerationActions actions;
  var approvals = 0;
  Future<bool> Function()? approve;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    storage = LaunchStorage();
    app = LaunchApp(storage);
    sessions = AgentSessionControls(app);
    root = await Directory.systemTemp.createTemp('comic-launch-');
    approvals = 0;
    approve = null;
    actions = ComicGenerationActions(
        app: app,
        sessions: sessions,
        root: root,
        approve: (s, a) async {
          approvals++;
          return await approve?.call() ?? true;
        });
    await seedComic(app);
  });
  tearDown(() async {
    await actions.close();
    app.dispose();
    await root.delete(recursive: true);
  });
  Future<AgentToolResult> execute(Map<String, dynamic> args,
          {String session = 'one'}) =>
      actions.execute('langbai_software_action', args, session);
  Future<AgentToolResult> run(Map<String, dynamic> args) async {
    final r = await execute(args);
    if (r.ok) {
      deliver(actions, args, r);
      await actions.settled();
    }
    return r;
  }

  test(
      'unlimited auto starts twelve only after receipt and uses shared candidates',
      () async {
    app.comic.project.initialGenerationCount = 6;
    final args = startArgs(app), result = await execute(startArgs(app));
    expect(result.ok, true, reason: result.output);
    expect(app.calls, 0);
    expect(approvals, 0);
    expect(jsonDecode(result.output)['operation']['total'], 12);
    expect(() => app.comic.addOneToAll(), throwsStateError);
    deliver(actions, args, result);
    await actions.settled();
    expect(app.calls, 12);
    expect(actions.operation!['state'], 'completed');
    expect(app.comic.project.panels.map((p) => p.candidates.length), [6, 6]);
    expect(actions.busy, false);
  });
  test('confirm mode approves entire twelve-image plan once', () async {
    await sessions.execute(
        'studio_generation_policy', {'mode': 'confirm'}, 'one');
    app.comic.project.initialGenerationCount = 6;
    final r = await run(startArgs(app));
    expect(r.ok, true, reason: r.output);
    expect(app.calls, 12);
    expect(approvals, 1);
  });
  test(
      'initial fills missing; selected additional and regenerate preserve other panels and images',
      () async {
    expect((await run(startArgs(app))).ok, true);
    expect(app.calls, 2);
    expect((await run(startArgs(app, mode: 'additional', panels: ['p1']))).ok,
        true);
    expect(app.comic.project.panels.map((p) => p.candidates.length), [1, 2]);
    expect((await run(startArgs(app, mode: 'regenerate', panels: ['p0']))).ok,
        true);
    expect(app.comic.project.panels.map((p) => p.candidates.length), [2, 2]);
    final done = await execute(startArgs(app));
    expect(done.ok, false);
    expect(app.calls, 4);
  });
  test(
      'denial and confirmation-time edit submit nothing and release reservation',
      () async {
    await sessions.execute(
        'studio_generation_policy', {'mode': 'confirm'}, 'one');
    approve = () async => false;
    expect((await execute(startArgs(app))).ok, false);
    expect(app.calls, 0);
    expect(actions.busy, false);
    final gate = Completer<bool>();
    approve = () => gate.future;
    final task = execute(startArgs(app));
    await waitFor(() => approvals == 2);
    app.comic.project.title = 'UI edited';
    gate.complete(true);
    expect((await task).ok, false);
    expect(app.comic.project.title, 'UI edited');
    expect(app.calls, 0);
    app.comic.assertRevision(app.comic.revision);
  });
  test(
      'source and credentials change between queued receipt and launch block requests',
      () async {
    var args = startArgs(app), result = await execute(startArgs(app));
    app.settings.imageBaseUrl = 'https://changed.invalid';
    deliver(actions, args, result);
    await actions.settled();
    expect(app.calls, 0);
    expect(actions.operation!['state'], 'failed');
    args = startArgs(app);
    result = await execute(args);
    storage.token = 'different';
    deliver(actions, args, result);
    await actions.settled();
    expect(app.calls, 0);
    expect(actions.operation!['state'], 'failed');
  });
  test('lost response and replay never start a paid request', () async {
    final args = startArgs(app), result = await execute(startArgs(app));
    deliver(actions, args, result, delivered: false);
    await actions.settled();
    expect(actions.operation!['state'], 'interrupted');
    deliver(actions, args, result);
    await actions.settled();
    expect(app.calls, 0);
  });
  test('queued receipt timeout and restart remain interrupted without replay',
      () async {
    await actions.close();
    actions = ComicGenerationActions(
        app: app,
        sessions: sessions,
        root: root,
        handoffTimeout: const Duration(milliseconds: 15),
        approve: (_, __) async => true);
    expect((await execute(startArgs(app))).ok, true);
    await waitFor(() => !actions.busy);
    expect(actions.operation!['state'], 'interrupted');
    expect(app.calls, 0);
    await File('${root.path}/comic-generation-operation.json')
        .writeAsString(jsonEncode({...actions.operation!, 'state': 'running'}));
    final reopened = ComicGenerationActions(
        app: app,
        sessions: sessions,
        root: root,
        approve: (_, __) async => throw StateError('must not approve'));
    await reopened.initialize();
    expect(reopened.operation!['state'], 'interrupted');
    expect(app.calls, 0);
    await reopened.close();
  });
  test(
      'finite quota validates whole plan and counts failed attempts without submitting next',
      () async {
    await sessions.execute(
        'studio_generation_policy', {'mode': 'auto', 'limit': 1}, 'one');
    expect((await execute(startArgs(app))).ok, false);
    expect(app.calls, 0);
    await sessions.execute(
        'studio_generation_policy', {'mode': 'auto', 'limit': 2}, 'one');
    app.network = () async => throw StateError('provider failure');
    expect((await run(startArgs(app))).ok, true);
    expect(app.calls, 1);
    expect((await sessions.read('one'))['remaining'], 1);
    expect(actions.operation!['state'], 'failed');
  });
  test(
      'stop enforces owner and exact run; late saved image retained and next request prevented',
      () async {
    final gate = Completer<void>();
    app.network = () => gate.future;
    final args = startArgs(app), result = await execute(startArgs(app));
    deliver(actions, args, result);
    await waitFor(() => app.calls == 1);
    final id = actions.operation!['id'];
    expect(
        (await execute({'action': 'comic.generation.stop', 'runId': id},
                session: 'other'))
            .ok,
        false);
    expect(
        (await execute({'action': 'comic.generation.stop', 'runId': 'old'})).ok,
        false);
    expect((await execute({'action': 'comic.generation.stop', 'runId': id})).ok,
        true);
    gate.complete();
    await actions.settled();
    expect(app.calls, 1);
    expect(app.comic.project.panels.first.candidates, hasLength(1));
    expect(actions.operation!['state'], 'cancelled');
  });
  test(
      'session revoke after first submission prevents subsequent image and retains result',
      () async {
    app.network = () async {
      await sessions.execute('studio_stop_generation', {}, 'one');
    };
    expect((await run(startArgs(app))).ok, true);
    expect(app.calls, 1);
    expect(app.comic.project.panels.first.candidates, hasLength(1));
    expect(actions.operation!['state'], 'cancelled');
  });
  test(
      'changed grant fails before first image even when switched back to original mode',
      () async {
    final args = startArgs(app), result = await execute(startArgs(app));
    await sessions.execute(
        'studio_generation_policy', {'mode': 'confirm'}, 'one');
    await sessions.execute(
        'studio_generation_policy', {'mode': 'auto', 'limit': 0}, 'one');
    deliver(actions, args, result);
    await actions.settled();
    expect(app.calls, 0);
    expect(actions.operation!['state'], 'failed');
  });
  test(
      'missing reference and corrupt job journal fail closed without approval or network',
      () async {
    app.comic.project.preciseReferences
        .add(ComicReferenceAsset(id: 'r', name: 'r', filePath: 'missing.png'));
    expect((await execute(startArgs(app))).ok, false);
    expect(approvals, 0);
    expect(app.calls, 0);
    final corrupt = Directory('${root.path}/corrupt');
    await corrupt.create();
    await File('${corrupt.path}/comic-generation-operation.json')
        .writeAsString('corrupt');
    final other = ComicGenerationActions(
        app: app,
        sessions: sessions,
        root: corrupt,
        approve: (_, __) async => true);
    expect(
        (await other.execute('langbai_software_action',
                {'action': 'comic.generation.status'}, 'one'))
            .ok,
        false);
    expect(
        await File('${corrupt.path}/comic-generation-operation.json')
            .readAsString(),
        'corrupt');
    await other.close();
  });
  test('failed project persistence before launch makes zero submissions',
      () async {
    final args = startArgs(app), result = await execute(startArgs(app));
    storage.failProject = true;
    deliver(actions, args, result);
    await actions.settled();
    expect(app.calls, 0);
    expect(actions.operation!['state'], 'failed');
    expect(actions.busy, false);
    storage.failProject = false;
  });
  test('invalid modes IDs revisions and unknown arguments do not acquire queue',
      () async {
    for (final args in [
      {...startArgs(app), 'mode': 'invalid'},
      {
        ...startArgs(app),
        'panelIds': ['p0', 'p0']
      },
      {
        ...startArgs(app),
        'panelIds': ['missing']
      },
      {...startArgs(app), 'expectedRevision': 'old'},
      {...startArgs(app), 'confirmed': true}
    ]) {
      expect((await execute(args)).ok, false);
      expect(actions.busy, false);
    }
    expect(app.calls, 0);
  });

  test('approved references are frozen rather than re-read after confirmation',
      () async {
    final file = File('${root.path}/reference.png');
    final original = img.encodePng(img.Image(width: 8, height: 8));
    await file.writeAsBytes(original);
    app.comic.project.globalParams.model = 'nai-diffusion-4-5-full';
    app.comic.project.preciseReferences
        .add(ComicReferenceAsset(id: 'r', name: 'r', filePath: file.path));
    final args = startArgs(app), result = await execute(startArgs(app));
    expect(result.ok, true, reason: result.output);
    await file.writeAsBytes(img.encodePng(img.Image(width: 4, height: 4)));
    deliver(actions, args, result);
    await actions.settled();
    expect(app.calls, 2);
    expect(app.received.first.preciseReferences.single.base64,
        base64Encode(original));
    expect(app.received.last.preciseReferences.single.base64,
        base64Encode(original));
  });
}
