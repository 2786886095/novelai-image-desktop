import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final mode in ['native', 'models', 'openai-images']) {
    test('explicit relay protocol: $mode', () async {
      String? document;
      final vault = NovelAiAccounts(read: () async => document, write: (s) async { document = s; });
      await vault.load(legacyToken: () async => null, legacySettings: () async => AppSettings());
      final calls = <String>[];
      final api = NovelAiAccountApi(vault, clientFactory: (_, __) => MockClient((req) async {
        calls.add('${req.method} ${req.url.path}');
        expect(req.headers['Authorization'], 'Bearer QA_ONLY_RELAY');
        expect(req.followRedirects, isFalse);
        if (req.url.path.endsWith('/user/data')) return http.Response('<html>SPA</html>', 200);
        if (req.url.path.endsWith('/user/subscription')) return http.Response('', 401);
        return http.Response(jsonEncode({'object':'list','data':[{'id':'example-image'}]}), 200);
      }));
      final add = vault.addVerified(label: 'Route QA', method: 'relay', token: 'QA_ONLY_RELAY',
          apiBaseUrl: 'https://relay-fixture.invalid/prefix/v1/models', imageBaseUrl: 'https://relay-fixture.invalid/prefix',
          relayProtocol: mode, relayModel: mode == 'openai-images' ? 'example-image' : null,
          verify: (s) => api.verifyCandidate(s, AppSettings()));
      if (mode == 'native') {
        await expectLater(add, throwsA(isA<FormatException>().having((e)=>e.message,'message', 'NAI_ACCOUNT_VALIDATION:auth:401:/user/subscription')));
        expect(vault.profiles, isEmpty);
        expect(calls, hasLength(2));
      } else {
        final profile = await add;
        expect(profile.relayProtocol, mode);
        expect(profile.apiBaseUrl, 'https://relay-fixture.invalid/prefix/v1');
        expect(calls, ['GET /prefix/v1/models']);
        final reopened = NovelAiAccounts(read: () async => document, write: (_) async {});
        await reopened.load(legacyToken: () async => null, legacySettings: () async => AppSettings());
        expect(reopened.active!.profile.relayProtocol, mode);
        expect(reopened.active!.profile.relayModel, profile.relayModel);
        expect(vault.cachedSummary(profile.id).anlasBalance, isNull);
      }
    });
  }

  test('denied model, missing model and timeout report the selected read route without ever writing the vault', () async {
    for (final status in [401,403,404,200,0]) {
      final vault = NovelAiAccounts(read: () async => null, write: (_) async {fail('unexpected write');});
      final api = NovelAiAccountApi(vault, clientFactory: (_, __) => MockClient((req) async {
        expect(req.method, 'GET');expect(req.url.path, '/v1/models');
        if (status == 0) throw const FormatException('QA_PRIVATE_RESPONSE');
        return http.Response(jsonEncode({'object':'list','data':[{'id':'other-model'}]}),status);
      }));
      const snapshot = NovelAiCredentialSnapshot(NovelAiAccount(id:'probe',label:'Probe',method:'relay',
        relayProtocol:'openai-images',relayModel:'expected-model',apiBaseUrl:'https://relay-fixture.invalid/v1',
        imageBaseUrl:'https://relay-fixture.invalid/v1'), 'QA_ONLY_RELAY');
      await expectLater(api.verifyCandidate(snapshot, AppSettings()),
        throwsA(isA<FormatException>().having((e)=>e.message,'message',endsWith(':$status:/v1/models'))));
    }
  });

  test('runtime provider overlay never serializes an account profile or overwrites standalone preferences', () {
    final s = AppSettings(imageProvider:'novelai',compatibleImage:{'model':'standalone'});
    s.relayImageProtocol='openai-images';s.relayImageConfig={'model':'selected','credentialId':'account:fixture'};
    expect(s.imageProvider, 'openai-images');expect(s.compatibleImage['model'], 'selected');
    final copy=AppSettings.fromJson(s.toJson());
    expect(copy.imageProvider,'novelai');expect(copy.compatibleImage['model'],'standalone');
    expect(s.toJson().toString(),isNot(contains('account:fixture')));
  });
}
