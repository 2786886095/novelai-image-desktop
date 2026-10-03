import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/i18n/runtime_text.dart';
import 'accounts_test.dart' show memoryVault;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for(final language in ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']) {
    test('API Token runtime terminology is consistent in $language', () {
      for(final key in ['error.tokenRequired','error.naiTokenRequired','comic.authStopped']) {
        final message=runtimeTextFor(language,key);
        expect(message,contains('API Token'));
        expect(message,isNot(contains('API Key')));
      }
    });
  }
  test('relay read-only fallback uses explicit prefix, parses string balance, no POST',() async {
    final vault=await memoryVault(); final calls=<http.Request>[];
    final api=NovelAiAccountApi(vault,clientFactory:(_,__)=>MockClient((r) async {
      calls.add(r); expect(r.method,'GET'); expect(r.followRedirects,false);
      expect(r.headers['Authorization'],'Bearer FIXTURE-KEY');
      if(r.url.path.endsWith('/user/data')) return http.Response('',404);
      return http.Response(jsonEncode({'data':{'information':{'subscription':{
        'tier':'0','trainingStepsLeft':{'fixedTrainingStepsLeft':'100','purchasedTrainingSteps':'7'}}}}}),200);
    }));
    final snapshot=NovelAiCredentialSnapshot(const NovelAiAccount(id:'fixture',label:'R',method:'relay',
      apiBaseUrl:'https://relay.example/prefix',imageBaseUrl:'https://images.relay.example/prefix'),'FIXTURE-KEY');
    final result=await api.verifyCandidate(snapshot,AppSettings());
    expect(calls.map((r)=>r.url.toString()).toList(),[
      'https://images.relay.example/prefix/user/data','https://relay.example/prefix/user/subscription']);
    expect(result.anlasBalance,107); expect(result.tierName,'Paper');
    expect(result.hasActiveSubscription,false); expect(api.inFlight,false);
  });
  for(final status in [301,401,403,400,429,500]) {
    test('read-only HTTP $status cannot save or fall back to an official or paid route',() async {
      final vault=await memoryVault(legacy:'OLD-FIXTURE'); final calls=<http.Request>[];
      final api=NovelAiAccountApi(vault,clientFactory:(_,__)=>MockClient((r) async {
        calls.add(r);return http.Response('DO-NOT-ECHO-FIXTURE',status,
          headers:{'location':'https://image.novelai.net/user/data'});
      }));
      await expectLater(vault.addVerified(label:'R',method:'relay',token:'FIXTURE-KEY',
        apiBaseUrl:'https://relay.example',imageBaseUrl:'',verify:(s)=>api.verifyCandidate(s,AppSettings())),
        throwsA(isA<FormatException>().having((e)=>e.message,'redacted',isNot(contains('DO-NOT-ECHO')))));
      expect(calls.length,1); expect(calls.single.method,'GET');
      expect(vault.profiles.length,1); expect(vault.active!.token,'OLD-FIXTURE'); expect(vault.locked,false);
    });
  }
  test('200 HTML, empty body or missing subscription tier cannot be successful verification',() async {
    final vault=await memoryVault();
    for(final body in ['<html>Login</html>','{}','{"subscription":{"tier":"nan"}}']) {
      final api=NovelAiAccountApi(vault,clientFactory:(_,__)=>MockClient((r) async=>http.Response(body,200)));
      await expectLater(vault.addVerified(label:'R',method:'relay',token:'FIXTURE',apiBaseUrl:'https://r.example',
        imageBaseUrl:'',verify:(s)=>api.verifyCandidate(s,AppSettings())),throwsFormatException);
      expect(vault.profiles,isEmpty);
    }
  });
  test('verified save, dedup, per-account cached balance, active deletion and restart form one atomic lifecycle',() async {
    String? doc; var fail=false;
    final v=NovelAiAccounts(read:() async=>doc,write:(s) async {if(fail) throw StateError('vault');doc=s;});
    await v.load(legacyToken:() async=>'PRISTINE-OLD',legacySettings:() async=>AppSettings());
    expect(v.profiles.single.label,'用户1');
    var verifies=0;
    Future<AccountSummary> verify(NovelAiCredentialSnapshot s) async {verifies++;
      return AccountSummary(hasToken:true,anlasBalance:s.token=='NEW-FIXTURE' ? 37 : 19,tierLevel:0,tierName:'Paper');}
    final b=await v.addVerified(label:'',method:'relay',token:' NEW-FIXTURE ',apiBaseUrl:'https://R.example/prefix/',
      imageBaseUrl:'',verify:verify);
    expect(b.label,'用户2');
    final duplicate=await v.addVerified(label:'Ignored duplicate',method:'relay',token:'NEW-FIXTURE',
      apiBaseUrl:'https://r.example/prefix',imageBaseUrl:'https://r.example/prefix/',verify:verify);
    expect(duplicate.id,b.id);expect(v.profiles.length,2);expect(verifies,2);
    final before=doc;fail=true;
    await expectLater(v.addVerified(label:'Failed',method:'token',token:'THIRD-FIXTURE',verify:verify),throwsStateError);
    expect(doc,before);expect(v.profiles.length,2);expect(v.active!.profile.id,b.id);fail=false;
    final reloaded=NovelAiAccounts(read:() async=>doc,write:(s) async=>doc=s);
    await reloaded.load(legacyToken:() async=>throw StateError('must not restore legacy'),legacySettings:() async=>AppSettings());
    expect(reloaded.cachedSummary(b.id).anlasBalance,37); expect(reloaded.cachedSummary(b.id).stale,true);
    await reloaded.remove(b.id);expect(reloaded.active!.profile.id,'legacy-v1');
    await reloaded.remove('legacy-v1');expect(reloaded.active,isNull);
    final empty=NovelAiAccounts(read:() async=>doc,write:(s) async=>doc=s);
    await empty.load(legacyToken:() async=>'PRISTINE-OLD',legacySettings:() async=>AppSettings());
    expect(empty.profiles,isEmpty);expect(empty.active,isNull);
  });
  test('pending verification forbids another save, switching, or task submission',() async {
    final v=await memoryVault(legacy:'OLD-FIXTURE');final gate=Completer<AccountSummary>();
    final save=v.addVerified(label:'B',method:'token',token:'B-FIXTURE',verify:(_)=>gate.future);
    await expectLater(v.activate(null),throwsStateError);
    await expectLater(v.operation((_) async=>1),throwsStateError);
    await expectLater(v.addVerified(label:'C',method:'token',token:'C-FIXTURE',verify:(_)=>gate.future),throwsStateError);
    gate.complete(const AccountSummary(hasToken:true));await save;expect(v.locked,false);
  });
}
