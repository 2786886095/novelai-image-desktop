// Real Android/iOS engine journeys. No platform, vault, Storage or API mocks.
// The only provider is a bounded local HTTP fixture with a synthetic credential.
// ignore_for_file: avoid_print, curly_braces_in_flow_control_structures
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/comic/comic_prompt.dart';
import 'package:novelai_mobile/comic/comic_prompt_composer.dart';
import 'package:novelai_mobile/comic/comic_prompt_controller.dart';
import 'package:novelai_mobile/i18n/template_feature_text.dart';
import 'package:novelai_mobile/prompts/template_library.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/screens/prompt_skill_selector.dart';
import 'package:novelai_mobile/screens/template_library_screen.dart';
import 'package:novelai_mobile/services/data_backup_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'native_scenario_support.dart';

final suite = NativeScenarios(8);
const japaneseCheckpointKey = 'native_japanese_v3_checkpoint';
Future<void> main() => suite.run(_run);
Future<void> _wait(FutureOr<bool> Function() condition, String label) async {
  final limit = DateTime.now().add(const Duration(seconds: 45));
  while (!await condition()) {
    require(DateTime.now().isBefore(limit), 'Timed out: $label');
    await frame();
  }
}

T _widget<T extends Widget>(Key key) =>
    elements((w) => w.key == key).single.widget as T;
Future<void> _press(Key key) async {
  final button = _widget<ButtonStyleButton>(key);
  require(button.onPressed != null, 'Disabled native control $key');
  button.onPressed!();
  await frame();
}

Future<void> _edit(Key key, String text) async {
  final field = _widget<TextField>(key);
  require(
      field.enabled != false && !field.readOnly, 'Native field not editable');
  field.controller?.text = text;
  field.onChanged!(text);
  await frame();
}

Future<ComicPromptComposerController> _composer() async {
  await _wait(() => elements((w) => w is ComicPromptComposerView).length == 1,
      'production composer mounted');
  final c = (elements((w) => w is ComicPromptComposerView).single.widget
          as ComicPromptComposerView)
      .controller;
  await _wait(() => c.loaded, 'native draft loaded');
  return c;
}

Future<void> _settled(ComicPromptComposerController c) async {
  await _wait(() => !c.busy, 'request settled');
  await frame();
}

Future<void> _run() async {
  final c = await NativeContext.create('japanese-comic-v3'), app = c.app;
  final requests = <Map<String, dynamic>>[], errors = <Object>[];
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  var responseMode = 'success';
  Completer<void>? entered, release;
  server.listen((r) async {
    var held = false;
    try {
      require(
          r.connectionInfo!.remoteAddress.isLoopback, 'Non-loopback transport');
      require(r.uri.path.endsWith('/chat/completions'),
          'Unexpected non-conversion endpoint ${r.uri.path}');
      require(r.headers.value('authorization') == 'Bearer $syntheticToken',
          'Wrong synthetic credential');
      require(r.headers.contentType?.mimeType == 'application/json',
          'Comic request is not JSON');
      final bytes = await r
          .fold<BytesBuilder>(BytesBuilder(), (b, v) => b..add(v))
          .then((b) => b.takeBytes());
      final body =
          Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes)) as Map);
      requests.add(body);
      final user = body['messages'][1]['content'] as String;
      if (responseMode == 'hold') {
        held = true;
        entered?.complete();
        await release!.future;
      }
      final recommend = user.contains('comic-recommend-1');
      final range = RegExp(r'第(\d+)至(\d+)页').firstMatch(user);
      final from = range == null ? 1 : int.parse(range[1]!),
          to = range == null ? 1 : int.parse(range[2]!);
      final content = recommend
          ? jsonEncode({
              'pages': 5,
              'reason': 'Five visible beats',
              'beats': ['Meet', 'Walk', 'Rain', 'Share', 'Leave']
            })
          : '<<<PAGES\n${List.generate(to - from + 1, (i) => '1girl, native page ${from + i}, rainy street').join('\n')}\nPAGES>>>\n<<<NOTES\nSame blue umbrella.\nNOTES>>>';
      r.response.headers.contentType = ContentType.json;
      r.response.write(jsonEncode({
        'choices': [
          {
            'message': {'content': content},
            'finish_reason': responseMode == 'truncated' ? 'length' : 'stop'
          }
        ]
      }));
      await r.response.close();
    } catch (e) {
      if (!(held && (e is HttpException || e is SocketException))) {
        errors.add(e);
        print('FEATURE_FIXTURE_ERROR:$e');
      }
    }
  });
  final base = 'http://127.0.0.1:${server.port}';
  app.settings
    ..convertApiUrl = base
    ..convertApiModel = 'native-japanese-text'
    ..tagServerEnabled = false;
  await c.storage.setSettings(app.settings);
  await c.storage.setConvertKey(syntheticToken);
  await app.templateLibrary.load();
  try {
    final original = app.comic;
    await original.load();
    await original.importText('1girl, original tag workspace');
    await original.flush();
    final originalHash =
        digest(utf8.encode(jsonEncode(original.project.toJson())));
    await mount(app, const ToolsHubScreen());
    final tile = elements((w) =>
            w is ListTile &&
            w.title is Text &&
            (w.title as Text).data == templateFeatureText('en-US', 'japanese'))
        .single
        .widget as ListTile;
    require(tile.onTap != null, 'Japanese Tools tile disabled');
    tile.onTap!();
    await _wait(
        () => elements(
                (w) => w is ComicScreen && (w.controller?.japanese ?? false))
            .isNotEmpty,
        'native Japanese route callback');
    final japanese = app.japaneseComic;
    await japanese.load();
    await _composer();
    require(japanese.workspace == 'japanese' && !identical(japanese, original),
        'Japanese scope aliases original');
    require(
        digest(utf8.encode(jsonEncode(
                (await Storage().getComicProject(app.params)).toJson()))) ==
            originalHash,
        'Tools entry changed original comic');
    suite.check('comic', 'japanese-entry-scope-native', {
      'actualToolsTileCallback': true,
      'actualComicScreenJapaneseController': true,
      'separateProjectKeys': true,
      'originalTagProjectHashPreserved': originalHash
    });

    app.convertInput = 'Keep original image conversion input';
    app.convertResult = 'Keep original image result';
    await mount(app, const InspectScreen(kind: InspectPageKind.convert));
    _widget<ChoiceChip>(const ValueKey('convert-target-comic'))
        .onSelected!(true);
    await _wait(
        () =>
            app.settings.convertPromptTarget == 'comic' &&
            elements((w) => w is ComicPromptComposerView).length == 1,
        'comic target branch');
    await _wait(
        () async =>
            (await Storage().getSettings()).convertPromptTarget == 'comic',
        'target durable setting');
    require(elements((w) => w is PromptSkillSelector).isEmpty,
        'Image skill/mode controls leaked into comic branch');
    final convertComposer = await _composer();
    await _edit(const ValueKey('comic-prompt-input'),
        'Independent conversion comic draft');
    await convertComposer.flush();
    require(
        app.convertInput == 'Keep original image conversion input' &&
            app.convertResult == 'Keep original image result',
        'Comic target overwrote image drafts');
    _widget<ChoiceChip>(const ValueKey('convert-target-image'))
        .onSelected!(true);
    await frame();
    require(elements((w) => w is PromptSkillSelector).isNotEmpty,
        'Image target no longer exposes original mode/skill controls');
    _widget<ChoiceChip>(const ValueKey('convert-target-comic'))
        .onSelected!(true);
    await _wait(() => elements((w) => w is ComicPromptComposerView).isNotEmpty,
        'comic target restored');
    require((await _composer()).input == 'Independent conversion comic draft',
        'Comic draft did not reopen independently');
    suite.check('convert', 'image-comic-target-persist-native', {
      'actualTargetChoiceCallbacks': true,
      'targetReadThroughFreshStorage': true,
      'imageInputResultPreserved': true,
      'comicNoImageSkillControls': true,
      'independentComicDraftReopened': true
    });

    await mount(app, ComicScreen(controller: japanese));
    final planning = await _composer();
    await _edit(const ValueKey('comic-prompt-input'),
        'Native umbrella story with five pages');
    final beforeRecommendation = requests.length;
    await _press(const ValueKey('comic-recommend'));
    await _settled(planning);
    require(
        requests.length == beforeRecommendation + 1 &&
            planning.pages == 5 &&
            planning.reason == 'Five visible beats',
        'Real recommendation did not set editable pages');
    await _edit(const ValueKey('comic-prompt-pages'), '5');
    final manualChip = elements((w) =>
            w is ChoiceChip &&
            w.label is Text &&
            (w.label as Text).data == 'Manual page count').single.widget
        as ChoiceChip;
    manualChip.onSelected!(true);
    await frame();
    await _press(const ValueKey('comic-generate-prompts'));
    await _settled(planning);
    require(
        planning.completedPages == 4 &&
            planning.canContinue &&
            !planning.canImport,
        'First batch must be four of five pages');
    final afterBatch = requests.length;
    await Future<void>.delayed(const Duration(milliseconds: 300));
    require(
        requests.length == afterBatch, 'Next batch submitted automatically');
    await _press(const ValueKey('comic-next-batch'));
    await _settled(planning);
    require(planning.completedPages == 5 && planning.canImport,
        'Explicit next batch failed');
    require(
        (requests.last['messages'][1]['content'] as String).contains('第5至5页') &&
            (requests.last['messages'][1]['content'] as String)
                .contains('native page 4'),
        'Batch range/continuity missing');
    final formatPicker = elements((w) => w is DropdownButton<ComicPromptFormat>)
        .single
        .widget as DropdownButton<ComicPromptFormat>;
    formatPicker.onChanged!(ComicPromptFormat.singlePanel);
    await frame();
    require(
        planning.format == ComicPromptFormat.singlePanel && !planning.canImport,
        'Switching template did not invalidate old result');
    final currentPicker =
        elements((w) => w is DropdownButton<ComicPromptFormat>).single.widget
            as DropdownButton<ComicPromptFormat>;
    currentPicker.onChanged!(ComicPromptFormat.japanesePage);
    await frame();
    require(
        planning.canImport, 'Switching back lost unchanged Japanese output');
    await planning.flush();
    suite.check('comic', 'prompt-recommend-manual-batches-native', {
      'actualNativeComposerControls': true,
      'recommendationRealHttp': true,
      'editableManualFivePages': true,
      'fourThenExplicitOne': true,
      'noAutomaticContinuation': true,
      'oneLinePerPage': planning.completedPages
    });

    final beforeFailure = planning.output;
    responseMode = 'truncated';
    final beforeTruncated = requests.length;
    await _press(const ValueKey('comic-generate-prompts'));
    await _settled(planning);
    await Future<void>.delayed(const Duration(milliseconds: 250));
    require(
        requests.length == beforeTruncated + 1 &&
            planning.output == beforeFailure &&
            planning.raw.isNotEmpty,
        'Truncated response retried or replaced accepted output');
    responseMode = 'hold';
    entered = Completer<void>();
    release = Completer<void>();
    final beforeCancel = requests.length;
    await _press(const ValueKey('comic-generate-prompts'));
    await entered.future.timeout(const Duration(seconds: 45));
    planning.cancel();
    release.complete();
    await _settled(planning);
    require(
        requests.length == beforeCancel + 1 && planning.output == beforeFailure,
        'Cancel retried or erased completed result');
    entered = Completer<void>();
    release = Completer<void>();
    await _press(const ValueKey('comic-generate-prompts'));
    await entered.future.timeout(const Duration(seconds: 45));
    await _edit(const ValueKey('comic-prompt-input'),
        'Newer native edit while request is pending');
    release.complete();
    await _settled(planning);
    require(
        planning.output == beforeFailure &&
            planning.unused &&
            !planning.canImport,
        'Stale response overwrote newer input');
    responseMode = 'success';
    suite.check('comic', 'prompt-cancel-truncated-stale-native', {
      'realHttpLengthRawRetained': true,
      'noAutomaticResend': true,
      'ownerCancellationOnly': true,
      'lateResultNotApplied': true,
      'completedOutputRetained': true
    });

    final library = app.templateLibrary;
    await library.load();
    require(library.builtins.length == 8,
        'Expected six image and two comic originals');
    require(
        library.builtins.where((x) => x.slot.startsWith('image.')).length ==
                6 &&
            library.builtins.where((x) => x.slot.startsWith('comic.')).length ==
                2,
        'Template categories wrong');
    final originalBodies = {for (final b in library.builtins) b.slot: b.sha256};
    await mount(
        app, TemplateLibraryScreen(library: library, language: 'en-US'));
    await _wait(
        () => elements((w) => w.key == const ValueKey('template-library-body'))
            .isNotEmpty,
        'native template body');
    require(
        _widget<TextField>(const ValueKey('template-library-body')).readOnly,
        'Built-in body editable');
    final customSource = File('${c.root.path}/native-comic-import.md');
    const customBody =
        'Native supplied custom comic template\n{{input}}\nOnly one English prompt line per page.';
    await customSource.writeAsString(customBody, flush: true);
    final preview = parseMobileTemplateImport(await customSource.readAsString(),
        'native-comic-import.md', 'comic.jp-page');
    require(preview.entries.length == 1, 'Text import preview count invalid');
    final imported = await library.importEntries(preview.entries,
        activate: true, expectedRevision: library.revision);
    final selected = library.resolve('comic.jp-page');
    require(selected.source == 'custom' && selected.id == imported.single,
        'Imported custom not selected');
    final customId = selected.id;
    await library.update(
        id: customId,
        name: 'Native persisted comic',
        body: '$customBody\nPreserve umbrella.',
        expectedRevision: library.revision);
    _widget<OutlinedButton>(const ValueKey('template-library-reload'))
        .onPressed!();
    await frame();
    await library.load();
    final reopened = MobileTemplateLibrary();
    await reopened.load();
    require(
        reopened.resolve('comic.jp-page').id == customId &&
            reopened
                .resolve('comic.jp-page')
                .body
                .endsWith('Preserve umbrella.'),
        'Fresh library did not read durable custom');
    reopened.dispose();
    require(library.builtins.every((b) => originalBodies[b.slot] == b.sha256),
        'Custom import changed original template bytes');
    final exported = File('${c.root.path}/native-export-custom.json');
    await exported.writeAsString(library.exportCustomJson(), flush: true);
    require(
        (jsonDecode(await exported.readAsString())['templates'] as List)
            .any((x) => x['body'] == library.resolve('comic.jp-page').body),
        'Export body missing');
    suite.check('settings', 'template-library-v3-custom-native', {
      'actualNativeReadOnlyBody': true,
      'sixImagesTwoComics': true,
      'realFileImportPreviewAtomicSave': true,
      'systemPickerNotClaimed': true,
      'customEditSelectedReopened': true,
      'originalEightShaPreserved': true,
      'parseableCustomJsonExport': true
    });

    final backup = DataBackupService(c.storage, templateLibrary: library);
    final archive = await backup.createBackup(
        {DataBackupCategory.promptPresets},
        prefix: 'native-japanese-v3');
    final checked = await backup.inspect(archive.path);
    require(
        checked.categories
            .any((x) => x.category == DataBackupCategory.promptPresets),
        'Template backup category absent');
    final zip =
        ZipDecoder().decodeBytes(await archive.readAsBytes(), verify: true);
    require(zip.files.any((f) => f.name.contains('prompt-template-library')),
        'Template library file absent from backup');
    final originalCustom = library.resolve('comic.jp-page');
    await library.reset('comic.jp-page', expectedRevision: library.revision);
    await backup.importBackup(archive.path, {DataBackupCategory.promptPresets},
        confirmConfigurationOverwrite: false);
    await library.load();
    require(
        library.custom
            .any((x) => x.id == customId && x.body == originalCustom.body),
        'Backup restore lost saved custom');
    final count = library.custom.length;
    await backup.importBackup(archive.path, {DataBackupCategory.promptPresets},
        confirmConfigurationOverwrite: false);
    await library.load();
    require(library.custom.length == count,
        'Repeated template restore duplicated records');
    suite.check('backup', 'template-library-v3-backup-native', {
      'actualNativeBackupWorkerFile': true,
      'archiveCrcVerified': true,
      'libraryFileIncluded': true,
      'customRecordsMergedWithoutClobber': true,
      'repeatedRestoreIdempotent': true
    });

    // The import button's actual dialog/callback performs a revision-bound backup.
    await library.select('comic.jp-page',
        id: customId, source: 'custom', expectedRevision: library.revision);
    japanese.project.title = 'Before confirmed native page import';
    await japanese.flush();
    await mount(app, ComicScreen(controller: japanese));
    final finalComposer = await _composer();
    await _edit(const ValueKey('comic-prompt-input'),
        'Final native single page with literal dollars');
    await _edit(const ValueKey('comic-prompt-pages'), '1');
    finalComposer.setManual(true);
    await frame();
    await _press(const ValueKey('comic-generate-prompts'));
    await _settled(finalComposer);
    require(finalComposer.canImport, 'Final native page not ready');
    await _press(const ValueKey('comic-import-pages'));
    await _wait(() => elements((w) => w is AlertDialog).isNotEmpty,
        'explicit import dialog');
    require(japanese.project.title == 'Before confirmed native page import',
        'Dialog imported before confirmation');
    await _press(const ValueKey('comic-confirm-import'));
    await _wait(
        () =>
            japanese.project.panels.length == 1 &&
            japanese.project.panels.single.prompt.contains('native page 1'),
        'confirmed page import');
    await japanese.flush();
    final prefs = await SharedPreferences.getInstance();
    require(
        (await Storage().getJapaneseComicBackup(app.params))?.title ==
            'Before confirmed native page import',
        'Japanese backup missing previous project');
    require(
        digest(utf8.encode(jsonEncode(
                (await Storage().getComicProject(app.params)).toJson()))) ==
            originalHash,
        'Page import altered original tag project');
    suite.check('comic', 'prompt-import-backup-native', {
      'actualConfirmDialogThenCallback': true,
      'previousJapaneseProjectBackedUp': true,
      'originalTagProjectUnchanged': true,
      'onePageImportedNoImageRequest': true
    });

    final body = requests.last;
    final selectedTemplate = library.resolve('comic.jp-page');
    require(
        body['model'] == 'native-japanese-text' &&
            body['max_tokens'] == 16000 &&
            !body.containsKey('tools'),
        'Comic body inherited wrong model/tools');
    require(
        body['messages'][0]['content'] ==
            comicTemplateSystem(selectedTemplate.body, finalComposer.input),
        'Wire system differs from selected exact custom template');
    require(
        (body['messages'][1]['content'] as String).contains('comic-gen-1') &&
            (body['messages'][1]['content'] as String).contains('严格1个非空提示词行'),
        'Wire range/envelope missing');
    require(errors.isEmpty, 'Loopback fixture errors');
    await finalComposer.flush();
    await c.storage.setSettings(app.settings);
    final project = await Storage().getJapaneseComicProject(app.params);
    final draft = await Storage().getComicPromptDraft('japanese');
    await prefs.setString(
        japaneseCheckpointKey,
        jsonEncode({
          'warmPid': pid,
          'sourceSha': sourceSha,
          'profileSha': profileSha,
          'customId': customId,
          'customSha': selectedTemplate.sha256,
          'projectSha': digest(utf8.encode(jsonEncode(project.toJson()))),
          'draftSha': digest(utf8.encode(draft!)),
          'originalTagSha': originalHash,
          'convertDraftSha': digest(
              utf8.encode((await Storage().getComicPromptDraft('convert'))!)),
          'imageInput': app.convertInput,
          'imageResult': app.convertResult
        }));
    suite.check('convert', 'comic-prompt-wire-json-native', {
      'actualNativeNaiApiAndVaultCredential': true,
      'loopbackJsonContentType': true,
      'selectedCustomSystemExact': true,
      'modelAndBatchEnvelopeExact': true,
      'noToolsOrImageModeOverlay': true,
      'noPaidUpstreamOrImageRequests': true,
      'coldCheckpointNativeFilesAndPrefsCommitted': true
    });
  } finally {
    if (release != null && !release.isCompleted) release.complete();
    await server.close(force: true);
    await mount(app,
        const Scaffold(body: Text('Japanese comic native scenarios complete')));
    await c.close();
  }
}
