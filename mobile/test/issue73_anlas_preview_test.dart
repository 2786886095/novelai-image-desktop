import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';
class FixtureVaultIo {
  final File file; FixtureVaultIo(this.file);
  Future<void> _tail=Future<void>.value();
  Future<T> _serialized<T>(Future<T> Function() action) {
    final result=_tail.then((_)=>action());
    _tail=result.then<void>((_){},onError:(Object _,StackTrace __){});
    return result;
  }
  Future<bool> exists()=>file.exists();
  Future<String> readAsString()=>_serialized(file.readAsString);
  Future<void> writeAsString(String value)=>_serialized(()async{await file.writeAsString(value);});
}
const opus=AccountSummary(hasToken:true,tierLevel:3,hasActiveSubscription:true,anlasBalance:19788,opusUsage:OpusGenerationUsage(percent:99,isNegative:false,timeUntilNextPercent:3600));
const relaySummary=AccountSummary(hasToken:true,hasActiveSubscription:false);
class FixtureStorage extends NovelAiAccountStorage {
  FixtureStorage(super.accounts);
  @override Future<void> ready() async {}
}
class FixtureApi extends NaiApi {
  final NovelAiAccounts accounts;
  int officialCalls=0,relayCalls=0; int? officialPrice=0;
  FixtureApi(this.accounts);
  @override Future<AccountSummary> fetchAccount(String t,AppSettings s) async=>accounts.active!.profile.relay?relaySummary:opus;
  @override Future<int?> requestOfficialGenerationPrice(String t,AppSettings s,GenerateParams p) async {
    if(accounts.active!.profile.relay){relayCalls++;return null;}
    officialCalls++;return officialPrice;
  }
}
class Fixture {
  final Directory root; final FixtureVaultIo vault; final NovelAiAccounts accounts; final AppState state;final FixtureApi api;final String officialId,relayId;
  Fixture(this.root,this.vault,this.accounts,this.state,this.api,this.officialId,this.relayId);
  Future<void> dispose() async {state.dispose();/* Retain this synthetic fixture directory: background refresh may hold its handle. */}
}
Future<Fixture> fixture({String language='zh-CN',bool relay=true}) async {
  final root=await Directory.systemTemp.createTemp('anlas-synthetic-'); final vault=FixtureVaultIo(File('${root.path}/synthetic-vault.json'));
  final a=NovelAiAccounts(read:()async=>await vault.exists()?vault.readAsString():null,write:(v)=>vault.writeAsString(v));
  await a.load(legacyToken:()async=>null,legacySettings:()async=>AppSettings());
  final o=await a.addVerified(label:'synthetic-official',method:'token',token:'synthetic-fixture-official',verify:(_)async=>opus);
  final r=await a.addVerified(label:'synthetic-relay',method:'relay',token:'synthetic-fixture-independent',apiBaseUrl:'https://relay.example.invalid',imageBaseUrl:'https://image-relay.example.invalid',verify:(_)async=>relaySummary);
  await a.activate(relay?r.id:o.id);
  final api=FixtureApi(a);final state=AppState(storage:FixtureStorage(a),api:api);
  state.settings.language=language;
  state.account=relay?relaySummary:opus;
  state.params=GenerateParams(model:'nai-diffusion-5-full',width:1408,height:704,steps:28,positivePrompt:'synthetic quote only');
  return Fixture(root,vault,a,state,api,o.id,r.id);
}
bool reference(AnlasQuote q){try{return (q as dynamic).referenceOnly==true;}catch(_){return false;}}
const messages={
 'zh-CN':('中转实际扣费：未知','官方无订阅优惠参考：29 Anlas（估算，非中转账单）'),
 'zh-TW':('中轉實際扣費：未知','官方無訂閱優惠參考：29 Anlas（估算，非中轉帳單）'),
 'en-US':('Relay actual charge: unknown','Official no-subscription-discount reference: 29 Anlas (estimate, not a relay bill)'),
 'ja-JP':('中継の実際の請求：不明','公式のサブスク割引なし参考：29 Anlas（推定、中継の請求額ではありません）'),
 'ko-KR':('중계 실제 청구: 알 수 없음','공식 구독 할인 없는 참고: 29 Anlas (추정, 중계 청구액 아님)'),
};
void main(){
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 test('same V5 input official Opus0 vs relay reference29 keeps estimate budget',()async{
  final f=await fixture();addTearDown(f.dispose);await f.state.refreshGenerationQuote();
  expect(f.state.generationQuote!.amount,29);expect(reference(f.state.generationQuote!),isTrue);expect(f.api.relayCalls,0);
  await f.state.activateNaiAccount(f.officialId);await f.state.refreshGenerationQuote();
  expect(f.state.generationQuote!.amount,0);expect(reference(f.state.generationQuote!),isFalse);expect(f.api.officialCalls,greaterThan(0));
 });
 test('all initial and final relay preview notifications are reference-only',()async{
  final f=await fixture();addTearDown(f.dispose);final observed=<bool>[];
  f.state.addListener((){if(f.state.generationQuote!=null)observed.add(reference(f.state.generationQuote!));});
  await f.state.refreshGenerationQuote();expect(observed,isNotEmpty);expect(observed,everyElement(isTrue));
 });
 test('relay profile authority never inherits official Opus benefits from a supplied summary',()async{
  final f=await fixture();addTearDown(f.dispose);f.state.account=opus;await f.state.refreshGenerationQuote();
  expect(f.state.generationQuote!.amount,29);expect(reference(f.state.generationQuote!),isTrue);
 });
 test('same host does not make official account a relay; explicit profile kind does',()async{
  final f=await fixture(relay:false);addTearDown(f.dispose);f.state.settings.imageBaseUrl='https://relay.example.invalid';
  await f.state.refreshGenerationQuote();expect(reference(f.state.generationQuote!),isFalse);expect(f.state.generationQuote!.amount,0);
 });
 test('real isolated vault FS reopen preserves relay authority and switching clears old preview',()async{
  final f=await fixture();addTearDown(f.dispose);await f.state.refreshGenerationQuote();
  await f.state.activateNaiAccount(f.officialId);expect(f.state.generationQuote,isNull);await f.state.refreshGenerationQuote();expect(f.state.generationQuote!.amount,0);
  for(var i=0;i<100 && f.state.naiAccountLocked;i++){await Future<void>.delayed(const Duration(milliseconds:2));}
  await f.state.activateNaiAccount(f.relayId);expect(f.state.generationQuote,isNull);await f.state.refreshGenerationQuote();expect(reference(f.state.generationQuote!),isTrue);
  final reopened=NovelAiAccounts(read:()=>f.vault.readAsString(),write:(v)=>f.vault.writeAsString(v));
  await reopened.load(legacyToken:()async=>null,legacySettings:()async=>AppSettings());expect(reopened.active!.profile.relay,isTrue);
  expect(jsonDecode(await f.vault.readAsString())['activeId'],f.relayId);
 });

 for(final official in [true,false]) {
  testWidgets('official account zero preview keeps ${official ? "quote" : "estimate"} and never claims actual bill',(tester)async{
   tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(390,844);addTearDown(tester.view.reset);
   final f=(await tester.runAsync(()=>fixture(relay:false)))!;addTearDown(f.dispose);f.api.officialPrice=official?0:null;await f.state.refreshGenerationQuote();
   await tester.pumpWidget(ChangeNotifierProvider.value(value:f.state,child:const MaterialApp(home:GenerateScreen())));await tester.pumpAndSettle();
   expect(f.state.generationQuote!.amount,0);expect(reference(f.state.generationQuote!),isFalse);
   expect(find.textContaining(official?'生成前官方报价（非实际扣费）':'生成前估算（非实际扣费）'),findsOneWidget);
   expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());
  });
 }
 for(final locale in messages.keys){
  testWidgets('$locale real GenerateScreen distinguishes relay actual unknown from official reference29',(tester)async{
   tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(390,844);addTearDown(tester.view.reset);
   final f=(await tester.runAsync(()=>fixture(language:locale)))!;addTearDown(f.dispose);await f.state.refreshGenerationQuote();
   await tester.pumpWidget(ChangeNotifierProvider.value(value:f.state,child:const MaterialApp(home:GenerateScreen())));await tester.pumpAndSettle();
   expect(find.textContaining(messages[locale]!.$1),findsOneWidget);expect(find.textContaining(messages[locale]!.$2),findsOneWidget);
   for(final text in [messages[locale]!.$1,messages[locale]!.$2]) {
     final widget=tester.widget<Text>(find.textContaining(text));expect(widget.maxLines,isNull);expect(widget.overflow,isNot(TextOverflow.ellipsis));
     final rect=tester.getRect(find.textContaining(text));expect(rect.top,greaterThanOrEqualTo(0));expect(rect.bottom,lessThanOrEqualTo(844));
   }
   expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());
  });
 }
 testWidgets('real ToolsScreen postprocess distinguishes reference fee from actual relay bill',(tester)async{
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(600,2200);addTearDown(tester.view.reset);
  final f=(await tester.runAsync(()=>fixture()))!;addTearDown(f.dispose);f.state.directorTool='bg-removal';
  await tester.pumpWidget(ChangeNotifierProvider.value(value:f.state,child:const MaterialApp(home:ToolsScreen(kind:ToolPageKind.postprocess))));await tester.pumpAndSettle();
  await tester.tap(find.text('导演工具'));await tester.pumpAndSettle();
  expect(reference(f.state.directorAnlasQuote),isTrue);expect(find.textContaining(messages['zh-CN']!.$1),findsOneWidget);expect(find.textContaining('官方无订阅优惠参考：65 Anlas'),findsOneWidget);
  expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox.shrink());
 });
 test('all tool previews retain numeric budgets and relay marker',()async{
  final f=await fixture();addTearDown(f.dispose);f.state.workbenchImage=const WorkingImage(filePath:'synthetic-only.png',width:1408,height:704);
  for(final q in [f.state.inpaintAnlasQuote,f.state.upscaleAnlasQuote,f.state.directorAnlasQuote]){expect(q.amount,isNotNull);expect(reference(q),isTrue);}
 });
}
