// Real native clipboard, settings, typography and production TLS update routes.
// No platform-channel interception, path-as-picker substitute, paid generation,
// updater installer execution, public network call, or host-pass promotion.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image/image.dart' as image;
import 'package:provider/provider.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/models/ui_typography.dart';
import 'package:novelai_mobile/screens/typography_settings.dart';
import 'package:novelai_mobile/services/composer_transfers.dart';
import 'package:novelai_mobile/services/image_clipboard.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/update_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/global_typography.dart';
import 'native_os_tls_fixture.dart';
import 'native_scenario_support.dart';

Uint8List _originalPng() {
  final bytes=png(64,64),body=utf8.encode('Comment\u0000${jsonEncode({'prompt':'synthetic forest 日本語','seed':4294967290,'steps':28})}');
  final typed=<int>[...ascii.encode('tEXt'),...body];var crc=0xffffffff;
  for(final byte in typed){crc^=byte;for(var i=0;i<8;i++){crc=(crc&1)!=0?(crc>>1)^0xedb88320:crc>>1;}}
  final length=ByteData(4)..setUint32(0,body.length),sum=ByteData(4)..setUint32(0,(crc^0xffffffff)&0xffffffff);
  return Uint8List.fromList([...bytes.take(33),...length.buffer.asUint8List(),...typed,...sum.buffer.asUint8List(),...bytes.skip(33)]);
}
Future<Uint8List> _pastePng() async {
  final paths=await ComposerTransfers.paste();
  require(paths.length==1,'Native image paste did not return exactly one real file');
  final file=File(paths.single);
  require(await file.exists(),'Native pasted file is missing');
  final bytes=await file.readAsBytes();require(image.decodePng(bytes)!=null,'Native clipboard did not paste a real PNG');
  return bytes;
}
Future<Map<String,String>> _nativeCacheSnapshot(List<String> roots) async {
  final files=<String,String>{};
  for(final root in roots){final dir=Directory(root);if(!await dir.exists())continue;
    await for(final file in dir.list(recursive:true,followLinks:false)){
      if(file is File)files[file.path]=digest(await file.readAsBytes());
    }
  }
  return {for(final key in (files.keys.toList()..sort()))key:files[key]!};
}

Future<void> main() async {
  final suite=NativeScenarios(6);
  await suite.run(()=>runNativeOsScenarios(suite));
}
Future<void> runNativeOsScenarios(NativeScenarios suite) async {
  final c=await NativeContext.create('os6');NativeOsTlsFixture? tls;
  try {
    final original=_originalPng(),file=File('${c.root.path}/original-private-source.png');await file.writeAsBytes(original);
    require(parsePngTextMetadata(original)['Comment']?.contains('4294967290')==true,'Metadata fixture is invalid');
    const text='acceptance 日本語 🧪 line1\nline2 e\u0301';
    await Clipboard.setData(const ClipboardData(text:text));
    require((await Clipboard.getData(Clipboard.kTextPlain))?.text==text,'Real native Unicode clipboard roundtrip failed');
    suite.check('clipboard','native-unicode-text',{'unicodeNewlineCombiningEmojiPreserved':true,'nativeMethodChannel':true,'textSha256':digest(utf8.encode(text))});

    require(await ImageClipboard.copy(file.path,withOriginalMetadata:true),'Native original-metadata image copy failed');
    final pasted=await _pastePng();require(digest(pasted)==digest(original),'Native image copy/paste altered original PNG bytes');
    require(parseImageTextMetadata(pasted)['Comment']?.contains('4294967290')==true,'Native original metadata was not preserved');
    require(await ImageClipboard.copy(file.path,withOriginalMetadata:false),'Native privacy image copy failed');
    final stripped=await _pastePng(),decoded=image.decodePng(stripped)!;
    require(parseImageTextMetadata(stripped).isEmpty,'Privacy clipboard retains generation metadata');
    require(decoded.width==64&&decoded.height==64,'Privacy clipboard changed image dimensions');
    require(digest(await file.readAsBytes())==digest(original),'Clipboard modified the original file');
    suite.check('clipboard','png-metadata-copy-paste',{'nativeOriginalBytesSha256':digest(pasted),'nativeStrippedBytesSha256':digest(stripped),'originalMetadataPreserved':true,'privacyMetadataEmpty':true,'sourceByteIdentical':true,'width':decoded.width,'height':decoded.height,'realNativePasteFile':true});

    final pastedPaths=await ComposerTransfers.paste();require(pastedPaths.length==1,'Clipboard paste file disappeared');
    final nativeRoot=File(pastedPaths.single).parent.parent.path;
    final cacheRoots=['$nativeRoot/composer-inputs','$nativeRoot/image-clipboard'];
    final cacheBefore=await _nativeCacheSnapshot(cacheRoots);
    await fails(()=>ImageClipboard.copy('${c.root.path}/missing-input.png',withOriginalMetadata:false),'Missing clipboard input was accepted');
    final invalidFile=File('${c.root.path}/not-an-image.png');await invalidFile.writeAsString('synthetic private text is not an image');
    Object? invalidError;
    try{await ImageClipboard.copy(invalidFile.path,withOriginalMetadata:true);}catch(error){invalidError=error;}
    require(invalidError is FormatException,'Public original-metadata clipboard API published non-image bytes');
    require(jsonEncode(await _nativeCacheSnapshot(cacheRoots))==jsonEncode(cacheBefore),'Rejected clipboard input leaked a native file');
    final nativeText=(await Clipboard.getData(Clipboard.kTextPlain))?.text??'';
    require(!nativeText.contains(file.path)&&!nativeText.contains(c.root.path),'Image clipboard exposed the source filesystem path as text');
    require(digest(await _pastePng())==digest(stripped),'Invalid clipboard operation replaced the last valid image');
    require(digest(await file.readAsBytes())==digest(original),'Rejected clipboard input changed source bytes');
    suite.check('clipboard','invalid-input-no-file-leak',{'missingFileRejected':true,'publicOriginalModeInvalidImageRejected':true,'invalidImageErrorType':'FormatException','nativeCacheSnapshotUnchanged':true,'sourcePathNotExposedAsText':true,'lastUsableImagePreserved':true,'sourceByteIdentical':true});

    await c.storage.setToken(syntheticToken);
    final settingsBefore=jsonEncode((await Storage().getSettings()).toJson()),paramsBefore=jsonEncode((await Storage().getParams()).toJson()),historyBefore=jsonEncode((await Storage().getHistory()).map((e)=>e.toJson()).toList());
    await fails(()=>c.app.setAutomaticComparison('__unregistered_fixture_surface__',true),'Unknown setting surface was accepted');
    await fails(()=>c.app.setUiTypography(UiTypography(font:'font-${'a'*64}',scale:150)),'Missing imported font was accepted');
    require(jsonEncode((await Storage().getSettings()).toJson())==settingsBefore,'Rejected settings changed persisted configuration');
    require(jsonEncode((await Storage().getParams()).toJson())==paramsBefore,'Rejected settings changed generation parameters');
    require(jsonEncode((await Storage().getHistory()).map((e)=>e.toJson()).toList())==historyBefore,'Rejected settings changed history');
    require(await Storage().getToken()==syntheticToken,'Rejected settings changed native credential');
    require(digest(await file.readAsBytes())==digest(original),'Rejected settings changed output/source bytes');
    suite.check('settings','invalid-change-no-destruction',{'unknownSurfaceRejected':true,'missingNativeEngineFontRejected':true,'persistedSettingsSha256':digest(utf8.encode(settingsBefore)),'paramsAndHistoryUnchanged':true,'nativeCredentialUnchanged':true,'imageBytesUnchanged':true});

    var layouts=0,boxes=0;
    for(final language in ['zh-CN','ja-JP']){for(final requestedScale in [1,900]){
      c.app.settings.language=language;
      await c.app.setUiTypography(UiTypography.fromJson({'font':'invalid-font','scale':requestedScale}));
      final selected=c.app.settings.uiTypography;
      require(selected.font=='default'&&selected.scale==(requestedScale<80?80:200),'Typography bounds did not normalize');
      final scaler=StudioTextScaler(const TextScaler.linear(1.15),selected.scale/100);
      await _mountTypography(c.app,scaler);
      final roots=elements((w)=>w.key==const ValueKey('typography-settings'));
      require(roots.length==1,'Actual typography settings are not mounted');
      final rootBox=roots.single.renderObject! as RenderBox;
      require(rootBox.hasSize&&rootBox.size.width<=320.01,'Native narrow viewport is not enforced');
      final origin=rootBox.localToGlobal(Offset.zero);var checked=0;
      void visit(Element e){
        final render=e.renderObject;
        if(render is RenderBox&&render.hasSize&&render.size.width>0){
          final point=render.localToGlobal(Offset.zero)-origin;
          require(render.size.isFinite&&point.dx>=-1&&point.dx+render.size.width<=rootBox.size.width+1,'Actual native typography control overflows horizontal bounds');checked++;
        }
        e.visitChildren(visit);
      }
      visit(roots.single);require(checked>10,'Native layout geometry was not inspected');
      require(suite.errors.isEmpty,'Actual native typography layout produced a framework error');
      boxes+=checked;layouts++;
    }}
    suite.check('typography','bounds-layout',{'actualProductionTypographyWidget':true,'nativeViewportWidth':320,'nativeLayouts':layouts,'renderBoxesInspected':boxes,'scaleClamped80And200':true,'globalProductionTextScalerDriven':true,'osAccessibilityScale':1.15,'localizedLanguages':['zh-CN','ja-JP'],'horizontalOverflow':false,'frameworkErrors':0});

    tls=await NativeOsTlsFixture.open();tls.trustInDisposableProcess();
    final updateSettings=AppSettings.fromJson({...c.app.settings.toJson(),'proxyMode':'custom','proxyUrl':tls.proxyUrl,'proxyForUpdate':true});
    final info=await checkAppUpdate(updateSettings);
    require(info.error==null&&info.hasUpdate&&info.latestVersion==NativeOsTlsFixture.version&&info.currentVersion==appVersion,'Production update check did not consume actual TLS fixture');
    require(info.releaseUrl==(Platform.isAndroid?NativeOsTlsFixture.apkUrl:NativeOsTlsFixture.release),'Production native-platform update link differs');
    if(Platform.isAndroid){require(info.apkSha256==tls.artifactDigest&&info.apkSize==tls.artifact.length,'Production Android integrity metadata differs');}
    require(tls.connections.isNotEmpty&&tls.connections.every(NativeOsTlsFixture.hosts.contains),'Update transport escaped the allowlisted loopback TLS proxy');
    tls.mode='http-error';final failed=await checkAppUpdate(updateSettings);
    require(failed.error=='network'&&!failed.hasUpdate,'Production update network failure was not reported');
    require(tls.errors.isEmpty,'TLS fixture had a request assertion failure');
    suite.check('updates','version-check-platform-links',{'productionCheckAppUpdate':true,'actualNativeTlsAndHttpConnect':true,'nativePlatform':Platform.operatingSystem,'currentVersion':info.currentVersion,'fixtureVersion':info.latestVersion,'releaseUrl':info.releaseUrl,'androidIntegrityMetadata':Platform.isAndroid,'readOnlyRequests':tls.requests.length,'tunnelHosts':tls.connections.toSet().toList(),'fixtureCaSha256':tls.certificateDigest,'normalHostnameVerificationEnabled':true,'upstreamNetworkFailureVisible':true,'credentialOrBodySent':false,'installerExecuted':false});
    coverageGap('output-management','folder-choice-history-link needs an actual native OS picker; no path substitution was used');
    coverageGap('metadata-import','Full online official runtime/default local bytes/format/privacy scenario remains a separate native journey');
    if(Platform.isIOS)coverageGap('updates','iOS has release-link check but no production Android APK download/install bridge; Android updater calls are not promoted to iOS parity');
  } finally {await tls?.close();await c.close();}
}

Future<void> _mountTypography(AppState app,TextScaler scaler) async {
  final theme=withUiTextLayout(withUiFont(ThemeData(useMaterial3:true),'sans-serif'),scaler);
  runApp(ChangeNotifierProvider.value(value:app,child:MaterialApp(theme:theme,home:Center(child:SizedBox(width:320,height:540,
    child:Builder(builder:(context)=>MediaQuery(data:MediaQuery.of(context).copyWith(size:const Size(320,540),textScaler:scaler),
      child:const Scaffold(body:SingleChildScrollView(padding:EdgeInsets.all(8),child:TypographySettings())))))))));
  await frame();await frame();
}

// Diagnostic only: gaps remain explicit but never occupy the reserved Agent
// capability namespace, create CHECKs, or contribute acceptance coverage.
// ignore: avoid_print
void coverageGap(String feature, String reason) => print(
    'FEATURE_NATIVE_COVERAGE_GAP:${jsonEncode({'sourceSha':sourceSha,
      'profileSha':profileSha,'platform':Platform.operatingSystem,
      'testEntry':testEntry,'feature':feature,'status':'not-certified',
      'kind':'diagnostic','reason':reason,'paidCalls':0})}');
