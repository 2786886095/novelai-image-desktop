import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/image_clipboard.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'png_privacy_fixtures.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override Future<String?> getApplicationDocumentsPath() async => root;
  @override Future<String?> getTemporaryPath() async => root;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final carrier in ['alpha', 'rgb']) {
    for (final compressed in [false, true]) {
      test('clears full $carrier ${compressed ? 'gzip' : 'plain'} carrier with RGBA deviation <= 1', () {
        final input = privacyFixture(carrier, compressed: compressed, text: true);
        final original = Uint8List.fromList(input);
        expect(privacyHeader(input, carrier), startsWith('stealth_'));
        final output = stripPngMetadata(input);
        final before = img.decodePng(input)!, after = img.decodePng(output)!;
        expect((after.width, after.height), (before.width, before.height));
        var changed = 0, semiTransparent = 0;
        for (final pixel in after) {
          final old = before.getPixel(pixel.x, pixel.y);
          for (var c = 0; c < 4; c++) {
            final delta = (pixel[c] - old[c]).abs();
            expect(delta, lessThanOrEqualTo(1));
            if (delta != 0) changed++;
            expect(pixel[c].toInt() & 1, 0);
          }
          if (pixel.a > 0 && pixel.a < 255) semiTransparent++;
        }
        expect(changed, greaterThan(0));
        expect(semiTransparent, greaterThan(0));
        expect(parseImageTextMetadata(output), isEmpty);
        expect(privacyHeader(output, carrier), isNot(startsWith('stealth_')));
        expect(utf8.decode(output, allowMalformed: true), isNot(contains('PRIVATE-TRAILER')));
        expect(input, orderedEquals(original));
        expect(stripPngMetadata(output), orderedEquals(output));
      });
    }
  }

  test('both alpha and RGB carriers are removed in one export', () {
    final alpha = img.decodePng(privacyFixture('alpha'))!;
    final rgb = img.decodePng(privacyFixture('rgb'))!;
    for (final p in alpha) {
      final r = rgb.getPixel(p.x, p.y);
      p.r = r.r; p.g = r.g; p.b = r.b;
    }
    final output = img.decodePng(stripPngMetadata(img.encodePng(alpha)))!;
    for (final p in output) {
      for (var c = 0; c < 4; c++) { expect(p[c].toInt() & 1, 0); }
    }
  });

  test('ordinary PNG is rebuilt and every metadata/custom block is discarded', () {
    final input = privacyText(privacyStrongFixtures()['unknown-random-lsb']!);
    final output = stripPngMetadata(input);
    expect(privacyIdat(output), isNot(orderedEquals(privacyIdat(input))));
    expect(parsePngTextMetadata(output), isEmpty);
    expect(ascii.decode(output.sublist(output.length - 8, output.length - 4)), 'IEND');
    expect(output[25],6);
  });

  test('unknown payload, damaged magic, ICC XMP and custom chunks receive full reset including clipboard', () {
    for (final input in privacyStrongFixtures().values) {
      for (final output in [stripPngMetadata(input),prepareClipboardImage(input)]) {
        final pixels=img.decodePng(output)!;
        for(final p in pixels) {
          for(var c=0;c<4;c++) { expect(p[c].toInt() & 1,0); }
        }
        final data=ByteData.sublistView(output);
        for(var offset=8;offset<output.length;) {
          final length=data.getUint32(offset);
          expect(ascii.decode(output.sublist(offset+4,offset+8)),isIn(['IHDR','IDAT','IEND']));
          offset+=length+12;
        }
      }
    }
  });

  test('16-bit exhaustive native samples retain format/detail and clear native/high/rounded LSB', () {
    final image=img.Image(width:256,height:256,format:img.Format.uint16,numChannels:4);
    for(final p in image) {
      final value=p.y*256+p.x;
      p.r=value;p.g=65535-value;p.b=value;p.a=value;
    }
    final output=stripPngMetadata(img.encodePng(image));
    expect(output[24],16);
    final clean=img.decodePng(output)!;
    var nonEightBitLevels=0;
    for(final p in clean) {
      final old=image.getPixel(p.x,p.y);
      for(var c=0;c<4;c++) {
        final value=p[c].toInt(),before=old[c].toInt();
        expect(value&1,0);expect((value>>8)&1,0);expect((value/257).round()&1,0);
        expect(((value>>8)-(before>>8)).abs(),lessThanOrEqualTo(1));
        expect(((value/257).round()-(before/257).round()).abs(),lessThanOrEqualTo(1));
        if(value%257!=0) nonEightBitLevels++;
      }
    }
    expect(nonEightBitLevels,greaterThan(1000));
  });

  test('existing 18 official PNG matrix is rebuilt, preserving dimensions and 8-bit visual delta <= 1', () {
    final files = Directory('../shared/official-image-metadata-fixtures')
        .listSync().whereType<File>().where((f)=>f.path.endsWith('.png'));
    var accepted=0;
    for(final file in files) {
      final input=file.readAsBytesSync(),output=stripPngMetadata(input);
      expect(parseImageTextMetadata(output),isEmpty,reason:file.path);
      expect(output[24],input[24]==16?16:8);
      expect(output[25],6);
      final before=img.decodePng(input)!,after=img.decodePng(output)!;
      expect((after.width,after.height),(before.width,before.height));
      for(final p in after) {
        final old=before.getPixel(p.x,p.y);
        for(var c=0;c<4;c++) {
          final oldValue=before.numChannels==2?(c<3?old[0]:old[1]):old[c];
          final a=after.format==img.Format.uint16?p[c].toInt()>>8:p[c].toInt();
          final b=before.format==img.Format.uint16?oldValue.toInt()>>8:oldValue.toInt();
          expect((a-b).abs(),lessThanOrEqualTo(1),reason:file.path);
        }
      }
      accepted++;
    }
    expect(accepted,18);
  });

  test('malformed structural and pixel PNGs fail closed rather than returning original', () {
    final original = privacyFixture('none');
    final header = original.sublist(16, 29);
    Uint8List rebuild({List<int>? h, List<int>? raw, List<int>? middle, bool end = true}) =>
      Uint8List.fromList([...original.sublist(0,8), ...privacyChunk('IHDR', h ?? header),
        if (middle != null) ...middle,
        if (raw != null) ...privacyChunk('IDAT', zlib.encode(raw)),
        if (end) ...privacyChunk('IEND', [])]);
    final badCrc = Uint8List.fromList(original)..[29] ^= 1;
    final over = List<int>.from(header);
    over.setRange(0, 4, [0x7f, 0xff, 0xff, 0xff]);
    final wrongFormat = List<int>.from(header)..[8] = 3;
    final row = [0, ...List.filled(64 * 4, 0)];
    final raw = [for (var y = 0; y < 64; y++) ...row];
    final badFilter = List<int>.from(raw)..[0] = 5;
    for (final invalid in <Uint8List>[
      badCrc, Uint8List.sublistView(original, 0, original.length - 3),
      rebuild(), rebuild(raw:raw, end:false), rebuild(h:over, raw:raw),
      rebuild(h:wrongFormat, raw:raw), rebuild(raw:badFilter),
      rebuild(raw:raw.sublist(0,raw.length-1)), rebuild(raw:[...raw,0]),
      rebuild(raw:raw, middle:privacyChunk('IHDR',header)),
      rebuild(raw:raw, middle:privacyChunk('ABCD',[])),
      rebuild(raw:raw, middle:privacyChunk('acTL',[0,0,0,1,0,0,0,0])),
    ]) {
      expect(() => stripPngMetadata(invalid), throwsFormatException);
      expect(() => prepareClipboardImage(invalid), throwsFormatException);
    }
    final nonPng = Uint8List.fromList([0xff,0xd8,0xff,0xd9]);
    expect(() => stripPngMetadata(nonPng), throwsFormatException);
  });

  test('real Storage three boundaries persist cleaned bytes, preserve keep mode, reject bad PNG before write', () async {
    final root = Directory.systemTemp.createTempSync('png-privacy-storage-');
    PathProviderPlatform.instance = _Paths(root.path);
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    UnifiedStorage.active = null;
    final storage = Storage();
    try {
      final input = privacyFixture('alpha', text:true);
      for (final keep in [false,true]) {
        await storage.setSettings(AppSettings(keepImageMetadata:keep,saveToGallery:false));
        final saved = await storage.saveImage(input,GenerateParams(),4234567890);
        final temp = await storage.saveArtistLabTemporaryImage(input,GenerateParams(),4234567890);
        final compatible = await storage.saveCompatibleImage(input,{'model':'fixture','prompt':'PRIVATE-PROMPT'},AppSettings(keepImageMetadata:keep,saveToGallery:false));
        for (final item in [saved,temp,compatible]) {
          final bytes = File(item.filePath).readAsBytesSync();
          if (keep) { expect(bytes,orderedEquals(input)); }
          else { expect(parseImageTextMetadata(bytes),isEmpty); expect(privacyHeader(bytes,'alpha'),isNot(startsWith('stealth_'))); }
        }
      }
      await storage.setSettings(AppSettings(keepImageMetadata:false,saveToGallery:false));
      final beforeFiles = root.listSync(recursive:true).whereType<File>().map((f)=>f.path).toSet();
      final bad = Uint8List.fromList(input)..[29] ^= 1;
      await expectLater(storage.saveImage(bad,GenerateParams(),1),throwsFormatException);
      await expectLater(storage.saveArtistLabTemporaryImage(bad,GenerateParams(),1),throwsFormatException);
      await expectLater(storage.saveCompatibleImage(bad,{'model':'fixture','prompt':'PRIVATE-PROMPT'},AppSettings(keepImageMetadata:false,saveToGallery:false)),throwsFormatException);
      final jpeg=Uint8List.fromList([255,216,255,217]);
      await expectLater(storage.saveImage(jpeg,GenerateParams(),1),throwsFormatException);
      await expectLater(storage.saveArtistLabTemporaryImage(jpeg,GenerateParams(),1),throwsFormatException);
      await expectLater(storage.saveCompatibleImage(jpeg,{'model':'fixture','prompt':'PRIVATE-PROMPT'},AppSettings(keepImageMetadata:false,saveToGallery:false)),throwsFormatException);
      expect(root.listSync(recursive:true).whereType<File>().map((f)=>f.path).toSet(), beforeFiles);
    } finally {
      if (root.parent.path == Directory.systemTemp.path && root.uri.pathSegments[root.uri.pathSegments.length - 2].startsWith('png-privacy-storage-')) root.deleteSync(recursive:true);
    }
  });
}
