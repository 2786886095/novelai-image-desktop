// Host fixture regression only; no native proof or paid provider.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/external_mcp_settings.dart';
import 'package:novelai_mobile/i18n/platform_feature_text.dart';
import '../integration_test/native_batch_mcp_scenarios.dart' as fixture;

class Paths extends PathProviderPlatform {
  final String root;
  Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final mode in [
    'approve',
    'cleanup',
    'cleanup-no-primary',
    'deny',
    'disabled',
    'foreign',
    'stale'
  ]) {
    testWidgets('bound native MCP approval fixture: $mode', (tester) async {
      HttpOverrides.global = null;
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});
      final root = (await tester.runAsync(
          () => Directory.systemTemp.createTemp('mcp-widget-real-loopback-')))!;
      final oldPaths = PathProviderPlatform.instance;
      PathProviderPlatform.instance = Paths(root.path);
      UnifiedStorage.active = null;
      final app =
          AppState(storage: Storage(), preloadCompletedImage: (_) async {})
            ..settings = AppSettings(
                language: 'en-US', proxyMode: 'direct', saveToGallery: false);
      final file = File('${root.path}/source.png');
      final bytes = im.encodePng(im.Image(width: 32, height: 32, numChannels: 4)
        ..clear(im.ColorRgba8(12, 34, 56, 255)));
      await tester.runAsync(() => file.writeAsBytes(bytes));
      final client = HttpClient();
      String? session;
      var id = 0;
      Object? connectionError;
      Map<String, dynamic>? completed;
      Future<void>? observed;
      fixture.NativeMcpPendingRpc? owned;
      try {
        await tester.runAsync(() => app.externalMcp.toggle());
        final server = app.externalMcp.server!;
        await tester.pumpWidget(ChangeNotifierProvider.value(
            value: app,
            child: const MaterialApp(
                home: Scaffold(
                    body: SingleChildScrollView(
                        child: ExternalMcpSettingsCard())))));
        await tester.pump();
        Future<Map<String, dynamic>> rpc(String method,
            {Map<String, dynamic>? params}) async {
          final r = await client.postUrl(Uri.parse(server.url));
          r.headers.contentType = ContentType.json;
          r.headers.set('Authorization', 'Bearer ${server.token}');
          if (session != null) r.headers.set('Mcp-Session-Id', session!);
          r.write(jsonEncode({
            'jsonrpc': '2.0',
            'id': ++id,
            'method': method,
            if (params != null) 'params': params
          }));
          final response = await r.close();
          session = response.headers.value('mcp-session-id') ?? session;
          return jsonDecode(await utf8.decoder.bind(response).join())
              as Map<String, dynamic>;
        }

        await tester.runAsync(() async {
          expect(
              (await rpc('initialize',
                  params: {'protocolVersion': '2025-11-25'}))['result'],
              isNotNull);
          final pending = rpc('tools/call', params: {
            'name': 'import_image',
            'arguments': {'path': file.path}
          });
          owned = fixture.NativeMcpPendingRpc(pending);
          observed = owned!.outcome.then<void>((value) {
            completed = value.body;
            connectionError = value.error;
          });
          for (var n = 0; n < 200 && server.approvals.isEmpty; n++) {
            await Future<void>.delayed(const Duration(milliseconds: 5));
          }
          expect(server.approvals, hasLength(1));
        });
        await tester.pump();
        final old = find.widgetWithText(FilledButton, 'Approve'),
            real = find.widgetWithText(FilledButton,
                platformFeatureText(app.settings.language, 'approve'));
        expect(old, findsNothing);
        expect(real, findsOneWidget);
        expect(platformFeatureText('en-US', 'approve'), 'Approve execution');
        expect(completed, isNull);
        expect(connectionError, isNull);
        expect(
            Directory('${root.path}/external-mcp/assets').listSync(), isEmpty);
        print('ACTUAL_MCP_WIDGET ${jsonEncode({
              'approvalPending': server.approvals.length,
              'oldPredicateCount': old.evaluate().length,
              'realWidgetCount': real.evaluate().length,
              'realLabel':
                  platformFeatureText(app.settings.language, 'approve'),
              'completedBeforeDecision': completed != null,
              'mode': mode
            })}');
        if (mode == 'approve' || mode == 'deny') {
          await fixture.decideNativeMcpApproval(
              server, app.settings.language, mode == 'approve',
              renderFrame: () => tester.pump());
          final response = await tester.runAsync(() => owned!.reply());
          await tester.runAsync(() => observed!);
          expect(connectionError, isNull);
          expect(response!['result']['isError'],
              mode == 'deny' ? isTrue : isNot(true));
          if (mode == 'approve') {
            final data =
                jsonDecode(response['result']['content'][0]['text']) as Map;
            expect(data['filePath'], isNot(file.path));
            expect(File(data['filePath'] as String).existsSync(), isTrue);
          }
          expect(server.approvals, isEmpty);
          print('ACTUAL_MCP_DECISION ${jsonEncode({
                'mode': mode,
                'replyReceived': true,
                'uiCallbackInvoked': true,
                'native': false
              })}');
        } else if (mode == 'cleanup') {
          final first = StateError('ORIGINAL_FIXTURE_FAILURE');
          Object? caught;
          try {
            try {
              throw first;
            } finally {
              await tester.runAsync(() => fixture.closeNativeMcpRequests(
                  [owned!],
                  closeClient: () => client.close(force: true),
                  stopServer: () => app.externalMcp.toggle(),
                  primaryError: first));
            }
          } catch (error) {
            caught = error;
          }
          await tester.runAsync(() => observed!);
          expect(identical(caught, first), isTrue);
          expect(completed, isNull);
          expect(connectionError, isA<HttpException>());
          expect(connectionError.toString(),
              contains('Connection closed before full header was received'));
          print('ACTUAL_MCP_CLEANUP ${jsonEncode({
                'primaryPreserved': identical(caught, first),
                'pendingObserved': connectionError is HttpException,
                'native': false
              })}');
        } else if (mode == 'cleanup-no-primary') {
          await tester.runAsync(() async {
            await expectLater(
                fixture.closeNativeMcpRequests([owned!],
                    closeClient: () => client.close(force: true),
                    stopServer: () => app.externalMcp.toggle()),
                throwsA(isA<HttpException>()));
          });
          await tester.runAsync(() => observed!);
          expect(completed, isNull);
          expect(connectionError, isA<HttpException>());
        } else if (mode == 'stale') {
          await expectLater(
              fixture.decideNativeMcpApproval(
                  server, app.settings.language, true, renderFrame: () async {
                await tester.runAsync(() => app.externalMcp.toggle());
                await tester.pump();
              }),
              throwsA(isA<StateError>().having((e) => e.message, 'message',
                  contains('changed before UI decision'))));
        } else {
          final request = server.approvals.single;
          var pressed = false;
          // Synthetic negative rows exercise binding/disabled guards only; no native/UI success claim.
          await tester.pumpWidget(MaterialApp(
              home: Scaffold(
                  body: Card(
                      child: Column(children: [
            Text(request['title'] as String),
            SelectableText(mode == 'foreign'
                ? 'OTHER_REQUEST_SUMMARY'
                : const JsonEncoder.withIndent('  ')
                    .convert(request['parameters'])),
            FilledButton(
                onPressed: mode == 'disabled' ? null : () => pressed = true,
                child: Text(platformFeatureText('en-US', 'approve')))
          ])))));
          await expectLater(
              fixture.decideNativeMcpApproval(
                  server, app.settings.language, true,
                  renderFrame: () => tester.pump()),
              throwsA(isA<StateError>().having(
                  (e) => e.message,
                  'message',
                  contains(mode == 'disabled'
                      ? 'disabled'
                      : 'missing or ambiguous'))));
          expect(pressed, isFalse);
          expect(server.approvals, hasLength(1));
          expect(completed, isNull);
        }
      } finally {
        if (app.externalMcp.server != null) {
          await tester.runAsync(() => fixture.closeNativeMcpRequests(
              [if (owned != null) owned!],
              closeClient: () => client.close(force: true),
              stopServer: () => app.externalMcp.toggle(),
              primaryError: StateError('TEST_FINALLY')));
        } else {
          client.close(force: true);
        }
        await tester.pumpWidget(const SizedBox.shrink());
        app.dispose();
        PathProviderPlatform.instance = oldPaths;
        UnifiedStorage.active = null;
        await tester.runAsync(() => root.delete(recursive: true));
      }
    });
  }
}
