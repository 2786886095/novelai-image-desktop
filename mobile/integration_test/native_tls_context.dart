// Test-only contexts: no system trust-store changes and no certificate bypass.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'native_tls_root_credentials.dart';

Uint8List nativeFixtureRootBytes({required bool ios}) =>
    base64Decode(ios ? nativeTlsRootDerBase64 : nativeTlsRootPemBase64);
void trustNativeFixtureRoot(SecurityContext context) => context
    .setTrustedCertificatesBytes(nativeFixtureRootBytes(ios: Platform.isIOS));
void trustNativeFixtureRootInDisposableProcess() =>
    trustNativeFixtureRoot(SecurityContext.defaultContext);
SecurityContext nativeFixtureClientContext() {
  final context = SecurityContext(withTrustedRoots: false);
  trustNativeFixtureRoot(context);
  return context;
}

SecurityContext nativeFixtureServerContext(
    {required String chainBase64,
    required String keyBase64,
    required String pkcs12Base64}) {
  final context = SecurityContext();
  if (Platform.isIOS) {
    // Documented iOS API imports both certificate chain and key from PKCS12.
    context.usePrivateKeyBytes(base64Decode(pkcs12Base64),
        password: nativeTlsFixturePkcs12Password);
  } else {
    context.useCertificateChainBytes(base64Decode(chainBase64));
    context.usePrivateKeyBytes(base64Decode(keyBase64));
  }
  return context;
}
