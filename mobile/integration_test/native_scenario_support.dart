// Native acceptance helpers. No platform, Storage, network or API mocks.
// ignore_for_file: avoid_print
import 'dart:async';
import 'native_foreground.dart';
import 'native_proof_log.dart';
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

// Diagnostic logs are deliberately separate from native acceptance proof markers.
// They explain failures; they never certify a check or relax the strict error gate.
class NativeFailureDiagnostics {
  static const maxRecords = 16;
  static const maxExceptionBytes = 1024;
  static const maxStackBytes = 6144;
  static const maxContextBytes = 1024;
  final String sourceIdentity;
  final String profileIdentity;
  final String entry;
  final void Function(String) _output;
  int observed = 0;
  int retained = 0;
  int dropped = 0;
  int outputFailures = 0;
  NativeFailureDiagnostics({required this.sourceIdentity,
    required this.profileIdentity, required this.entry,
    void Function(String)? output}) : _output = output ?? print;

  static String _safeString(Object? Function() value) {
    try { return value()?.toString() ?? ''; }
    catch (_) { return '<unprintable diagnostic>'; }
  }
  static String _bounded(String value, int maxBytes) {
    // Redact before truncation so a credential crossing the bound cannot leak.
    var text = value.replaceAll(
      RegExp(r'Bearer\s+[^\s"\x27,;<>]+', caseSensitive: false),
      'Bearer <redacted>');
    text = text.replaceAllMapped(RegExp(
      r'''(["']?(?:authorization|api[_-]?key|key|token|password|secret|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)''',
      caseSensitive: false), (m) => '${m[1]}<redacted>');
    text = text.replaceAll(RegExp(r'https?://[^/\s]+@'), '<redacted-url>@');
    // Keep repository-relative stack locations, not disposable/private roots.
    text = text.replaceAll(RegExp(r'file:///[^\s]*?/source/'), '<source>/');
    text = text.replaceAll(RegExp(r'''file:///[^\s"'<>)]*|[A-Za-z]:[\\/][^\r\n"'<>)]*|/(?:data|home|Users|private|var|tmp|storage|sdcard|mnt)/[^\s"'<>)]*'''), '<private-path>');
    final out = StringBuffer();
    var used = 0;
    for (final rune in text.runes) {
      final part = String.fromCharCode(rune), size = utf8.encode(part).length;
      if (used + size > maxBytes) break;
      out.write(part); used += size;
    }
    return out.toString();
  }

  void _emit(String line) {
    try { _output(line); } catch (_) { outputFailures++; }
  }
  void _record(String kind, Object error, StackTrace? stack,
      {required int checkIndex, String? library, String? context,
      bool? silent}) {
    observed++;
    if (retained >= maxRecords) { dropped++; return; }
    retained++;
    final record = <String, Object?>{
      'schema': 'native-failure-diagnostic/v1',
      'sourceSha': _bounded(sourceIdentity, 64),
      'profileSha': _bounded(profileIdentity, 64),
      'entry': _bounded(entry, 64), 'id': retained,
      'kind': kind, 'checkIndex': checkIndex,
      'exception': _bounded(_safeString(() => error), maxExceptionBytes),
      'stack': _bounded(_safeString(() => stack), maxStackBytes),
      'library': _bounded(library ?? '', 256),
      'context': _bounded(context ?? '', maxContextBytes), 'silent': silent,
    };
    final bytes = utf8.encode(jsonEncode(record));
    final hash = digest(bytes), count = (bytes.length / 384).ceil();
    for (var index = 0; index < count; index++) {
      final end = (index + 1) * 384;
      _emit('NATIVE_DIAGNOSTIC_CHUNK:${jsonEncode({
        'v': 1, 'id': retained, 'index': index, 'count': count,
        'bytes': bytes.length, 'sha256': hash,
        'data': base64Encode(bytes.sublist(index * 384,
          end < bytes.length ? end : bytes.length)),
      })}');
    }
  }
  void framework(FlutterErrorDetails details, {required int checkIndex}) =>
    _record('framework', details.exception, details.stack,
      checkIndex: checkIndex, library: details.library,
      context: _safeString(() => details.context?.toDescription()),
      silent: details.silent);
  void asynchronous(Object error, StackTrace stack, {required int checkIndex}) =>
    _record('async', error, stack, checkIndex: checkIndex);
  void finish({required int checkIndex}) {
    if (observed == 0) return;
    _emit('NATIVE_DIAGNOSTIC_SUMMARY:${jsonEncode({
      'schema': 'native-failure-diagnostic-summary/v1',
      'sourceSha': _bounded(sourceIdentity, 64),
      'profileSha': _bounded(profileIdentity, 64),
      'entry': _bounded(entry, 64), 'checkIndex': checkIndex,
      'observed': observed, 'retained': retained, 'dropped': dropped,
      'outputFailures': outputFailures,
    })}');
  }
}

class NativeScenarios {
  final int expected;
  final checks = <Map<String,Object?>>[];
  final errors = <Object>[];
  final NativeFailureDiagnostics failureDiagnostics;
  NativeScenarios(this.expected, {NativeFailureDiagnostics? diagnostics})
    : failureDiagnostics = diagnostics ?? NativeFailureDiagnostics(
        sourceIdentity: sourceSha, profileIdentity: profileSha, entry: testEntry);
  void recordFrameworkFailure(FlutterErrorDetails details) {
    errors.add(details.exception);
    failureDiagnostics.framework(details, checkIndex: checks.length);
    FlutterError.presentError(details);
  }
  bool recordAsyncFailure(Object error, StackTrace stack) {
    errors.add(error);
    failureDiagnostics.asynchronous(error, stack, checkIndex: checks.length);
    return true;
  }
  void verifyNoFrameworkFailures() =>
    require(errors.isEmpty, 'Native framework/async failure');
  Future<void> run(Future<void> Function() body) async {
    WidgetsFlutterBinding.ensureInitialized();
    ui.PlatformDispatcher.instance.onError = recordAsyncFailure;
    FlutterError.onError = recordFrameworkFailure;
    var status = 1;
    try {
      require(Platform.isAndroid || Platform.isIOS, 'Native mobile engine required');
      require(const bool.fromEnvironment('FEATURE_ISOLATED_DEVICE'), 'Disposable device is mandatory');
      require(RegExp(r'^[a-f0-9]{40}$').hasMatch(sourceSha), 'Committed source identity required');
      require(RegExp(r'^[a-f0-9]{64}$').hasMatch(profileSha), 'Profile identity required');
      require(const {'library33':33,'generation24':24,'text15':15,'skill_reopen1':1,'batch_mcp7':7,'comic_openai6':6,'image_agent3':3,'tools3':3,'ui9':9,'os6':6,'android_update2':2,'ios_update2':2,'android_folder1':1,'metadata_import3':3,'gallery3':3}[testEntry] == expected, 'Registered native entry/count identity required');
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
      verifyNoFrameworkFailures();
      status = 0;
    } catch (error, stack) { print('FEATURE_ACCEPTANCE_FAILURE:$error\n$stack'); }
    finally { failureDiagnostics.finish(checkIndex: checks.length); }
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
    checks.add(record); printNativeCheck(record, entry: testEntry, id: checks.length);
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

