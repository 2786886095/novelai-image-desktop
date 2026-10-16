// Host fixture/transport tests only. These never emit mobile feature CHECKs.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/apk_update.dart';
import 'package:novelai_mobile/services/proxy_http_client.dart';
import 'package:novelai_mobile/services/update_service.dart';
import '../integration_test/native_os_tls_fixture.dart';

Future<void> _removeHostFixture(Directory root) async {
  final resolved=await root.resolveSymbolicLinks(),temporary=await Directory.systemTemp.resolveSymbolicLinks();
  if(Directory(resolved).parent.path!=temporary||!resolved.split(Platform.pathSeparator).last.startsWith('native-os-host-')) {
    throw StateError('Refusing recursive deletion outside this test-owned temporary fixture');
  }
  await Directory(resolved).delete(recursive:true);
}

void main() {
  test('production updater uses real TLS through allowlisted loopback CONNECT, including visible network failure', () async {
    final fixture=await NativeOsTlsFixture.open();fixture.trustInDisposableProcess();
    final settings=AppSettings(proxyMode:'custom',proxyUrl:fixture.proxyUrl,proxyForUpdate:true);
    try {
      final info=await checkAppUpdate(settings);
      expect(info.error,isNull);expect(info.latestVersion,NativeOsTlsFixture.version);
      expect(info.releaseUrl,Platform.isAndroid?NativeOsTlsFixture.apkUrl:NativeOsTlsFixture.release);
      expect(fixture.requests,isNotEmpty);expect(fixture.connections,everyElement(isIn(NativeOsTlsFixture.hosts)));
      expect(fixture.requests.every((x)=>x['authorizationPresent']==false&&x['requestBodyBytes']==0),true);
      fixture.mode='http-error';final failed=await checkAppUpdate(settings);
      expect(failed.error,'network');expect(failed.hasUpdate,false);expect(fixture.errors,isEmpty);
    } finally {await fixture.close();}
  });

  test('real production download validates exact size/hash and rejects corruption without an installer', () async {
    final fixture=await NativeOsTlsFixture.open();fixture.trustInDisposableProcess();
    final root=await Directory.systemTemp.createTemp('native-os-host-transport-');
    final settings=AppSettings(proxyMode:'custom',proxyUrl:fixture.proxyUrl,proxyForUpdate:true);
    final client=createProxyHttpClient(settings,scope:ProxyScope.update);
    try {
      final info=await checkAppUpdateWithClient(client,isAndroid:true);
      expect(info.apkSha256,fixture.artifactDigest);expect(info.apkSize,fixture.artifact.length);
      final file=await downloadVerifiedApk(client,info,Directory('${root.path}/valid'),(_){ });
      expect(await file.readAsBytes(),fixture.artifact);expect(await verifyApkFile(file,info),true);
      for(final mode in ['corrupt','oversize']){
        fixture.mode=mode;final directory=Directory('${root.path}/$mode');
        await expectLater(downloadVerifiedApk(client,info,directory,(_){ }),throwsFormatException);
        expect(await directory.list().where((e)=>e.path.endsWith('.part')||e.path.endsWith('.apk')).toList(),isEmpty);
      }
      expect(fixture.errors,isEmpty);
    } finally {client.close();await fixture.close();await _removeHostFixture(root);}
  });

  test('normal TLS validation rejects an untrusted CA; test transport has no permissive certificate callback', () async {
    final fixture=await NativeOsTlsFixture.open();
    final client=HttpClient(context:SecurityContext(withTrustedRoots:false))..findProxy=(_)=>'PROXY 127.0.0.1:${fixture.proxy.port}';
    try {
      await expectLater(client.getUrl(Uri.parse('https://github.com/2786886095/novelai-image-desktop/releases/latest/download/latest.yml')),
        throwsA(isA<HandshakeException>()));
    } finally {client.close(force:true);await fixture.close();}
  });

  test('held real HTTPS download cancellation removes only its partial and never creates a ready artifact', () async {
    final fixture=await NativeOsTlsFixture.open();fixture.trustInDisposableProcess();
    final root=await Directory.systemTemp.createTemp('native-os-host-cancel-');
    final settings=AppSettings(proxyMode:'custom',proxyUrl:fixture.proxyUrl,proxyForUpdate:true);
    final client=createProxyHttpClient(settings,scope:ProxyScope.update);
    try {
      final info=await checkAppUpdateWithClient(client,isAndroid:true),cancellation=UpdateCancellation();
      fixture.mode='hold';final start=fixture.requests.length;
      final Future<Object?> pending=downloadVerifiedApk(client,info,root,(_){ },cancellation:cancellation)
        .then<Object?>((_)=>null,onError:(Object error)=>error);
      final deadline=DateTime.now().add(const Duration(seconds:5));
      while(!fixture.requests.skip(start).any((r)=>(r['path'] as String).endsWith('/app-release.apk'))){
        if(DateTime.now().isAfter(deadline))throw StateError('No actual TLS download request');
        await Future<void>.delayed(const Duration(milliseconds:10));
      }
      cancellation.cancel();client.close();
      expect(await pending.timeout(const Duration(seconds:5)),isA<StateError>());
      expect(await root.list().toList(),isEmpty);
    }finally{client.close();await fixture.close();await _removeHostFixture(root);}
  });
}
