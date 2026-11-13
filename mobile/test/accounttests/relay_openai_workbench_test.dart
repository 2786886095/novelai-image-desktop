import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('account selection mounts compatible UI, submits exactly once and writes actual image', (tester) async {
    final temp = Directory.systemTemp.createTempSync('owned-relay-account-');
    addTearDown(() async {
      expect(temp.parent.path, Directory.systemTemp.path);
      expect(temp.uri.pathSegments.where((e)=>e.isNotEmpty).last, startsWith('owned-relay-account-'));
      await temp.delete(recursive:true);
    });
    PathProviderPlatform.instance = _Paths(temp.path);
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    UnifiedStorage.active = null;
    String? disk;
    final vault = NovelAiAccounts(read: () async => disk, write: (s) async {disk=s;});
    final storage = NovelAiAccountStorage(vault);
    final requests=<String>[];
    var responseStatus=200;
    final accountApi=NovelAiAccountApi(vault,clientFactory:(_,__)=>MockClient((r) async {
      requests.add('GET ${r.url.path}');
      expect(r.method,'GET');expect(r.headers['Authorization'],'Bearer QA_ONLY_RELAY');
      return http.Response(jsonEncode({'object':'list','data':[{'id':'custom-image'}]}),200);
    }));
    final state=AppState(storage:storage,api:accountApi,preloadCompletedImage:(_)async{},
      compatibleClientFactory:(_,uri,scope) async {
        expect(scope,ProxyScope.nai);
        return MockClient((r) async {
          requests.add('${r.method} ${r.url.path}');
          expect(r.url.origin,'https://owned-relay.invalid');
          expect(r.headers['Authorization'],'Bearer QA_ONLY_RELAY');
          expect(r.followRedirects,isFalse);
          expect(jsonDecode(r.body),{'model':'custom-image','prompt':'fixture trees','size':'auto','n':1});
          return http.Response(jsonEncode({'data':[{'b64_json':base64Encode(img.encodePng(img.Image(width:2,height:2)))}]}),responseStatus);
        });
      })..settings=AppSettings(saveToGallery:false)..params.positivePrompt='fixture trees'..batchCount=1;
    addTearDown(state.dispose);
    await tester.runAsync(() async {
      await storage.setSettings(state.settings);
      await state.addNaiAccount(label:'Fixture',method:'relay',token:'QA_ONLY_RELAY',
        apiBaseUrl:'https://owned-relay.invalid/prefix/v1/models',imageBaseUrl:'',
        relayProtocol:'openai-images',relayModel:'custom-image');
    });
    expect(requests,['GET /prefix/v1/models']);
    expect(state.settings.imageProvider,'openai-images');
    await tester.pumpWidget(ChangeNotifierProvider.value(value:state,child:const MaterialApp(home:GenerateScreen())));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('compatible-prompt')),findsOneWidget);
    await tester.runAsync(state.generate);
    await tester.pumpAndSettle();
    expect(requests,['GET /prefix/v1/models','POST /prefix/v1/images/generations']);
    expect(state.current,isNotNull);
    expect(img.decodePng(File(state.current!.filePath).readAsBytesSync())!.width,2);
    expect(state.lastAnlasSpent,isNull);
    responseStatus=403;
    await tester.runAsync(state.generate);
    await tester.pumpAndSettle();
    expect(requests,hasLength(3));
    expect(state.status,contains('POST /v1/images/generations HTTP 403'));
    expect((await tester.runAsync(storage.getSettings))!.toJson().toString(),isNot(contains('QA_ONLY_RELAY')));
    await tester.pumpWidget(const SizedBox());
  });
}

