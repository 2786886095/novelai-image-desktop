// Host lifecycle regression only. Actual production runtime/server/card and real
// loopback bind; only its scheduling is delayed. No account, paid API or native receipt.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path/path.dart' as path;
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/agent/external_mcp_runtime.dart';
import 'package:novelai_mobile/agent/external_mcp_server.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/i18n/platform_feature_text.dart';
import 'package:novelai_mobile/screens/external_mcp_settings.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _BindGate extends IOOverrides {
  final entered = Completer<void>(), release = Completer<void>();
  int binds = 0;
  String? sourceProbePath;
  int importExecuteReads = 0;
  @override
  Future<FileSystemEntityType> fseGetType(String file, bool followLinks) {
    if (sourceProbePath != null && path.equals(file, sourceProbePath!)) {
      importExecuteReads++;
    }
    return super.fseGetType(file, followLinks);
  }

  @override
  Future<ServerSocket> serverSocketBind(dynamic address, int port,
      {int backlog = 0, bool v6Only = false, bool shared = false}) async {
    if (address is! InternetAddress || !address.isLoopback || port != 0) {
      throw StateError('Only one owned ephemeral loopback bind is expected');
    }
    binds++;
    if (!entered.isCompleted) entered.complete();
    await release.future;
    return super.serverSocketBind(address, port,
        backlog: backlog, v6Only: v6Only, shared: shared);
  }

  void unblock() {
    if (!release.isCompleted) release.complete();
  }
}

class _Start {
  final _BindGate gate;
  late final Future<void> future;
  bool done = false;
  Object? error;
  _Start(ExternalMcpRuntime runtime, this.gate) {
    future = IOOverrides.runWithIOOverrides(runtime.toggle, gate);
    future.then((_) {
      done = true;
    }, onError: (Object e, StackTrace _) {
      error = e;
      done = true;
    });
  }
}

void _harvest(WidgetTester tester, List<Object> errors) {
  final error = tester.takeException();
  if (error != null) errors.add(error);
}

Future<void> _spin(
    WidgetTester tester, bool Function() done, List<Object> errors,
    {bool frames = true}) async {
  for (var i = 0; i < 240 && !done(); i++) {
    if (frames) {
      await tester.pump(const Duration(milliseconds: 20));
    } else {
      await tester
          .idle(); // Drain microtasks but deliberately keep the last UI frame.
    }
    await tester
        .runAsync(() => Future<void>.delayed(const Duration(milliseconds: 2)));
    _harvest(tester, errors);
  }
  expect(done(), isTrue,
      reason: 'Owned lifecycle operation exceeded host scheduling bound');
}

Future<void> _mount(WidgetTester tester, AppState app, String key) async {
  await tester.pumpWidget(ChangeNotifierProvider.value(
      value: app,
      child: MaterialApp(
          home: Scaffold(
              body: SingleChildScrollView(
                  child: ExternalMcpSettingsCard(key: ValueKey(key)))))));
}

bool _hitPathContains(WidgetTester tester, Finder finder) {
  final box = tester.element(finder).findRenderObject()! as RenderBox;
  final hit = HitTestResult();
  GestureBinding.instance.hitTestInView(
      hit, box.localToGlobal(box.size.center(Offset.zero)), tester.view.viewId);
  final descendants = <RenderObject>{};
  void walk(RenderObject object) {
    descendants.add(object);
    object.visitChildren(walk);
  }

  walk(box);
  return hit.path.any((entry) => descendants.contains(entry.target));
}

Future<void> _connect(WidgetTester tester, String url) async {
  final endpoint = Uri.parse(url);
  expect(endpoint.scheme, 'http');
  expect(endpoint.host, '127.0.0.1');
  expect(endpoint.port, greaterThan(0));
  expect(endpoint.path, '/mcp');
  await tester.runAsync(() async {
    final socket =
        await Socket.connect(InternetAddress.loopbackIPv4, endpoint.port)
            .timeout(const Duration(seconds: 2));
    await socket.close();
  });
}

class _RealHttp extends HttpOverrides {}

class _RpcReply {
  final int status;
  final Map<String, dynamic> body;
  final String? session;
  _RpcReply(this.status, this.body, this.session);
}

Future<_RpcReply> _rpc(String url, String token, Map<String, dynamic> body,
        {String? session}) =>
    HttpOverrides.runWithHttpOverrides(() async {
      final endpoint = Uri.parse(url);
      if (endpoint.scheme != 'http' ||
          endpoint.host != '127.0.0.1' ||
          endpoint.port <= 0) {
        throw StateError(
            'Only the owned actual loopback MCP endpoint is permitted');
      }
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 5);
      client.findProxy = (_) => 'DIRECT';
      try {
        final request = await client.postUrl(endpoint);
        request.headers.contentType = ContentType.json;
        request.headers.set('Authorization', 'Bearer $token');
        if (session != null) {
          request.headers.set('Mcp-Session-Id', session);
        }
        request.write(jsonEncode(body));
        final response =
            await request.close().timeout(const Duration(seconds: 10));
        final bytes = await utf8.decoder
            .bind(response)
            .join()
            .timeout(const Duration(seconds: 10));
        return _RpcReply(
            response.statusCode,
            Map<String, dynamic>.from(jsonDecode(bytes) as Map),
            response.headers.value('mcp-session-id'));
      } finally {
        client.close(force: true);
      }
    }, _RealHttp());

class _PendingRpc {
  bool done = false;
  _RpcReply? reply;
  Object? error;
  _PendingRpc(Future<_RpcReply> future) {
    future.then((value) {
      reply = value;
      done = true;
    }, onError: (Object e, StackTrace _) {
      error = e;
      done = true;
    });
  }
}

Future<_RpcReply> _completeRpc(WidgetTester tester, String url, String token,
    Map<String, dynamic> body, List<Object> errors,
    {String? session}) async {
  // Keep both the real client I/O and widget-zone server listener draining.
  final holder = await tester.runAsync(
      () async => _PendingRpc(_rpc(url, token, body, session: session)));
  await _spin(tester, () => holder!.done, errors);
  expect(holder!.error, isNull);
  expect(holder.reply, isNotNull);
  return holder.reply!;
}

Future<Map<String, Object?>> _approvalExercise(
    WidgetTester tester,
    AppState app,
    ExternalMcpServer server,
    _BindGate gate,
    Directory root,
    List<Object> errors,
    String mode) async {
  final source = File(path.join(root.path, 'synthetic-source.png'));
  final bytes = im.encodePng(im.Image(width: 4, height: 4));
  await tester.runAsync(() => source.writeAsBytes(bytes, flush: true));
  gate.sourceProbePath = source.path;
  final assets = Directory(path.join(root.path, 'external-mcp', 'assets'));
  int outputCount() => assets.listSync().whereType<File>().length;
  final initialized = await _completeRpc(
      tester,
      server.url,
      server.token,
      {
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'initialize',
        'params': {'protocolVersion': '2025-11-25'}
      },
      errors);
  expect(initialized.status, 200);
  expect(initialized.session, isNotNull);
  final body = <String, dynamic>{
    'jsonrpc': '2.0',
    'id': 2,
    'method': 'tools/call',
    'params': {
      'name': 'import_image',
      'arguments': {'path': source.path}
    }
  };
  final pending = await tester.runAsync(() async => _PendingRpc(
      _rpc(server.url, server.token, body, session: initialized.session)));
  await _spin(tester, () => server.approvals.length == 1, errors);
  await tester.pump(const Duration(milliseconds: 20));
  _harvest(tester, errors);
  expect(gate.importExecuteReads, 0);
  expect(outputCount(), 0);
  final originalRequest = Map<String, dynamic>.from(server.approvals.single);
  final action = mode == 'stale-cancel-after-stop' ? 'cancel' : 'approve';
  final label = platformFeatureText(app.settings.language, action);
  final target = action == 'cancel'
      ? find.widgetWithText(TextButton, label)
      : find.widgetWithText(FilledButton, label);
  expect(target, findsOneWidget);
  final oldButton = tester.widget(target), oldFinder = find.byWidget(oldButton);
  expect(_hitPathContains(tester, oldFinder), isTrue);
  final handled = mode == 'handled-cancel-approve-again';
  if (handled) {
    // Handle the live request with the real Cancel UI first. The old Approve
    // widget below then proves exact-pending revalidation while ownership is live.
    await tester.tap(find.widgetWithText(
        TextButton, platformFeatureText(app.settings.language, 'cancel')));
    await _spin(tester, () => pending!.done, errors, frames: false);
    expect(pending!.error, isNull);
    expect(pending.reply!.body['result']['isError'], isTrue);
    expect(gate.importExecuteReads, 0);
    expect(outputCount(), 0);
    expect(server.approvals, isEmpty);
    expect(app.externalMcp.server, same(server));
    expect(app.externalMcp.changing, isFalse);
  } else {
    var stopped = false;
    Object? stopError;
    final stop = app.externalMcp.toggle();
    stop.then((_) {
      stopped = true;
    }, onError: (Object e, StackTrace _) {
      stopError = e;
      stopped = true;
    });
    await _spin(tester, () => stopped && pending!.done, errors, frames: false);
    expect(stopError, isNull);
    expect(app.externalMcp.server, isNull);
    expect(server.approvals, isEmpty);
    expect(() => server.url, throwsA(isA<TypeError>()));
    if (pending!.error != null) {
      expect(pending.error, isA<IOException>());
    } else {
      expect(pending.reply!.body['result']['isError'], isTrue);
    }
  }
  // Real pointer hit on the exact old approval widget, with no intervening UI frame.
  expect(oldFinder, findsOneWidget);
  expect(_hitPathContains(tester, oldFinder), isTrue);
  var pointerEvents = 0;
  void pointer(PointerEvent e) {
    if (e is PointerDownEvent || e is PointerUpEvent) {
      pointerEvents++;
    }
  }

  final reads = gate.importExecuteReads, outputs = outputCount();
  GestureBinding.instance.pointerRouter.addGlobalRoute(pointer);
  try {
    await tester.tap(oldFinder);
  } finally {
    GestureBinding.instance.pointerRouter.removeGlobalRoute(pointer);
  }
  _harvest(tester, errors);
  expect(pointerEvents, 2);
  expect(gate.importExecuteReads, reads);
  expect(outputCount(), outputs);
  expect(server.approvals, isEmpty);
  final key = (originalRequest['session'] as String).replaceFirst('mcp-', '');
  expect(RegExp(r'^[a-f0-9]{64}$').hasMatch(key), isTrue);
  final journal = File(path.join(server.journal.path, '$key.json'));
  final record = await tester
      .runAsync(() async => jsonDecode(await journal.readAsString()) as Map);
  expect(record!['result']['isError'], isTrue);
  if (handled) {
    final replay = await _completeRpc(
        tester, server.url, server.token, body, errors,
        session: initialized.session);
    expect(replay.body['result']['isError'], isTrue);
    expect(gate.importExecuteReads, reads);
    expect(outputCount(), 0);
  } else {
    expect(gate.importExecuteReads, 0);
    expect(outputCount(), 0);
  }
  expect(await tester.runAsync(() => source.readAsBytes()), bytes);
  expect(app.workbenchImage, isNull);
  expect(app.history, isEmpty);
  return {
    'actualPendingRpc': true,
    'actualApprovalUiPointer': true,
    'stalePointerEvents': pointerEvents,
    'stopped': !handled,
    'handledCancelControl': handled,
    'sourceExecutionReads': gate.importExecuteReads,
    'mutationFiles': outputCount(),
    'journalDeniedByStop': !handled,
    'staleActionAddedExecution': false,
    'durableReplayAddedExecution': false
  };
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  final clipboard = <String>[];
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    root = Directory.systemTemp.createTempSync('mcp-ready-card-host-');
    clipboard.clear();
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (_) async => root.path);
    messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') {
        clipboard.add((call.arguments as Map)['text'] as String);
      }
      return null;
    });
  });
  tearDown(() async {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'), null);
    messenger.setMockMethodCallHandler(SystemChannels.platform, null);
    final actual = await root.resolveSymbolicLinks(),
        temp = await Directory.systemTemp.resolveSymbolicLinks();
    if (!path.isWithin(temp, actual) ||
        !path.basename(actual).startsWith('mcp-ready-card-host-')) {
      throw StateError('Owned fixture directory escaped system temp');
    }
    await root.delete(recursive: true);
  });

  for (final mode in [
    'pending-bind',
    'stale-copy-after-stop',
    'stale-approve-after-stop',
    'stale-cancel-after-stop',
    'handled-cancel-approve-again'
  ]) {
    testWidgets('actual MCP card lifecycle: $mode', (tester) async {
      final app = AppState(storage: Storage())
        ..settings = AppSettings(language: 'en-US');
      final runtime = app.externalMcp, errors = <Object>[], gate = _BindGate();
      _Start? start;
      var pointerEvents = 0;
      void pointer(PointerEvent e) {
        if (e is PointerDownEvent || e is PointerUpEvent) pointerEvents++;
      }

      try {
        if (mode == 'pending-bind') {
          await _mount(tester, app, 'before');
        } else {
          // Isolate the stale callback from the separate startup-frame fault.
          // The actual production card is mounted once the real bind is ready.
          await tester.pumpWidget(const SizedBox.shrink());
        }
        _harvest(tester, errors);
        start = _Start(runtime, gate);
        await _spin(tester, () => gate.entered.isCompleted, errors);
        final pending = runtime.server!;
        expect(pending.runtimeType, ExternalMcpServer);
        expect(path.isWithin(root.path, pending.journal.path), isTrue);
        expect(runtime.changing, isTrue);
        expect(() => pending.url, throwsA(isA<TypeError>()),
            reason:
                'Actual server getter must remain unavailable before actual bind');
        if (mode == 'pending-bind') {
          // A real settings rebuild/navigation while start is awaiting the OS.
          await _mount(tester, app, 'pending');
          _harvest(tester, errors);
          expect(find.byType(OutlinedButton), findsNothing);
          expect(find.byType(SelectableText), findsNothing);
          expect(clipboard, isEmpty);
        }
        gate.unblock();
        await _spin(tester, () => start!.done, errors);
        expect(start.error, isNull);
        expect(runtime.changing, isFalse);
        expect(identical(runtime.server, pending), isTrue);
        expect(gate.binds, 1);
        await _mount(tester, app, 'ready');
        _harvest(tester, errors);
        final url = pending.url;
        await _connect(tester, url);
        expect(find.byType(OutlinedButton), findsOneWidget);
        await tester.tap(find.byType(OutlinedButton));
        await tester.pump();
        _harvest(tester, errors);
        expect(clipboard, hasLength(1));
        final config =
            jsonDecode(clipboard.single)['mcpServers']['langbai'] as Map;
        expect(config['url'] == url, isTrue);
        expect(config['headers']['Authorization'] == 'Bearer ${pending.token}',
            isTrue);
        Map<String, Object?> approval = const {};
        if (mode == 'stale-approve-after-stop' ||
            mode == 'stale-cancel-after-stop' ||
            mode == 'handled-cancel-approve-again') {
          approval = await _approvalExercise(
              tester, app, pending, gate, root, errors, mode);
        }
        final oldCopy =
            tester.widget<OutlinedButton>(find.byType(OutlinedButton));
        final oldFinder = find.byWidget(oldCopy);
        var stopped = false;
        Object? stopError;
        if (approval['stopped'] == true) {
          stopped = true;
        } else {
          final stop = runtime.toggle();
          stop.then((_) {
            stopped = true;
          }, onError: (Object e, StackTrace _) {
            stopError = e;
            stopped = true;
          });
        }
        await _spin(tester, () => stopped, errors,
            frames: mode != 'stale-copy-after-stop');
        expect(stopError, isNull);
        expect(runtime.server, isNull);
        expect(runtime.changing, isFalse);
        expect(() => pending.url, throwsA(isA<TypeError>()),
            reason:
                'Stopped getter is not replaced with an empty or old endpoint');
        if (mode == 'stale-copy-after-stop') {
          expect(oldFinder, findsOneWidget);
          expect(_hitPathContains(tester, oldFinder), isTrue,
              reason:
                  'The old ready Copy button must still be physically reachable');
          GestureBinding.instance.pointerRouter.addGlobalRoute(pointer);
          try {
            await tester.tap(oldFinder);
          } finally {
            GestureBinding.instance.pointerRouter.removeGlobalRoute(pointer);
          }
          _harvest(tester, errors);
          expect(pointerEvents, 2);
          expect(clipboard, hasLength(1),
              reason:
                  'Closed server must not be copied from a stale ready frame');
        }
        await _mount(tester, app, 'stopped');
        _harvest(tester, errors);
        expect(find.byType(OutlinedButton), findsNothing);
        expect(find.byType(SelectableText), findsNothing);
        // ignore: avoid_print
        print('HOST_MCP_READY_CARD:${jsonEncode({
              'mode': mode,
              'realBindCount': gate.binds,
              'readyEndpointWasConnectable': true,
              'serverClosed': runtime.server == null,
              'staleCopyPointerEvents': pointerEvents,
              'clipboardWrites': clipboard.length,
              'frameworkErrors': errors.map((e) => e.toString()).toList(),
              'approvalLifecycle': approval,
              'nativeCertificationGranted': false
            })}');
        expect(errors, isEmpty,
            reason:
                'Every captured framework/gesture failure must fail this host regression');
      } finally {
        gate.unblock();
        if (start != null) await _spin(tester, () => start!.done, errors);
        if (runtime.server != null && !runtime.changing) {
          var done = false;
          final stop = runtime.toggle();
          stop.whenComplete(() {
            done = true;
          });
          await _spin(tester, () => done, errors);
          await stop;
        }
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        app.dispose();
      }
    });
  }
}
