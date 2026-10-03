import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Future<NovelAiAccounts> fixture() async {
    String? document;
    final accounts=NovelAiAccounts(read:()async=>document,write:(s)async=>document=s);
    await accounts.load(legacyToken:()async=>null,legacySettings:()async=>AppSettings());
    return accounts;
  }
  Future<AccountSummary> verify(NovelAiAccounts accounts,NovelAiCredentialSnapshot s,{bool modelsOnly=false})=>
    NovelAiAccountApi(accounts,clientFactory:(_,__)=>MockClient((r)async{
      expect(r.method,'GET');expect(r.url.host.endsWith('novelai.net'),false);
      return modelsOnly?(r.url.path.endsWith('/models')?
        http.Response(jsonEncode({'object':'list','data':[{'id':'nai-diffusion-5-full'}]}),200):http.Response('',404)):
        http.Response(jsonEncode({'subscription':{'tier':0,'trainingStepsLeft':42}}),200);
    })).verifyCandidate(s,AppSettings());
  test('verified save deduplicates same main endpoint and Token across different image endpoints',()async{
    final a=await fixture();
    final first=await a.addVerified(label:'first',method:'relay',token:'fixture-relay',apiBaseUrl:'https://relay.example.invalid/prefix',imageBaseUrl:'https://one-images.example.invalid/raw',verify:(s)=>verify(a,s));
    final again=await a.addVerified(label:'second',method:'relay',token:'fixture-relay',apiBaseUrl:'https://relay.example.invalid/prefix',imageBaseUrl:'https://two-images.example.invalid/raw',verify:(s)=>verify(a,s));
    expect(a.profiles.length,1);expect(again.id,first.id);
  });
  test('a successful models-only verification preserves last known account balance as cached',()async{
    final a=await fixture();
    final first=await a.addVerified(label:'first',method:'relay',token:'fixture-relay',apiBaseUrl:'https://relay.example.invalid/prefix',imageBaseUrl:'https://one-images.example.invalid/raw',verify:(s)=>verify(a,s));
    await a.addVerified(label:'same',method:'relay',token:'fixture-relay',apiBaseUrl:'https://relay.example.invalid/prefix',imageBaseUrl:'https://one-images.example.invalid/raw',verify:(s)=>verify(a,s,modelsOnly:true));
    expect(a.profiles.length,1);expect(a.cachedSummary(first.id).anlasBalance,42);expect(a.cachedSummary(first.id).stale,true);
  });
}
