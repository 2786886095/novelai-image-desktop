// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:archive/archive.dart';
import 'package:flutter/services.dart';
import 'package:novelai_mobile/images/image_processing.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/novelai_accounts.dart';
import 'package:novelai_mobile/services/novelai_account_api.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/ai_log_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';


// Public neutral CI-only key pair. Trust exactly this fixture certificate;
// never disable certificate validation or trust arbitrary upstream certificates.
const _fixtureCertificate="-----BEGIN CERTIFICATE-----\nMIIDUjCCAjqgAwIBAgIUYdnJXFnZlJkLPm0djWBqlBzgg+YwDQYJKoZIhvcNAQEL\nBQAwHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENBMB4XDTI2MTAxMTA3MjYz\nNFoXDTI3MTAxMTA3MjYzNFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkq\nhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp2jCGmt4OG1MoyoRZ1rpoE/waMnA7nze\notnpCC+EA7oaLbjmT8GdX5QgcaEMrquJN5y/vaAmflvzMiKKtqd0h+AZs4TvzQKG\nkiBu/NbBBf3n2p1qewpB/lvaeUUvnezT/TjWxahaic2LXHiOY+WhV59oO111+Cc2\n8FSzLHn/ZUOQ+nNZtI6E1s40t9tpq/6EVQmJfvtb7BIgnMlyDZfsLQ82Gs8HZAxU\nUwLdZwQZ9isySJnylTUrtuFElfRh6O/TmD8dpVmpzbiiLMTlilUe50TR2qgKFYSK\nedBRtks6d24JFBijya/STPLjSWvp4P6nvuNxOOgD/ohDdmsWJx1h9QIDAQABo4GS\nMIGPMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgWgMBMGA1UdJQQMMAoGCCsG\nAQUFBwMBMBoGA1UdEQQTMBGHBH8AAAGCCWxvY2FsaG9zdDAdBgNVHQ4EFgQUQyS8\nIEYkBSeTAhO/XUGNGd8Np/MwHwYDVR0jBBgwFoAUr0lAYXmZ+xnFcYSKQd42keRG\nH/swDQYJKoZIhvcNAQELBQADggEBAC51zZvrINl4zsFPuX0AAKMi3Ze5VCX6fYVh\nUmRdMzleI/mtB39u5k89mBJWxKa45ZP2E69wm0tTI4X20dcCNMgvEEB+6d15HhlU\n/KeSrM4ciSzyBy5ZJ+sxibR15ubtMySmtlnEuomsrdxiM2KfhYHW4fp8ptSeRE0g\nl4zLoPzqXYXScJ5kgFhwdwYV2Ms8pIKysOmQ8VFRpr1TusaT6ByhD/pG4ylsC4Tu\ncPgbTjs2/TimirBnw1ZEaj+nD90OuLuH21CJhuRy88TdY3c7FQn1C5MMDDU4mj+Q\nNO4hhCJxpk+mom5mhu1in0mZEQctJHJ4u4P88UmL+edyQrUgpl8=\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\nMIIDLjCCAhagAwIBAgIUWgLilRtsr+PY4AiW2JzYYefXjDswDQYJKoZIhvcNAQEL\nBQAwHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENBMB4XDTI2MTAxMTA3MjYz\nNFoXDTM2MTAwODA3MjYzNFowHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENB\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7ugFhDN4nfWOt1urNBt6\nE3cPSioTCiN9qNBGeO08bptlRCWgbSHEWNE2PZz3lJakSpFh8GV1/ADlXYQ4bOLE\nltVx6gtx/vgQ0OslJR6g25zNj64EOjDYfLXStfrAiUbKIvw/xgsJhp33phLZgrSI\nzrQd1OIBASkDAQgvM7CgXdKb5goupi44ctugpp0xcNW061nXlgWmkSY/+jr9KGHL\nDUAo4UYvV8as76q9/WGxoNDJcdJwT6Lfwt90cKh392bTCFqitnweinr59YxzpAIl\nL+h3s+qo/RNfZGwKfYno95HtI72Ff/yt1MDjs6OX+mMpeHD7VH9QyrSGBzcPZ639\n+QIDAQABo2YwZDAdBgNVHQ4EFgQUr0lAYXmZ+xnFcYSKQd42keRGH/swHwYDVR0j\nBBgwFoAUr0lAYXmZ+xnFcYSKQd42keRGH/swEgYDVR0TAQH/BAgwBgEB/wIBADAO\nBgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQELBQADggEBADkxzBsh1os6SQ1Qp9+2\n7EJA5nfJliIlwtsckLeKdFHpyvhDn+z/PspgdJi6adzYLaWBQ9nukt9FAQLUvRpM\n9FdFT/GQu1OKMpEUy7rZX/ry03gyNLrLtAdCdrUUs/tADplzlAtGWGrZ6itnw9Se\nVepJZyUpOHCeyXE8NYy/D75i1qh8sA+YXipUMZ042G9ExgWZvhk98HWd/CP4FBbS\npHLAXjccb+jmri9sCBuSZiYTI0cTFIbnaO58mokI2LHemesN3nN+d1Cef62xzpok\nwYa6Fs1J7QUvdK7Dlsnd+GFx9zO0SoL4Qa1nrQsV82m9lH8QeFxT8H25ej/TYFoj\nq0U=\n-----END CERTIFICATE-----\n";
const _fixtureCa="-----BEGIN CERTIFICATE-----\nMIIDLjCCAhagAwIBAgIUWgLilRtsr+PY4AiW2JzYYefXjDswDQYJKoZIhvcNAQEL\nBQAwHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENBMB4XDTI2MTAxMTA3MjYz\nNFoXDTM2MTAwODA3MjYzNFowHTEbMBkGA1UEAwwSTmV1dHJhbCBDSSBSb290IENB\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7ugFhDN4nfWOt1urNBt6\nE3cPSioTCiN9qNBGeO08bptlRCWgbSHEWNE2PZz3lJakSpFh8GV1/ADlXYQ4bOLE\nltVx6gtx/vgQ0OslJR6g25zNj64EOjDYfLXStfrAiUbKIvw/xgsJhp33phLZgrSI\nzrQd1OIBASkDAQgvM7CgXdKb5goupi44ctugpp0xcNW061nXlgWmkSY/+jr9KGHL\nDUAo4UYvV8as76q9/WGxoNDJcdJwT6Lfwt90cKh392bTCFqitnweinr59YxzpAIl\nL+h3s+qo/RNfZGwKfYno95HtI72Ff/yt1MDjs6OX+mMpeHD7VH9QyrSGBzcPZ639\n+QIDAQABo2YwZDAdBgNVHQ4EFgQUr0lAYXmZ+xnFcYSKQd42keRGH/swHwYDVR0j\nBBgwFoAUr0lAYXmZ+xnFcYSKQd42keRGH/swEgYDVR0TAQH/BAgwBgEB/wIBADAO\nBgNVHQ8BAf8EBAMCAQYwDQYJKoZIhvcNAQELBQADggEBADkxzBsh1os6SQ1Qp9+2\n7EJA5nfJliIlwtsckLeKdFHpyvhDn+z/PspgdJi6adzYLaWBQ9nukt9FAQLUvRpM\n9FdFT/GQu1OKMpEUy7rZX/ry03gyNLrLtAdCdrUUs/tADplzlAtGWGrZ6itnw9Se\nVepJZyUpOHCeyXE8NYy/D75i1qh8sA+YXipUMZ042G9ExgWZvhk98HWd/CP4FBbS\npHLAXjccb+jmri9sCBuSZiYTI0cTFIbnaO58mokI2LHemesN3nN+d1Cef62xzpok\nwYa6Fs1J7QUvdK7Dlsnd+GFx9zO0SoL4Qa1nrQsV82m9lH8QeFxT8H25ej/TYFoj\nq0U=\n-----END CERTIFICATE-----\n";
const _fixturePrivateKey="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCnaMIaa3g4bUyj\nKhFnWumgT/BoycDufN6i2ekIL4QDuhotuOZPwZ1flCBxoQyuq4k3nL+9oCZ+W/My\nIoq2p3SH4BmzhO/NAoaSIG781sEF/efanWp7CkH+W9p5RS+d7NP9ONbFqFqJzYtc\neI5j5aFXn2g7XXX4JzbwVLMsef9lQ5D6c1m0joTWzjS322mr/oRVCYl++1vsEiCc\nyXINl+wtDzYazwdkDFRTAt1nBBn2KzJImfKVNSu24USV9GHo79OYPx2lWanNuKIs\nxOWKVR7nRNHaqAoVhIp50FG2Szp3bgkUGKPJr9JM8uNJa+ng/qe+43E46AP+iEN2\naxYnHWH1AgMBAAECggEABZ/Lm5seMhkb8MReStBfVnMxErgqeuiniyWSgmOkRgLH\n097pH+dTi+08TMz6Edkx9jQWLf72JBsfN8E400ubauAwxNrzunm5/ylHSUfGutaN\npkbRF7qfvnWkCJx2LdJRyelRr9jI1+XXp37mW71QdxLkK9BnQPPCUP8reNRNa/+z\n6wGb5mR2oXtRXcUZNx1lKoaDbZ3DDzOYM/dyHZBCKcy5tXYw7rj+xS9/huwqVH+K\nyRNn8AemJtIFg0zbKYdpAuGYM0THIYfnvSv3YE5NEbjdune3esm8d0qbgyWrJijp\n1760i7h5m3F5EnO71yoq1IOuHKAX0bbCX9sy9x5uCQKBgQDdzV4RpgEcFMpIHxAf\nPBzWRcar7Yb2oSDlCEhf9jBvuDjXvSQCGLQohhHw/rGlRxre+hhM+13xK2O1w+sn\n5DiIOVUeLZv/pqJF6iRayE3Au4pYsyqDxzcJyYCkz5LDwMQ+ZUU2hnrTleWKre4c\nE8wqQJCE0ah/3NAVJwqHm+Y/qQKBgQDBOHl9MU3ktZSN2s+nFJEZtPSttSC32XkM\nbM8yAbv9KWtefU4wwrv2LbSkJ3qCyrFqSRtMMiVXf/0RjxuwZVQymaXTEWzAaWpz\ngWsycolugRQ2Fctf0c8z427UbtLwaUcMVCD5lNOyMGacjCqMf3+FO8HrLQ9FIpyG\n9BETwOpvbQKBgDM0qFT2uCbdfd2snjI31Ih7T2R9z7y8cjWt9deBpKkGJMlZtyhs\nv5rjaNz0T9rSUZfMsTOEjKmS1NAvzOhGve5lHgt7iBo7RBdT+NSkjZ7DLStRIa2O\nnlw6EuL5sO5UYHnvM01lOpICdx3PDbuZrnbKtRKUvIvYVImtm7a2/S8RAoGAXbUt\n9nF6/Xiy2zlLjBSFappAMB6wB3oJIuWCdxYwPc9gqyrKSQuobPQtr48V82iqMonS\nG1oWkiEYcvOc0ifSddfefEbvH0IAxpP1kTnLPTSMwM5BG+99NgUPMyesVbw5INmM\nRH7RTJH8sd+oowsSpWMd4RixVy46C5lCzvm4uOECgYB6eWngaOApkWzLUmegQAs/\n49SSCyoJClXR7hLAOa3lIGRplU9l3UT2siIypmUbaqogHeckvy3Sx8ghKvnJcmMB\n9FtOzgftHCVUQ8vzs+xIRxZDrM9ezE8s86RxE6kPPSUhR2/tTaOiKbbHCa8LoCy+\ng1Us2E5J3tv1AwWR/Vix6w==\n-----END PRIVATE KEY-----\n";
class _LoopbackTrust extends HttpOverrides {
  @override HttpClient createHttpClient(SecurityContext? context) {
    final fixtureOnly=SecurityContext(withTrustedRoots:false)..setTrustedCertificatesBytes(utf8.encode(_fixtureCa));
    return super.createHttpClient(fixtureOnly);
  }
}
Future<HttpServer> _tlsLoopback() async {
  final context=SecurityContext()..useCertificateChainBytes(utf8.encode(_fixtureCertificate))..usePrivateKeyBytes(utf8.encode(_fixturePrivateKey));
  HttpOverrides.global=_LoopbackTrust();
  return HttpServer.bindSecure(InternetAddress.loopbackIPv4,0,context);
}
Future<bool> _serveAccountVerification(HttpRequest request) async {
  if(request.method!='GET')return false;
  expect(request.uri.path,'/user/data');expect(request.headers.value('authorization'),'Bearer neutral-nai-secret');
  request.response.headers.contentType=ContentType.json;
  request.response.write(jsonEncode({'subscription':{'tier':3,'active':true,'trainingStepsLeft':{'fixedTrainingStepsLeft':1000000,'purchasedTrainingSteps':0}}}));
  await request.response.close();return true;
}
Future<void> _activateNeutralAccount(AppState app,int port) async {
  final url='https://127.0.0.1:$port';
  await app.addNaiAccount(label:'Neutral CI account',method:'relay',token:'neutral-nai-secret',apiBaseUrl:url,imageBaseUrl:url);
  expect(app.naiAccounts.active!.profile.imageBaseUrl,url);
  expect(await app.storage.getToken(),'neutral-nai-secret');
  expect(jsonEncode((await app.storage.getSettings()).toJson()),isNot(contains('neutral-nai-secret')));
}

// Native CI-only fresh simulator/emulator. Real plugin channels, storage and
// socket transport; neutral fixtures, no production endpoint and no paid call.
void result(String name,List<String> features) => print('NATIVE_MOBILE_CASE:${jsonEncode({'name':name,'features':features,'pass':true,'platform':Platform.isAndroid?'android':'ios','sourceSha':const String.fromEnvironment('ACCEPTANCE_SOURCE_SHA'),'paidCalls':0})}');
HistoryItem row(String id,String file)=>HistoryItem(id:id,filePath:file,date:'2026-10-11',createdAt:'2026-10-11',seed:123,model:'fixture',width:32,height:32,prompt:'blue square');
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  late Storage storage;late AppState app;late Directory root;late File source,mask;
  final servers=<HttpServer>[];
  setUp(() async {
    HttpOverrides.global=null;UnifiedStorage.active=null;
    final prefs=await SharedPreferences.getInstance();await prefs.clear();
    await const FlutterSecureStorage().deleteAll();
    root=await Directory((await getTemporaryDirectory()).path).createTemp('native-acceptance-');
    final accounts=NovelAiAccounts();storage=NovelAiAccountStorage(accounts);await (storage as NovelAiAccountStorage).ready();app=AppState(api:NovelAiAccountApi(accounts),storage:storage,preloadCompletedImage:(_) async {})..settings=AppSettings(proxyMode:'direct',saveToGallery:false);
    await storage.setSettings(app.settings);await storage.writeHistory([]);await storage.writeGroups([]);
    final image=im.Image(width:32,height:32,numChannels:4);im.fill(image,color:im.ColorRgba8(220,30,30,255));
    image.textData={'Comment':jsonEncode({'prompt':'blue square','seed':123})};
    source=File('${root.path}/source.png');await source.writeAsBytes(im.encodePng(image));
    final selected=im.Image(width:32,height:32,numChannels:4);im.fillRect(selected,x1:12,y1:12,x2:19,y2:19,color:im.ColorRgba8(255,255,255,255));
    mask=File('${root.path}/mask.png');await mask.writeAsBytes(im.encodePng(selected));
  });
  tearDown(() async {
    app.dispose();for(final server in servers){await server.close(force:true);}servers.clear();
    await Future<void>.delayed(const Duration(milliseconds:50));if(await root.exists())await root.delete(recursive:true);
  });
  testWidgets('real secure storage and preferences survive reopening', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Native acceptance'))));
    final docs=await getApplicationDocumentsDirectory();expect(await docs.exists(),true);
    await app.saveOpenAIEditSettings({'baseUrl':'https://example.test/v1','model':'fixture-edit','size':'32x32','quality':'auto','inputFidelity':''},'neutral-fixture-secret','');
    final fresh=await Storage().getSettings();final id=fresh.openAIEdit['credentialId'] as String;
    expect(id,isNotEmpty);expect(await Storage().getOpenAIEditKey(id),'neutral-fixture-secret');
    expect(jsonEncode(fresh.toJson()),isNot(contains('neutral-fixture-secret')));expect(fresh.imageProvider,'novelai');
    await app.setAutomaticComparison('inpaint',false);expect((await Storage().getSettings()).automaticComparison['inpaint'],false);
    result('Real native credential/preferences/path-provider readback',['accounts','settings','openai-inpaint','output-management']);
  });
  for(final status in [200,422]) {
    testWidgets('real OpenAI AppState multipart $status submits once', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral edit'))));
      var posts=0;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);
      server.listen((request) async {
        expect(request.method,'POST');expect(request.uri.path,'/v1/images/edits');posts++;
        expect(request.headers.value('authorization'),'Bearer neutral-edit-secret');
        await request.drain<void>();request.response.statusCode=status;
        final image=im.Image(width:32,height:32);im.fill(image,color:im.ColorRgb8(0,0,255));
        request.response.write(status==200?jsonEncode({'data':[{'b64_json':base64Encode(im.encodePng(image))}]}):'fixture rejected');await request.response.close();
      });
      await app.saveOpenAIEditSettings({'baseUrl':'http://127.0.0.1:${server.port}/v1','model':'fixture-edit','size':'32x32','quality':'auto','inputFidelity':''},'neutral-edit-secret','');
      app.inpaintEngine='openai';app.inpaintSourceMode='latest';app.inpaintPositivePrompt='blue square';await app.setWorkbenchPath(source.path);
      await app.inpaint(await mask.readAsBytes());expect(posts,1);expect(app.busy,false);expect(app.history.length,status==200?1:0);
      if(status==200) {final saved=im.decodePng(await File(app.history.single.filePath).readAsBytes())!;
        expect([saved.getPixel(0,0).r,saved.getPixel(0,0).g,saved.getPixel(0,0).b],[220,30,30]);
        // Default production compositor deliberately feathers/matches seams;
        // pure blue is not the specified result for this small selected region.
        final center=saved.getPixel(15,15);
        expect(saved.width,32);expect(saved.height,32);
        expect(center.r,lessThan(40));expect(center.g,lessThan(40));expect(center.b,greaterThan(200));expect(center.a,255);
        for(final xy in [[0,31],[31,0],[31,31]]) {
          final corner=saved.getPixel(xy[0],xy[1]);expect([corner.r,corner.g,corner.b],[220,30,30]);
        }
        print('NATIVE_COMPOSITE_PIXELS:${jsonEncode({'center':[center.r,center.g,center.b],'cornersUnchanged':true})}');
        expect(app.history.single.feature,'openai-inpaint');expect(jsonEncode(app.history.single.toJson()),isNot(contains('neutral-edit-secret')));
      }
      result('OpenAI real AppState multipart status $status',['openai-inpaint','inpaint','works']);
    });
  }
  testWidgets('real file deletion/move/reconcile across Storage instances', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral works'))));
    final images=await storage.imagesDir(),a=File('${images.path}/acceptance-a.png'),b=File('${images.path}/acceptance-b.png');
    await a.writeAsBytes(await source.readAsBytes());await b.writeAsBytes(await source.readAsBytes());
    await storage.writeGroups(const [HistoryGroup(id:'native-group',name:'Group',createdAt:'2026-10-11')]);
    await storage.writeHistory([row('a',a.path),row('b',b.path),row('external',source.path)]);app.history=await storage.getHistory();app.groups=await storage.getGroups();
    final other=Storage();expect((await other.getHistory()).length,3);
    await app.moveHistoryItems({'a','b'},'native-group');expect((await other.getHistory()).take(2).every((h)=>h.groupId=='native-group'),true);
    await app.setWorkbenchPath(a.path);await app.deleteHistoryItems({'a','external'});expect(await a.exists(),false);expect(await source.exists(),true);expect(app.workbenchImage,isNull);
    await b.delete();app.booted=true;await app.reconcileMissingHistory();expect(app.history,isEmpty);expect(await other.getHistory(),isEmpty);
    result('Actual native filesystem/group/index/cache transaction',['works','works-batch-edit','missing-file-reconciliation','output-management']);
  });
  testWidgets('real authenticated loopback MCP rejects unauthenticated callers', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral MCP'))));
    expect(app.externalMcp.server,isNull);await app.externalMcp.toggle();final server=app.externalMcp.server!;final client=HttpClient();
    try {
      final bad=await client.postUrl(Uri.parse(server.url));bad.headers.contentType=ContentType.json;bad.write('{}');final denied=await bad.close();await denied.drain<void>();expect(denied.statusCode,403);
      final request=await client.postUrl(Uri.parse(server.url));request.headers.contentType=ContentType.json;request.headers.set('authorization','Bearer ${server.token}');
      request.write(jsonEncode({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26'}}));final response=await request.close();expect(response.statusCode,200);
      final reply=jsonDecode(await utf8.decoder.bind(response).join());expect(reply['result']['serverInfo']['version'],appVersion);
    } finally {client.close(force:true);await app.externalMcp.toggle();}
    expect(app.externalMcp.server,isNull);result('Native loopback MCP authentication/lifecycle',['external-mcp-server','settings']);
  });
  testWidgets('actual records expand and scroll past long first entry', (tester) async {
    final text=List.generate(100,(i)=>'Neutral blue square record line $i').join('\n');
    // Populate the read-only log through the real public API and transport.
    final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);var posts=0;
    server.listen((request) async {
      expect(request.method,'POST');expect(request.uri.path,'/v1/chat/completions');posts++;
      await request.drain<void>();request.response.headers.contentType=ContentType.json;
      request.response.write(jsonEncode({'choices':[{'message':{'content':text}}]}));await request.response.close();
    });
    for(var i=0;i<24;i++) {
      final response=await app.api.runTextAi(settings:app.settings,apiKey:'neutral-log-secret',apiUrl:'http://127.0.0.1:${server.port}/v1',model:'fixture',system:text,user:text,label:'Neutral record $i');
      expect(response.ok,true);
    }
    expect(posts,24);expect(app.aiCallLog.length,24);expect(app.aiCallLog.first.label,'Neutral record 23');
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:const MaterialApp(home:AiLogScreen())));await tester.pumpAndSettle();
    await tester.tap(find.text('Neutral record 23'));await tester.pumpAndSettle();
    final list=find.byType(ListView).first;final scrollable=find.descendant(of:list,matching:find.byType(Scrollable)).first;
    final before=tester.state<ScrollableState>(scrollable).position.pixels;await tester.drag(list,const Offset(0,-500));await tester.pumpAndSettle();
    expect(tester.state<ScrollableState>(scrollable).position.pixels,greaterThan(before));expect(tester.takeException(),isNull);
    result('Native renderer expanded records scroll',['ai-records']);
  });
  testWidgets('real core screens fit portrait/landscape at 200 percent text', (tester) async {
    for(final size in [const Size(390,844),const Size(844,390),const Size(1024,768)]) {
      await tester.binding.setSurfaceSize(size);
      for(final screen in [const GalleryScreen(),const GenerateScreen(),const ToolsScreen(kind:ToolPageKind.inpaint)]) {
        await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:MediaQuery(data:MediaQueryData(size:size,textScaler:const TextScaler.linear(2)),child:screen))));
        await tester.pumpAndSettle();expect(tester.takeException(),isNull,reason:'$size ${screen.runtimeType}');
        if(screen is GalleryScreen) {await tester.tap(find.byKey(const ValueKey('works-batch-edit')));await tester.pumpAndSettle();expect(tester.takeException(),isNull);}
        await tester.pumpWidget(const SizedBox.shrink());
      }
    }
    await tester.binding.setSurfaceSize(null);result('Native device core-screen responsive text 200 percent',['typography','works-batch-edit','generation','inpaint']);
  });

  // Backend -> native file/index readback with the production transport.
  // All endpoints are localhost, never a provider and never a paid call.
  for(final scenario in ['high','medium','503','401']) {
    testWidgets('native NovelAI generation $scenario', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native generation'))));
      var posts=0;final server=await _tlsLoopback();servers.add(server);
      final status=int.tryParse(scenario)??200;Map<String,dynamic>? requestBody;
      final generated=im.Image(width:64,height:64);im.fill(generated,color:im.ColorRgb8(0,0,255));
      final png=im.encodePng(generated),zip=ZipEncoder().encode(Archive()..addFile(ArchiveFile('image.png',png.length,png)))!;
      server.listen((request) async {
        if(await _serveAccountVerification(request))return;
        posts++;expect(request.uri.path,'/ai/generate-image');expect(request.method,'POST');
        expect(request.headers.value('authorization'),'Bearer neutral-nai-secret');
        requestBody=jsonDecode(await utf8.decoder.bind(request).join()) as Map<String,dynamic>;
        request.response.statusCode=status;
        if(status==200){request.response.headers.set('content-type','application/zip');request.response.add(zip);}
        else{request.response.write('fixture HTTP $status');}
        await request.response.close();
      });
      await _activateNeutralAccount(app,server.port);app.settings.streamPreviewEnabled=false;
      final params=GenerateParams(positivePrompt:'blue square',width:64,height:64,seed:4000000000,seedMode:'fixed',effort:scenario=='medium'?'medium':'high');
      var succeeded=false;
      try {
        final output=await app.api.generate('neutral-nai-secret',app.settings,params,GenerateExtras());
        succeeded=true;expect(output.$1.length,1);expect(output.$2,4000000000);
        final item=await storage.saveImage(output.$1.single,params,output.$2);
        expect(await File(item.filePath).readAsBytes(),png);expect((await Storage().getHistory()).length,1);
      } catch(error) {if(status==200)rethrow;}
      expect(succeeded,status==200);expect(posts,1);expect(requestBody!['model'],scenario=='medium'?'nai-diffusion-5-full-medium':'nai-diffusion-5-full');
      expect((requestBody!['parameters'] as Map)['seed'],4000000000);expect((requestBody!['parameters'] as Map)['n_samples'],1);
      if(status!=200)expect(await storage.getHistory(),isEmpty);
      result('Native NovelAI generation $scenario',['generation','effort','output-management','works','accounts']);
    });
  }
  for(final action in ['img2img','inpaint','colorize','upscale']) {
    testWidgets('native image action $action', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native image action'))));
      var posts=0;final server=await _tlsLoopback();servers.add(server);
      Map<String,dynamic>? requestBody;
      final side=action=='inpaint'?256:64;final generated=im.Image(width:side,height:side);im.fill(generated,color:im.ColorRgb8(0,0,255));
      final png=im.encodePng(generated),zip=ZipEncoder().encode(Archive()..addFile(ArchiveFile('image.png',png.length,png)))!;
      server.listen((request) async {
        if(await _serveAccountVerification(request))return;
        posts++;expect(request.method,'POST');expect(request.headers.value('authorization'),'Bearer neutral-nai-secret');
        expect(request.uri.path,action=='colorize'?'/ai/augment-image':action=='upscale'?'/ai/upscale':'/ai/generate-image');
        requestBody=jsonDecode(await utf8.decoder.bind(request).join()) as Map<String,dynamic>;
        request.response.headers.set('content-type','application/zip');request.response.add(zip);await request.response.close();
      });
      await _activateNeutralAccount(app,server.port);app.settings.streamPreviewEnabled=false;
      final params=GenerateParams(positivePrompt:'blue square',width:side,height:side,seed:123,seedMode:'fixed'),input=await source.readAsBytes();
      late Uint8List output;
      if(action=='img2img'){
        final r=await app.api.img2img('neutral-nai-secret',app.settings,params,GenerateExtras(),input,I2IParams());output=r.$1.single;
        expect(requestBody!['action'],'img2img');expect((requestBody!['parameters'] as Map)['image'],isNotEmpty);
      }else if(action=='inpaint'){
        final r=await app.api.inpaint('neutral-nai-secret',app.settings,params,input,await mask.readAsBytes(),'nai-diffusion-5-full-inpainting',32,32,1,0);output=r.$1.single;
        expect(requestBody!['action'],'infill');expect((requestBody!['parameters'] as Map)['mask'],isNotEmpty);
        // The official default expands by 4 latent cells (32px) and
        // blurs twice by 20px. A 64px fixture has no outside corner at all.
        // Use 256px so these corners are genuinely outside the blended region.
        final decoded=im.decodePng(output)!;expect([decoded.width,decoded.height],[256,256]);
        for(final xy in [[0,0],[255,0],[0,255],[255,255]]) {
          final corner=decoded.getPixel(xy[0],xy[1]);expect([corner.r,corner.g,corner.b],[220,30,30]);
        }
        expect(decoded.getPixel(128,128).b,greaterThan(200));
      }else if(action=='colorize'){
        output=(await app.api.augment('neutral-nai-secret',app.settings,input,32,32,'colorize',AugmentOptions())).single;
        expect(requestBody!['req_type'],'colorize');expect(requestBody!['image'],isNotEmpty);
      }else{
        output=await app.api.upscale('neutral-nai-secret',app.settings,input,2,'nai-diffusion-5-full');
        final decoded=im.decodePng(output)!;expect([decoded.width,decoded.height],[64,64]);
      }
      expect(posts,1);final item=await storage.saveImage(output,params,123,feature:action);
      expect(await File(item.filePath).readAsBytes(),output);expect((await Storage().getHistory()).single.feature,action);
      result('Native image action $action',[action=='img2img'?'image-to-image':action=='inpaint'?'inpaint':'postprocess','works']);
    });
  }
  for(final kind in ['convert','reverse']) {
    for(final status in [200,401]) {
      testWidgets('native cold $kind $status', (tester) async {
        await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native text AI'))));
        var posts=0;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);servers.add(server);
        const answer='A blue square lies in the middle of a red background.';
        server.listen((request) async {
          posts++;expect(request.method,'POST');expect(request.uri.path,'/v1/chat/completions');
          expect(request.headers.value('authorization'),'Bearer neutral-text-secret');
          final body=jsonDecode(await utf8.decoder.bind(request).join()) as Map;
          expect(body['model'],'fixture');
          if(kind=='reverse')expect(jsonEncode(body['messages']),contains('data:image/png;base64,'));
          request.response.statusCode=status;request.response.headers.contentType=ContentType.json;
          request.response.write(status==200?jsonEncode({'choices':[{'message':{'content':answer},'finish_reason':'stop'}]}):jsonEncode({'error':{'message':'fixture unauthorized'}}));await request.response.close();
        });
        final settings=AppSettings(proxyMode:'direct',saveToGallery:false,convertApiUrl:'http://127.0.0.1:${server.port}/v1',visionApiUrl:'http://127.0.0.1:${server.port}/v1',convertApiModel:'fixture',visionApiModel:'fixture',promptCodexEnhanceEnabled:false,promptRuleAutoRepairEnabled:false,reverseConvertDshEnabled:false,tagServerEnabled:false);
        final response=kind=='convert'
          ?await app.api.convertPrompt(settings:settings,apiKey:'neutral-text-secret',text:'A blue square',mode:ReversePromptMode.natural,knownCharacter:false,systemTemplate:'Describe the neutral shape.')
          :await app.api.reversePrompt(settings:settings,apiKey:'neutral-text-secret',image:await source.readAsBytes(),mode:ReversePromptMode.natural,scope:ReversePromptScope.full,hint:'Describe the neutral shape.',knownCharacter:false,systemTemplate:'Describe the neutral shape.');
        expect(response.ok,status==200);expect(posts,1);expect(app.aiCallLog.length,1);expect(app.aiCallLog.single.ok,status==200);
        if(status==200){expect(response.text,answer);}else{expect(response.message,contains('401'));}
        result('Native cold $kind $status',[kind,'ai-records']);
      });
    }
  }
  final webps=<String,String>{'lossy':'UklGRlQAAABXRUJQVlA4IEgAAABwBACdASpgAEAAPm02mUmkIyKhIWgAgA2JaQB2APwAABZkSKC7NmzZs2bNEAD+7c7f//nEsdTu7s///mCRuq/fb0odUoAAAAA=','lossless':'UklGRiQAAABXRUJQVlA4TBcAAAAvX8APAAfQtnI0uP8BICH8ny9F9D/1BwA=','alpha':'UklGRiQAAABXRUJQVlA4TBcAAAAvX8APEAfQtnI0uFkBICH8ny9F9D/1BwA=','animated':'UklGRpQAAABXRUJQVlA4WAoAAAACAAAAXwAAPwAAQU5JTQYAAAD/////AABBTk1GMAAAAAAAAAAAAF8AAD8AAGQAAAJWUDhMFwAAAC9fwA8AB1C8otSo/wEgIfyfL0X0P/UHAEFOTUYwAAAAAAAAAAAAXwAAPwAAZAAAAFZQOEwXAAAAL1/ADwAHULz61qj/ASAh/J8vRfQ/9QcA','novelai-exif-v5':'UklGRgoDAABXRUJQVlA4WAoAAAAIAAAAXwAAPwAAVlA4TBcAAAAvX8APAAfQuyZVtv8BICH8ny9F9D/1BwBKVU5LAwAAAG9kZABFWElGvwIAAElJKgAIAAAABgANAQIAGAAAAGgAAAAOAQIAEAAAAIAAAAAxAQIAGgAAAJAAAAA7AQIACAAAAKoAAACYggIALgAAALIAAABphwQAAQAAAFYAAAAAAAAAAQCGkgcA3wEAAOAAAAAAAAAATm92ZWxBSSBnZW5lcmF0ZWQgaW1hZ2UAMWdpcmwsIGJsdWUgc2t5AE5vdmVsQUkgRGlmZnVzaW9uIFY1IEZ1bGwATm92ZWxBSQBGaXh0dXJlIG9ubHk7IG5vdCBhbiBvZmZpY2lhbCBnZW5lcmF0ZWQgaW1hZ2UAQVNDSUkAAAB7InByb21wdCI6IjFnaXJsLCBibHVlIHNreSIsInVjIjoibG93cmVzLCBiYWQgaGFuZHMiLCJtb2RlbCI6Im5haS1kaWZmdXNpb24tNS1mdWxsIiwic2VlZCI6NDAwMDAwMDAwMCwic3RlcHMiOjI4LCJzY2FsZSI6Niwid2lkdGgiOjk2LCJoZWlnaHQiOjY0LCJzYW1wbGVyIjoia19ldWxlcl9hbmNlc3RyYWwiLCJlZmZvcnQiOiJoaWdoIiwidjRfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoiMWdpcmwsIGJsdWUgc2t5IiwiY2hhcl9jYXB0aW9ucyI6W3siY2hhcl9jYXB0aW9uIjoiZ2lybCwgYmx1ZSBoYWlyIiwiY2VudGVycyI6W3sieCI6MC4yNSwieSI6MC43NX1dfV19LCJ1c2VfY29vcmRzIjp0cnVlfSwidjRfbmVnYXRpdmVfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoibG93cmVzLCBiYWQgaGFuZHMiLCJjaGFyX2NhcHRpb25zIjpbeyJjaGFyX2NhcHRpb24iOiJiYWQgZmFjZSJ9XX19fQAA','novelai-exif-v5-be':'UklGRhADAABXRUJQVlA4WAoAAAAIAAAAXwAAPwAAVlA4TBcAAAAvX8APAAfQuyZVtv8BICH8ny9F9D/1BwBKVU5LAwAAAG9kZABFWElGxQIAAEV4aWYAAE1NACoAAAAIAAYBDQACAAAAGAAAAGgBDgACAAAAEAAAAIABMQACAAAAGgAAAJABOwACAAAACAAAAKqCmAACAAAALgAAALKHaQAEAAAAAQAAAFYAAAAAAAGShgAHAAAB3wAAAOAAAAAATm92ZWxBSSBnZW5lcmF0ZWQgaW1hZ2UAMWdpcmwsIGJsdWUgc2t5AE5vdmVsQUkgRGlmZnVzaW9uIFY1IEZ1bGwATm92ZWxBSQBGaXh0dXJlIG9ubHk7IG5vdCBhbiBvZmZpY2lhbCBnZW5lcmF0ZWQgaW1hZ2UAQVNDSUkAAAB7InByb21wdCI6IjFnaXJsLCBibHVlIHNreSIsInVjIjoibG93cmVzLCBiYWQgaGFuZHMiLCJtb2RlbCI6Im5haS1kaWZmdXNpb24tNS1mdWxsIiwic2VlZCI6NDAwMDAwMDAwMCwic3RlcHMiOjI4LCJzY2FsZSI6Niwid2lkdGgiOjk2LCJoZWlnaHQiOjY0LCJzYW1wbGVyIjoia19ldWxlcl9hbmNlc3RyYWwiLCJlZmZvcnQiOiJoaWdoIiwidjRfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoiMWdpcmwsIGJsdWUgc2t5IiwiY2hhcl9jYXB0aW9ucyI6W3siY2hhcl9jYXB0aW9uIjoiZ2lybCwgYmx1ZSBoYWlyIiwiY2VudGVycyI6W3sieCI6MC4yNSwieSI6MC43NX1dfV19LCJ1c2VfY29vcmRzIjp0cnVlfSwidjRfbmVnYXRpdmVfcHJvbXB0Ijp7ImNhcHRpb24iOnsiYmFzZV9jYXB0aW9uIjoibG93cmVzLCBiYWQgaGFuZHMiLCJjaGFyX2NhcHRpb25zIjpbeyJjaGFyX2NhcHRpb24iOiJiYWQgZmFjZSJ9XX19fQAA'};
  for(final name in webps.keys) {
    testWidgets('native WebP $name decode and workbench import', (tester) async {
      await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native WebP'))));
      final bytes=base64Decode(webps[name]!),file=File('${root.path}/$name.webp');await file.writeAsBytes(bytes);
      await app.setWorkbenchPath(file.path);expect(app.workbenchImage,isNotNull);
      final png=await processingImageBytes(bytes),decoded=im.decodePng(png)!;
      expect([decoded.width,decoded.height],[96,64]);expect(decoded.numFrames,1);expect(await file.readAsBytes(),bytes);
      expect([app.workbenchImage!.width,app.workbenchImage!.height],[96,64]);
      if(name=='alpha')expect(decoded.getPixel(20,20).a,lessThan(255));
      if(name.startsWith('novelai-exif')) {
        expect(app.workbenchImportedParams!.positivePrompt,'1girl, blue sky');expect(app.workbenchImportedParams!.seed,4000000000);
        expect(app.workbenchCharacterCaptions.single.prompt,'girl, blue hair');
      }
      result('Native WebP $name',['metadata-import','tools']);
    });
  }
  testWidgets('real native clipboard text roundtrip', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:Text('Neutral native clipboard'))));
    await Clipboard.setData(const ClipboardData(text:'neutral-native-clipboard-fixture'));
    expect((await Clipboard.getData(Clipboard.kTextPlain))!.text,'neutral-native-clipboard-fixture');
    result('Native clipboard text roundtrip',['clipboard']);
  });
}
