// Actual mobile comic conversion/generation and OpenAI edit client journeys.
// No API/Storage/platform mocks; only synthetic responses over actual loopback.
// ignore_for_file: curly_braces_in_flow_control_structures, avoid_print
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/comic/comic_models.dart';
import 'package:novelai_mobile/comic/comic_asset_store.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/screens/comic_screen.dart';
import 'package:novelai_mobile/screens/prompt_skill_selector.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/openai_image_edit.dart' as edit;
import 'native_scenario_support.dart';

final suite = NativeScenarios(6);
const convertedPrompt =
    "Two adult girls are inside a cafe in the evening with a wooden counter between them. The image is an upper body view from the side. A brass pendant lamp hangs in the room and the lighting is warm. A window in the background shows a sunset and the scene has evening sunlight. The background is blurred and shows a brick wall and a wooden shelf. A white mug, a coffee maker, a potted plant and a glass jar also appear in the background. The scene also has an unattended coffee cup with latte art and a saucer. | The girl on the left has a black bob cut with blunt bangs and hair tucked behind one ear. She has green eyes and a mole under one eye and wears stud earrings. She wears a white collared shirt with rolled-up sleeves, a black bowtie and a black apron. She smiles with her mouth closed and looks at the girl on the right. She holds a white plate with a strawberry shortcake on it. Her arm is stretched forward and her right hand supports the plate from underneath. She is passing the plate to the girl on the right. | The girl on the right has long red hair tied in a low ponytail with a hairclip. She has blue eyes and freckles and wears round glasses. She wears a yellow ribbed turtleneck sweater with sleeves past her wrists. She blushes with her mouth open and looks at the cake. She leans forward and reaches out to receive the plate. Her left fingertips touch the edge of the plate nearest to her and her right hand rests on the counter.";
Future<void> main() => suite.run(_run);
Future<T> bounded<T>(Future<T> task) =>
    task.timeout(const Duration(seconds: 45));
Future<void> reveal(bool Function(Widget) find) async {
  for (var i = 0; i < 30; i++) {
    if (elements(find).isNotEmpty) return;
    ScrollableState? scroll;
    for (final e in elements((w) => w is Scrollable)) {
      final state = (e as StatefulElement).state;
      if (state is ScrollableState &&
          state.position.hasContentDimensions &&
          state.position.axis == Axis.vertical &&
          state.position.pixels < state.position.maxScrollExtent) {
        scroll = state;
        break;
      }
    }
    if (scroll == null) break;
    scroll.position.jumpTo(
        (scroll.position.pixels + scroll.position.viewportDimension * .5)
            .clamp(0.0, scroll.position.maxScrollExtent));
    await frame();
  }
  require(elements(find).isNotEmpty, 'Comic native control not reachable');
}

Map<String, Uint8List> multipart(Uint8List bytes, String type) {
  final boundary = RegExp(r'boundary="?([^";]+)').firstMatch(type)!.group(1)!,
      parts = <String, Uint8List>{};
  for (final raw in latin1.decode(bytes).split('--$boundary')) {
    final cut = raw.indexOf('\r\n\r\n');
    if (cut < 0) continue;
    final name =
        RegExp(r'name="([^"]+)"').firstMatch(raw.substring(0, cut))?.group(1);
    if (name != null)
      parts[name] = Uint8List.fromList(latin1
          .encode(raw.substring(cut + 4).replaceFirst(RegExp(r'\r\n$'), '')));
  }
  return parts;
}

Future<void> _run() async {
  final c = await NativeContext.create('comic-openai5'), app = c.app;
  app.promptTemplates = await PromptTemplateLibrary.load();
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0),
      errors = <Object>[],
      generations = <Map<String, dynamic>>[],
      edits = <Map<String, Uint8List>>[],
      chats = <Map<String, dynamic>>[];
  var editStatus = 200, cancelledSocket = false, holdGeneration = false;
  Completer<void>? entered, gate;
  final editResult = im.Image(width: 128, height: 128, numChannels: 4);
  for (final p in editResult) {
    p
      ..r = (p.x * 13 + p.y * 7) % 256
      ..g = (p.x * 3) % 256
      ..b = (p.y * 5) % 256
      ..a = 255;
  }
  final generatedEdit = im.encodePng(editResult);
  server.listen((r) async {
    var held = false;
    try {
      require(
          r.connectionInfo!.remoteAddress.isLoopback &&
              r.headers.value('authorization') == 'Bearer $syntheticToken',
          'Unexpected transport/credential');
      final bytes = await r
          .fold<BytesBuilder>(BytesBuilder(), (b, v) => b..add(v))
          .then((b) => b.takeBytes());
      if (r.uri.path.endsWith('/user/data')) {
        r.response.headers.contentType = ContentType.json;
        r.response.write(
            '{"subscription":{"tier":3,"active":true,"trainingStepsLeft":{"fixedTrainingStepsLeft":100000,"purchasedTrainingSteps":0}}}');
      } else if (r.uri.path.endsWith('/request-price')) {
        r.response.headers.contentType = ContentType.json;
        r.response.write('{"price":20}');
      } else if (r.uri.path.endsWith('/chat/completions')) {
        chats.add(
            Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes)) as Map));
        r.response.headers.contentType = ContentType.json;
        r.response.write(jsonEncode({
          'choices': [
            {
              'message': {'content': convertedPrompt},
              'finish_reason': 'stop'
            }
          ]
        }));
      } else if (r.uri.path.endsWith('/generate-image')) {
        generations.add(
            Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes)) as Map));
        if (holdGeneration && entered != null && !entered.isCompleted) {
          held = true;
          entered.complete();
          await gate!.future;
        }
        final image = png(64, 64, 180 + generations.length);
        r.response.headers.contentType = ContentType('application', 'zip');
        r.response.add(ZipEncoder().encode(
            Archive()..addFile(ArchiveFile('0.png', image.length, image))));
      } else if (r.uri.path.endsWith('/images/edits')) {
        edits.add(multipart(bytes, r.headers.contentType.toString()));
        if (entered != null && !entered.isCompleted) {
          held = true;
          entered.complete();
          await gate!.future;
        }
        r.response.statusCode = editStatus;
        r.response.headers.contentType = ContentType.json;
        r.response.write(editStatus == 200
            ? jsonEncode({
                'data': [
                  {'b64_json': base64Encode(generatedEdit)}
                ]
              })
            : '{"error":{"message":"synthetic edit failure"}}');
      } else {
        throw StateError('Unexpected endpoint ${r.uri.path}');
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
    ..imageBaseUrl = base
    ..apiBaseUrl = base
    ..convertApiUrl = base
    ..convertApiModel = 'native-comic-text'
    ..tagServerEnabled = false;
  await c.storage.setSettings(app.settings);
  await c.storage.setToken(syntheticToken);
  await c.storage.setConvertKey(syntheticToken);
  try {
    final comic = app.comic;
    await comic.load();
    comic.project = ComicProject.empty(app.params)
      ..title = 'Native two-panel project'
      ..globalStylePrompt = 'global framing'
      ..globalNegativePrompt = 'synthetic negative'
      ..initialGenerationCount = 1;
    await comic
        .importText('庭院里的女孩正在读书。\nA second panel preserves its own scene.');
    await comic.flush();
    final reopened = await Storage().getComicProject(app.params);
    require(
        reopened.panels.length == 2 &&
            reopened.title == comic.project.title &&
            reopened.globalNegativePrompt == 'synthetic negative',
        'Comic project/panels not durable');
    comic.movePanel(comic.project.panels.first.id, 1);
    await comic.flush();
    require(
        (await Storage().getComicProject(app.params)).panels.first.prompt ==
            'A second panel preserves its own scene.',
        'Comic panel ordering not persistent');
    suite.check('comic', 'project-panels-persist', {
      'nativeProjectReopen': true,
      'twoImportedPanels': true,
      'panelReorderReopened': true,
      'globalAndPanelContextsIndependent': true
    });
    final target = comic.project.panels.last;
    comic.selectPanel(target.id);
    comic.setStep(ComicStep.panels);
    app.convertMode = ReversePromptMode.natural;
    await mount(app, ComicScreen(controller: comic));
    await reveal((w) => w is PromptSkillSelector);
    final selector = elements((w) => w is PromptSkillSelector).first.widget
        as PromptSkillSelector;
    selector.onChanged!('v5', '2.0.0');
    await frame();
    await reveal((w) => w.key == ValueKey('comic-convert-${target.id}'));
    final button =
        elements((w) => w.key == ValueKey('comic-convert-${target.id}'))
            .single
            .widget as OutlinedButton;
    button.onPressed!();
    final limit = DateTime.now().add(const Duration(seconds: 45));
    while (comic.convertingPanel(target.id)) {
      require(
          DateTime.now().isBefore(limit), 'Comic conversion did not settle');
      await Future<void>.delayed(const Duration(milliseconds: 30));
    }
    require(
        chats.length == 1 &&
            comic.project.panels.last.prompt == convertedPrompt,
        'Actual comic AI button did not convert source text');
    require(
        chats.single['model'] == 'native-comic-text' &&
            (chats.single['messages'][0]['content'] as String).contains(app
                .promptTemplates
                .resolve('convert', ReversePromptMode.natural, {},
                    templateVersion: 'v5', skillVersion: '2.0.0')
                .replaceAll('{{input}}', '<provided in the user message>')),
        'Comic selected template/model not sent');
    await bounded(comic.generateInitial());
    require(
        comic.runPhase == 'completed' &&
            generations.length == 2 &&
            generations.any((r) =>
                (r['input'] as String).contains(convertedPrompt) &&
                (r['input'] as String).contains('global framing')),
        'Converted comic context did not reach generation');
    require(
        comic.project.panels.every((p) =>
            p.candidates.length == 1 &&
            app.history.any((h) => h.id == p.candidates.single.historyItemId)),
        'Comic generated files/history not linked');
    suite.check('comic', 'context-convert-generate', {
      'actualNativeAiConversionButton': true,
      'visibleVersionAndTargetModelControls': true,
      'sourceChineseConvertedByRealHttp': true,
      'exactChosenV2BodyAndProviderModelSent': true,
      'globalAndPanelPromptReachImageRequest': true,
      'twoFilesHistoryLinked': true
    });

    final beforeCancel =
            comic.project.panels.map((p) => p.candidates.length).toList(),
        beforeCancelHistory = app.history.length;
    entered = Completer<void>();
    gate = Completer<void>();
    holdGeneration = true;
    final stoppedComic = comic.addOne(comic.project.panels.first);
    await bounded(entered.future);
    cancelledSocket = true;
    comic.cancelQueue();
    await bounded(stoppedComic);
    gate.complete();
    entered = null;
    gate = null;
    holdGeneration = false;
    require(
        comic.runPhase == 'cancelled' &&
            app.history.length == beforeCancelHistory &&
            List.generate(
                beforeCancel.length,
                (i) =>
                    comic.project.panels[i].candidates.length ==
                    beforeCancel[i]).every((v) => v),
        'Comic active cancellation changed completed candidates');
    await bounded(comic.addOne(comic.project.panels.first));
    require(comic.project.panels.first.candidates.length == 2,
        'Additional comic candidate was not retained');
    final chosen = comic.project.panels.first.candidates.first;
    comic.selectCandidate(comic.project.panels.first, chosen.id);
    await comic.flush();
    comic.setStep(ComicStep.generate);
    await mount(app, ComicScreen(controller: comic));
    await reveal((w) => w.key == const ValueKey('comic-save-selected-zip'));
    final save =
        elements((w) => w.key == const ValueKey('comic-save-selected-zip'))
            .single
            .widget as OutlinedButton;
    require(save.onPressed != null, 'Managed ZIP native button disabled');
    save.onPressed!();
    final exportDeadline = DateTime.now().add(const Duration(seconds: 45));
    while (comic.exporting) {
      require(DateTime.now().isBefore(exportDeadline),
          'Managed export did not settle');
      await Future<void>.delayed(const Duration(milliseconds: 30));
    }
    final receipt = comic.lastExport;
    require(
        receipt != null &&
            receipt['saved'] == true &&
            receipt['shared'] == false &&
            receipt['count'] == 2,
        'Native managed ZIP not confirmed without fake system share');
    final archiveFile = File(receipt!['filePath']),
        archiveBytes = await archiveFile.readAsBytes(),
        archive = ZipDecoder().decodeBytes(archiveBytes, verify: true);
    final imageFiles = archive.files
        .where((f) =>
            f.isFile && f.name.startsWith('images/') && f.name.endsWith('.png'))
        .toList();
    require(imageFiles.length == 2 && digest(archiveBytes) == receipt['sha256'],
        'Selected ZIP count/CRC/readback hash incorrect');
    final firstImage = im.decodeImage(Uint8List.fromList(imageFiles.first.content as List<int>))!,
        expected = im.decodeImage(await File(chosen.outputPath).readAsBytes())!;
    require(firstImage.getPixel(0, 0).r == expected.getPixel(0, 0).r,
        'Export ignored selected candidate');
    final projectJson = utf8.decode(archive.files
        .singleWhere((f) => f.name == 'project.json')
        .content as List<int>);
    require(
        !projectJson.contains(c.root.path) &&
            !projectJson.contains(chosen.outputPath),
        'Portable ZIP leaked native absolute paths');
    final stableArchive = digest(archiveBytes);
    await fails(() => writeComicArchiveExclusive(archiveFile, [1, 2, 3], () {}),
        'Archive writer overwrote existing ZIP');
    require(digest(await archiveFile.readAsBytes()) == stableArchive,
        'Existing ZIP changed after collision rejection');
    suite.check('comic', 'cancel-selective-export', {
      'activeRealHttpQueueCancelledBeforeResponseRelease': true,
      'completedCandidatesAndHistoryPreserved': true,
      'actualNativeManagedSaveButton': true,
      'selectedTwoOfThreeCandidates': true,
      'zipCrcAndReadbackSha256': stableArchive,
      'existingZipNoClobber': true,
      'portableProjectNoAbsolutePaths': true,
      'systemShareNotClaimed': true
    });

    // Native credential transaction plus actual multipart edit and composition.
    final sourceImage = im.Image(width: 96, height: 64, numChannels: 4);
    for (final p in sourceImage) {
      p
        ..r = 30 + p.x
        ..g = 80 + p.y
        ..b = 140
        ..a = 255;
    }
    final sourceBytes = im.encodePng(sourceImage),
        source = File('${c.root.path}/openai-source.png');
    await source.writeAsBytes(sourceBytes);
    final maskImage = im.Image(width: 96, height: 64, numChannels: 4)
      ..clear(im.ColorRgba8(0, 0, 0, 255));
    for (var y = 20; y < 44; y++) {
      for (var x = 32; x < 64; x++) {
        maskImage.setPixelRgba(x, y, 255, 255, 255, 255);
      }
    }
    final mask = im.encodePng(maskImage), sourceHash = digest(sourceBytes);
    final configured = await c.storage.saveOpenAIEditConfiguration({
      'baseUrl': base,
      'model': 'native-edit-contract',
      'quality': 'high',
      'inputFidelity': 'high',
      'size': '128x128'
    }, syntheticToken,
        expectedId: app.settings.openAIEdit['credentialId'] as String? ?? '');
    app.settings.openAIEdit = configured;
    app
      ..inpaintEngine = 'openai'
      ..inpaintSourceMode = 'original'
      ..inpaintPositivePrompt = 'Replace only the selected patch'
      ..workbenchImage =
          WorkingImage(filePath: source.path, width: 96, height: 64)
      ..i2iOriginalImage =
          WorkingImage(filePath: source.path, width: 96, height: 64);
    final beforeEdit = app.history.length;
    await bounded(app.inpaint(mask));
    require(edits.length == 1 && app.history.length == beforeEdit + 1,
        'Actual OpenAI edit did not save result');
    String field(String name) => utf8.decode(edits.last[name]!);
    final upload = im.decodeImage(edits.last['image']!)!,
        wireMask = im.decodeImage(edits.last['mask']!)!;
    require(
        field('model') == 'native-edit-contract' &&
            field('size') == '128x128' &&
            field('quality') == 'high' &&
            field('input_fidelity') == 'high' &&
            upload.width == 128 &&
            wireMask.width == 128,
        'OpenAI engine/size/mask multipart fields incorrect');
    suite.check('openai-inpaint', 'engine-size-mask-request', {
      'realNativeCredentialTransaction': true,
      'actualMultipartHttp': true,
      'engineModel': 'native-edit-contract',
      'workingSize': [128, 128],
      'imageAndAlphaMaskDecoded': true,
      'noNovelAiParametersLeaked': !edits.single.containsKey('sampler')
    });
    final output = app.history.first,
        result = im.decodeImage(await File(output.filePath).readAsBytes())!;
    require(
        result.width == 96 &&
            result.height == 64 &&
            app.comparisonBefore?.filePath == source.path &&
            app.comparisonAfter?.filePath == output.filePath,
        'OpenAI original-size/preview binding incorrect');
    final prepared = edit.prepareOpenAIEdit(
        {'source': sourceBytes, 'mask': mask, 'size': '128x128'});
    final alpha = edit.featherSelection(prepared.selection, 96, 64);
    var unchangedPixels = 0;
    for (var y = 0; y < 64; y++) {
      for (var x = 0; x < 96; x++) {
        if (alpha[y * 96 + x] != 0) continue;
        unchangedPixels++;
        final a = sourceImage.getPixel(x, y), b = result.getPixel(x, y);
        require(a.r == b.r && a.g == b.g && a.b == b.b && a.a == b.a,
            'Unselected source pixel changed');
      }
    }
    require(unchangedPixels > 0, 'Outside-feather pixel assertion was empty');
    require(digest(await source.readAsBytes()) == sourceHash,
        'OpenAI input file mutated');
    suite.check('openai-inpaint', 'preview-compose-original', {
      'sourceSize': [96, 64],
      'resultSize': [96, 64],
      'outsideFeatherPixelsExact': unchangedPixels,
      'featheredEdgeMayChangeOutsideRawMask': true,
      'beforeAfterPreviewBinding': true,
      'sourceFileHashUnchanged': true
    });
    final stable = app.history.length;
    editStatus = 400;
    await bounded(app.inpaint(mask));
    require(app.history.length == stable && !app.busy,
        'Edit upstream error mutated result');
    editStatus = 200;
    entered = Completer<void>();
    gate = Completer<void>();
    final stopped = app.inpaint(mask);
    await bounded(entered.future);
    cancelledSocket = true;
    app.cancelGeneration();
    await bounded(stopped);
    gate.complete();
    entered = null;
    gate = null;
    require(
        app.history.length == stable &&
            !app.busy &&
            digest(await source.readAsBytes()) == sourceHash,
        'Edit cancellation created a result/lost source');
    await bounded(app.restoreInpaintEditSession());
    require(
        app.workbenchImage?.filePath == source.path &&
            digest(await File(app.workbenchImage!.filePath).readAsBytes()) ==
                sourceHash,
        'Edit restore did not recover pre-edit source');
    suite.check('openai-inpaint', 'cancel-error-restore', {
      'http400PreservesCompletedOutput': true,
      'heldRealHttpCancelledBeforeRelease': true,
      'sourceHashUnchanged': true,
      'restorePreEditSource': true,
      'previousCompletedResultRetained': true
    });
    require(errors.isEmpty, 'Native loopback fixture failed');
  } finally {
    if (gate != null && !gate.isCompleted) gate.complete();
    await server.close(force: true);
    await mount(app, const Scaffold(body: Text('Comic/OpenAI complete')));
    await c.close();
  }
}
