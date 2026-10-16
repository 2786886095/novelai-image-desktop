// Real native widgets/files/plugins/controllers + synthetic loopback HTTP.
// No mock channel, fake provider, system-share or paid-model-quality claim.
// ignore_for_file: avoid_print, curly_braces_in_flow_control_structures
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/artist/curated_artists.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/comic/comic_asset_store.dart';
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/prompts/v5_artist_weight_repair.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/screens/prompt_codex_screen.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/services/prompt_codex_service.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'native_scenario_support.dart';

final suite = NativeScenarios(3);
const converted =
    'A girl stands beside a wooden table. She wears a blue coat. She holds a book in her right hand. The table is in front of a window. The window is open. Sunlight falls onto the table. A green tree stands outside the window. She looks down at the book. Her left hand rests on the table. A red mug sits near the book. Her hair reaches her shoulders. A curtain hangs on the left side of the window.';
Future<void> main() => suite.run(_run);
Future<T> bounded<T>(Future<T> future) =>
    future.timeout(const Duration(seconds: 45));
Future<void> waitUntil(bool Function() ready, String message) async {
  final limit = DateTime.now().add(const Duration(seconds: 30));
  while (!ready()) {
    require(DateTime.now().isBefore(limit), message);
    await frame();
  }
}

Future<void> reveal(bool Function(Widget) predicate) async {
  for (var i = 0; i < 40; i++) {
    if (elements(predicate).isNotEmpty) return;
    ScrollableState? scroll;
    for (final e in elements((w) => w is Scrollable)) {
      final s = (e as StatefulElement).state;
      if (s is ScrollableState &&
          s.position.hasContentDimensions &&
          s.position.axis == Axis.vertical &&
          s.position.pixels < s.position.maxScrollExtent) {
        scroll = s;
        break;
      }
    }
    if (scroll == null) break;
    scroll.position.jumpTo(
        (scroll.position.pixels + scroll.position.viewportDimension * .5)
            .clamp(0.0, scroll.position.maxScrollExtent));
    await frame();
  }
  require(elements(predicate).isNotEmpty, 'Native tools control not reachable');
}

Future<void> _run() async {
  final c = await NativeContext.create('tools3'),
      app = c.app,
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final wires = <Map<String, dynamic>>[], errors = <Object>[];
  var imageStatus = 200, cancelledSocket = false;
  Completer<void>? entered, gate;
  server.listen((r) async {
    var held = false;
    try {
      require(
          r.connectionInfo!.remoteAddress.isLoopback &&
              r.headers.value('authorization') == 'Bearer $syntheticToken',
          'Unexpected tools transport/credential');
      final raw = await utf8.decoder.bind(r).join();
      if (r.uri.path.endsWith('/user/data')) {
        r.response.headers.contentType = ContentType.json;
        r.response.write(
            '{"subscription":{"tier":3,"active":true,"trainingStepsLeft":{"fixedTrainingStepsLeft":100000,"purchasedTrainingSteps":0}}}');
      } else if (r.uri.path.endsWith('/request-price')) {
        r.response.headers.contentType = ContentType.json;
        r.response.write('{"price":20}');
      } else if (r.uri.path.endsWith('/chat/completions')) {
        wires.add({'path': r.uri.path, 'body': jsonDecode(raw)});
        r.response.headers.contentType = ContentType.json;
        r.response.write(jsonEncode({
          'choices': [
            {
              'message': {'content': converted},
              'finish_reason': 'stop'
            }
          ]
        }));
      } else if (r.uri.path.endsWith('/generate-image')) {
        wires.add({'path': r.uri.path, 'body': jsonDecode(raw)});
        if (entered != null && !entered.isCompleted) {
          held = true;
          entered.complete();
          await gate!.future;
        }
        r.response.statusCode = imageStatus;
        if (imageStatus == 200) {
          final bytes = png(64, 64, 180);
          r.response.headers.contentType = ContentType('application', 'zip');
          r.response.add(ZipEncoder().encode(
              Archive()..addFile(ArchiveFile('0.png', bytes.length, bytes))));
        } else {
          r.response.write('Synthetic tools HTTP failure');
        }
      } else {
        throw StateError('Unexpected tools endpoint ${r.uri.path}');
      }
      await r.response.close();
    } catch (e) {
      if (!(held &&
          cancelledSocket &&
          (e is HttpException || e is SocketException))) {
        errors.add(e);
        print('FEATURE_FIXTURE_ERROR:$e');
      }
    }
  });
  final base = 'http://127.0.0.1:${server.port}';
  app.settings
    ..apiBaseUrl = base
    ..imageBaseUrl = base
    ..convertApiUrl = base
    ..convertApiModel = 'native-tools-text'
    ..tagServerEnabled = false;
  await c.storage.setSettings(app.settings);
  await c.storage.setToken(syntheticToken);
  await c.storage.setConvertKey(syntheticToken);
  app.promptTemplates = await PromptTemplateLibrary.load();
  try {
    // Navigate all actual hub cards. This alone is deliberately not the proof:
    // each card's production operation is exercised below in this native run.
    await mount(app, const ToolsHubScreen());
    final labels = <String>[];
    for (var attempt = 0; attempt < 30; attempt++) {
      for (final e in elements((w) => w is ListTile)) {
        final tile = e.widget as ListTile;
        if (tile.title is Text && tile.onTap != null) {
          final text = (tile.title as Text).data!;
          if (!labels.contains(text)) labels.add(text);
        }
      }
      final scroll = (elements((w) => w is Scrollable).first as StatefulElement)
          .state as ScrollableState;
      if (scroll.position.pixels >= scroll.position.maxScrollExtent) break;
      scroll.position.jumpTo(
          (scroll.position.pixels + scroll.position.viewportDimension * .5)
              .clamp(0.0, scroll.position.maxScrollExtent));
      await frame();
    }
    require(
        labels.length == 6, 'Tools hub user-facing inventory changed: $labels');
    for (var index = 0; index < labels.length; index++) {
      final scroll = (elements((w) => w is Scrollable).first as StatefulElement)
          .state as ScrollableState;
      scroll.position.jumpTo(0);
      await frame();
      await reveal((w) =>
          w is ListTile &&
          w.title is Text &&
          (w.title as Text).data == labels[index]);
      final tile = elements((w) =>
          w is ListTile &&
          w.title is Text &&
          (w.title as Text).data == labels[index]).single.widget as ListTile;
      tile.onTap!();
      bool screen(Widget w) => switch (index) {
            0 => w is ComicScreen,
            1 => w is BatchRedrawScreen,
            2 => w is RandomArtistLabScreen,
            3 => w is V5ArtistWeightRepairScreen &&
                w.mode == V5ArtistToolMode.repair,
            4 => w is V5ArtistWeightRepairScreen &&
                w.mode == V5ArtistToolMode.draw,
            _ => w is PromptCodexScreen
          };
      await waitUntil(() => elements(screen).isNotEmpty,
          'Tool card did not open its real production screen');
      await frame();
      await frame();
      await frame();
      await frame();
      Navigator.of(elements(screen).first).pop();
      await frame();
      await frame();
      await frame();
      await frame();
    }
    final normalized =
        normalizeV45ArtistSyntax('(artist:quasarcake:1.5), blue dress');
    final repaired = repairV45ArtistCandidatesForV5(
        input: '1.5::artist:quasarcake::, blue dress', count: 2, drawSeed: 42);
    final drawn = drawAllV5ArtistWeights(
        input: 'artist:quasarcake, blue dress', count: 2, drawSeed: 42);
    final random = drawArtistRecipes(
        pool: kCuratedArtistTags.take(15).toList(),
        count: 2,
        minArtists: 2,
        maxArtists: 2,
        drawSeed: 42);
    require(
        normalized.output.contains('artist:quasarcake') &&
            repaired.length == 2 &&
            drawn.length == 2 &&
            random.length == 2,
        'Weight/draw production algorithms failed');
    require(
        [...repaired, ...drawn].every((r) =>
            r.prompt.contains('blue dress') &&
            r.prompt.contains('artist:quasarcake')),
        'Repair/draw discarded input tags');
    final artistFiles = <String>[];
    final expectedRecipes = [random.first, repaired.first, drawn.first];
    for (final recipe in expectedRecipes) {
      final params = app.params.copy()
        ..positivePrompt = 'A girl reads a book.'
        ..stylePrompt = recipe.prompt;
      final temp = await bounded(app.generateArtistLabTemporary(
          panelParams: params, panelExtras: GenerateExtras()));
      require(await File(temp.filePath).exists(),
          'Artist tool output file missing');
      artistFiles.add(temp.filePath);
      final favorite = await bounded(app.saveArtistLabFavorite(temp));
      require(
          app.history.any((h) => h.id == favorite.id) &&
              await File(favorite.filePath).exists(),
          'Artist favorite output/history missing');
    }
    final source = File('${c.root.path}/tools-source.png');
    await source.writeAsBytes(png(64, 64));
    final originalHash = digest(await source.readAsBytes());
    final batch = app.batchRedraw;
    await batch.load();
    batch.project = BatchRedrawProject.empty(app.params)
      ..sizeMode = 'custom'
      ..globalStrength = .4
      ..candidateCount = 1
      ..globalParams.width = 64
      ..globalParams.height = 64
      ..items = [
        BatchRedrawItem(
            id: 'tools-one',
            name: 'tools-one.png',
            base64: base64Encode(await source.readAsBytes()),
            sourcePath: source.path,
            width: 64,
            height: 64,
            prompt: 'A girl beside a window.')
      ];
    await batch.flush();
    await bounded(batch.startQueue(batch.project.items));
    require(
        batch.runPhase == 'completed' &&
            batch.project.items.single.candidates.length == 1,
        'Tools batch did not save image');
    final comic = app.comic;
    await comic.load();
    comic.project = ComicProject.empty(app.params)
      ..title = 'Tools native project'
      ..initialGenerationCount = 1;
    await comic.importText('女孩在窗边读书。');
    app.convertMode = ReversePromptMode.natural;
    await bounded(comic.convertPanelPrompt(comic.project.panels.single));
    require(comic.project.panels.single.prompt == converted,
        'Comic source not actually AI-converted');
    await bounded(comic.generateInitial());
    require(
        comic.runPhase == 'completed' &&
            comic.project.panels.single.candidates.length == 1,
        'Tools comic conversion did not reach generation');
    suite.check('tools', 'all-user-exposed-tools', {
      'actualHubCards': labels,
      'nativeRoutesOpenedAndReturned': 6,
      'randomRepairDrawRealImageFiles': artistFiles.length,
      'artistOutputsSavedToHistory': 3,
      'realBatchImg2ImgCompleted': true,
      'realComicAiConvertAndGenerate': true,
      'nativeNoSystemShareClaim': true
    });
    final selected = comic.project.panels.single.candidates.single;
    comic.setStep(ComicStep.generate);
    await mount(app, ComicScreen(controller: comic));
    await reveal((w) => w.key == const ValueKey('comic-save-selected-zip'));
    final save =
        elements((w) => w.key == const ValueKey('comic-save-selected-zip'))
            .single
            .widget as OutlinedButton;
    require(save.onPressed != null, 'Managed archive button disabled');
    save.onPressed!();
    await waitUntil(() => !comic.exporting, 'Managed archive did not settle');
    final receipt = comic.lastExport;
    require(
        receipt?['saved'] == true &&
            receipt?['shared'] == false &&
            receipt?['count'] == 1,
        'Managed archive receipt not saved');
    final zipFile = File(receipt!['filePath']),
        zipBytes = await zipFile.readAsBytes(),
        zip = ZipDecoder().decodeBytes(zipBytes, verify: true);
    final image =
        zip.files.singleWhere((f) => f.isFile && f.name.startsWith('images/'));
    require(
        digest(image.content as List<int>) ==
            digest(await File(selected.outputPath).readAsBytes()),
        'Exported archive did not use selected native image');
    require(digest(zipBytes) == receipt['sha256'],
        'Managed ZIP readback hash mismatch');
    final codex = await bounded(PromptCodexService().load());
    require(codex.books.length == 3 && codex.entries.length > 100,
        'Bundled codex native asset not loaded');
    final book = codex.books.first.id,
        matching = codex.entries
            .where((e) => e.bookId == book && e.prompt.isNotEmpty)
            .toList();
    require(matching.isNotEmpty, 'Codex book filter lost all entries');
    final reopened = await Storage().getComicProject(app.params);
    require(reopened.panels.single.selectedCandidateId == selected.id,
        'Tools comic settings/output selection not durable');
    require(
        expectedRecipes.every((recipe) => wires.any((r) =>
            r['path'].endsWith('/generate-image') &&
            (r['body']['input'] as String).contains(recipe.prompt))),
        'Chosen artist tool recipe not sent to actual generation');
    suite.check('tools', 'arguments-output-files', {
      'realWeightParametersAndAllInputTagsRetained': true,
      'chosenRecipeSentToImageTransport': true,
      'nativeProjectReadback': true,
      'managedZipCrc': true,
      'managedZipSha256': digest(zipBytes),
      'selectedImageHash': digest(image.content as List<int>),
      'offlineCodexBooks': codex.books.length,
      'offlineCodexEntries': codex.entries.length,
      'bookFilterResults': matching.length
    });
    final postsBefore = wires.length, historyBefore = app.history.length;
    require(
        repairV45ArtistCandidatesForV5(input: '', count: 2, drawSeed: 1)
                .isEmpty &&
            drawAllV5ArtistWeights(input: '', count: 2, drawSeed: 1).isEmpty,
        'Empty weight input produced candidates');
    require(
        wires.length == postsBefore, 'Invalid weight input sent generation');
    final stable = digest(zipBytes);
    await fails(() => writeComicArchiveExclusive(zipFile, [1, 2, 3], () {}),
        'Archive overwrote existing output');
    require(digest(await zipFile.readAsBytes()) == stable,
        'Collision changed existing ZIP');
    final projectJson = utf8.decode(zip.files
        .singleWhere((f) => f.name == 'project.json')
        .content as List<int>);
    require(
        !projectJson.contains(c.root.path) &&
            !projectJson.contains(selected.outputPath),
        'Portable ZIP exposed native absolute paths');
    imageStatus = 400;
    await bounded(batch.startQueue(batch.project.items));
    require(batch.runPhase == 'failed' && app.history.length == historyBefore,
        'Tools HTTP error changed completed history');
    imageStatus = 200;
    entered = Completer<void>();
    gate = Completer<void>();
    final stopped = batch.startQueue(batch.project.items);
    await bounded(entered.future);
    cancelledSocket = true;
    batch.cancelQueue();
    await bounded(stopped);
    gate.complete();
    entered = null;
    gate = null;
    require(
        batch.runPhase == 'cancelled' &&
            !app.busy &&
            !batch.queueRunning &&
            app.history.length == historyBefore &&
            digest(await source.readAsBytes()) == originalHash,
        'Tools real cancellation changed source/history or continued queue');
    suite.check('tools', 'errors-privacy-cancel', {
      'invalidWeightInputNoRequest': true,
      'realHttp400KeepsCompletedHistory': true,
      'actualHeldBatchHttpCancelledBeforeResponseRelease': true,
      'completedHistoryAndOriginalSourcePreserved': true,
      'existingArchiveNoClobber': true,
      'portableProjectHasNoAbsolutePaths': true
    });
    require(errors.isEmpty, 'Tools native loopback fixture error');
  } finally {
    if (gate != null && !gate.isCompleted) gate.complete();
    await server.close(force: true);
    await c.close();
  }
}
