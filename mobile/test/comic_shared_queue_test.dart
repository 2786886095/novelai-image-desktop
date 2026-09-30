import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class MemoryStorage extends Storage {
  ComicProject? saved;
  bool failProject = false, failRun = false;
  int loads = 0;
  Map<String, dynamic>? run;
  @override
  Future<Map<String, dynamic>?> getComicRun() async =>
      run == null ? null : Map<String, dynamic>.from(run!);
  @override
  Future<void> setComicRun(Map<String, dynamic> value) async {
    if (failRun) throw StateError('journal full');
    run = Map<String, dynamic>.from(value);
  }

  @override
  Future<String?> getToken() async => 'fixture-token';
  @override
  Future<ComicProject> getComicProject(GenerateParams fallback) async {
    loads++;
    return saved ?? ComicProject.empty(fallback);
  }

  @override
  Future<void> setComicProject(ComicProject project) async {
    if (failProject) throw StateError('project disk full');
    saved = ComicProject.fromJson(
        jsonDecode(jsonEncode(project.toJson())), project.globalParams,
        trustOutputs: true);
  }
}

class ComicApp extends AppState {
  final calls = <GenerateParams>[];
  Future<void> Function()? network;
  ComicApp(MemoryStorage storage) : super(storage: storage);
  @override
  Future<HistoryItem> generateComicPanel(
      {required GenerateParams panelParams,
      required GenerateExtras panelExtras,
      required String projectTitle,
      String? historyGroupId}) async {
    calls.add(panelParams.copy());
    await network?.call();
    return HistoryItem(
        id: 'image-${calls.length}',
        filePath: 'fixture-${calls.length}.png',
        createdAt: '2026-09-29',
        date: '2026-09-29',
        model: panelParams.model,
        width: panelParams.width,
        height: panelParams.height,
        seed: 1,
        prompt: panelParams.positivePrompt,
        params: panelParams.toJson(),
        groupId: 'g');
  }
}

ComicProject project(GenerateParams params) => ComicProject.empty(params)
  ..initialGenerationCount = 1
  ..panels = [
    ComicPanel(
        id: 'one',
        index: 1,
        prompt: 'forest',
        title: 'One',
        params: params.copy()),
    ComicPanel(
        id: 'two', index: 2, prompt: 'sea', title: 'Two', params: params.copy())
  ];
Future<void> until(bool Function() ready) async {
  for (var i = 0; i < 200; i++) {
    if (ready()) return;
    await Future<void>.delayed(const Duration(milliseconds: 5));
  }
  throw StateError('condition timeout');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'baseline missing comic reference must stop rather than silently omit it',
      () async {
    final app = ComicApp(MemoryStorage()), controller = ComicController(app);
    controller.project = project(app.params);
    controller.loaded = true;
    addTearDown(app.dispose);
    addTearDown(controller.dispose);
    controller.project.preciseReferences.add(ComicReferenceAsset(
        id: 'missing',
        name: 'missing',
        filePath: 'nonexistent-comic-reference.png'));
    await expectLater(controller.extrasFor(controller.project.panels.first),
        throwsA(isA<StateError>()));
  });
  test(
      'baseline failed first image stops the remainder rather than charging a second panel',
      () async {
    final app = ComicApp(MemoryStorage()), controller = ComicController(app);
    controller.project = project(app.params);
    controller.loaded = true;
    addTearDown(app.dispose);
    addTearDown(controller.dispose);
    app.network = () async => throw StateError('network failed');
    await controller.addOneToAll();
    expect(app.calls, hasLength(1));
    expect(controller.queueRunning, false);
  });

  test(
      'AppState owns one controller and reads persisted project once across repeated access',
      () async {
    final storage = MemoryStorage(), app = ComicApp(MemoryStorage());
    app.dispose();
    final actual = ComicApp(storage);
    storage.saved = project(actual.params);
    addTearDown(actual.dispose);
    final first = actual.comic;
    await first.load();
    expect(identical(first, actual.comic), true);
    await actual.comic.load();
    expect(storage.loads, 1);
    expect(first.project.panels, hasLength(2));
  });
  testWidgets(
      'leaving and reopening the real comic page retains the same live queue and outputs',
      (tester) async {
    final storage = MemoryStorage(), app = ComicApp(MemoryStorage());
    app.dispose();
    final actual = ComicApp(storage);
    storage.saved = project(actual.params);
    addTearDown(actual.dispose);
    final controller = actual.comic;
    await controller.load();
    final gate = Completer<void>();
    var n = 0;
    actual.network = () async {
      if (n++ == 0) await gate.future;
    };
    Widget root(Widget child) => ChangeNotifierProvider<AppState>.value(
        value: actual, child: MaterialApp(home: child));
    await tester.pumpWidget(root(const ComicScreen()));
    await tester.pump();
    final run = controller.addOneToAll();
    await tester.runAsync(() => until(() => actual.calls.length == 1));
    await tester.pumpWidget(root(const Scaffold(body: Text('another tab'))));
    expect(controller.queueRunning, true);
    expect(controller.queueCancelled, false);
    gate.complete();
    await tester.runAsync(() => run);
    await tester.runAsync(() => controller.flush());
    await tester.pumpWidget(root(const ComicScreen()));
    await tester.pump();
    expect(identical(controller, actual.comic), true);
    expect(actual.calls, hasLength(2));
    expect(
        controller.project.panels.every((p) => p.candidates.length == 1), true);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  test(
      'duplicate start reserves synchronously before async storage or reference reads',
      () async {
    final app = ComicApp(MemoryStorage()), c = ComicController(app);
    c.project = project(app.params);
    c.loaded = true;
    addTearDown(app.dispose);
    addTearDown(c.dispose);
    final gate = Completer<void>();
    app.network = () => gate.future;
    final first = c.addOneToAll();
    expect(() => c.addOneToAll(), throwsStateError);
    gate.complete();
    await first;
    expect(app.calls, hasLength(2));
  });
  test('stale confirmation revision rejects without a generated image',
      () async {
    final app = ComicApp(MemoryStorage()), c = ComicController(app);
    c.project = project(app.params);
    addTearDown(app.dispose);
    addTearDown(c.dispose);
    final rev = c.revision;
    c.project.panels.first.prompt = 'new';
    expect(() => c.assertRevision(rev), throwsStateError);
    expect(app.calls, isEmpty);
  });
  test('cancel preserves late output and prevents the next submission',
      () async {
    final storage = MemoryStorage(), app = ComicApp(MemoryStorage());
    app.dispose();
    final actual = ComicApp(storage), c = ComicController(actual);
    c.project = project(actual.params);
    c.loaded = true;
    addTearDown(actual.dispose);
    addTearDown(c.dispose);
    final gate = Completer<void>();
    actual.network = () => gate.future;
    final run = c.addOneToAll();
    await until(() => actual.calls.length == 1);
    c.cancelQueue();
    expect(c.queueRunning, true);
    gate.complete();
    await run;
    expect(actual.calls, hasLength(1));
    expect(c.project.panels.first.candidates, hasLength(1));
    expect(storage.saved!.panels.first.candidates, hasLength(1));
    expect(c.runPhase, 'cancelled');
    expect(actual.busy, false);
  });
  test(
      'changing provider between outputs stops rather than charging through another endpoint',
      () async {
    final app = ComicApp(MemoryStorage()), c = ComicController(app);
    c.project = project(app.params);
    c.loaded = true;
    addTearDown(app.dispose);
    addTearDown(c.dispose);
    app.network = () async {
      app.settings.imageBaseUrl = 'https://changed.invalid';
    };
    await c.addOneToAll();
    expect(app.calls, hasLength(1));
    expect(c.project.panels.first.candidates, hasLength(1));
    expect(c.runPhase, 'failed');
  });
  test('journal or project failure before dispatch creates no image', () async {
    for (final run in [true, false]) {
      final storage = MemoryStorage()
            ..failRun = run
            ..failProject = !run,
          app = ComicApp(MemoryStorage());
      app.dispose();
      final actual = ComicApp(storage), c = ComicController(actual);
      c.project = project(actual.params);
      c.loaded = true;
      await c.addOneToAll();
      expect(actual.calls, isEmpty);
      expect(actual.busy, false);
      expect(c.runPhase, 'failed');
      c.dispose();
      actual.dispose();
    }
  });
  test(
      'candidate persistence failure stops after the saved output without replaying it',
      () async {
    final storage = MemoryStorage(),
        app = ComicApp(storage),
        c = ComicController(app);
    c.project = project(app.params);
    c.loaded = true;
    addTearDown(app.dispose);
    addTearDown(c.dispose);
    app.network = () async {
      storage.failProject = true;
    };
    await c.addOneToAll();
    expect(app.calls, hasLength(1));
    expect(c.project.panels.first.candidates, hasLength(1));
    expect(c.runPhase, 'failed');
    expect(c.persistenceError, contains('full'));
  });
  test('restart marks active journal interrupted and never restarts paid work',
      () async {
    final storage = MemoryStorage()
      ..run = {
        'id': 'old',
        'phase': 'running',
        'total': 2,
        'done': 1,
        'error': null
      };
    final app = ComicApp(storage);
    storage.saved = project(app.params);
    addTearDown(app.dispose);
    await app.comic.load();
    expect(app.comic.runPhase, 'interrupted');
    expect(storage.run!['phase'], 'interrupted');
    expect(app.calls, isEmpty);
    expect(app.comic.queueRunning, false);
  });
  test(
      'corrupt journals are preserved and block new work instead of becoming a fresh task',
      () async {
    final storage = MemoryStorage()..run = {'phase': 'running'},
        app = ComicApp(storage);
    storage.saved = project(app.params);
    addTearDown(app.dispose);
    await app.comic.load();
    expect(app.comic.loadError, contains('损坏'));
    expect(storage.run, {'phase': 'running'});
    expect(() => app.comic.addOneToAll(), throwsStateError);
    expect(app.calls, isEmpty);
  });
  test(
      'real preference storage keeps corrupt project source and snapshots mutable writes immediately',
      () async {
    SharedPreferences.setMockInitialValues({'comic_project_v2': 'bad-json'});
    final storage = Storage();
    await expectLater(
        storage.getComicProject(GenerateParams()), throwsFormatException);
    expect(
        (await SharedPreferences.getInstance()).getString('comic_project_v2'),
        'bad-json');
    final p = project(GenerateParams()), saving = storage.setComicProject(p);
    p.title = 'changed after saving';
    await saving;
    expect((await storage.getComicProject(GenerateParams())).title,
        isNot('changed after saving'));
  });  test('application stop reaches the same queue even after leaving the comic page',()async{
    final storage=MemoryStorage(),app=ComicApp(storage);storage.saved=project(app.params);addTearDown(app.dispose);final c=app.comic;await c.load();final gate=Completer<void>();app.network=()=>gate.future;final run=c.addOneToAll();await until(()=>app.calls.length==1);app.cancelGeneration();expect(c.queueCancelled,true);gate.complete();await run;expect(app.calls,hasLength(1));expect(c.runPhase,'cancelled');
  });

}
