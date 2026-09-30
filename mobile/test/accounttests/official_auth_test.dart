import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/novelai_official_auth.dart';

void main() {
  final vectors = jsonDecode(
      File('test/accounttests/fixtures/access-key-vectors.json')
          .readAsStringSync()) as List;
  for (var i = 0; i < vectors.length; i++) {
    test(
        'Argon2id independent reference vector $i (Unicode code points, exact casing)',
        () async {
      final v = vectors[i];
      expect(await deriveNovelAiAccessKey(v['email'], v['password']),
          v['accessKey']);
    });
  }
  test(
      'login sends derived key only, fixed HTTPS, no redirects; access token is usable',
      () async {
    final v = vectors.first;
    var requests = 0;
    final auth = NovelAiOfficialAuth(
        clientFactory: () => MockClient((r) async {
              requests++;
              expect(r.url.toString(), 'https://api.novelai.net/user/login');
              expect(r.method, 'POST');
              expect(r.followRedirects, false);
              expect(jsonDecode(r.body), {'key': v['accessKey']});
              expect(r.body, isNot(contains(v['password'])));
              expect(r.body, isNot(contains(v['email'])));
              return http.Response(
                  '{"accessToken":"synthetic-access-token"}', 201);
            }));
    expect(
        await auth.login(v['email'], v['password']), 'synthetic-access-token');
    expect(requests, 1);
  });
  test('challenge and redirects do not persist/retry/expose remote body',
      () async {
    final v = vectors.first;
    for (final status in [200, 302, 401, 429]) {
      var calls = 0;
      final auth = NovelAiOfficialAuth(
          clientFactory: () => MockClient((r) async {
                calls++;
                return http.Response(
                    '{"challenge":"sensitive remote text"}', status);
              }));
      await expectLater(
          auth.login(v['email'], v['password']),
          throwsA(isA<StateError>().having((e) => e.toString(), 'safe error',
              isNot(contains('sensitive remote text')))));
      expect(calls, 1);
    }
  });
}
