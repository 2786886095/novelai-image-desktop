import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';

class OwnedStreamClient extends http.BaseClient {
  final Future<http.StreamedResponse> Function(http.BaseRequest) respond;
  int closes = 0, sends = 0;
  OwnedStreamClient(this.respond);
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    sends++;
    return respond(request);
  }
  @override
  void close() { closes++; }
}

void main() {
  final fixture = jsonDecode(File('test/accounttests/fixtures/novelai-paid-bounds-fixture.json').readAsStringSync()) as Map;
  final limit = fixture['byteLimit'] as int, png = base64Decode(fixture['png'] as String);
  for (final method in ['relay', 'token']) {
    for (final id in (fixture['cases'] as List).cast<String>()) {
      test('actual $method paid transport $id', () async {
        String? document;
        final vault = NovelAiAccounts(read: () async => document, write: (v) async => document = v);
        await vault.load(legacyToken: () async => null, legacySettings: () async => AppSettings());
        final p = await vault.add(label:'OWNED QA',method:method,token:'QA_ONLY_PLACEHOLDER_TOKEN',
          apiBaseUrl: method == 'relay' ? 'https://owned-novelai-relay.invalid' : 'https://api.novelai.net',
          imageBaseUrl: method == 'relay' ? 'https://owned-novelai-relay.invalid' : 'https://image.novelai.net');
        await vault.activate(p.id);
        var chunks = 0, cancelled = false;
        final requests = <Map<String, Object?>>[];
        final stream = StreamController<List<int>>(onCancel: () { cancelled = true; });
        late OwnedStreamClient client;
        client = OwnedStreamClient((request) async {
          expect(request.url.path, '/ai/generate-image');
          expect(request.headers['Authorization'], 'Bearer QA_ONLY_PLACEHOLDER_TOKEN');
          expect(request.followRedirects, false);
          requests.add({'method':request.method,'path':request.url.path});
          final status = id == 'error401-body' ? 401 : id == 'redirect302-body' ? 302 : id == 'success201' ? 201 : 200;
          // Emit only after the actual transport subscribes to the body.
          stream.onListen = () {
            scheduleMicrotask(() async {
              if (id == 'stream-error-redaction') {
                stream.addError(StateError('QA_SECRET_REMOTE_BODY'));
              } else if (id == 'stream-overflow') {
                final chunk = Uint8List(4 * 1024 * 1024)..[0]=0x89..[1]=0x50;
                for (var i = 0; i < 32 && !cancelled; i++) {
                  chunks++; stream.add(chunk); await Future<void>.delayed(Duration.zero);
                }
                if (!cancelled) { chunks++; stream.add([1]); }
              } else if (!cancelled) {
                chunks++; stream.add(png);
              }
              unawaited(stream.close());
            });
          };
          return http.StreamedResponse(stream.stream, status,
            contentLength: id == 'declared-overflow' ? limit + 1 : null,
            headers: {'content-type':'image/png', if(status == 302) 'location':'https://wrong.invalid/'});
        });
        final api = NovelAiAccountApi(vault, clientFactory:(_, __)=>client);
        Object? error;
        var generated = false;
        try {
          final result = await api.generate(vault.active!.token,AppSettings(),
            GenerateParams(model:'nai-diffusion-5-full',positivePrompt:'blue sky',seed:20261002,seedMode:'fixed'),GenerateExtras());
          generated = result.$1.isNotEmpty;
        } catch(e) { error = e; }
        final errorType = error?.runtimeType.toString() ?? '';
        final redacted = !error.toString().contains('QA_SECRET_REMOTE_BODY');
        final passed = client.sends == 1 && client.closes == 1 && !vault.locked && !api.inFlight &&
          switch (id) {
            'success200' || 'success201' => generated && error == null,
            'error401-body' || 'redirect302-body' => error is NaiHttpException && chunks == 0,
            'declared-overflow' => error is StateError && error.toString().contains('byte limit') && chunks == 0,
            'stream-overflow' => error is StateError && error.toString().contains('byte limit'),
            'stream-error-redaction' => error is StateError && redacted,
            _ => false,
          };
        debugPrint('NOVELAI_PAID_BOUNDS=${jsonEncode({'method':method,'id':id,'generated':generated,
          'errorType':errorType,'redacted':redacted,'chunks':chunks,'cancelled':cancelled,
          'requests':requests,'closes':client.closes,'locked':vault.locked,'inFlight':api.inFlight,'passed':passed})}');
        expect(passed,true);
      });
    }
    for (final phase in ['open', 'headers', 'body']) {
      testWidgets('actual $method paid deadline includes $phase', (tester) async {
        String? document;
        final vault = NovelAiAccounts(read: () async => document, write: (v) async => document = v);
        await vault.load(legacyToken: () async => null, legacySettings: () async => AppSettings());
        final p = await vault.add(label:'OWNED QA',method:method,token:'QA_ONLY_PLACEHOLDER_TOKEN',
          apiBaseUrl:method == 'relay' ? 'https://owned-novelai-relay.invalid' : 'https://api.novelai.net',
          imageBaseUrl:method == 'relay' ? 'https://owned-novelai-relay.invalid' : 'https://image.novelai.net');
        await vault.activate(p.id);
        final opened = Completer<http.Client>(), headers = Completer<http.StreamedResponse>();
        var chunks = 0, cancelled = false, factories = 0;
        final body = StreamController<List<int>>(onCancel: () { cancelled = true; });
        final client = OwnedStreamClient((_) async {
          if (phase == 'headers') return headers.future;
          if (phase == 'body') return http.StreamedResponse(body.stream, 200);
          return http.StreamedResponse(Stream.value(png),200);
        });
        final api = NovelAiAccountApi(vault,clientFactory:(_, __) {
          factories++;
          return phase == 'open' ? opened.future : client;
        });
        Object? error;
        final pending = api.generate(vault.active!.token,AppSettings(),GenerateParams(),GenerateExtras())
            .then<void>((_) {},onError:(Object e) { error=e; });
        await tester.pump();
        await tester.pump(const Duration(seconds:179));
        final early = error != null;
        await tester.pump(const Duration(seconds:1));
        final timedOut = error is TimeoutException, released = !vault.locked && !api.inFlight;
        if (phase == 'open') opened.complete(client);
        if (phase == 'headers') {
          body.onListen = () { scheduleMicrotask(() {
            if (!cancelled) { chunks++; body.add(png); }
            unawaited(body.close());
          }); };
          headers.complete(http.StreamedResponse(body.stream,200));
        }
        if (phase == 'body') {
          if (!cancelled) { chunks++; body.add(png); }
          unawaited(body.close());
        }
        await tester.pump();
        await pending;
        final passed = !early && timedOut && released && factories == 1 && client.closes == 1 &&
          (phase == 'open' ? client.sends == 0 : client.sends == 1 && cancelled && chunks == 0);
        debugPrint('NOVELAI_PAID_DEADLINE=${jsonEncode({'method':method,'phase':phase,'early':early,
          'timedOut':timedOut,'releasedAtDeadline':released,'factories':factories,'sends':client.sends,
          'closes':client.closes,'chunks':chunks,'cancelled':cancelled,'passed':passed})}');
        expect(passed,true);
      });
    }
  }
}
