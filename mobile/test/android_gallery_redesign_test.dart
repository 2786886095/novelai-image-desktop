import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';

class _GalleryState extends AppState {
  int generated = 0;
  int parameterUpdates = 0;
  final deleted = <String>[];

  @override
  void setParam(void Function(GenerateParams) update) {
    parameterUpdates++;
    update(params);
    notifyListeners();
  }

  @override
  Future<void> generate() async => generated++;

  @override
  Future<void> reconcileMissingHistory() async {}

  @override
  Future<void> deleteHistory(String id) async {
    deleted.add(id);
    history = history.where((item) => item.id != id).toList();
    notifyListeners();
  }

  void replacePath(String id, String path) {
    history = history
        .map((item) => item.id == id
            ? HistoryItem.fromJson({...item.toJson(), 'filePath': path})
            : item)
        .toList();
    notifyListeners();
  }
}

class _Fixture {
  final _GalleryState state;
  final List<File> files;
  final List<int> originalBytes;
  int openedCreate = 0;

  _Fixture(this.state, this.files, this.originalBytes);
}

Future<_Fixture> _pumpGallery(
  WidgetTester tester, {
  bool callback = true,
  TargetPlatform platform = TargetPlatform.android,
  Size size = const Size(360, 800),
  double textScale = 1,
}) async {
  debugDefaultTargetPlatformOverride = platform;
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  final directory = Directory.systemTemp.createTempSync('android-gallery-ui-');
  final png = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  final files = [
    for (final name in ['first.png', 'second.png', 'renamed.png'])
      File('${directory.path}${Platform.pathSeparator}$name')
        ..writeAsBytesSync(png)
  ];
  final first = GenerateParams()
    ..model = 'nai-diffusion-5-full'
    ..positivePrompt = 'first fixture, no generation'
    ..width = 832
    ..height = 1216
    ..seed = 101;
  final second = GenerateParams()
    ..model = 'nai-diffusion-5-full'
    ..positivePrompt = 'second fixture, no generation'
    ..negativePrompt = 'fixture negative'
    ..width = 1216
    ..height = 832
    ..steps = 31
    ..seed = 202;
  final state = _GalleryState()
    ..history = [
      HistoryItem(
          id: 'first',
          filePath: files[0].path,
          date: '2026-10-31',
          createdAt: '2026-10-31T10:00:00',
          seed: 101,
          model: first.model,
          width: first.width,
          height: first.height,
          prompt: first.positivePrompt,
          params: first.toJson()),
      HistoryItem(
          id: 'second',
          filePath: files[1].path,
          date: '2026-10-30',
          createdAt: '2026-10-30T10:00:00',
          seed: 202,
          model: second.model,
          width: second.width,
          height: second.height,
          prompt: second.positivePrompt,
          params: second.toJson()),
    ];
  state.settings.language = 'zh-CN';
  final fixture = _Fixture(state, files, png);
  addTearDown(() async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    state.dispose();
    PaintingBinding.instance.imageCache
      ..clear()
      ..clearLiveImages();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    // Delete only these exact test-owned files, never a recursive user path.
    for (final file in files) {
      if (file.existsSync()) file.deleteSync();
    }
    if (directory.existsSync()) directory.deleteSync();
    tester.view.reset();
    debugDefaultTargetPlatformOverride = null;
  });
  await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
    value: state,
    child: MaterialApp(
      theme: androidStudioTheme(ThemeData(platform: platform)),
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!),
      home: GalleryScreen(
          onOpenCreate: callback ? () => fixture.openedCreate++ : null),
    ),
  ));
  await tester.pumpAndSettle();
  return fixture;
}

Future<void> _openFirst(WidgetTester tester) async {
  await tester.tap(find.text('first.png'));
  await tester.pumpAndSettle();
  expect(find.byKey(const ValueKey('android-gallery-viewer')), findsOneWidget);
}

// Widget invariants are verified before addTearDown runs. Clear the platform
// override in the test-body finally, while retaining later file/state cleanup.
void _galleryTest(
    String description, Future<void> Function(WidgetTester) body) {
  testWidgets(description, (tester) async {
    try {
      await body(tester);
    } finally {
      try {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      } finally {
        debugDefaultTargetPlatformOverride = null;
      }
    }
  });
}

void main() {
  _galleryTest('Android callback enters dated grid and long press batch mode',
      (tester) async {
    final fixture = await _pumpGallery(tester);
    expect(find.byKey(const ValueKey('android-gallery-grid')), findsOneWidget);
    expect(find.byKey(const ValueKey('android-gallery-group-filter')),
        findsOneWidget);
    expect(find.byKey(const ValueKey('android-gallery-date-filter')),
        findsOneWidget);
    expect(find.text('2026-10-31'), findsWidgets);
    await tester.longPress(find.text('first.png'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('works-batch-edit')), findsOneWidget);
    expect(find.byIcon(Icons.drive_file_move_outline), findsOneWidget);
    expect(find.byIcon(Icons.archive_outlined), findsOneWidget);
    expect(fixture.state.generated, 0);
    expect(tester.takeException(), isNull);
  });

  for (final scenario in [
    (TargetPlatform.android, false),
    (TargetPlatform.iOS, true)
  ]) {
    _galleryTest(
        'classic gallery retained for ${scenario.$1.name}, callback=${scenario.$2}',
        (tester) async {
      await _pumpGallery(tester, platform: scenario.$1, callback: scenario.$2);
      expect(find.byKey(const ValueKey('android-gallery-grid')), findsNothing);
      expect(find.byType(GridView), findsOneWidget);
      await tester.tap(find.text('first.png'));
      await tester.pumpAndSettle();
      expect(
          find.byKey(const ValueKey('android-gallery-viewer')), findsNothing);
      expect(find.byType(DraggableScrollableSheet), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  _galleryTest('filmstrip chooses matching record; reuse only applies params',
      (tester) async {
    final fixture = await _pumpGallery(tester);
    await _openFirst(tester);
    await tester
        .tap(find.byKey(const ValueKey('android-gallery-thumbnail-second')));
    await tester.pumpAndSettle();
    expect(find.textContaining('2/2 · second.png'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('android-gallery-reuse')));
    await tester.pumpAndSettle();
    expect(fixture.state.parameterUpdates, 1);
    expect(
        fixture.state.params.positivePrompt, 'second fixture, no generation');
    expect(fixture.state.params.negativePrompt, 'fixture negative');
    expect(fixture.state.params.seed, 202);
    expect(fixture.state.params.width, 1216);
    expect(fixture.state.params.height, 832);
    expect(fixture.state.params.steps, 31);
    expect(fixture.state.generated, 0);
    expect(fixture.openedCreate, 0);
    await tester.tap(find.text('去创作'));
    await tester.pumpAndSettle();
    expect(fixture.openedCreate, 1);
    expect(find.byKey(const ValueKey('android-gallery-viewer')), findsNothing);
    for (final file in fixture.files) {
      expect(file.readAsBytesSync(), fixture.originalBytes);
    }
    expect(tester.takeException(), isNull);
  });

  for (final scenario in [
    (const Size(360, 800), 1.5),
    (const Size(760, 400), 1.0)
  ]) {
    _galleryTest(
        'viewer labelled horizontal actions at ${scenario.$1} x${scenario.$2}',
        (tester) async {
      final fixture =
          await _pumpGallery(tester, size: scenario.$1, textScale: scenario.$2);
      await _openFirst(tester);
      expect(find.byKey(const ValueKey('android-gallery-horizontal-actions')),
          findsOneWidget);
      expect(find.byKey(const ValueKey('android-gallery-vertical-actions')),
          findsNothing);
      expect(find.text('导出/分享'), findsOneWidget);
      expect(fixture.state.generated, 0);
      expect(tester.takeException(), isNull);
    });
  }

  _galleryTest('current live path is used after history record changes',
      (tester) async {
    final fixture = await _pumpGallery(tester);
    await _openFirst(tester);
    fixture.state.replacePath('first', fixture.files[2].path);
    await tester.pumpAndSettle();
    expect(find.textContaining('renamed.png'), findsWidgets);
    await tester.tap(find.byKey(const ValueKey('android-gallery-action-3')));
    await tester.pumpAndSettle();
    for (final key in ['rename', 'move', 'path', 'favorite', 'delete']) {
      expect(find.byKey(ValueKey('android-gallery-more-$key')), findsOneWidget);
    }
    await tester.tap(find.byKey(const ValueKey('android-gallery-more-path')));
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<SelectableText>(
                find.byKey(const ValueKey('gallery-full-file-path')))
            .data,
        fixture.files[2].absolute.path);
    expect(fixture.state.generated, 0);
    expect(tester.takeException(), isNull);
  });

  _galleryTest('confirmed delete keeps next existing image in viewer',
      (tester) async {
    final fixture = await _pumpGallery(tester);
    await _openFirst(tester);
    await tester.tap(find.byKey(const ValueKey('android-gallery-action-3')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('android-gallery-more-delete')));
    await tester.pumpAndSettle();
    expect(fixture.state.deleted, isEmpty);
    await tester.tap(find.descendant(
        of: find.byType(AlertDialog), matching: find.byType(FilledButton)));
    await tester.pumpAndSettle();
    expect(fixture.state.deleted, ['first']);
    expect(
        find.byKey(const ValueKey('android-gallery-viewer')), findsOneWidget);
    expect(find.textContaining('1/1 · second.png'), findsOneWidget);
    expect(fixture.state.generated, 0);
    expect(tester.takeException(), isNull);
  });
}
