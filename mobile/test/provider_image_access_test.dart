// HOST contract tests. Injected readers are not a native picker/provider proof.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/images/image_file_access.dart';
import 'package:novelai_mobile/images/coordinated_file_image.dart';
import 'package:novelai_mobile/images/metadata_recovery.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/inpaint_mask_editor.dart';
import 'package:novelai_mobile/screens/metadata_inspector_screen.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

final png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
HistoryItem history(String path) => HistoryItem(id:'original',filePath:path,
  date:'2026-10-17',createdAt:'2026-10-17T00:00:00Z',seed:1,
  model:'nai-diffusion-5-full',width:1,height:1,prompt:'keep');
class SessionStorage extends Storage {
  final File snapshot;
  ({File file,String name})? session;
  SessionStorage(this.snapshot, ImageFileReader reader):super(imageReader:reader);
  @override
  Future<({File file,String name})> saveMetadataInspectorImage(Uint8List bytes,String originalName) async {
    await snapshot.writeAsBytes(bytes);
    return session=(file:snapshot,name:originalName);
  }
  @override
  Future<({File file,String name})?> getMetadataInspectorImage() async => session;
}
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory temp;
  setUp(() {temp=Directory.systemTemp.createTempSync('provider-reader-host-'); SharedPreferences.setMockInitialValues({});});
  tearDown(() async {PaintingBinding.instance.imageCache..clear()..clearLiveImages();await Future<void>.delayed(const Duration(milliseconds:20));if(temp.existsSync())temp.deleteSync(recursive:true);});
  test('real local read preserves exact bytes and source, enforces caller limit',() async {
    final file=File('${temp.path}/original.png')..writeAsBytesSync(png);
    const reader=ImageFileReader(coordinated:false);
    expect(await reader.read(file.path),png);
    expect(await file.readAsBytes(),png);
    await expectLater(reader.read(file.path,maxBytes:8),throwsA(isA<ImageAccessException>().having((e)=>e.code,'code','image_size')));
    expect(await reader.probe('${temp.path}/missing.png'),ImageAvailability.missing);
  });
  test('coordinated bytes win over any same-path local file, with exact path and limit',() async {
    final file=File('${temp.path}/original.png')..writeAsBytesSync([1,2,3]);
    final calls=<Object>[];
    final reader=ImageFileReader(coordinated:true,nativeRead:(path,limit) async {calls.add([path,limit]);return png;});
    expect(await reader.read(file.path,maxBytes:1024),png);
    expect(calls,[[file.path,1024]]);
    expect(await file.readAsBytes(),[1,2,3]);
  });
  for(final code in ['output_folder_permission','output_folder_read']) {
    test('revoked/offline $code never falls back to readable local file',() async {
      final file=File('${temp.path}/original.png')..writeAsBytesSync(png);
      final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async => throw PlatformException(code:code));
      await expectLater(reader.read(file.path),throwsA(isA<ImageAccessException>().having((e)=>e.confirmedMissing,'missing',false)));
      expect(await reader.probe(file.path),ImageAvailability.unavailable);
      expect(await file.readAsBytes(),png);
    });
  }
  test('only native-confirmed local missing is deletable, not generic provider errors',() async {
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async => throw PlatformException(code:'output_image_missing'));
    expect(await reader.probe('/app/missing.png'),ImageAvailability.missing);
  });
  test('oversize native response is rejected even when bridge disregards limit',() async {
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async => Uint8List(9));
    await expectLater(reader.read('/provider/image.png',maxBytes:8),throwsA(isA<ImageAccessException>()));
  });
  test('provider regrant retries fresh IO without cached-error state or renamed path',() async {
    var permitted=false,calls=0;
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async {calls++;if(!permitted)throw PlatformException(code:'output_folder_permission');return png;});
    expect(await reader.probe('/provider/original.png'),ImageAvailability.unavailable);
    permitted=true;expect(await reader.read('/provider/original.png'),png);expect(calls,2);
  });
  test('reconciliation retains unavailable external history and original persistent path',() async {
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async => throw PlatformException(code:'output_folder_permission'));
    final storage=Storage(imageReader:reader),item=history('/provider/date/original.png');
    await storage.writeHistory([item]);
    expect(await storage.reconcileMissingHistory(),isEmpty);
    final reopened=Storage(imageReader:reader);
    expect((await reopened.getHistory()).single.toJson(),item.toJson());
  });
  test('workbench actual consumer reads provider, preserves source and old state on revoke',() async {
    var permitted=true;
    final calls=<String>[];
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async {calls.add(p);if(!permitted)throw PlatformException(code:'output_folder_permission');return png;});
    final state=AppState(storage:Storage(imageReader:reader));addTearDown(state.dispose);
    state.params.positivePrompt='user prompt';
    await state.setWorkbenchPath('/provider/original.png');
    expect(state.workbenchImage?.filePath,'/provider/original.png');
    expect(state.params.positivePrompt,'user prompt');
    permitted=false;
    await expectLater(state.setWorkbenchPath('/provider/another.png'),throwsA(isA<ImageAccessException>()));
    expect(state.workbenchImage?.filePath,'/provider/original.png');
    expect(calls,['/provider/original.png','/provider/another.png']);
  });
  test('actual gallery and metadata helper read original provider; session copy is explicit, not fallback',() async {
    var permitted=true;final calls=<String>[];
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async {calls.add(p);if(!permitted)throw PlatformException(code:'output_folder_permission');return png;});
    final storage=SessionStorage(File('${temp.path}/session.png'),reader);
    final state=AppState(storage:storage);addTearDown(state.dispose);
    final item=history('/provider/original.png');
    await stageHistoryImageForMetadata(state,item);
    expect(storage.metadataInspectorSourcePath,item.filePath);
    expect(await storage.snapshot.readAsBytes(),png);
    final result=await inspectHistoryImageMetadata(state,item,mode:MetadataRecoveryMode.offline);
    expect(result.file.path,storage.snapshot.path);
    expect(storage.metadataInspectorSourcePath,item.filePath);
    permitted=false;
    await expectLater(stageHistoryImageForMetadata(state,item),throwsA(isA<ImageAccessException>()));
    await expectLater(inspectHistoryImageMetadata(state,item,mode:MetadataRecoveryMode.offline),throwsA(isA<ImageAccessException>()));
    expect(calls.every((p)=>p==item.filePath),true);
    expect(await storage.snapshot.readAsBytes(),png);
  });
  test('explicit share exports fresh coordinated bytes but cannot reuse them after revoke',() async {
    var permitted=true;
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async {if(!permitted)throw PlatformException(code:'output_folder_permission');return png;});
    final file=await ImageFiles.forSharing('/provider/original.png',access:reader);
    expect(file.name,'original.png');expect(await file.readAsBytes(),png);
    permitted=false;
    await expectLater(ImageFiles.forSharing('/provider/original.png',access:reader),throwsA(isA<ImageAccessException>()));
  });
  testWidgets('actual inpaint source does not retain old pixels after provider failure; selection survives',(tester) async {
    var permitted=true;
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async {if(!permitted)throw PlatformException(code:'output_folder_permission');return png;});
    Widget editor(int epoch) => MaterialApp(home:InpaintMaskEditor(
      image:const WorkingImage(filePath:'/provider/original.png',width:64,height:64),language:'en-US',
      initialRegion:const (x:0,y:0,width:32,height:32),
      imageProvider:CoordinatedImageProvider('/provider/original.png',reader:reader,epoch:epoch)));
    await tester.pumpWidget(editor(0));
    for(var i=0;i<30;i++) {
      await tester.runAsync(()=>Future<void>.delayed(const Duration(milliseconds:20)));await tester.pump();
      if(find.byType(RawImage).evaluate().isNotEmpty && tester.widget<RawImage>(find.byType(RawImage)).image!=null)break;
    }
    expect(tester.widget<RawImage>(find.byType(RawImage)).image,isNotNull);
    expect(find.byKey(const ValueKey('focused-inpaint-region')),findsOneWidget);
    permitted=false;await tester.pumpWidget(editor(1));await tester.pumpAndSettle();
    expect(find.byType(RawImage),findsNothing);
    expect(find.byIcon(Icons.broken_image_outlined),findsOneWidget);
    expect(find.byKey(const ValueKey('focused-inpaint-region')),findsOneWidget);
    expect(tester.widget<Image>(find.byKey(const ValueKey('inpaint-mask-source-image'))).gaplessPlayback,false);
  });
  testWidgets('actual image provider decodes coordinated bytes and resume removes stale pixels after revoke',(tester) async {
    var permitted=true,calls=0;
    final reader=ImageFileReader(coordinated:true,nativeRead:(p,n) async {calls++;if(!permitted)throw PlatformException(code:'output_folder_permission');return png;});
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:CoordinatedFileImage('/provider/original.png',reader:reader))));
    for (var i=0;i<30;i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds:20)));
      await tester.pump();
      if (find.byType(RawImage).evaluate().isNotEmpty && tester.widget<RawImage>(find.byType(RawImage)).image!=null) break;
    }
    expect(tester.widget<RawImage>(find.byType(RawImage)).image,isNotNull);
    permitted=false;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byType(RawImage),findsNothing);
    expect(find.byIcon(Icons.broken_image_outlined),findsOneWidget);
    expect(find.byType(Tooltip),findsOneWidget);
    expect(calls,2);
    permitted=true;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    for (var i=0;i<30;i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds:20)));
      await tester.pump();
      if (find.byType(RawImage).evaluate().isNotEmpty && tester.widget<RawImage>(find.byType(RawImage)).image!=null) break;
    }
    expect(tester.widget<RawImage>(find.byType(RawImage)).image,isNotNull);
    expect(calls,3);
  });
}
