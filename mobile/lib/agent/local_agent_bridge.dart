import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'agent_models.dart';
import 'agent_tools.dart';
import 'studio_data_service.dart';
import 'operation_approval.dart';
import 'operation_policy.dart';
import 'session_controls.dart';
import 'template_tools.dart';

typedef LocalToolExecutor = Future<AgentToolResult> Function(
    String tool, Map<String, dynamic> args);

/// Loopback only, secret held in memory. Mutations require an explicit decision
/// and durable call identity; interrupted/ambiguous requests are never replayed.
class LocalAgentBridge {
  final Directory journal;
  final LocalToolExecutor execute;
  final Future<AgentToolResult> Function(String, Map<String, dynamic>, String)?
      executeScoped;
  final FutureOr<Map<String, dynamic>> Function(
      String, Map<String, dynamic>, String)? describeApproval;
  final Future<bool> Function(String, Map<String, dynamic>, String)?
      authorizeImage;
  final String token = List.generate(32, (_) => Random.secure().nextInt(256))
      .map((n) => n.toRadixString(16).padLeft(2, '0'))
      .join();
  HttpServer? _server;
  bool _mutation = false;
  bool _closed = false;
  final _approvals = AgentOperationApprovals();
  final Set<String> _pending = {};
  final Set<Future<void>> _handlers = {};
  LocalAgentBridge(
      {required this.journal,
      required this.execute,
      this.executeScoped,
      this.describeApproval,
      this.authorizeImage});
  String get url => 'http://127.0.0.1:${_server!.port}';
  Future<void> start() async {
    await journal.create(recursive: true);
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server!.listen((request) {
      late Future<void> task;
      task = _handle(request).whenComplete(() => _handlers.remove(task));
      _handlers.add(task);
    });
  }

  bool _authenticated(String? supplied) {
    final expected = 'Bearer $token';
    if (supplied == null || supplied.length != expected.length) return false;
    var difference = 0;
    for (var i = 0; i < expected.length; i++) {
      difference |= supplied.codeUnitAt(i) ^ expected.codeUnitAt(i);
    }
    return difference == 0;
  }

  Future<void> _reply(
      HttpRequest request, int status, Map<String, dynamic> body) async {
    request.response.statusCode = status;
    request.response.headers.contentType = ContentType.json;
    request.response.headers.set('Cache-Control', 'no-store');
    request.response.write(jsonEncode(body));
    await request.response.close();
  }

  Future<void> _handle(HttpRequest request) async {
    try {
      if (_closed ||
          request.method != 'POST' ||
          request.uri.path != '/v1/tool' ||
          request.headers.value('Origin') != null ||
          !_authenticated(request.headers.value('Authorization'))) {
        await _reply(request, 403,
            {'ok': false, 'error': 'Unauthorized local bridge request'});
        return;
      }
      final bytes = <int>[];
      await for (final chunk in request.timeout(const Duration(seconds: 10))) {
        bytes.addAll(chunk);
        if (bytes.length > 128 * 1024) {
          await _reply(request, 413, {'ok': false});
          return;
        }
      }
      final payload = jsonDecode(utf8.decode(bytes));
      if (payload is! Map<String, dynamic> ||
          payload['tool'] is! String ||
          payload['args'] is! Map<String, dynamic>) {
        await _reply(
            request, 400, {'ok': false, 'error': 'Invalid tool request'});
        return;
      }
      final tool = payload['tool'] as String,
          args = payload['args'] as Map<String, dynamic>;
      final uiTool = AgentSessionControls.tools.contains(tool) ||
          AgentTemplateTools.tools.contains(tool);
      final apiInputTool =
          tool == 'studio_api_input' || tool == 'studio_resolve_api_input';
      final materialSource = tool == 'studio_material_source';
      final materialConfirm = tool == 'studio_material_confirm';
      final approvalTool = tool == 'studio_image_approval' ||
          tool == 'studio_resolve_image_approval';
      if (!materialSource &&
          !materialConfirm &&
          !approvalTool &&
          !apiInputTool &&
          !uiTool &&
          !agentReadTools.contains(tool) &&
          !agentMutatingTools.contains(tool)) {
        await _reply(request, 400, {
          'ok': false,
          'error': 'This Studio operation is not supported on Android'
        });
        return;
      }
      final identity = RegExp(r'^[a-zA-Z0-9_.:-]{1,160}$');
      final session = payload['sessionId'], call = payload['callId'];
      if (session is! String ||
          call is! String ||
          !identity.hasMatch(session) ||
          !identity.hasMatch(call)) {
        await _reply(request, 400,
            {'ok': false, 'error': 'Stable call identity required'});
        return;
      }
      if (materialConfirm &&
          (args.keys.any((k) => ![
                    'name',
                    'collection',
                    'previous',
                    'warnings',
                    'revision'
                  ].contains(k)) ||
              args['name'] is! String ||
              args['revision'] is! String ||
              !['characters', 'personas', 'lorebooks', 'samplerPresets']
                  .contains(args['collection']) ||
              jsonEncode(args).length > 16000)) {
        await _reply(request, 400, {'ok': false, 'error': '会话资料确认参数无效'});
        return;
      }
      if (apiInputTool) {
        final output = await (executeScoped?.call(tool, args, session) ??
            execute(tool, args));
        await _reply(request, 200, {
          'ok': output.ok,
          'title': output.title,
          if (output.ok) 'data': jsonDecode(output.output),
          if (!output.ok) 'error': '私密输入未完成，请重新读取配置后再操作。'
        });
        return;
      }
      if (approvalTool) {
        if (tool == 'studio_resolve_image_approval') {
          if (args['id'] is! String || args['approved'] is! bool) {
            await _reply(
                request, 400, {'ok': false, 'error': 'Invalid decision'});
            return;
          }
          _approvals.resolve(
              session, args['id'] as String, args['approved'] as bool);
        }
        await _reply(
            request, 200, {'ok': true, 'data': _approvals.read(session)});
        return;
      }
      final key = sha256.convert(utf8.encode('$session\n$call')).toString();
      final digest = sha256
          .convert(utf8.encode(jsonEncode({'tool': tool, 'args': args})))
          .toString();
      final file = File('${journal.path}/$key.json');
      final interrupt = tool == 'langbai_tasks' &&
          ['list', 'pause', 'cancel'].contains(args['action']);
      final mutating = (materialConfirm ||
              [
                'studio_set_session_style',
                'studio_generation_policy',
                'studio_save_prompt_template',
                'studio_stop_generation'
              ].contains(tool) ||
              agentMutatingTools.contains(tool)) &&
          !(tool == 'langbai_templates' && args['action'] == 'read') &&
          !(tool == 'langbai_api' &&
              ['read', 'test'].contains(args['action'])) &&
          !(tool == 'langbai_tasks' && args['action'] == 'list') &&
          !(tool == 'langbai_backup' && args['action'] == 'list');
      final exclusive = mutating && !interrupt && !uiTool;
      if (_pending.contains(key) || (exclusive && _mutation)) {
        await _reply(request, 409, {
          'ok': false,
          'error': 'A tool request is already pending. Do not resubmit.'
        });
        return;
      }
      _pending.add(key);
      if (exclusive) _mutation = true;
      try {
        if (mutating && await file.exists()) {
          final prior =
              jsonDecode(await file.readAsString()) as Map<String, dynamic>;
          if (prior['digest'] == digest &&
              prior['result'] is Map<String, dynamic>) {
            await _reply(request, 200, prior['result']);
            return;
          }
          await _reply(request, 409, {
            'ok': false,
            'error':
                'This call already ran or has an unknown outcome; inspect history. No replay.'
          });
          return;
        }
        if (mutating) {
          // Save before approval/execution; disconnect/crash never authorizes retry.
          await file.writeAsString(
              jsonEncode({'digest': digest, 'state': 'pending'}),
              flush: true);
          final automatic = !uiTool &&
              AgentSessionControls.paid.contains(tool) &&
              await (authorizeImage?.call(tool, args, session) ??
                  Future.value(false));
          if ((!uiTool &&
                  !automatic &&
                  requiresAgentConfirmation(tool, args) &&
                  !await _approvals.wait(
                      session,
                      tool,
                      Map<String, dynamic>.from(StudioDataService.project(
                          await (materialConfirm
                              ? Future.value(args)
                              : (describeApproval?.call(tool, args, session) ??
                                  Future.value(args))))))) ||
              _closed) {
            final result = materialConfirm
                ? <String, dynamic>{
                    'ok': true,
                    'data': {'approved': false},
                    'output': jsonEncode({'approved': false})
                  }
                : <String, dynamic>{
                    'ok': false,
                    'error': 'Not approved in Agent. No action performed.'
                  };
            await file.writeAsString(
                jsonEncode({'digest': digest, 'result': result}),
                flush: true);
            await _reply(request, 200, result);
            return;
          }
        }
        if (_closed) throw StateError('Agent stopped before execution');
        if ((tool == 'langbai_tasks' && args['action'] == 'cancel') ||
            tool == 'studio_stop_generation') {
          _approvals.cancelGeneration(session);
        }
        final output = materialConfirm
            ? AgentToolResult(
                ok: true,
                title: '会话资料确认',
                output: jsonEncode({'approved': true}))
            : await (executeScoped?.call(tool, args, session) ??
                execute(tool, args));
        final result = <String, dynamic>{
          'ok': output.ok,
          'title': output.title,
          'output': output.output,
          'generatedImages':
              output.generatedImages.map((image) => image.toJson()).toList(),
          // Preserve the old mobile alias for older readers.
          'images':
              output.generatedImages.map((image) => image.toJson()).toList(),
          if (output.ok &&
              (materialSource ||
                  materialConfirm ||
                  uiTool ||
                  tool == 'langbai_templates' ||
                  tool == 'langbai_api' ||
                  tool == 'langbai_library' ||
                  tool == 'langbai_tasks' ||
                  tool == 'langbai_backup' ||
                  StudioDataService.tools.contains(tool) ||
                  tool == 'langbai_software_capabilities' ||
                  tool == 'langbai_software_action'))
            'data': jsonDecode(output.output)
        };
        if (mutating) {
          await file.writeAsString(
              jsonEncode({'digest': digest, 'result': result}),
              flush: true);
        }
        await _reply(request, 200, result);
      } finally {
        _pending.remove(key);
        if (exclusive) _mutation = false;
      }
    } catch (_) {
      // Do not log raw tool payloads, provider tokens, or images.
      try {
        await _reply(request, 500, {
          'ok': false,
          'error':
              'Tool failed or outcome unknown. Inspect Studio history before any new request.'
        });
      } catch (_) {/* peer disconnected */}
    }
  }

  Future<void> close() async {
    _closed = true;
    _approvals.close();
    await _server?.close(force: true);
    _server = null;
    // Finish cancellation journals before disposing this bridge or its directory.
    // Already-dispatched remote work retains a durable pending identity if it outlives shutdown.
    await Future.wait(_handlers.toList())
        .timeout(const Duration(seconds: 30), onTimeout: () => []);
  }
}
