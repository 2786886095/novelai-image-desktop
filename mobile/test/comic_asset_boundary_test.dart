import 'dart:async';
import 'dart:convert';
import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:file_picker/file_picker.dart';
import 'package:novelai_mobile/comic/comic_asset_store.dart';
import 'package:novelai_mobile/comic/comic_controller.dart';
import 'package:novelai_mobile/comic/comic_project_transfer.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class AssetPaths extends PathProviderPlatform {
  final String root;
  AssetPaths(this.root);
  @override
  Future<String?> getTemporaryPath() async => root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
}

class AssetStorage extends Storage {
  bool fail = false, failBackup = false;
  Future<void> Function()? onSave;
  @override
  Future<void> setComicBackup(ComicProject p) async {
    if (failBackup) throw StateError('fixture backup full');
    await super.setComicBackup(p);
  }

  @override
  Future<void> setComicProject(ComicProject p) async {
    await onSave?.call();
    if (fail) throw StateError('fixture disk full');
    await super.setComicProject(p);
  }
}

class AssetPicker extends FilePicker {
  FilePickerResult? result;
  Future<void> Function()? onPick;
  @override
  Future<FilePickerResult?> pickFiles(
      {String? dialogTitle,
      String? initialDirectory,
      FileType type = FileType.any,
      List<String>? allowedExtensions,
      Function(FilePickerStatus)? onFileLoading,
      bool allowCompression = true,
      int compressionQuality = 30,
      bool allowMultiple = false,
      bool withData = false,
      bool withReadStream = false,
      bool lockParentWindow = false,
      bool readSequential = false}) async {
    await onPick?.call();
    return result;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FilePicker.platform = AssetPicker();
  late Directory root;
  late PathProviderPlatform prior;
  late FilePicker priorPicker;
  late AssetPicker picker;
  final shared = <String>[];
  const channel = MethodChannel('dev.fluttercommunity.plus/share');
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    root = Directory.systemTemp.createTempSync('comic-boundary-test-');
    prior = PathProviderPlatform.instance;
    PathProviderPlatform.instance = AssetPaths(root.path);
    shared.clear();
    priorPicker = FilePicker.platform;
    picker = AssetPicker();
    FilePicker.platform = picker;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      shared.addAll(List<String>.from((call.arguments as Map)['paths']));
      return 'fixture';
    });
  });
  tearDown(() async {
    PathProviderPlatform.instance = prior;
    FilePicker.platform = priorPicker;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    await root.delete(recursive: true);
  });
  Future<AppState> fixture({AssetStorage? storage}) async {
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    await app.comic.load();
    app.comic.project.panels
        .add(ComicPanel(id: 'p', index: 1, title: 'one', prompt: 'forest'));
    final file = File('${root.path}/source.png');
    await file.writeAsBytes(img.encodePng(img.Image(width: 8, height: 8)));
    app.comic.project.preciseReferences.add(
        ComicReferenceAsset(id: 'r', name: 'reference', filePath: file.path));
    app.comic.project.panels.single.preciseReferences
        .add(ComicPanelReference(referenceId: 'r'));
    await app.comic.flush();
    return app;
  }

  test('baseline failed reference removal preserves project and source file',
      () async {
    final storage = AssetStorage(), app = await fixture(storage: storage);
    storage.fail = true;
    final before = app.comic.revision,
        path = app.comic.project.preciseReferences.single.filePath;
    await expectLater(app.comic.removePreciseReference('r'), throwsStateError);
    expect(app.comic.revision, before);
    expect(File(path).existsSync(), true);
  });
  test('baseline a missing selected image fails the whole ZIP before sharing',
      () async {
    final app = await fixture();
    final first = app.comic.project.panels.single;
    first.candidates.add(ComicCandidate(
        id: 'c',
        historyItemId: 'h',
        outputPath: '${root.path}/source.png',
        createdAt: 'today'));
    app.comic.project.panels.add(ComicPanel(
        id: 'p2',
        index: 2,
        title: 'two',
        prompt: 'sea',
        candidates: [
          ComicCandidate(
              id: 'missing',
              historyItemId: 'private',
              outputPath: '${root.path}/missing.png',
              createdAt: 'today')
        ]));
    await expectLater(app.comic.exportSelectedZip(), throwsStateError);
    expect(shared, isEmpty);
  });
  test('baseline exported project JSON contains no local output path',
      () async {
    final app = await fixture();
    app.comic.project.panels.single.candidates.add(ComicCandidate(
        id: 'c',
        historyItemId: 'private-history',
        outputPath: 'PRIVATE-OUTPUT.png',
        createdAt: 'today'));
    await app.comic.exportProjectJson();
    expect(shared, hasLength(1));
    final json = await File(shared.single).readAsString();
    expect(json, isNot(contains('PRIVATE-OUTPUT')));
    expect(json, isNot(contains('private-history')));
  });

  void selectFiles(List<File> files) {
    picker.result = FilePickerResult(files
        .map((f) => PlatformFile(
            name: f.uri.pathSegments.last, path: f.path, size: f.lengthSync()))
        .toList());
  }

  void candidate(AppState app) {
    app.comic.project.panels.first.candidates.add(ComicCandidate(
        id: 'c',
        historyItemId: 'private',
        outputPath: '${root.path}/source.png',
        createdAt: 'today'));
  }

  ReferencePreset preset(String path) => ReferencePreset(
      id: 'preset',
      name: 'my reference',
      group: '',
      kind: ReferencePresetKind.precise,
      filePath: path,
      createdAt: 'today',
      strength: 0.7,
      fidelity: 0.6);

  test(
      'successful reference detach persists backup and retains files on restart',
      () async {
    final app = await fixture(),
        path = app.comic.project.preciseReferences.single.filePath;
    final before = app.comic.project.toJson();
    await app.comic.removePreciseReference('r');
    expect(app.comic.project.preciseReferences, isEmpty);
    expect(app.comic.project.panels.single.preciseReferences, isEmpty);
    expect((await app.storage.getComicProject(app.params)).preciseReferences,
        isEmpty);
    final prefs = await SharedPreferences.getInstance();
    expect(
        jsonDecode(prefs.getString('comic_project_agent_backup_v1')!), before);
    expect(File(path).existsSync(), true);
    final restarted = AppState();
    addTearDown(restarted.dispose);
    await restarted.comic.load();
    expect(restarted.comic.project.preciseReferences, isEmpty);
    await expectLater(app.comic.removePreciseReference('r'), throwsStateError);
  });
  test('backup failure and running generation block reference removal',
      () async {
    final storage = AssetStorage(),
        app = await fixture(storage: storage),
        before = app.comic.revision;
    storage.failBackup = true;
    await expectLater(app.comic.removePreciseReference('r'), throwsStateError);
    expect(app.comic.revision, before);
    storage.failBackup = false;
    app.comic.queueRunning = true;
    await expectLater(app.comic.removePreciseReference('r'), throwsStateError);
    app.comic.queueRunning = false;
    expect(app.comic.revision, before);
    expect(
        File(app.comic.project.preciseReferences.single.filePath).existsSync(),
        true);
  });
  test(
      'save-time concurrent edit rejects stale removal and restores current storage',
      () async {
    final storage = AssetStorage(), app = await fixture(storage: storage);
    final gate = Completer<void>(), started = Completer<void>();
    var first = true;
    storage.onSave = () async {
      if (first) {
        first = false;
        started.complete();
        await gate.future;
      }
    };
    final result =
        expectLater(app.comic.removePreciseReference('r'), throwsStateError);
    await started.future;
    app.comic.project.title = 'new UI title';
    gate.complete();
    await result;
    expect((await storage.getComicProject(app.params)).title, 'new UI title');
    expect(app.comic.project.preciseReferences, hasLength(1));
    expect(
        File(app.comic.project.preciseReferences.single.filePath).existsSync(),
        true);
  });
  test('preset imports validated PNG and persists before returning success',
      () async {
    final app = await fixture();
    expect(
        await app.comic
            .addPreciseReferencePreset(preset('${root.path}/source.png')),
        isNull);
    final ref = app.comic.project.preciseReferences.last;
    expect(ref.filePath, isNot('${root.path}/source.png'));
    expect(ref.strength, 0.7);
    expect(img.decodeImage(await File(ref.filePath).readAsBytes())!.width, 8);
    expect(
        (await app.storage.getComicProject(app.params))
            .preciseReferences
            .last
            .id,
        ref.id);
  });
  test('invalid preset and failed save leave no new file or project mutation',
      () async {
    final storage = AssetStorage(),
        app = await fixture(storage: storage),
        before = app.comic.revision;
    final corrupt = File('${root.path}/corrupt.png');
    await corrupt.writeAsString('not an image');
    expect(await app.comic.addPreciseReferencePreset(preset(corrupt.path)),
        isNotNull);
    storage.fail = true;
    expect(
        await app.comic
            .addPreciseReferencePreset(preset('${root.path}/source.png')),
        isNotNull);
    expect(app.comic.revision, before);
    expect(Directory('${root.path}/comic-assets').listSync(), isEmpty);
    expect(File('${root.path}/source.png').existsSync(), true);
  });
  test('picker reference import is all-or-nothing and rejects stale selection',
      () async {
    final app = await fixture(), before = app.comic.revision;
    final bad = File('${root.path}/bad.png');
    await bad.writeAsString('bad');
    selectFiles([File('${root.path}/source.png'), bad]);
    await expectLater(app.comic.pickPreciseReferences(), throwsStateError);
    expect(app.comic.revision, before);
    expect(Directory('${root.path}/comic-assets').listSync(), isEmpty);
    selectFiles([File('${root.path}/source.png')]);
    picker.onPick = () async {
      app.comic.project.title = 'changed while selecting';
    };
    await expectLater(app.comic.pickPreciseReferences(), throwsStateError);
    expect(app.comic.project.preciseReferences, hasLength(1));
    picker.onPick = null;
    await app.comic.pickPreciseReferences();
    expect((await app.storage.getComicProject(app.params)).preciseReferences,
        hasLength(2));
  });
  test('picker over limit performs no partial import', () async {
    final app = await fixture(), before = app.comic.revision;
    selectFiles(List.filled(5, File('${root.path}/source.png')));
    await expectLater(app.comic.pickPreciseReferences(), throwsStateError);
    expect(app.comic.revision, before);
    expect(Directory('${root.path}/comic-assets').existsSync(), false);
  });
  test(
      'portable schema round trip preserves override and excludes outputs and reference paths',
      () async {
    final app = await fixture();
    candidate(app);
    app.comic.project.panels.first
      ..overrideParams = true
      ..params.steps = 37;
    final data = portableComicProject(app.comic.project);
    expect(
        jsonEncode(data), isNot(contains(root.path.replaceAll(r'\', r'\\'))));
    expect((data['panels'] as List).first['candidates'], isEmpty);
    final copy = ComicProject.fromJson(data, app.params);
    expect(copy.panels.first.overrideParams, true);
    expect(copy.panels.first.params.steps, 37);
    expect(copy.preciseReferences, isEmpty);
    expect(copy.panels.first.candidates, isEmpty);
    final legacy =
        ComicProject.fromJson(app.comic.project.toJson(), app.params);
    expect(legacy.panels.first.overrideParams, true);
    expect(legacy.panels.first.params.steps, 37);
  });
  test(
      'UI JSON import commits once with backup and rejects persistence failure',
      () async {
    final storage = AssetStorage(),
        app = await fixture(storage: storage),
        before = app.comic.revision;
    final data = portableComicProject(app.comic.project)
      ..['title'] = 'imported';
    (data['panels'] as List).first['paramsOverride'] = {
      'enabled': true,
      'params': app.params.copy().toJson()..['steps'] = 35
    };
    final file = File('${root.path}/import.json');
    await file.writeAsString(jsonEncode(data));
    selectFiles([file]);
    storage.fail = true;
    await expectLater(app.comic.importProjectJson(), throwsStateError);
    expect(app.comic.revision, before);
    storage.fail = false;
    final oldId = app.comic.project.id;
    await app.comic.importProjectJson();
    expect(app.comic.project.id, isNot(oldId));
    expect((await app.storage.getComicProject(app.params)).title, 'imported');
    expect(app.comic.project.panels.first.overrideParams, true);
    expect(app.comic.project.panels.first.params.steps, 35);
  });
  test(
      'ZIP exports verified images with panel mapping and unique filenames without leaking paths',
      () async {
    final app = await fixture();
    candidate(app);
    app.comic.project.panels.insert(
        0, ComicPanel(id: 'empty', index: 1, title: 'empty', prompt: 'empty'));
    app.comic.project.panels.last.index = 2;
    await app.comic.exportSelectedZip();
    final first = app.comic.lastExport!;
    await app.comic.exportSelectedZip();
    final second = app.comic.lastExport!;
    expect(first['filePath'], isNot(second['filePath']));
    expect(shared, hasLength(2));
    for (final receipt in [first, second]) {
      final bytes = await File(receipt['filePath']).readAsBytes();
      expect(sha256.convert(bytes).toString(), receipt['sha256']);
      expect(receipt['count'], 1);
      final archive = ZipDecoder().decodeBytes(bytes, verify: true);
      final mapping =
          jsonDecode(utf8.decode(archive.findFile('images.json')!.content));
      expect(mapping.single['index'], 2);
      expect(mapping.single['panelId'], 'p');
      expect(mapping.single['file'], 'images/001.png');
      expect(
          sha256
              .convert(archive.findFile(mapping.single['file'])!.content)
              .toString(),
          mapping.single['sha256']);
      final json = utf8.decode(archive.findFile('project.json')!.content);
      expect(json, isNot(contains('source.png')));
      expect(json, isNot(contains('private')));
    }
  });
  test('corrupt selected image never publishes partial ZIP', () async {
    final app = await fixture();
    candidate(app);
    await File('${root.path}/source.png').writeAsString('bad');
    await expectLater(app.comic.exportSelectedZip(), throwsStateError);
    expect(shared, isEmpty);
    expect(app.comic.exporting, false);
    expect(Directory('${root.path}/comic-assets').existsSync(), false);
  });
  test(
      'share failure retains verified ZIP receipt and controller does not announce success',
      () async {
    final app = await fixture();
    candidate(app);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            channel,
            (call) async =>
                throw PlatformException(code: 'fixture share failed'));
    await expectLater(app.comic.exportSelectedZip(), throwsStateError);
    final receipt = app.comic.lastExport!;
    expect(receipt['shared'], false);
    expect(File(receipt['filePath']).existsSync(), true);
    expect(app.comic.statusKey, isNot('comic.zipShared'));
    expect(app.comic.exporting, false);
    expect(
        sha256
            .convert(await File(receipt['filePath']).readAsBytes())
            .toString(),
        receipt['sha256']);
  });
  test(
      'concurrent export rejected while share pending and later export is permitted',
      () async {
    final app = await fixture();
    candidate(app);
    final gate = Completer<void>(), entered = Completer<void>();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      entered.complete();
      await gate.future;
      return 'fixture';
    });
    final pending = app.comic.exportSelectedZip();
    await entered.future;
    await expectLater(app.comic.exportProjectJson(), throwsStateError);
    expect(app.comic.exporting, true);
    gate.complete();
    await pending;
    expect(app.comic.exporting, false);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async => 'fixture');
    await app.comic.exportProjectJson();
    expect(app.comic.lastExport!['filePath'], endsWith('.json'));
  });
  test(
      'export project change during root resolution rejects without partial output',
      () async {
    final app = await fixture();
    candidate(app);
    final c = ComicController(app,
        assets: ComicAssetStore(root: () async {
          app.comic.project.title = 'changed';
          return Directory('${root.path}/stale');
        }, share: (_) async {
          fail('must not share');
        }));
    addTearDown(c.dispose);
    c.project = app.comic.project;
    await expectLater(c.exportSelectedZip(), throwsStateError);
    expect(Directory('${root.path}/stale').listSync(), isEmpty);
    expect(c.exporting, false);
  });
  test(
      'post-rename revision failure removes only newly created export and preserves originals',
      () async {
    final app = await fixture();
    candidate(app);
    final dir = Directory('${root.path}/exports');
    await dir.create();
    final prior = File('${dir.path}/keep.zip');
    await prior.writeAsString('keep');
    final assets = ComicAssetStore(
        root: () async => dir,
        share: (_) async {
          fail('must not share');
        });
    var checks = 0;
    await expectLater(
        assets.exportSelected(
            app.comic.project, portableComicProject(app.comic.project), () {
          if (++checks == 5) throw StateError('stale after rename');
        }),
        throwsStateError);
    expect(dir.listSync(), hasLength(1));
    expect(dir.listSync().single.resolveSymbolicLinksSync(),
        prior.resolveSymbolicLinksSync());
    expect(await prior.readAsString(), 'keep');
    expect(File('${root.path}/source.png').existsSync(), true);
  });

  test('a failed later export replaces stale success status and receipt',
      () async {
    final app = await fixture();
    candidate(app);
    await app.comic.exportSelectedZip();
    final previous = app.comic.lastExport!['filePath'];
    await File('${root.path}/source.png').delete();
    await expectLater(app.comic.exportSelectedZip(), throwsStateError);
    expect(app.comic.lastExport, isNull);
    expect(app.comic.statusDetail, contains('图片不存在'));
    expect(File(previous).existsSync(), true);
  });
}
