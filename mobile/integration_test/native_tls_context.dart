// Test-only contexts: no system trust-store changes and no certificate bypass.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'native_tls_root_credentials.dart';

// Flutter3.24.0 pins Dart a97f6326: its BoringSSL parser accepts PEM/PKCS12,
// not bare DER. The historical dart:io iOS note does not describe this engine.
// Keep the selector argument for call compatibility, not platform guesswork.
Uint8List nativeFixtureRootBytes({required bool ios}) =>
    base64Decode(nativeTlsRootPemBase64);
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
  // The pinned engine imports key and chain separately, including on iOS.
  // A P12 private-key import explicitly discards its certificate chain there.
  // Retain pkcs12Base64 as public fixture inventory/call compatibility only.
  context.useCertificateChainBytes(base64Decode(chainBase64));
  context.usePrivateKeyBytes(base64Decode(keyBase64));
  return context;
}
