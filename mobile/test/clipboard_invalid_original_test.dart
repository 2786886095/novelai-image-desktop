import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/composer_transfers.dart';
import 'package:novelai_mobile/services/image_clipboard.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('invalid original is rejected before native clipboard; no text/path publication',()async{
  final dir=await Directory.systemTemp.createTemp('invalid-original-'),file=File('${dir.path}/private.png');await file.writeAsString('SYNTHETIC_PRIVATE_NOT_IMAGE');var calls=0;
  final messenger=TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;messenger.setMockMethodCallHandler(ComposerTransfers.channel,(call)async{calls++;return true;});
  try{await expectLater(ImageClipboard.copy(file.path,withOriginalMetadata:true),throwsFormatException);expect(calls,0);}
  finally{messenger.setMockMethodCallHandler(ComposerTransfers.channel,null);await dir.delete(recursive:true);}
 });
}
