import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final fixture = jsonDecode(File('test/accounttests/fixtures/newapi-novelai-fixture.json').readAsStringSync()) as Map;
  for (final raw in fixture['cases'] as List) {
    final row = raw as Map;
    test('actual NovelAI only save guard ${row['id']}', () async {
      String? document;
      var writes = 0;
      final vault = NovelAiAccounts(read: () async => document,
          write: (v) async { document = v; writes++; });
      await vault.load(legacyToken: () async => null, legacySettings: () async => AppSettings());
      final original = document, originalWrites = writes;
      final calls = <Map<String, Object?>>[];
      const token = 'QA_ONLY_PLACEHOLDER_TOKEN';
      final api = NovelAiAccountApi(vault, clientFactory: (_, __) => MockClient((request) async {
        expect(request.url.origin, 'https://owned-novelai-relay.invalid');
        calls.add({'method': request.method, 'path': request.url.path,
          'maxRedirects': request.maxRedirects, 'followRedirects': request.followRedirects,
          'fixtureAuthorization': request.headers['Authorization'] == 'Bearer $token'});
        final response = (row['responses'] as Map)[request.url.path] as Map?;
        final data = response?['data'];
        return http.Response(data is String ? data : jsonEncode(data), response?['status'] as int? ?? 404);
      }));
      var allowsSave = true;
      String code = 'passed';
      try {
        await vault.addVerified(label: 'OWNED_QA', method: 'relay', token: token,
          apiBaseUrl: 'https://owned-novelai-relay.invalid${row['apiSuffix'] ?? ''}', imageBaseUrl: '',
          verify: (snapshot) => api.verifyCandidate(snapshot, AppSettings()));
      } catch (error) {
        allowsSave = false;
        code = RegExp(r'NAI_ACCOUNT_VALIDATION:([\w-]+):').firstMatch('$error')?.group(1) ?? 'unexpected';
      }
      final passed = allowsSave == row['expectedOk'] && code == row['expectedCode'] &&
        calls.every((c) => c['method'] == 'GET' && c['followRedirects'] == false &&
          c['maxRedirects'] == 0 && c['fixtureAuthorization'] == true);
      if (!allowsSave) { expect(document, original); expect(writes, originalWrites); expect(vault.profiles, isEmpty); }
      print('NOVELAI_MOBILE_VALIDATION=${jsonEncode({'id':row['id'],'passed':passed,
        'allowsSave':allowsSave,'code':code,'calls':calls,'vaultWrites':writes-originalWrites,
        'anlasBalance':vault.active == null ? null : vault.cachedSummary(vault.active!.profile.id).anlasBalance})}');
      if (row['id'] == 'models-quota-not-anlas' && allowsSave) { expect(vault.cachedSummary(vault.active!.profile.id).anlasBalance, isNull); }
      expect(passed, true);
    });
  }
}
