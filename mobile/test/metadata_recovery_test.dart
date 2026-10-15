import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/metadata_recovery.dart';
import 'package:novelai_mobile/images/official_metadata_assets.dart';
import 'package:novelai_mobile/i18n/metadata_recovery_text.dart';

Matcher failure(String code) => isA<MetadataRecoveryFailure>()
    .having((error) => error.code, 'code', code);
Uint8List fixture(String name) => File(
    '${Directory.current.parent.path}/shared/official-image-metadata-fixtures/$name')
    .readAsBytesSync();

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('explicit offline restores PNG and WebP without asset GET or sandbox', () async {
    var gets = 0, runs = 0;
    final reader = MetadataRecoveryReader(
      fetchAsset: (_) async { gets++; throw StateError('must not GET'); },
      sandbox: (_, __, ___) async { runs++; throw StateError('must not run'); },
    );
    for (final name in ['png-text-plus-stealth.png', 'webp-lossless-alpha.webp']) {
      final bytes = fixture(name), pristine = Uint8List.fromList(fixture(name));
      final report = await reader.read(bytes, mode: MetadataRecoveryMode.offline);
      expect(report.imported.seed, 424242);
      expect(report.imported.model, 'nai-diffusion-5-full');
      expect(report.imported.positivePrompt, 'blue sky, 白色衣服');
      expect(report.characterCaptions, hasLength(1));
      expect(bytes, pristine);
    }
    expect(gets, 0); expect(runs, 0);
  });
  test('default online verifies first fixed asset and never falls back', () async {
    final ids = <String>[]; var runs = 0;
    final reader = MetadataRecoveryReader(
      fetchAsset: (id) async { ids.add(id); return Uint8List(33637); },
      sandbox: (_, __, ___) async { runs++; return {'ok': true, 'metadata': <String,String>{}}; },
    );
    await expectLater(reader.read(fixture('png-text-plus-stealth.png')),
        throwsA(failure('asset_integrity_changed')));
    expect(ids, ['png-text']); expect(runs, 0);
  });
  test('JPEG in online mode fails before any GET or sandbox', () async {
    var gets = 0, runs = 0;
    final reader = MetadataRecoveryReader(
      fetchAsset: (_) async { gets++; return Uint8List(1); },
      sandbox: (_, __, ___) async { runs++; return {}; },
    );
    final jpeg = Uint8List(33)..[0] = 255..[1] = 216..[2] = 255;
    await expectLater(reader.read(jpeg), throwsA(failure('online_png_webp_only')));
    expect(gets, 0); expect(runs, 0);
  });
  test('truncated and oversized image headers fail before parser allocation', () {
    expect(() => assertOfficialMetadataImage(Uint8List(32)),
        throwsA(failure('online_png_webp_only')));
    final png = fixture('png-text-plus-stealth.png');
    ByteData.sublistView(png).setUint32(16, maxRecoveryImagePixels + 1);
    expect(() => assertOfficialMetadataImage(png), throwsA(failure('image_pixel_limit')));
    final webp = fixture('webp-lossless-alpha.webp');
    ByteData.sublistView(webp).setUint32(4, webp.length + 100, Endian.little);
    expect(() => assertOfficialMetadataImage(webp), throwsA(failure('invalid_image_header')));
  });
  test('asset inventory is fixed, public GET data, with reviewed sizes and SHA', () {
    expect(officialMetadataAssets, hasLength(10));
    expect(officialMetadataAssets.map((asset) => asset.id).toSet(), hasLength(10));
    for (final asset in officialMetadataAssets) {
      final uri = Uri.parse(asset.url);
      expect(uri.scheme, 'https'); expect(uri.host, 'novelai.net');
      expect(uri.path, startsWith('/_next/static/')); expect(uri.userInfo, isEmpty);
      expect(asset.bytes, inInclusiveRange(1, 2 * 1024 * 1024));
      expect(asset.sha256, matches(RegExp(r'^[a-f0-9]{64}$')));
      expect(MetadataRecoveryReader.assetFor(asset.id), same(asset));
    }
    expect(() => MetadataRecoveryReader.assetFor('https://example.invalid/?image=private'),
        throwsA(failure('unknown_asset')));
  });
  test('cancelled fetch cannot reach sandbox or produce stale successful result', () async {
    final started = Completer<void>(), bytes = Completer<Uint8List>(); var runs = 0;
    final reader = MetadataRecoveryReader(
      fetchAsset: (_) { started.complete(); return bytes.future; },
      sandbox: (_, __, ___) async { runs++; return {}; },
    );
    final pending = reader.read(fixture('png-text-plus-stealth.png'));
    final cancelled = expectLater(pending, throwsA(failure('cancelled')));
    await started.future; await reader.cancel(); bytes.complete(Uint8List(1));
    await cancelled; expect(runs, 0);
  });
  test('a newer read wins even when two read calls start before first continuation', () async {
    var gets = 0;
    final reader = MetadataRecoveryReader(fetchAsset: (_) async { gets++; return Uint8List(1); });
    final first = reader.read(fixture('png-text-plus-stealth.png'));
    final second = reader.read(fixture('png-text-plus-stealth.png'));
    await expectLater(first, throwsA(failure('cancelled')));
    await expectLater(second, throwsA(failure('asset_integrity_changed')));
    expect(gets, 1);
  });
  test('all five languages explicitly state online failure and local privacy', () {
    for (final language in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      final text = metadataRecoveryText(language);
      expect(text.label, isNotEmpty); expect(text.online, isNot(text.offline));
      expect(text.onlineInfo, contains('PNG')); expect(text.onlineInfo, contains('WebP'));
      expect(text.onlineInfo, contains('JPEG')); expect(text.onlineFailure, isNotEmpty);
      expect(text.offlineInfo, contains('Anlas'));
    }
  });
}
