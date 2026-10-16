// Native acceptance helpers. No platform, Storage, network or API mocks.
// ignore_for_file: avoid_print
import 'dart:async';
import 'native_foreground.dart';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:image/image.dart' as im;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/background_queue_service.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

const sourceSha = String.fromEnvironment('FEATURE_SOURCE_SHA');
const profileSha = String.fromEnvironment('FEATURE_PROFILE_SHA');
const testEntry = String.fromEnvironment('FEATURE_TEST_ENTRY');
const syntheticToken = 'NATIVE_ACCEPTANCE_SYNTHETIC_NOT_A_REAL_CREDENTIAL';
void require(bool value, String reason) {
  if (!value) throw StateError(reason);
}
String digest(List<int> value) => sha256.convert(value).toString();

Uint8List png(int width, int height, [int red = 70]) =>
    Uint8List.fromList(im.encodePng(im.Image(width: width, height: height,
      numChannels: 4)..clear(im.ColorRgba8(red, 100, 130, 255))));

Future<void> fails(FutureOr<Object?> Function() action, String reason) async {
  var failed = false;
  try { await action(); } catch (_) { failed = true; }
  require(failed, reason);
}
Future<void> frame() async {
  await Future<void>.delayed(const Duration(milliseconds: 50));
  WidgetsBinding.instance.scheduleFrame();
  await WidgetsBinding.instance.endOfFrame;
}
List<Element> elements(bool Function(Widget) predicate) {
  final result = <Element>[];
  void walk(Element e) { if (predicate(e.widget)) result.add(e); e.visitChildren(walk); }
  final root = WidgetsBinding.instance.rootElement;
  if (root != null) walk(root);
  return result;
}
Future<void> mount(AppState app, Widget child) async {
  runApp(ChangeNotifierProvider.value(value: app,
    child: MaterialApp(home: child)));
  await frame(); await frame();
}

class NativeScenarios {
  final int expected;
  final checks = <Map<String,Object?>>[];
  final errors = <Object>[];
  NativeScenarios(this.expected);
  Future<void> run(Future<void> Function() body) async {
    WidgetsFlutterBinding.ensureInitialized();
    ui.PlatformDispatcher.instance.onError = (error, stack) {
      errors.add(error); print('FEATURE_NATIVE_ASYNC_ERROR:$error\n$stack'); return true;
    };
    FlutterError.onError = (details) { errors.add(details.exception); FlutterError.presentError(details); };
    var status = 1;
    try {
      require(Platform.isAndroid || Platform.isIOS, 'Native mobile engine required');
      require(const bool.fromEnvironment('FEATURE_ISOLATED_DEVICE'), 'Disposable device is mandatory');
      require(RegExp(r'^[a-f0-9]{40}$').hasMatch(sourceSha), 'Committed source identity required');
      require(RegExp(r'^[a-f0-9]{64}$').hasMatch(profileSha), 'Profile identity required');
      require(const {'library33':33,'generation24':24,'text15':15,'skill_reopen1':1,'batch_mcp7':7,'comic_openai6':6,'image_agent3':3,'tools3':3,'ui9':9,'os6':6,'android_update2':2,'ios_update2':2,'metadata_import3':3,'gallery3':3}[testEntry] == expected, 'Registered native entry/count identity required');
      print('FEATURE_ACCEPTANCE_BEGIN:${jsonEncode({'sourceSha':sourceSha,'profileSha':profileSha,'platform':Platform.operatingSystem,'kind':'device','nativeOnly':true,'mockOnly':false,'paidCalls':0,'testEntry':testEntry,'expectedChecks':expected,'nativePid':pid})}');
      if (Platform.isAndroid) FlutterForegroundTask.initCommunicationPort();
      BackgroundQueueService.initialize();
      runApp(const MaterialApp(home:Scaffold(body:Text('Isolated native client scenarios'))));
      await nativeForegroundBarrier(renderBootstrap:false);
      const coldEntry=testEntry=='skill_reopen1';
      const predecessorVerified=bool.fromEnvironment('FEATURE_PREDECESSOR_VERIFIED');
      require(!coldEntry || predecessorVerified,'Cold entry requires a runner-verified qualified predecessor and fresh process');
      require(!predecessorVerified || coldEntry,'Predecessor preservation is limited to the registered cold entry');
      if(!coldEntry)await (await SharedPreferences.getInstance()).clear();
      // Read-only real native bridge probe. Unsupported/missing handler is
      // evidence of a gap, never an accepted install/activation scenario.
      try {
        final status=await const MethodChannel('langbai.novelai/local_agent')
          .invokeMapMethod<String,dynamic>('status');
        pending('agent-components',jsonEncode({'nativeStatus':{
          for(final field in ['supported','running','phase'])field:status?[field]},
          'installActivateProcessNotExecuted':true}));
      } on MissingPluginException catch(error) {
        pending('agent-components','Actual native MissingPluginException: ${error.message}');
      } on PlatformException catch(error) {
        pending('agent-components','Actual native PlatformException: ${error.code}');
      }
      await body();
      require(checks.length == expected, 'Incomplete fixed checks: ${checks.length}/$expected');
      require(errors.isEmpty, 'Native framework/async failure');
      status = 0;
    } catch (error, stack) { print('FEATURE_ACCEPTANCE_FAILURE:$error\n$stack'); }
    print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha':sourceSha,'profileSha':profileSha,'exitStatus':status,'checks':checks.length,'platform':Platform.operatingSystem,'paidCalls':0})}');
  }
  void check(String feature, String scenario, Map<String,Object?> observed,
      {bool complete = true}) {
    require(!checks.any((e) => e['feature']==feature && e['scenario']==scenario), 'Duplicate scenario');
    final record = <String,Object?>{'sourceSha':sourceSha,'profileSha':profileSha,
      'platform':Platform.operatingSystem,'feature':feature,'scenario':scenario,
      'journey':scenario,'kind':'device','status':'passed',
      'acceptanceLevel':complete?'scenario':'component',
      'scope':'observed client behavior only; no paid upstream or model-quality claim',
      'mockOnly':false,'paidCalls':0,'observed':observed};
    checks.add(record); print('FEATURE_ACCEPTANCE_CHECK:${jsonEncode(record)}');
  }
  void pending(String feature, String reason) => print('FEATURE_ACCEPTANCE_PENDING:${jsonEncode({
    'sourceSha':sourceSha,'profileSha':profileSha,'platform':Platform.operatingSystem,
    'feature':feature,'status':'pending','reason':reason,
    'kind':'device','nativeOnly':true,'testEntry':testEntry,'mockOnly':false,'paidCalls':0})}');
}

class NativeContext {
  final Storage storage;
  final NaiApi api;
  final AppState app;
  final Directory root;
  NativeContext._(this.storage,this.api,this.app,this.root);
  static Future<NativeContext> create(String name) async {
    final docs = await UnifiedStorage.documents();
    final root = await Directory(docs.path).createTemp('native-$name-');
    final storage=Storage(), api=NaiApi();
    // Closed loopback port prevents an unconfigured background quote from
    // reaching a public endpoint. Entries with HTTP use their actual server.
    final settings=AppSettings(imageBaseUrl:'http://127.0.0.1:1',
      apiBaseUrl:'http://127.0.0.1:1',visionApiUrl:'http://127.0.0.1:1',
      convertApiUrl:'http://127.0.0.1:1',proxyMode:'direct',
      allowCustomEndpoint:true,allowCustomEndpointFallback:false,
      imageOutputDir:root.path,backupDir:'${root.path}/backups',
      streamPreviewEnabled:false,saveToGallery:false,keepImageMetadata:true,
      promptCodexEnhanceEnabled:false,promptRuleAutoRepairEnabled:false,
      reverseConvertDshEnabled:false,language:'en-US');
    final app=AppState(api:api,storage:storage)..settings=settings
      ..params=GenerateParams(width:64,height:64,seed:42,seedMode:'fixed',
        positivePrompt:'synthetic forest',negativePrompt:'synthetic negative',
        qualityPreset:'none',ucPreset:0);
    await storage.setSettings(settings); await storage.setParams(app.params);
    return NativeContext._(storage,api,app,root);
  }
  Future<void> close() async { app.dispose(); }
}

