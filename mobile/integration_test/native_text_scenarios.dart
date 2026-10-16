// Real native Flutter, credential vault, preferences, files and HTTP.
// Synthetic loopback provider responses prove client contracts, not model quality.
// Translation uses the production public Google transport; no paid API is used.
// ignore_for_file: avoid_print, curly_braces_in_flow_control_structures
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/prompts/prompt_skill_selection.dart';
import 'package:novelai_mobile/screens/prompt_assistant_dialog.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/prompts/translation_session.dart';
import 'package:novelai_mobile/screens/ai_log_screen.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/screens/prompt_skill_selector.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'native_scenario_support.dart';
import 'native_skill_checkpoint.dart';

final suite = NativeScenarios(15);
final _samples = Map<String, String>.from(jsonDecode(
        r'''{"tags": "2girls, cafe, indoors, evening, upper body, from side, wooden counter, brass pendant lamp, warm lighting, window, sunset, sunlight, blurry background, brick wall, wooden shelf, white mug, coffee maker, potted plant, glass jar, coffee cup, saucer, latte art | girl, adult woman, bob cut, black hair, blunt bangs, hair behind ear, green eyes, mole under eye, stud earrings, white shirt, collared shirt, sleeves rolled up, black bowtie, black apron, smile, closed mouth, looking at another, outstretched arm, holding plate, source#giving, white plate, strawberry shortcake | girl, adult woman, long hair, red hair, low ponytail, hairclip, blue eyes, freckles, round eyewear, yellow sweater, ribbed sweater, turtleneck, sleeves past wrists, blush, open mouth, looking at food, leaning forward, reaching, target#giving", "natural": "Two adult girls are inside a cafe in the evening with a wooden counter between them. The image is an upper body view from the side. A brass pendant lamp hangs in the room and the lighting is warm. A window in the background shows a sunset and the scene has evening sunlight. The background is blurred and shows a brick wall and a wooden shelf. A white mug, a coffee maker, a potted plant and a glass jar also appear in the background. The scene also has an unattended coffee cup with latte art and a saucer. | The girl on the left has a black bob cut with blunt bangs and hair tucked behind one ear. She has green eyes and a mole under one eye and wears stud earrings. She wears a white collared shirt with rolled-up sleeves, a black bowtie and a black apron. She smiles with her mouth closed and looks at the girl on the right. She holds a white plate with a strawberry shortcake on it. Her arm is stretched forward and her right hand supports the plate from underneath. She is passing the plate to the girl on the right. | The girl on the right has long red hair tied in a low ponytail with a hairclip. She has blue eyes and freckles and wears round glasses. She wears a yellow ribbed turtleneck sweater with sleeves past her wrists. She blushes with her mouth open and looks at the cake. She leans forward and reaches out to receive the plate. Her left fingertips touch the edge of the plate nearest to her and her right hand rests on the counter.", "mixed": "2girls, cafe, indoors, evening, upper body, from side, wooden counter, brass pendant lamp, warm lighting, window, sunset, sunlight, blurry background, brick wall, wooden shelf, white mug, coffee maker, potted plant, glass jar, coffee cup, saucer, latte art, The counter stands between the two girls. | girl, adult woman, bob cut, black hair, blunt bangs, hair behind ear, green eyes, mole under eye, stud earrings, white shirt, collared shirt, sleeves rolled up, black bowtie, black apron, smile, closed mouth, looking at another, outstretched arm, holding plate, source#giving, white plate, strawberry shortcake, She supports the cake plate from underneath with her right hand and passes it toward the girl on the right. | girl, adult woman, long hair, red hair, low ponytail, hairclip, blue eyes, freckles, round eyewear, yellow sweater, ribbed sweater, turtleneck, sleeves past wrists, blush, open mouth, looking at food, leaning forward, reaching, target#giving, She touches the edge of the plate nearest to her with her left fingertips and rests her right hand on the counter."}''')
    as Map);
Future<void> main() => suite.run(_run);
Future<T> bounded<T>(Future<T> value) =>
    value.timeout(const Duration(seconds: 65));
Future<void> _reveal(bool Function(Widget) predicate) async {
  for (var i = 0; i < 30; i++) {
    if (elements(predicate).isNotEmpty) return;
    ScrollableState? scroll;
    for (final e in elements((w) => w is Scrollable)) {
      final state = (e as StatefulElement).state;
      if (state is ScrollableState &&
          state.position.hasContentDimensions &&
          state.position.axis == Axis.vertical &&
          state.position.maxScrollExtent > state.position.pixels) {
        scroll = state;
        break;
      }
    }
    if (scroll == null) break;
    final next =
        (scroll.position.pixels + scroll.position.viewportDimension * .55)
            .clamp(0.0, scroll.position.maxScrollExtent);
    scroll.position.jumpTo(next);
    await frame();
  }
  require(elements(predicate).isNotEmpty,
      'Required native control/result not reachable by scrolling');
}

Future<void> _waitSession(TranslationSession session) async {
  final deadline = DateTime.now().add(const Duration(seconds: 65));
  while (session.busy) {
    require(DateTime.now().isBefore(deadline), 'Translation did not settle');
    await Future<void>.delayed(const Duration(milliseconds: 30));
  }
}

Future<void> _run() async {
  final c = await NativeContext.create('text12'), app = c.app;
  final source = File('${c.root.path}/source.png')
    ..writeAsBytesSync(png(64, 64));
  app.workbenchImage =
      WorkingImage(filePath: source.path, width: 64, height: 64);
  app.promptTemplates = await PromptTemplateLibrary.load();
  await c.storage.setVisionKey(syntheticToken);
  await c.storage.setConvertKey(syntheticToken);
  final wires = <Map<String, dynamic>>[], serverErrors = <Object>[];
  Completer<void>? requestEntered, responseGate;
  var content = _samples['tags']!,
      finish = 'stop',
      status = 200,
      typedRefusal = false;
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((r) async {
    try {
      require(r.connectionInfo!.remoteAddress.isLoopback,
          'Unexpected public fixture transport');
      require(r.uri.path.endsWith('/chat/completions'), 'Wrong AI endpoint');
      require(r.headers.value('authorization') == 'Bearer $syntheticToken',
          'Non-synthetic AI credential');
      wires.add(Map<String, dynamic>.from(
          jsonDecode(await utf8.decoder.bind(r).join()) as Map));
      if (requestEntered != null && !requestEntered.isCompleted) {
        requestEntered.complete();
        await responseGate!.future;
      }
      r.response.statusCode = status;
      r.response.headers.contentType = ContentType.json;
      r.response.write(status == 200
          ? jsonEncode({
              'choices': [
                {
                  'message': typedRefusal
                      ? {
                          'content': null,
                          'refusal': 'Cannot assist with this request'
                        }
                      : {'content': content},
                  'finish_reason': finish
                }
              ]
            })
          : jsonEncode({'error': 'upstream rejected $syntheticToken'}));
      await r.response.close();
    } catch (error) {
      serverErrors.add(error);
      await r.response.close();
    }
  });
  final base = 'http://127.0.0.1:${server.port}';
  app.settings
    ..visionApiUrl = base
    ..convertApiUrl = base
    ..visionApiModel = 'native-vision-contract'
    ..convertApiModel = 'native-text-contract'
    ..tagServerEnabled = false;
  await c.storage.setSettings(app.settings);
  Future<TextToolJob?> reverse() => bounded(app.reversePrompt());
  Future<TextToolJob?> convert() => bounded(app.convertPrompt());
  try {
    // Every mode and scope is sent by actual AppState -> NaiApi, with a real
    // file import into its independent edition slot and persisted readback.
    for (final task in ['reverse', 'convert']) {
      await mount(
          app,
          InspectScreen(
              kind: task == 'reverse'
                  ? InspectPageKind.reverse
                  : InspectPageKind.convert));
      final selectors = elements((w) => w is PromptSkillSelector);
      require(selectors.isNotEmpty,
          'Actual $task model/edition selector is not rendered');
      (selectors.first.widget as PromptSkillSelector).onChanged!(
          'v4.5', '1.0.0');
      await frame();
      require(
          (task == 'reverse'
                  ? app.settings.reversePromptTemplateVersion
                  : app.settings.convertPromptTemplateVersion) ==
              'v4.5',
          'Target model UI did not select V4.5');
      (elements((w) => w is PromptSkillSelector).first.widget
              as PromptSkillSelector)
          .onChanged!('v5', '2.0.0');
      await frame();
      for (final mode in ReversePromptMode.values) {
        final imported = File('${c.root.path}/$task-${mode.value}.md');
        final original = app.promptTemplates.resolve(task, mode, {},
            templateVersion: 'v5', skillVersion: '2.0.0');
        final marker = '\nNATIVE_IMPORTED_${task}_${mode.value}';
        await imported.writeAsString(original + marker, flush: true);
        await app.setPromptTemplate(task, mode, await imported.readAsString(),
            templateVersion: 'v5', skillVersion: '2.0.0');
        final saved = await Storage().getSettings();
        require(
            (task == 'reverse'
                    ? saved.reversePromptTemplatesV2
                    : saved.convertPromptTemplatesV2)[mode.value] ==
                original + marker,
            'Imported template not durable');
        if (task == 'reverse')
          app.reverseMode = mode;
        else {
          app.convertMode = mode;
          app.convertInput = 'Synthetic scene input; no image generation.';
        }
        content = _samples[mode.value]!;
        for (final scope in task == 'reverse'
            ? ReversePromptScope.values
            : [ReversePromptScope.full]) {
          app.reverseScope = scope;
          app.reverseHint = 'Visible subject only';
          final before = wires.length,
              job = await (task == 'reverse' ? reverse() : convert());
          require(job?.status == TextToolJobStatus.done,
              '$task ${mode.value}/${scope.value} failed: ${job?.message}');
          require(wires.length == before + 1, 'V2 silently retried');
          final wire = wires.last,
              system = wire['messages'][0]['content'] as String;
          require(
              system.contains(marker.trim()) &&
                  !system.contains('软件内部JSON输出协议'),
              'Wrong independent template/protocol');
          require(
              wire['model'] ==
                  (task == 'reverse'
                      ? 'native-vision-contract'
                      : 'native-text-contract'),
              'AI model was confused with generation model');
          if (task == 'reverse')
            require(
                (wire['messages'][1]['content'] as List)
                    .last['text']
                    .contains('"scope":"${scope.value}"'),
                'Scope not sent');
        }
      }
      suite.check(
          task,
          task == 'reverse'
              ? 'mode-and-scope-system-import'
              : 'three-modes-and-import',
          {
            'modes': 3,
            'scopes': task == 'reverse' ? 4 : 1,
            'importedNativeFiles': 3,
            'isolatedV2SlotsReopened': true,
            'actualModelEditionSelector': true,
            'oneRequestPerTask': true
          });
    }
    app.reverseMode = ReversePromptMode.natural;
    app.reverseScope = ReversePromptScope.full;
    app.reverseKnownCharacter = true;
    final paired = jsonEncode({
      'namePrompt': _samples['natural'],
      'featurePrompt': _samples['natural']
    });
    content = '```json\n$paired\n```';
    final reverseJob = await reverse();
    require(
        reverseJob?.variants?.isComplete == true &&
            app.reverseResult == _samples['natural'],
        'Fenced paired JSON not accepted');
    await mount(app, const InspectScreen(kind: InspectPageKind.reverse));
    await _reveal(
        (w) => w is EditableText && w.controller.text == app.reverseResult);
    require(
        elements((w) =>
                w is EditableText &&
                (w.controller.text == app.reverseResult)).isNotEmpty ||
            elements((w) => w is SelectableText && w.data == app.reverseResult)
                .isNotEmpty,
        'Reverse result is not visible in native widget tree');
    suite.check('reverse', 'valid-json-and-visible-result', {
      'pairedJsonFence': true,
      'literalResultMatches': true,
      'actualResultWidget': true,
      'durableHistory': app.reverseHistory.isNotEmpty
    });
    final prior = app.reverseResult, reverseHistory = app.reverseHistory.length;
    for (final failure in [
      'plain-refusal',
      'typed-refusal',
      'truncated',
      'malformed-json'
    ]) {
      typedRefusal = failure == 'typed-refusal';
      content = failure == 'plain-refusal'
          ? "I'm sorry, but I can't assist with this request."
          : failure == 'truncated'
              ? ''
              : 'json {bad';
      finish = failure == 'truncated' ? 'length' : 'stop';
      final before = wires.length, job = await reverse();
      require(
          job?.status == TextToolJobStatus.failed &&
              app.reverseResult == prior &&
              app.reverseHistory.length == reverseHistory,
          '$failure destroyed previous reverse result');
      require(wires.length == before + 1, 'Failure automatically retried');
    }
    typedRefusal = false;
    finish = 'stop';
    app.reverseKnownCharacter = false;
    suite.check('reverse', 'refusal-truncated-invalid-preserve', {
      'plainRefusal': true,
      'typedRefusal': true,
      'emptyLengthNoRetry': true,
      'invalidJsonRejected': true,
      'previousResultAndHistoryUnchanged': true
    });

    app.convertMode = ReversePromptMode.tags;
    app.convertKnownCharacter = true;
    content = '```json\n${jsonEncode({
          'namePrompt': _samples['tags'],
          'featurePrompt': _samples['tags']
        })}\n```';
    final converted = await convert();
    require(
        converted?.variants?.isComplete == true &&
            converted?.result == _samples['tags'],
        'Structured tag variants changed literal escapes/weights');
    suite.check('convert', 'structured-variants-preserve-escapes', {
      'pairedJsonFence': true,
      'exactEscapedPrompt': true,
      'variantsEqualSource':
          converted!.variants!.namePrompt == _samples['tags'],
      'roleAndWeightSyntaxUnchanged': true
    });
    final convertedPrior = app.convertResult,
        convertedHistory = app.convertHistory.length;
    for (final invalid in ['信息不足：没有足够输入', '模式能力不足：此模式无法无损表达', 'json {bad']) {
      content = invalid;
      final before = wires.length, result = await convert();
      require(
          result?.status == TextToolJobStatus.failed &&
              app.convertResult == convertedPrior &&
              app.convertHistory.length == convertedHistory &&
              wires.length == before + 1,
          'Invalid conversion changed result or retried');
    }
    status = 400;
    final failed = await convert();
    status = 200;
    app.convertKnownCharacter = false;
    require(
        failed?.status == TextToolJobStatus.failed &&
            app.convertResult == convertedPrior,
        'HTTP conversion failure overwrote result');
    suite.check('convert', 'errors-preserve-results', {
      'controlledInsufficientAndCapability': true,
      'invalidJson': true,
      'http400': true,
      'oldResultAndHistoryPreserved': true,
      'noAutomaticRetry': true
    });

    final logs = app.aiCallLog;
    require(
        logs.any((l) => l.ok) &&
            logs.any((l) => !l.ok) &&
            logs.every((l) =>
                l.systemPrompt.isNotEmpty &&
                l.userText.isNotEmpty &&
                l.model.isNotEmpty &&
                l.response.isNotEmpty),
        'AI request/response/status missing');
    suite.check('ai-records', 'record-request-response-status', {
      'realHttpCalls': wires.length,
      'successAndFailure': true,
      'requestResponseModelTimePresent': true,
      'imageBytesOmitted': logs
          .where((l) => l.api == 'vision')
          .every((l) => l.userText.contains('[image omitted]'))
    });
    content = 'safe return $syntheticToken';
    await c.api.runTextAi(
        settings: app.settings,
        apiKey: syntheticToken,
        apiUrl: base,
        model: 'native-log',
        system: 'Synthetic credential $syntheticToken',
        user: 'credential $syntheticToken');
    final serialized = jsonEncode(app.aiCallLog
        .map((l) => {
              'system': l.systemPrompt,
              'user': l.userText,
              'response': l.response,
              'label': l.label
            })
        .toList());
    require(!serialized.contains(syntheticToken),
        'Credential leaked to user-visible AI log');
    suite.check('ai-records', 'sensitive-fields-redacted', {
      'rawCredentialAbsentFromSystemUserResponse': true,
      'rawImageBytesNotRecorded': true,
      'syntheticOnly': true
    });
    await mount(app, const AiLogScreen());
    final refresh = elements((w) =>
        w is IconButton &&
        w.icon is Icon &&
        (w.icon as Icon).icon == Icons.refresh);
    require(refresh.isNotEmpty, 'Actual refresh missing');
    (refresh.first.widget as IconButton).onPressed!();
    await frame();
    final tiles = elements((w) => w is ListTile && w.onTap != null);
    require(tiles.isNotEmpty, 'Actual expandable log missing');
    (tiles.first.widget as ListTile).onTap!();
    await frame();
    require(elements((w) => w is SelectableText).isNotEmpty,
        'Expanded log details not rendered');
    final historyBeforeClear =
        app.convertHistory.length + app.reverseHistory.length;
    final clear = elements((w) =>
        w is IconButton &&
        w.icon is Icon &&
        (w.icon as Icon).icon == Icons.delete_sweep_outlined);
    require(clear.isNotEmpty, 'Actual clear missing');
    (clear.first.widget as IconButton).onPressed!();
    await frame();
    require(
        app.aiCallLog.isEmpty &&
            NaiApi().aiCallLog.isEmpty &&
            app.convertHistory.length + app.reverseHistory.length ==
                historyBeforeClear,
        'Clearing memory log destroyed durable tool history');
    suite.check('ai-records', 'refresh-expand-clear-memory-history-boundary', {
      'actualRefreshExpandClearActions': true,
      'memoryOnlyAfterNewApi': true,
      'textHistoriesPreserved': true
    });

    // Both generation-model/edition axes reach a real request, not only UI labels.
    app.settings
      ..reversePromptTemplateVersion = 'v4.5'
      ..reversePromptSkillVersion = '1.0.0';
    app.reverseMode = ReversePromptMode.natural;
    await app.setPromptTemplate('reverse', ReversePromptMode.natural,
        'NATIVE_LEGACY_V45: Return only factual English sentences.',
        templateVersion: 'v4.5', skillVersion: '1.0.0');
    content = 'A girl stands beside a wooden desk.';
    final legacyReverse = await reverse();
    require(
        legacyReverse?.status == TextToolJobStatus.done &&
            wires.last['messages'][0]['content'].contains('NATIVE_LEGACY_V45'),
        'V4.5/1.0 selection did not reach provider');
    require(app.settings.reversePromptTemplatesV2.length == 3,
        'Legacy selection destroyed V2 imports');
    suite.check('reverse', 'versioned-skill-catalog-and-models', {
      'v5Edition2AllThreeIndependentBodiesSent': true,
      'v45Edition1RealRequest': true,
      'aiProviderModelIndependent': true,
      'legacyAndV2SlotsRetained': true
    });
    selectPromptSkill(app.settings, 'reverse', '2.0.0', 'v5');
    app.reverseMode = ReversePromptMode.tags;
    app.reverseKnownCharacter = false;
    content = _samples['tags']!;
    await mount(app, const InspectScreen(kind: InspectPageKind.reverse));
    requestEntered = Completer<void>();
    responseGate = Completer<void>();
    final livePrior = app.reverseResult, pendingReverse = reverse();
    await bounded(requestEntered.future);
    final inline = elements((w) => w is PromptSkillSelector);
    require(inline.isNotEmpty, 'Inline reverse controls absent');
    (inline.first.widget as PromptSkillSelector).onChanged!('v4.5', '1.0.0');
    await frame();
    responseGate.complete();
    final staleReverse = await pendingReverse;
    requestEntered = null;
    responseGate = null;
    require(
        staleReverse?.status == TextToolJobStatus.done &&
            app.reverseResult == livePrior &&
            app.reverseHistory.any((h) => h.id == staleReverse?.id),
        'Stale response applied after inline edition/model change');
    suite.check('reverse', 'inline-controls-stale-no-apply', {
      'actualInlineControlChangedDuringHttp': true,
      'completedJobRetainedInHistory': true,
      'liveResultNotOverwritten': true,
      'realRequestNotMocked': true
    });

    selectPromptSkill(app.settings, 'assistant', '2.0.0', 'v5');
    for (final kind in ['optimize', 'custom']) {
      for (final mode in ReversePromptMode.values) {
        app.settings.promptAssistantMode = mode.value;
        content = _samples[mode.value]!;
        await app.setSettings((s) {
          if (kind == 'optimize') {
            s.promptOptimizeTemplateV2 = 'NATIVE_OPTIMIZE_OVERLAY';
          } else {
            s.promptAssistantTemplateV2 = 'NATIVE_CUSTOM_OVERLAY';
          }
        });
        final result = await bounded(app.assistPositivePrompt(
            currentPrompt: _samples[mode.value]!,
            instruction: 'Preserve visible facts.',
            kind: kind));
        require(
            result.ok && result.text == content, '$kind/${mode.value} failed');
        require(
            wires.last['messages'][0]['content'].contains(kind == 'optimize'
                ? 'NATIVE_OPTIMIZE_OVERLAY'
                : 'NATIVE_CUSTOM_OVERLAY'),
            'Edition overlay not sent');
      }
    }
    app.settings.promptAssistantMode = 'tags';
    content = _samples['tags']!;
    await mount(
        app,
        PromptAssistantDialog(
            kind: 'custom', source: 'original source', isCurrent: (_) => true));
    final instruction =
        elements((w) => w is TextField).first.widget as TextField;
    instruction.controller!.text = 'First native requested change';
    instruction.onChanged?.call(instruction.controller!.text);
    await frame();
    final execute = elements((w) =>
        w is TextButton &&
        w.onPressed != null &&
        (w.child is Text) &&
        ((w.child as Text).data == '执行' || (w.child as Text).data == 'Run'));
    require(execute.isNotEmpty, 'Actual assistant execute missing');
    requestEntered = Completer<void>();
    responseGate = Completer<void>();
    (execute.first.widget as TextButton).onPressed!();
    await bounded(requestEntered.future);
    instruction.controller!.text = 'Different requested change';
    instruction.onChanged?.call(instruction.controller!.text);
    responseGate.complete();
    await frame();
    await frame();
    requestEntered = null;
    responseGate = null;
    final apply = elements((w) =>
        w is FilledButton &&
        w.child is Text &&
        ['应用', 'Apply'].contains((w.child as Text).data));
    require(
        apply.isNotEmpty &&
            (apply.first.widget as FilledButton).onPressed == null,
        'Assistant stale instruction result remained applicable');
    suite.check('convert', 'versioned-skill-editing-overlays', {
      'optimizeAndAssistant': true,
      'threeModesSixRealRequests': true,
      'independentV2OverlaysActuallySent': true,
      'nativePreviewEditedDuringHttpCannotApply': true
    });
    await mount(app, const Scaffold(body: Text('Reopen settings')));
    await app.setSettings((s) {
      selectPromptSkill(s, 'reverse', '1.0.0', 'v4.5');
      selectPromptSkill(s, 'convert', '2.0.0', 'v5');
      selectPromptSkill(s, 'assistant', '2.0.0', 'v5');
      s.convertPromptTemplates['tags'] = 'NATIVE_KEEP_LEGACY_CUSTOM';
    });
    final encoded = jsonEncode((await Storage().getSettings()).toJson());
    final cold = AppState(api: NaiApi(), storage: Storage())
      ..settings = await Storage().getSettings()
      ..promptTemplates = await PromptTemplateLibrary.load();
    require(
        jsonEncode(cold.settings.toJson()) == encoded &&
            cold.settings.reversePromptSkillVersion == '1.0.0' &&
            cold.settings.reversePromptTemplateVersion == 'v4.5' &&
            cold.settings.convertPromptSkillVersion == '2.0.0' &&
            cold.settings.convertPromptTemplates['tags'] ==
                'NATIVE_KEEP_LEGACY_CUSTOM' &&
            cold.settings.convertPromptTemplatesV2.length == 3 &&
            cold.settings.promptOptimizeTemplateV2 ==
                'NATIVE_OPTIMIZE_OVERLAY' &&
            cold.settings.promptAssistantTemplateV2 == 'NATIVE_CUSTOM_OVERLAY',
        'Native settings did not reopen with independent axes/custom slots');
    await mount(cold, const InspectScreen(kind: InspectPageKind.convert));
    require(
        elements((w) =>
            w is PromptSkillSelector &&
            w.model == 'v5' &&
            w.edition == '2.0.0').isNotEmpty,
        'Reconstructed native UI did not show persisted selection');
    await mount(app, const Scaffold(body: Text('Cold state closed')));
    cold.dispose();
    // Same-process readback is preparation only, never promoted to cold proof.
    await writeNativeSkillCheckpoint(app.settings, sourceSha, profileSha);

    // No provider mocks or URL-rewrite adapters: the actual production HTTPS
    // translator is exercised. Any offline/rate-limit failure fails this entry.
    app.settings
      ..proxyMode = 'direct'
      ..translateProvider = 'google';
    final detected = <String, String>{};
    for (final target in ['zh-CN', 'zh-TW', 'ja', 'ko', 'en']) {
      final result = await bounded(app.translatePreviewText(
          target == 'en'
              ? '庭に赤い花が咲いています。'
              : 'Red flowers are blooming in the garden.',
          target: target,
          sourceLanguage: 'auto'));
      require(
          result.ok &&
              result.text.trim().isNotEmpty &&
              result.sourceLanguage != null,
          'Public translation/detection failed for $target: ${result.message}');
      detected[target] = result.sourceLanguage!;
    }
    suite.check('translation', 'languages-source-detect', {
      'actualProductionHttps': true,
      'targets': detected.keys.toList(),
      'detectedSources': detected,
      'remoteQualityNotClaimed': true
    });
    const protected =
        r'1.2::artist:synthetic_artist::, character:synthetic_name, \\(book\\), https://example.invalid/a.png, red flowers';
    final translated = await bounded(app.translatePreviewText(protected,
        target: 'ja', sourceLanguage: 'en'));
    require(
        translated.ok &&
            translated.text.contains('1.2::artist:synthetic_artist::') &&
            translated.text.contains('character:synthetic_name') &&
            translated.text.contains('https://example.invalid/a.png') &&
            translated.text.contains(r'\\(book\\)'),
        'Translation changed protected tag/weight/path syntax');
    suite.check('translation', 'preserve-tags-weights', {
      'realHttpsTranslation': true,
      'weightedArtistCharacterEscapesUrlPreserved': true,
      'literalSourceHash': digest(utf8.encode(protected))
    });
    final originalPositive = app.params.positivePrompt;
    app.settings
      ..proxyMode = 'custom'
      ..proxyUrl = 'ftp://127.0.0.1:1'
      ..proxyForTranslate = true;
    final failure = await bounded(app.translatePreviewText(
        'Synthetic translation failure.',
        target: 'ja',
        sourceLanguage: 'en'));
    require(!failure.ok && app.params.positivePrompt == originalPositive,
        'Translation failure overwrote prompt');
    app.settings.proxyMode = 'direct';
    final session = TranslationSession(
        'Flowers are blooming in a garden.', 'ja', (source, to, from) async {
      final r = await app.translatePreviewText(source,
          target: to, sourceLanguage: from);
      return TranslationReply(
          ok: r.ok,
          text: r.text,
          error: r.message,
          sourceLanguage: r.sourceLanguage);
    }, sourceLanguage: 'en');
    session.translate();
    require(session.busy, 'Actual translation request did not start');
    session.editResult('MANUAL PRESERVED');
    await _waitSession(session);
    require(
        session.result == 'MANUAL PRESERVED' &&
            app.params.positivePrompt == originalPositive,
        'Stale translated response overwrote newer intent');
    session.dispose();
    suite.check('translation', 'failure-cancel-no-overwrite', {
      'invalidProxyFailedClosed': true,
      'previewNeverMutatesPositivePrompt': true,
      'newerManualEditCancelsApplicationOfRealInFlightReply': true,
      'transportAbortNotClaimed': true
    });
    require(serverErrors.isEmpty, 'Loopback server error');
  } finally {
    await mount(app, const Scaffold(body: Text('Text scenarios complete')));
    await server.close(force: true);
    await c.close();
  }
}
