import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/png_metadata.dart';

void main(){
 for(final name in ['novelai-exif-v5.webp','novelai-exif-v5-be.webp','novelai-exif-paired.png']){
  test('NovelAI EXIF mappings: $name',(){
   final bytes=File('../shared/image-input-fixtures/$name').readAsBytesSync(),before=Uint8List.fromList(bytes);
   final metadata=parseImageTextMetadata(bytes),report=inspectImageMetadata(metadata);
   expect(report.kind,ImageMetadataKind.novelAi);
   expect(report.imported.positivePrompt,'1girl, blue sky');
   expect(report.imported.negativePrompt,'lowres, bad hands');
   expect(report.imported.seed,4000000000);
   expect(report.imported.model,'nai-diffusion-5-full');
   expect(metadata['Description'],'1girl, blue sky');
   expect(metadata['Source'],'NovelAI Diffusion V5 Full');
   expect(report.characterCaptions.single.prompt,'girl, blue hair');
   expect(bytes,before);
  });
 }
 test('truncated WebP cannot read metadata from missing bytes',(){
  final b=File('../shared/image-input-fixtures/novelai-exif-v5.webp').readAsBytesSync();
  expect(parseImageTextMetadata(Uint8List.sublistView(b,0,b.length-10)),isEmpty);
 });
}
