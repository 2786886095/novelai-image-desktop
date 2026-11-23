import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/opencode_go_session.dart';

class _Redirect extends HttpOverrides {
  final int port;
  _Redirect(this.port);
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      _Loop(super.createHttpClient(context), port);
}

class _Loop implements HttpClient {
  final HttpClient inner;
  final int port;
  _Loop(this.inner, this.port);
  @override
  set idleTimeout(Duration value) => inner.idleTimeout = value;
  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) => inner.openUrl(
      method, url.replace(scheme: 'http', host: '127.0.0.1', port: port));
  @override
  void close({bool force = false}) => inner.close(force: force);
  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SizedBox.shrink());
  void expect(dynamic value, dynamic spec) {
    final m = wrapMatcher(spec);
    if (!m.matches(value, <dynamic, dynamic>{}))
      throw StateError('Native QA mismatch: ' + m.toString());
  }

  final labels = <String>[];
  final file = File(
      '${(await getApplicationDocumentsDirectory()).path}/GO_ADAPTER_PROOF_R2.json');
  final clean = <FutureOr<void> Function()>[];
  void addTearDown(FutureOr<void> Function() f) => clean.add(f);
  Future<void> runCase(String label, Future<void> Function() work) async {
    try {
      await work();
      labels.add(label);
    } catch (e, st) {
      await file.writeAsString(jsonEncode({
        'passed': false,
        'case': label,
        'error': '$e',
        'stack': '$st',
        'steps': labels
      }));
      rethrow;
    } finally {
      for (final f in clean.reversed) {
        await f();
      }
      clean.clear();
    }
  }

  for (final entry in {
    'go': 'https://opencode.ai/inference/go/v1',
    'deepseek': 'https://api.deepseek.com',
    'otherPath': 'https://opencode.ai/inference/openai/v1',
    'lookalike': 'https://opencode.ai.example.invalid/inference/go/v1',
    'control': 'https://example.invalid/v1'
  }.entries) {
    for (final task in ['convert', 'reverse', 'agent', 'retry']) {
      await runCase(
          '${entry.key} $task: actual transport, retry and conversation isolation',
          () async {
        final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        addTearDown(() => server.close(force: true));
        final before = HttpOverrides.current;
        HttpOverrides.global = _Redirect(server.port);
        addTearDown(() => HttpOverrides.global = before);
        final ids = <String?>[], uas = <String?>[], images = <bool>[];
        server.listen((r) async {
          ids.add(r.headers.value('x-opencode-session'));
          uas.add(r.headers.value('user-agent'));
          images.add((await utf8.decoder.bind(r).join()).contains('image_url'));
          final retry = task == 'retry' && ids.length.isOdd;
          r.response.headers.contentType = ContentType.json;
          r.response.write(jsonEncode({
            'choices': [
              {
                'message': {
                  'role': 'assistant',
                  'content':
                      retry ? '' : 'A woman in a blue coat stands by a tree.'
                },
                'finish_reason': retry ? 'length' : 'stop'
              }
            ]
          }));
          await r.response.close();
        });
        final url = entry.value,
            s = AppSettings(
                visionApiUrl: url,
                convertApiUrl: url,
                agentApiBaseUrl: url,
                agentApiProtocol: 'openai-compatible',
                visionApiModel: 'deepseek-v4.1-flash',
                agentApiModel: 'deepseek-v4.1-flash',
                convertApiModel: 'deepseek-v4.1-flash',
                proxyForAi: false);
        final api = NaiApi();
        if (task == 'agent') {
          final client = AgentProviderClient();
          for (final id in ['chat-A', 'chat-A', 'chat-B']) {
            await withGoConversation(
                id,
                () => client.complete(
                    settings: s,
                    apiKey: 'fixture',
                    messages: [
                      {'role': 'user', 'content': 'hello'}
                    ],
                    tools: [],
                    onDelta: (_) {}));
          }
        } else {
          for (var i = 0; i < 2; i++) {
            if (task == 'retry') {
              await api.runTextAi(
                  settings: s,
                  apiKey: 'test',
                  apiUrl: url,
                  model: 'fixture',
                  system: 'test',
                  user: 'test');
            } else if (task == 'convert') {
              await api.convertPrompt(
                  settings: s,
                  apiKey: 'fixture',
                  text: 'blue coat',
                  mode: ReversePromptMode.natural,
                  knownCharacter: false,
                  systemTemplate: 'fixture');
            } else {
              await api.reversePrompt(
                  settings: s,
                  apiKey: 'fixture',
                  image: Uint8List.fromList(base64Decode(
                      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3DEAAAAASUVORK5CYII=')),
                  mode: ReversePromptMode.natural,
                  scope: ReversePromptScope.full,
                  hint: '',
                  knownCharacter: false,
                  systemTemplate: 'fixture');
            }
          }
        }
        expect(
            ids.length,
            task == 'agent'
                ? 3
                : task == 'retry'
                    ? 4
                    : 2);
        if (task == 'reverse') expect(images, everyElement(true));
        if (entry.key == 'go') {
          expect(ids.first, isNotEmpty);
          if (task == 'agent' || task == 'retry') {
            expect(ids[0], ids[1]);
          } else {
            expect(ids[0], isNot(ids[1]));
          }
          if (ids.length > 2) expect(ids[2], isNot(ids[0]));
          if (task == 'retry') expect(ids[3], ids[2]);
          expect(uas, everyElement('Langbai-NovelAI-Studio/mobile'));
        } else {
          expect(ids, everyElement(isNull));
          expect(uas, isNot(contains('Langbai-NovelAI-Studio/mobile')));
        }
      });
    }
  }
  await file.writeAsString(
      jsonEncode({
        'os': Platform.operatingSystem,
        'source': const String.fromEnvironment('STUDIO_QA_SHA'),
        'passed': true,
        'steps': labels
      }),
      flush: true);
}
