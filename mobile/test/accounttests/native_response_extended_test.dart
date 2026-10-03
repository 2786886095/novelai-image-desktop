import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
void main() {
  final fixture=jsonDecode(File('test/accounttests/fixtures/novelai-native-response-extended-fixture.json').readAsStringSync()) as Map;
  for(final row in fixture['cases'] as List) {
    test('actual native transport final response ${row['id']}',() async {
      String? document;
      final vault=NovelAiAccounts(read:()async=>document,write:(v)async=>document=v);
      await vault.load(legacyToken:()async=>null,legacySettings:()async=>AppSettings());
      final p=await vault.add(label:'OWNED QA',method:'relay',token:'QA_ONLY_PLACEHOLDER_TOKEN',
        apiBaseUrl:'https://owned-novelai-relay.invalid',imageBaseUrl:'https://owned-novelai-relay.invalid');
      await vault.activate(p.id);var posts=0;Object? error;var count=0;var images=<List<int>>[];
      final api=NovelAiAccountApi(vault,clientFactory:(_,__)=>MockClient((request)async{
        expect(request.method,'POST');expect(request.url.toString(),'https://owned-novelai-relay.invalid/ai/generate-image');
        expect(request.followRedirects,false);posts++;return http.Response.bytes(base64Decode(row['body'] as String),200);
      }));
      try{images=(await api.generate(vault.active!.token,AppSettings(),GenerateParams(),GenerateExtras() )).$1;count=images.length;}catch(e){error=e;}
      final expected=(row['expectedImages'] as List).map((v)=>base64Decode(v as String)).toList();
      final unchanged=images.length==expected.length&&List.generate(images.length,(i)=>base64Encode(images[i])==base64Encode(expected[i])).every((v)=>v);
      final passed=unchanged&&posts==1&&count==row['expectedCount']&&((row['expectedCount']==0)==(error!=null))&&!vault.locked&&!api.inFlight;
      debugPrint('NOVELAI_NATIVE_RESPONSE=${jsonEncode({'id':row['id'],'posts':posts,'count':count,'errorType':error?.runtimeType.toString()??'','passed':passed})}');
      expect(passed,true);
    });
  }
}
