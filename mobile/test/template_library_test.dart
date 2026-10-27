import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/template_library.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/prompts/prompt_skill_v3.dart';
import 'package:novelai_mobile/prompts/prompt_skill_selection.dart';
import 'package:novelai_mobile/models/nai_models.dart';

List<MobileBuiltinTemplate> fixtures() => mobileTemplateSlots
    .map((slot) => MobileBuiltinTemplate(
        id: 'builtin-$slot',
        slot: slot,
        name: slot,
        body: 'original $slot {{input}}',
        sha256: mobileTemplateDigest('original $slot {{input}}'),
        sourceFile: 'fixture',
        sourceVersion: slot == 'comic.jp-page'
            ? '4.1'
            : slot == 'comic.single-panel'
                ? '1.0'
                : null,
        skillVersion: slot.startsWith('image.') ? '3.0.0' : null))
    .toList();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late MobileTemplateLibrary library;
  setUp(() async {
    dir = await Directory.systemTemp.createTemp('template-library-test-');
    library = MobileTemplateLibrary(
        directoryProvider: () async => dir, builtinFixture: fixtures());
    await library.load();
  });
  tearDown(() async {
    library.dispose();
    await dir.delete(recursive: true);
  });

  test('first launch with no library is a legitimate built-in-only state',
      () async {
    expect(library.loaded, isTrue);
    expect(library.readOnly, isFalse);
    expect(library.revision, 'missing');
    expect(library.resolve('comic.jp-page').source, 'builtin');
    expect(await (await library.file).exists(), isFalse);
  });
  test(
      'disappearance after a known custom selection fails closed without recreating a file',
      () async {
    final id = await library.create(
        slot: 'comic.jp-page',
        name: 'Known custom',
        body: 'selected body',
        activate: true);
    final knownRevision = library.revision;
    final f = await library.file;
    await f.delete();
    await library.load();
    expect(library.readOnly, isTrue);
    expect(library.revision, knownRevision);
    expect(library.custom.single.id, id);
    expect(library.error, contains('missing'));
    expect(() => library.resolve('comic.jp-page'), throwsStateError);
    await expectLater(
        library.create(
            slot: 'comic.jp-page', name: 'replacement', body: 'must not reset'),
        throwsStateError);
    expect(await f.exists(), isFalse);
  });

  test(
      'the eight actual assets retain the exact desktop source bodies and hashes',
      () async {
    final builtins = await MobileTemplateLibrary.loadBuiltins();
    expect(builtins, hasLength(8));
    final catalogs = [
      'prompt-skill-catalog-v3.json',
      'comic-template-catalog.json'
    ];
    final expected = <String, String>{};
    for (final file in catalogs) {
      final json =
          jsonDecode(await File('../shared/$file').readAsString()) as Map;
      for (final row in json['templates'] as List) {
        expected[row['slot']] = row['body'];
      }
    }
    for (final builtin in builtins) {
      expect(builtin.body, expected[builtin.slot]);
      expect(builtin.sha256, mobileTemplateDigest(builtin.body));
    }
    expect(builtins.singleWhere((v) => v.slot == 'comic.jp-page').sourceVersion,
        '4.1');
    expect(
        builtins
            .singleWhere((v) => v.slot == 'comic.single-panel')
            .sourceVersion,
        '1.0');
  });
  test('builtins stay read-only; a named fork preserves body and origin',
      () async {
    final original = library.resolve('comic.jp-page');
    final id = await library.create(
        slot: 'comic.jp-page',
        name: 'My page',
        body: original.body,
        fromBuiltinId: original.id);
    expect(library.resolve('comic.jp-page').source, 'builtin');
    expect(library.custom.single.id, id);
    expect(library.custom.single.origin['builtinSha256'], original.sha256);
    await library.update(id: id, name: 'Renamed', body: 'my page {{input}}');
    expect(library.builtins.singleWhere((v) => v.slot == 'comic.jp-page').body,
        original.body);
    await library.select('comic.jp-page', id: id, source: 'custom');
    expect(library.resolve('comic.jp-page').body, 'my page {{input}}');
    await library.reset('comic.jp-page');
    expect(library.resolve('comic.jp-page').source, 'builtin');
    expect(library.custom, hasLength(1));
  });
  test('saving and reopening preserves custom body and selection', () async {
    final id = await library.create(
        slot: 'image.convert.mixed',
        name: 'My mixed',
        body: r'Keep $1 $& {{input}}',
        activate: true);
    final reopened = MobileTemplateLibrary(
        directoryProvider: () async => dir, builtinFixture: fixtures());
    await reopened.load();
    expect(reopened.resolve('image.convert.mixed').id, id);
    expect(
        reopened.resolve('image.convert.mixed').body, r'Keep $1 $& {{input}}');
    expect(jsonDecode(await (await library.file).readAsString())['schema'],
        'langbai.template-library/1');
    reopened.dispose();
  });
  test('imports create new IDs and collision-safe names without overwrites',
      () async {
    final preview = parseMobileTemplateImport(
        '[{"slot":"comic.jp-page","name":"Same","body":"one"},{"slot":"comic.jp-page","name":"Same","body":"two"}]',
        '../bundle.json',
        'comic.single-panel');
    final ids = await library.importEntries(preview.entries, activate: true);
    expect(ids.toSet(), hasLength(2));
    expect(library.custom.map((v) => v.name), ['Same', 'Same (2)']);
    expect(library.resolve('comic.jp-page').body, 'two');
    final exported = parseMobileTemplateImport(
        library.exportCustomJson(), 'roundtrip.json', 'comic.jp-page');
    expect(exported.entries.map((v) => v.body), ['one', 'two']);
  });
  test('an invalid batch fails before any commit and preserves existing bytes',
      () async {
    await library.create(slot: 'comic.jp-page', name: 'existing', body: 'keep');
    final before = await (await library.file).readAsBytes();
    expect(
        () => parseMobileTemplateImport(
            '[{"name":"good","body":"valid"},{"name":"bad","body":""}]',
            'bad.json',
            'comic.jp-page'),
        throwsFormatException);
    await expectLater(
        library.importEntries(const [
          MobileTemplateImportEntry(
              slot: 'comic.jp-page', name: 'good', body: 'valid'),
          MobileTemplateImportEntry(
              slot: 'comic.jp-page', name: 'bad', body: '')
        ]),
        throwsFormatException);
    expect(await (await library.file).readAsBytes(), before);
    expect(library.custom, hasLength(1));
  });
  test('CAS rejects stale UI revisions and separately loaded writers',
      () async {
    final second = MobileTemplateLibrary(
        directoryProvider: () async => dir, builtinFixture: fixtures());
    await second.load();
    final stale = library.revision;
    await library.create(slot: 'comic.jp-page', name: 'first', body: 'one');
    await expectLater(
        library.create(
            slot: 'comic.jp-page',
            name: 'stale',
            body: 'two',
            expectedRevision: stale),
        throwsStateError);
    await expectLater(
        second.create(
            slot: 'comic.jp-page', name: 'second writer', body: 'three'),
        throwsStateError);
    await second.load();
    expect(second.custom, hasLength(1));
    second.dispose();
  });
  test('simultaneous library instances cannot silently overwrite each other',
      () async {
    final second = MobileTemplateLibrary(
        directoryProvider: () async => dir, builtinFixture: fixtures());
    await second.load();
    final outcomes = await Future.wait([
      library
          .create(slot: 'comic.jp-page', name: 'first', body: 'one')
          .then((_) => true, onError: (_) => false),
      second
          .create(slot: 'comic.jp-page', name: 'second', body: 'two')
          .then((_) => true, onError: (_) => false),
    ]);
    expect(outcomes.where((v) => v), hasLength(1));
    await library.load();
    expect(library.custom, hasLength(1));
    second.dispose();
  });
  test('corrupt raw file is preserved and runtime/mutation fail closed',
      () async {
    final raw = utf8.encode('{this is not JSON');
    await (await library.file).writeAsBytes(raw);
    await library.load();
    expect(library.readOnly, isTrue);
    expect(library.error, isNotNull);
    expect(() => library.resolve('comic.jp-page'), throwsStateError);
    await expectLater(
        library.create(
            slot: 'comic.jp-page', name: 'replacement', body: 'unsafe reset'),
        throwsStateError);
    expect(await library.backupRaw(), raw);
    expect(await (await library.file).readAsBytes(), raw);
  });
  test('tampered selected custom never silently falls back to built-in',
      () async {
    await library.create(
        slot: 'comic.jp-page',
        name: 'selected',
        body: 'original custom',
        activate: true);
    final f = await library.file;
    final obj = jsonDecode(await f.readAsString());
    obj['custom'][0]['body'] = 'modified without hash';
    final corrupt = jsonEncode(obj);
    await f.writeAsString(corrupt);
    await library.load();
    expect(library.readOnly, isTrue);
    expect(() => library.resolve('comic.jp-page'), throwsStateError);
    expect(await f.readAsString(), corrupt);
  });
  test('missing selected record and quarantine are blocked rather than erased',
      () async {
    final bad = {
      'schema': 'langbai.template-library/1',
      'revision': 1,
      'custom': [],
      'selection': {
        'comic.jp-page': {'kind': 'custom', 'id': 'missing'}
      },
      'quarantine': []
    };
    final f = await library.file;
    await f.writeAsString(jsonEncode(bad));
    await library.load();
    expect(library.readOnly, isTrue);
    bad['selection'] = {};
    bad['quarantine'] = [
      {'bad': 'record'}
    ];
    await f.writeAsString(jsonEncode(bad));
    await library.load();
    expect(library.readOnly, isTrue);
  });
  test(
      'removing selected custom resets only that slot and preserves other records',
      () async {
    final a = await library.create(
        slot: 'comic.jp-page', name: 'a', body: 'a', activate: true);
    final b = await library.create(
        slot: 'comic.single-panel', name: 'b', body: 'b', activate: true);
    await library.remove(a);
    expect(library.resolve('comic.jp-page').source, 'builtin');
    expect(library.resolve('comic.single-panel').id, b);
    expect(library.custom, hasLength(1));
  });
  test('restoration merges with collision-safe names and is idempotent',
      () async {
    final incomingDir =
        await Directory.systemTemp.createTemp('template-library-backup-');
    final incoming = MobileTemplateLibrary(
        directoryProvider: () async => incomingDir, builtinFixture: fixtures());
    await incoming.load();
    await incoming.create(
        slot: 'comic.jp-page', name: 'same', body: 'incoming', activate: true);
    final raw = (await incoming.backupRaw())!;
    final existing = await library.create(
        slot: 'comic.jp-page', name: 'same', body: 'existing', activate: true);
    await library.restoreRaw(raw);
    expect(library.custom, hasLength(2));
    expect(library.resolve('comic.jp-page').id, existing);
    expect(library.custom.last.name, 'same (2)');
    await library.restoreRaw(raw);
    expect(library.custom, hasLength(2));
    incoming.dispose();
    await incomingDir.delete(recursive: true);
  });
  test(
      'malicious metadata remains data; invalid slot, NUL and UTF-8 size are rejected',
      () {
    final preview = parseMobileTemplateImport(
        '{"id":"../../not-used","path":"C:/not-used","slot":"comic.jp-page","body":"{{input}}","name":"safe","script":"not-run"}',
        'file.json',
        'comic.single-panel');
    expect(preview.entries.single.body, '{{input}}');
    expect(preview.entries.single.origin['fileName'], 'file.json');
    expect(
        () => parseMobileTemplateImport('{"slot":"bad","name":"x","body":"x"}',
            'file.json', 'comic.jp-page'),
        throwsFormatException);
    expect(() => mobileTemplateBody('x\x00y'), throwsFormatException);
    expect(() => mobileTemplateBody(List.filled(100000, '中').join()),
        throwsFormatException);
  });
  test('v3 independent selection preserves v1/v2 overrides and rejects V4.5',
      () {
    checkPromptSkillSelection('3.0.0', 'v5');
    expect(() => checkPromptSkillSelection('3.0.0', 'v4.5'),
        throwsFormatException);
    final settings = AppSettings();
    settings.convertPromptTemplates = {'mixed': 'legacy'};
    settings.convertPromptTemplatesV2 = {'mixed': 'v2'};
    expect(promptSkillOverrides(settings, 'convert', '3.0.0', 'v5'), isEmpty);
    selectPromptSkill(settings, 'convert', '3.0.0', 'v5');
    expect(settings.convertPromptTemplates['mixed'], 'legacy');
    expect(settings.convertPromptTemplatesV2['mixed'], 'v2');
    expect(() => selectPromptSkill(settings, 'assistant', '3.0.0', 'v5'),
        throwsFormatException);
    const library = PromptTemplateLibrary(skillCatalogV3: {
      'templates': [
        {'task': 'convert', 'mode': 'mixed', 'body': 'exact v3'}
      ]
    });
    expect(
        library.resolve(
            'convert', ReversePromptMode.mixed, {'mixed': 'wrong v2'},
            templateVersion: 'v5', skillVersion: '3.0.0'),
        'exact v3');
    expect(
        library.resolve('convert', ReversePromptMode.mixed, {},
            templateVersion: 'v5',
            skillVersion: '3.0.0',
            libraryBody: 'selected custom'),
        'selected custom');
    expect(
        () => library.resolve('convert', ReversePromptMode.mixed, {},
            templateVersion: 'v5', skillVersion: '3.0.0', libraryBody: ''),
        throwsFormatException);
  });
  test('v3 response keeps source rules instead of enforcing v2 density', () {
    expect(parsePromptSkillV3Response('1girl, red scarf\n#单元数: 2').prompt,
        '1girl, red scarf');
    expect(parsePromptSkillV3Response('```text\n1girl\n```').prompt, '1girl');
    expect(() => parsePromptSkillV3Response('```text\n1girl'),
        throwsFormatException);
    expect(() => parsePromptSkillV3Response('信息不足：请补充'), throwsFormatException);
    final known = parsePromptSkillV3Response(
        '{"namePrompt":"a","featurePrompt":"b"}',
        knownCharacter: true);
    expect(known.variants!.featurePrompt, 'b');
    expect(
        () => parsePromptSkillV3Response('{"namePrompt":"a"}',
            knownCharacter: true),
        throwsFormatException);
  });
}
