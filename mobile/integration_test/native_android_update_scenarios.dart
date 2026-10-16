// Android-only production update coordinator, native status, real trusted TLS
// download/integrity/cancel boundaries. The fixture is never an actual APK and
// no installer method is called. This cannot certify an absent iOS feature.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/apk_update.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'native_os_tls_fixture.dart';
import 'native_scenario_support.dart';

Future<void> main() async {
  final suite=NativeScenarios(2);
  await suite.run(() async {
    require(Platform.isAndroid,'This entry proves only the production Android updater; no iOS substitute');
    final c=await NativeContext.create('android-update2'),fixture=await NativeOsTlsFixture.open();
    final coordinator=ApkUpdateCoordinator();
    try {
      fixture.trustInDisposableProcess();
      final settings=AppSettings.fromJson({...c.app.settings.toJson(),'proxyMode':'custom','proxyUrl':fixture.proxyUrl,'proxyForUpdate':true});
      final info=await checkAppUpdate(settings);
      require(info.error==null&&info.apkSha256==fixture.artifactDigest&&info.apkSize==fixture.artifact.length,'Production Android update metadata was not received');
      final nativeBefore=await coordinator.nativeStatus();
      require(nativeBefore['state']=='idle'&&nativeBefore['currentVersion'] is String,'Actual Android updater native status is unavailable or already installing');
      final folder=Directory('${(await getTemporaryDirectory()).path}/updates');
      final ready=File('${folder.path}/studio-${info.apkSha256}.apk'),partial=File('${folder.path}/studio-${info.apkSha256}.part');
      final progress=<double>[],success=coordinator.reserve(settings,info);
      try {await success.download(progress.add);}finally{success.release();}
      require(await verifyApkFile(ready,info),'Production downloaded artifact did not verify');
      require(digest(await ready.readAsBytes())==fixture.artifactDigest&&progress.isNotEmpty&&progress.last==1,'Actual production streamed download differs');
      require(!await partial.exists()&&!coordinator.busy,'Completed update left partial file or busy lease');
      // Delete only our verified synthetic updater-owned artifact to force the
      // next request through the production integrity failure path, not cache.
      await ready.delete();
      final failures=<String>[];
      for(final mode in ['corrupt','oversize']){
        fixture.mode=mode;final session=coordinator.reserve(settings,info);Object? rejected;
        try{await session.download((_){ });}catch(error){rejected=error;}finally{session.release();}
        require(rejected is FormatException,'Production $mode update was not rejected by integrity/size verification');
        require(!await ready.exists()&&!await partial.exists()&&!coordinator.busy,'Failed update left an APK/partial or blocked subsequent retries');
        failures.add(mode);
      }
      final requestsBefore=fixture.requests.length;
      var rejected=false;
      try {coordinator.reserve(settings,UpdateInfo(hasUpdate:true,currentVersion:appVersion,latestVersion:NativeOsTlsFixture.version,
        releaseUrl:'http://127.0.0.1/untrusted.apk',apkSha256:info.apkSha256,apkSize:info.apkSize));}catch(error){rejected=error is FormatException;}
      require(rejected&&fixture.requests.length==requestsBefore,'Untrusted update URL was submitted');
      suite.check('updates','download-verify-failure',{'actualProductionCoordinator':true,'actualAndroidNativeStatus':nativeBefore['state'],'realTlsVerifiedDownload':true,'sha256':fixture.artifactDigest,'bytes':fixture.artifact.length,'streamingProgressCompleted':true,'failedModes':failures,'partialAndReadyRemovedOnFailure':true,'untrustedUrlRejectedBeforeRequest':true,'leaseReleasedForRetry':true,'installerExecuted':false});

      final image=File('${c.root.path}/kept-user-owned.png');await image.writeAsBytes(png(64,64));
      await c.storage.setToken(syntheticToken);
      await c.storage.writeHistory([HistoryItem(id:'native-update-owned',filePath:image.path,date:'2026-10-16',createdAt:'2026-10-16T00:00:00.000Z',seed:42,model:'nai-diffusion-5-full',width:64,height:64,prompt:'synthetic preserved image',params:c.app.params.toJson())]);
      final before=await _snapshot(image);
      fixture.mode='normal';final retained=coordinator.reserve(settings,info);
      try{await retained.download((_){ });}finally{retained.release();}
      require(await verifyApkFile(ready,info),'Second production download did not verify');
      require(jsonEncode(await _snapshot(image))==jsonEncode(before),'Verified download changed account/settings/params/history/output');
      await ready.delete();
      fixture.mode='hold';final held=coordinator.reserve(settings,info),start=fixture.requests.length;
      final Future<Object?> pending=held.download((_){ }).then<Object?>((_)=>null,onError:(Object error)=>error);
      final deadline=DateTime.now().add(const Duration(seconds:10));
      while(!fixture.requests.skip(start).any((r)=>(r['path'] as String).endsWith('/app-release.apk'))){
        require(DateTime.now().isBefore(deadline),'Cancellation request never reached real TLS server');
        await Future<void>.delayed(const Duration(milliseconds:20));
      }
      await held.cancel();final cancelled=await pending.timeout(const Duration(seconds:10));
      require(cancelled!=null&&!coordinator.busy,'Production update download cancellation did not release its lease');
      require(!await ready.exists()&&!await partial.exists(),'Cancelled production download left a ready/partial installer');
      require(jsonEncode(await _snapshot(image))==jsonEncode(before),'Update cancellation changed account/settings/params/history/output');
      final nativeAfter=await coordinator.nativeStatus();
      require(nativeAfter['state']=='idle'&&nativeAfter['currentVersion']==nativeBefore['currentVersion'],'Read-only download/cancellation unexpectedly invoked an installer');
      require(fixture.errors.isEmpty,'Actual TLS fixture asserted a transport/privacy failure');
      suite.check('updates','profile-preserved-update-boundary',{'productionDownloadAndCancel':true,'credentialHashUnchanged':true,'settingsParamsHistoryUnchanged':true,'historyItemsPreserved':1,'sourceImageSha256':before['image'],'nativeStatusBefore':nativeBefore['state'],'nativeStatusAfter':nativeAfter['state'],'nativeVersionUnchanged':true,'cancelObservedAfterActualHttpRequest':true,'readyAndPartialRemoved':true,'installerExecuted':false,'artifactIsNotAnExecutableApk':true});
    }finally{await fixture.close();await c.close();}
  });
}

Future<Map<String,String>> _snapshot(File image) async => {
  'settings':digest(utf8.encode(jsonEncode((await Storage().getSettings()).toJson()))),
  'params':digest(utf8.encode(jsonEncode((await Storage().getParams()).toJson()))),
  'history':digest(utf8.encode(jsonEncode((await Storage().getHistory()).map((x)=>x.toJson()).toList()))),
  'credential':digest(utf8.encode((await Storage().getToken())??'')),
  'image':digest(await image.readAsBytes()),
};
