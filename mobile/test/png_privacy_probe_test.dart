// Literal JSON evidence is the purpose of this host-only probe.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/image_clipboard.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'png_privacy_fixtures.dart';

class _PrivacyPaths extends PathProviderPlatform {
  final String root;
  _PrivacyPaths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async => root;
  @override Future<String?> getTemporaryPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('observable real Storage PNG privacy boundary', () async {
    final out = Platform.environment['MOBILE_PRIVACY_OUT'];
    final root = out == null ? Directory.systemTemp.createTempSync('png-privacy-probe-')
        : Directory(out)..createSync(recursive: true);
    PathProviderPlatform.instance = _PrivacyPaths(root.path);
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    UnifiedStorage.active = null;
    final storage = Storage();
    final inputs = <String, dynamic>{
      for (final carrier in ['alpha', 'rgb']) carrier: privacyFixture(carrier, text: true),
      ...privacyStrongFixtures(),
    };
    final inputPath = Platform.environment['MOBILE_PRIVACY_INPUTS'];
    if (inputPath != null) {
      for (final file in Directory(inputPath).listSync().whereType<File>()) {
        if (file.path.endsWith('.png')) inputs[file.uri.pathSegments.last] = file.readAsBytesSync();
      }
    }
    final extraPath = Platform.environment['MOBILE_PRIVACY_EXTRA_INPUTS'];
    if (extraPath != null) {
      for (final file in Directory(extraPath).listSync().whereType<File>()) {
        if (file.path.endsWith('.png')) inputs[file.uri.pathSegments.last] = file.readAsBytesSync();
      }
    }
    for (final entry in inputs.entries) {
      final input = entry.value;
      File('${root.path}/${entry.key}-input.png').writeAsBytesSync(input);
      final hash = sha256.convert(input).toString();
      await storage.setSettings(AppSettings(keepImageMetadata: false, saveToGallery: false));
      for (final boundary in ['save', 'temporary', 'compatible', 'clipboard']) {
        try {
          if (boundary == 'clipboard') {
            final bytes = prepareClipboardImage(input);
            File('${root.path}/${entry.key}-clipboard.png').writeAsBytesSync(bytes);
            print(jsonEncode({'input':entry.key,'boundary':boundary,'sourceSha256':hash,
              'outputSha256':sha256.convert(bytes).toString(),'metadata':parseImageTextMetadata(bytes).keys.toList(),
              'alphaHeaderKnown':privacyHeader(bytes,'alpha').startsWith('stealth_png'),
              'rgbHeaderKnown':privacyHeader(bytes,'rgb').startsWith('stealth_rgb')}));
            continue;
          }
          final item = boundary == 'compatible'
              ? await storage.saveCompatibleImage(input, {'model':'fixture','prompt':'PRIVATE-PROMPT'}, AppSettings(keepImageMetadata:false,saveToGallery:false))
              : boundary == 'temporary'
              ? await storage.saveArtistLabTemporaryImage(input, GenerateParams(), 4234567890)
              : await storage.saveImage(input, GenerateParams(), 4234567890);
          final bytes = File(item.filePath).readAsBytesSync();
          File('${root.path}/${entry.key}-$boundary.png').writeAsBytesSync(bytes);
          print(jsonEncode({'input': entry.key, 'boundary': boundary,
            'sourceSha256': hash, 'outputSha256': sha256.convert(bytes).toString(),
            'metadata': parseImageTextMetadata(bytes).keys.toList(),
            'alphaHeaderKnown': privacyHeader(bytes, 'alpha').startsWith('stealth_png'),
            'rgbHeaderKnown': privacyHeader(bytes, 'rgb').startsWith('stealth_rgb')}));
        } catch (error) { print(jsonEncode({'input':entry.key,'boundary':boundary,'error':error.toString()})); }
      }
      await storage.setSettings(AppSettings(keepImageMetadata: true, saveToGallery: false));
      final keep = await storage.saveImage(input, GenerateParams(), 4234567890);
      expect(File(keep.filePath).readAsBytesSync(), orderedEquals(input));
      final temporary = await storage.saveArtistLabTemporaryImage(input, GenerateParams(), 4234567890);
      expect(File(temporary.filePath).readAsBytesSync(), orderedEquals(input));
      final compatible = await storage.saveCompatibleImage(input, {'model':'fixture','prompt':'PRIVATE-PROMPT'}, AppSettings(keepImageMetadata:true,saveToGallery:false));
      expect(File(compatible.filePath).readAsBytesSync(), orderedEquals(input));
      expect(sha256.convert(input).toString(), hash);
      print(jsonEncode({'input':entry.key,'keepAllThreeBoundariesExact':true,'inputUnchanged':true}));
    }
  });
}
