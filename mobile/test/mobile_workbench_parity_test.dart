import 'package:flutter/material.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/mobile_bulk_controls.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Images extends Storage {
  final staged = <String>{};
  bool fail = false;
  @override
  Future<StylePromptPreviewImage?> copyStylePromptPreviewImage(
      {required String presetId,
      required String sourcePath,
      required String sourceName}) async {
    final id = presetId + sourcePath;
    staged.add(id);
    return StylePromptPreviewImage(
        id: id, name: sourceName, filePath: id, createdAt: 'now');
  }

  @override
  Future<void> setSettings(AppSettings settings) async {
    if (fail) throw StateError('test storage write failed');
  }

  @override
  Future<void> deleteStylePromptPreviewImage(
      String presetId, StylePromptPreviewImage image) async {
    staged.remove(image.id);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('desktop segmented TXT and mixed-language numbering', () {
    final rows =
        parseMobileRoles('【角色一】 正面：day\n负面: fog\nCharacter 2: night', 6);
    expect(rows, [
      {'prompt': 'day', 'negativePrompt': 'fog'},
      {'prompt': 'night'}
    ]);
    expect(() => parseMobileRoles('角色2: missing', 6), throwsFormatException);
    expect(() => parseMobileRoles('角色1: day\n角色1: again', 6),
        throwsFormatException);
    expect(parseMobileRoles('a\n\nb', 6), [
      {'prompt': 'a'},
      {'prompt': 'b'}
    ]);
  });
  test(
      'batch attach is atomic and only adds example images, not workspace references',
      () async {
    final store = _Images(), a = AppState(storage: store);
    a.settings.stylePromptPresets = [
      for (final id in ['a', 'b'])
        StylePromptPreset(id: id, name: id, prompt: 'p', createdAt: 'now')
    ];
    const ids = {'a', 'b'};
    await a.attachStyleExamplesTogether(ids, [(path: 'one', name: 'one.png')]);
    final prev = a.settings.stylePromptPresets
        .map((p) => p.previewImages.first.id)
        .toList();
    expect(prev, ['aone', 'bone']);
    expect(a.workbenchImage, isNull);
    expect(a.extras.vibeImages, isEmpty);
    expect(a.extras.preciseReferences, isEmpty);
    store.fail = true;
    await expectLater(
        a.attachStyleExamplesTogether(ids, [(path: 'two', name: 'two.png')]),
        throwsStateError);
    expect(store.staged, {'aone', 'bone'});
    expect(
        a.settings.stylePromptPresets.every((p) => p.previewImages.length == 1),
        isTrue);
    await expectLater(
        a.attachStyleExamplesTogether(
            ids, List.filled(9, (path: 'over', name: 'over.png'))),
        throwsStateError);
    expect(store.staged, {'aone', 'bone'});
    a.dispose();
  });
  for (final attach in [true, false]) {
    testWidgets(
        'style multi-selection UI requires explicit targets and confirmation (attach=$attach)',
        (t) async {
      MobileStyleMove? result;
      final styles = [
        for (final id in ['one', 'two', 'three'])
          StylePromptPreset(id: id, name: id, prompt: '', createdAt: 'now')
      ];
      await t.pumpWidget(MaterialApp(
          home: Builder(
              builder: (c) => Scaffold(
                  body: TextButton(
                      child: const Text('open'),
                      onPressed: () async {
                        result = await showDialog<MobileStyleMove>(
                            context: c,
                            builder: (_) => MoveMobileStylesDialog(
                                styles: styles,
                                groups: const ['Default', 'target'],
                                language: 'zh-CN',
                                attach: attach));
                      })))));
      await t.tap(find.text('open'));
      await t.pumpAndSettle();
      expect(
          t.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
      await t.tap(find.text('one'));
      await t.tap(find.text('two'));
      await t.pumpAndSettle();
      if (!attach) {
        expect(t.widget<FilledButton>(find.byType(FilledButton)).onPressed,
            isNull);
        await t.tap(find.text('—'));
        await t.pumpAndSettle();
        await t.tap(find.text('target').last);
        await t.pumpAndSettle();
      }
      expect(result, isNull);
      await t.tap(find.byType(FilledButton));
      await t.pumpAndSettle();
      expect(result!.ids, {'one', 'two'});
      if (!attach) expect(result!.group, 'target');
    });
  }
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('bulk parser refuses unknown keys, invalid slots and oversize arrays',
      () {
    for (final v in [
      '[]',
      '{"characters":[{}]}',
      '[{"prompt":"ok","x":1}]',
      '[{"prompt":"a"},{"prompt":"b"}]'
    ]) {
      expect(() => parseMobileRoles(v, 1), throwsFormatException);
    }
  });
  testWidgets(
      'bulk roles preview then apply; keep negative, coordinates and trailing character',
      (t) async {
    final a = AppState();
    a.settings.language = 'zh-CN';
    a.extras.charCaptions = [
      CharCaptionItem(
          name: 'A',
          prompt: 'day',
          negativePrompt: 'fog',
          enabled: false,
          useCoords: true,
          x: .2),
      CharCaptionItem(prompt: 'keep')
    ];
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: a,
        child: MaterialApp(
            home: Builder(
                builder: (ctx) => Scaffold(
                    body: TextButton(
                        onPressed: () => showDialog<void>(
                            context: ctx,
                            builder: (_) => const MobileRoleBulkDialog()),
                        child: const Text('open')))))));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    await t.enterText(
        find.byType(TextField), '{"characters":[{"prompt":"night"}]}');
    await t.tap(find.text('预览'));
    await t.pumpAndSettle();
    expect(a.extras.charCaptions.first.prompt, 'day');
    await t.tap(find.text('填充'));
    await t.pumpAndSettle();
    final c = a.extras.charCaptions.first;
    expect([
      c.prompt,
      c.name,
      c.negativePrompt,
      c.enabled,
      c.useCoords,
      c.x,
      a.extras.charCaptions.last.prompt
    ], [
      'night',
      'A',
      'fog',
      false,
      true,
      .2,
      'keep'
    ]);
    final snap = roleSnapshot(a);
    c.prompt = 'edited';
    expect(
        fillMobileRoles(a, snap, [
          {'prompt': 'stale'}
        ]),
        isFalse);
    expect(c.prompt, 'edited');
    a.dispose();
  });
  test(
      'bulk style move commits chosen IDs together and rejects stale selection without partial change',
      () async {
    final a = AppState();
    a.settings.stylePromptPresetGroups = ['B', 'C'];
    a.settings.stylePromptPresets = [
      for (final id in ['one', 'two', 'three'])
        StylePromptPreset(
            id: id, name: id, prompt: 'original', createdAt: '2026-01-01')
    ];
    await a.moveStylePresetsTogether({'one', 'three'}, 'B');
    List<String> groups() =>
        a.settings.stylePromptPresets.map((p) => p.group).toList();
    expect(groups(), ['B', 'Default', 'B']);
    await expectLater(
        a.moveStylePresetsTogether({'one', 'missing'}, 'C'), throwsStateError);
    expect(groups(), ['B', 'Default', 'B']);
    expect(a.workbenchImage, isNull);
    a.dispose();
  });
  test(
      'move waiting jobs preserves snapshots and reservations; running/missing ID is rejected',
      () {
    final a = AppState();
    final jobs = [
      for (final id in ['a', 'b', 'c'])
        GenerationQueueJob(
            id: id,
            params: a.params.copy(),
            extras: a.extras.copy(),
            quotedAnlas: 4,
            addedAt: DateTime(2026))
    ];
    a.generationQueue.addAll(jobs);
    a.queueReservedAnlas = 12;
    expect(a.movePendingQueueJob('b', -1), isTrue);
    expect(a.generationQueue, [jobs[1], jobs[0], jobs[2]]);
    expect(a.movePendingQueueJob('running', 1), isFalse);
    expect(a.movePendingQueueJob('b', -1), isFalse);
    expect(a.queueReservedAnlas, 12);
    expect(a.movePendingQueueJob('b', 1), isTrue);
    expect(a.generationQueue, jobs);
    a.dispose();
  });
}
