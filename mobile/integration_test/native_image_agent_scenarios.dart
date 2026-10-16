// Default production AgentProviderClient + real native state/approval UI/files.
// Only the upstream model and image output are synthetic localhost HTTP services.
// ignore_for_file: avoid_print, curly_braces_in_flow_control_structures
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/screens/studio_agent_screen.dart';
import 'package:novelai_mobile/screens/studio_agent_components.dart';
import 'native_scenario_support.dart';

final suite = NativeScenarios(3);
Future<void> main() => suite.run(_run);
Future<T> bounded<T>(Future<T> task) =>
    task.timeout(const Duration(seconds: 60));
Future<void> until(bool Function() ready, String failure) async {
  final end = DateTime.now().add(const Duration(seconds: 35));
  while (!ready()) {
    require(DateTime.now().isBefore(end), failure);
    await Future<void>.delayed(const Duration(milliseconds: 30));
  }
}

Future<void> _run() async {
  final c = await NativeContext.create('image-agent3'),
      app = c.app,
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final requests = <Map<String, dynamic>>[],
      images = <Map<String, dynamic>>[],
      errors = <Object>[];
  var mode = 'generate', sequence = 0;
  Completer<void>? chatEntered, chatGate;
  var cancelledSocket = false;
  server.listen((r) async {
    var held = false;
    try {
      require(r.connectionInfo!.remoteAddress.isLoopback,
          'Non-local synthetic transport');
      require(r.headers.value('authorization') == 'Bearer $syntheticToken',
          'Non-synthetic credential');
      final raw = await utf8.decoder.bind(r).join();
      if (r.uri.path.endsWith('/chat/completions')) {
        final body = Map<String, dynamic>.from(jsonDecode(raw) as Map);
        requests.add(body);
        if (chatEntered != null && !chatEntered.isCompleted) {
          held = true;
          chatEntered.complete();
          await chatGate!.future;
        }
        final messages = (body['messages'] as List).cast<Map>(),
            last = messages.last;
        Map<String, dynamic> delta;
        Map<String, dynamic> call(
                String name, Map<String, dynamic> args, String prefix) =>
            {
              'tool_calls': [
                {
                  'index': 0,
                  'id': '$prefix-${++sequence}',
                  'type': 'function',
                  'function': {'name': name, 'arguments': jsonEncode(args)}
                }
              ]
            };
        if (mode == 'unsafe') {
          delta = call('not_a_registered_software_tool',
              {'path': '/outside/private'}, 'unsafe');
        } else if (mode == 'echo' || mode == 'hold') {
          delta = {'content': 'The native conversation context was retained.'};
        } else if (last['role'] != 'tool') {
          delta = call(
              'langbai_prepare_generation',
              {
                'positivePrompt': 'synthetic native flower garden',
                'width': 64,
                'height': 64,
                'count': 1
              },
              'prepare');
        } else if ((last['tool_call_id'] as String).startsWith('prepare-')) {
          final prepared = jsonDecode(last['content'] as String) as Map;
          require(prepared['preparationId'] is String,
              'Production preparation did not return one-use ID');
          delta = call('langbai_generate_image',
              {'preparationId': prepared['preparationId']}, 'generate');
        } else {
          delta = {'content': 'Completed the approved native image operation.'};
        }
        r.response.headers.contentType =
            ContentType('text', 'event-stream', charset: 'utf-8');
        r.response.write('data: ${jsonEncode({
              'choices': [
                {'delta': delta}
              ]
            })}\n\ndata: [DONE]\n\n');
      } else if (r.uri.path.endsWith('/user/data')) {
        r.response.headers.contentType = ContentType.json;
        r.response.write(
            '{"subscription":{"tier":3,"active":true,"trainingStepsLeft":{"fixedTrainingStepsLeft":100000,"purchasedTrainingSteps":0}}}');
      } else if (r.uri.path.endsWith('/request-price')) {
        r.response.headers.contentType = ContentType.json;
        r.response.write('{"price":20}');
      } else if (r.uri.path.endsWith('/generate-image')) {
        images.add(Map<String, dynamic>.from(jsonDecode(raw) as Map));
        final bytes = png(64, 64, 210);
        r.response.headers.contentType = ContentType('application', 'zip');
        r.response.add(ZipEncoder().encode(
            Archive()..addFile(ArchiveFile('0.png', bytes.length, bytes))));
      } else {
        throw StateError('Unexpected agent fixture endpoint ${r.uri.path}');
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
    ..agentApiProtocol = 'openai-compatible'
    ..agentApiBaseUrl = base
    ..agentApiModel = 'native-tool-contract'
    ..agentProviderName = 'Native fixture'
    ..agentAutoCompact = false
    ..agentVisionEnabled = false
    ..apiBaseUrl = base
    ..imageBaseUrl = base;
  await c.storage.setSettings(app.settings);
  await c.storage.setToken(syntheticToken);
  await c.storage.setAgentApiKey(syntheticToken);
  var controller = AgentController(app: app);
  await controller.load();
  controller.selectedConversation!
    ..studioApprovalMode = 'confirm'
    ..studioWebSearchEnabled = false
    ..studioTemplateEnabled = false;
  await controller.saveWorkspace();
  Future<void> mountAgent() async =>
      mount(app, StudioAgentScreen(controller: controller));
  Future<void> decide(bool approve) async {
    await until(() => controller.pendingPermission != null,
        'Production agent permission not reached');
    await frame();
    final cards =
        elements((w) => w is StudioAgentPlanCard && w.onConfirm != null);
    require(cards.isNotEmpty, 'Actual native approval plan not rendered');
    final card = cards.last.widget as StudioAgentPlanCard;
    require(card.preview['positivePrompt'] == 'synthetic native flower garden',
        'Approval summary not bound to prepared request');
    if (approve) {
      card.onConfirm!();
    } else {
      card.onCancel!();
    }
  }

  try {
    await mountAgent();
    final previousHistory = app.history.length,
        pending = controller
            .sendStudio('Generate one synthetic native flower garden image.');
    await until(
        () => controller.pendingPermission != null, 'No approval request');
    require(images.isEmpty && app.history.length == previousHistory,
        'Image submitted before human approval');
    require(
        controller.pendingPermission!.tool == 'langbai_generate_image' &&
            controller.selectedConversation!.messages.last.tools.any((t) =>
                t.name == 'langbai_prepare_generation' &&
                t.status == 'completed'),
        'Proposal was not prepared through production tool loop');
    await decide(true);
    await bounded(pending);
    require(
        controller.error == null &&
            images.length == 1 &&
            app.history.length == previousHistory + 1,
        'Approved real tool loop failed: ${controller.error}');
    final message = controller.selectedConversation!.messages.last,
        generated =
            message.attachments.where((a) => a.kind == 'image').toList();
    require(
        generated.length == 1 &&
            await File(generated.single.filePath).exists() &&
            digest(await File(generated.single.filePath).readAsBytes()) ==
                digest(png(64, 64, 210)),
        'Native generated attachment bytes missing');
    suite.check('image-agent', 'proposal-approve-execute', {
      'defaultProductionProviderSse': true,
      'actualNativePlanCardApproval': true,
      'oneUsePreparationId': true,
      'zeroImageRequestsBeforeApproval': true,
      'oneApprovedImageFileHistoryAttachment': true
    });
    final id = controller.selectedConversation!.id,
        contextUsed = controller.selectedConversation!.context.used;
    require(contextUsed > 0, 'Conversation context snapshot missing');
    await controller.saveWorkspace();
    await mount(app, const Scaffold(body: Text('Reopen native agent')));
    controller.dispose();
    controller = AgentController(app: app);
    await controller.load();
    require(
        controller.selectedConversation!.id == id &&
            controller.selectedConversation!.messages.last.attachments
                .any((a) => a.filePath == generated.single.filePath) &&
            controller.selectedConversation!.context.used > 0,
        'Native agent workspace/context did not reopen');
    mode = 'echo';
    await mountAgent();
    await bounded(
        controller.sendStudio('Check the previous native operation context.'));
    require(
        requests.last['messages'].any((m) =>
            m['role'] == 'user' &&
            m['content'].toString().contains('synthetic native flower garden')),
        'Reopened provider context omitted prior user operation');
    suite.check('image-agent', 'history-context-reopen', {
      'newProductionControllerReadsNativeWorkspace': true,
      'generatedAttachmentFileRetained': true,
      'contextSnapshotRetained': true,
      'realFollowingRequestIncludesPreviousContext': true
    });
    mode = 'generate';
    final beforeDenied = images.length,
        historyBeforeDenied = app.history.length,
        denied = controller.sendStudio(
            'Generate a second synthetic native flower garden image.');
    await decide(false);
    await bounded(denied);
    require(
        images.length == beforeDenied &&
            app.history.length == historyBeforeDenied &&
            controller.selectedConversation!.messages.last.tools
                .any((t) => t.status == 'denied'),
        'Rejected plan submitted image');
    mode = 'unsafe';
    await bounded(controller.sendStudio('Verify unsupported tool safety.'));
    require(
        controller.error?.contains('未授权工具') == true &&
            images.length == beforeDenied,
        'Unregistered tool was executed');
    mode = 'hold';
    chatEntered = Completer<void>();
    chatGate = Completer<void>();
    final aborted =
        controller.sendStudio('Abort this actual pending model stream.');
    await bounded(chatEntered.future);
    cancelledSocket = true;
    controller.abort();
    await bounded(aborted);
    chatGate.complete();
    chatEntered = null;
    chatGate = null;
    require(
        !controller.sending &&
            controller.pendingPermission == null &&
            images.length == beforeDenied &&
            controller.selectedConversation!.messages.last.status == 'aborted',
        'In-flight abort did not preserve safe state');
    suite.check('image-agent', 'deny-cancel-tool-safety', {
      'actualNativePlanDeniedBeforeImageSubmit': true,
      'unregisteredToolRejected': true,
      'actualHttpProviderCancelledBeforeResponseRelease': true,
      'noExtraImageCallsOrHistory': true,
      'pendingPermissionCleared': true
    });
    require(errors.isEmpty, 'Actual fixture server failed');
  } finally {
    if (chatGate != null && !chatGate.isCompleted) chatGate.complete();
    await mount(app, const Scaffold(body: Text('Native agent complete')));
    controller.dispose();
    await server.close(force: true);
    await c.close();
  }
}
