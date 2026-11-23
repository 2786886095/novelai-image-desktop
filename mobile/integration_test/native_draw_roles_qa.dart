// Offline native pointer acceptance. No provider credentials or generation calls.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:novelai_mobile/screens/style_library_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart' show WorkbenchCharacterEditor;
import 'package:novelai_mobile/screens/mobile_bulk_controls.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
class FixturePicker extends FilePicker{
 final File file;FixturePicker(this.file);
 @override Future<FilePickerResult?> pickFiles({String? dialogTitle,String? initialDirectory,FileType type=FileType.any,List<String>? allowedExtensions,Function(FilePickerStatus)? onFileLoading,bool allowCompression=true,int compressionQuality=30,bool allowMultiple=false,bool withData=false,bool withReadStream=false,bool lockParentWindow=false,bool readSequential=false}) async => FilePickerResult([PlatformFile(path:file.path,name:'qa-example.png',size:file.lengthSync())]);
}
class Capture extends AppState{
 final rows=<GenerateExtras>[];final styles=<String>[];
 @override Future<HistoryItem> generateArtistLabTemporary({required GenerateParams panelParams,required GenerateExtras panelExtras})async{
 rows.add(panelExtras);styles.add(panelParams.stylePrompt);
 if(rows.length==1)extras.charCaptions.first.prompt='edited during batch';
 throw StateError('QA stopped before network');
 }
}
Future<void> main()async{
 final binding=WidgetsFlutterBinding.ensureInitialized(), app=Capture();final t=LiveWidgetController(binding);
 final file=File('${(await getApplicationDocumentsDirectory()).path}/DRAW_ROLE_QA.json');if(file.existsSync())file.deleteSync();
 final output=<String,dynamic>{'os':Platform.operatingSystem},steps=<String>[];output['steps']=steps;
 void check(bool v,String msg){if(!v)throw StateError(msg);steps.add(msg);}
 Finder key(String k)=>find.byKey(ValueKey(k));
 Future<void> tick([int ms=400])async{await t.pump(Duration(milliseconds:ms));await t.pump();}
 Future<void> locate(Finder f)async{
 if(f.evaluate().isEmpty){
 final scroll=t.state<ScrollableState>(find.byType(Scrollable).first);
 scroll.position.jumpTo(0);await tick(90);
 for(var i=0;i<55&&f.evaluate().isEmpty;i++){
 final next=(scroll.position.pixels+240).clamp(0.0,scroll.position.maxScrollExtent).toDouble(); if(next==scroll.position.pixels)break;
 scroll.position.jumpTo(next);await tick(60);}
 }
 if(f.evaluate().isEmpty)throw StateError('missing $f');
 await t.ensureVisible(f.first);await tick(170);
 }
 Future<void> tap(Finder f)async{await locate(f);await t.tap(f.hitTestable().first);await tick();}
 Future<void> type(Finder f,String v)async{await locate(f);await t.tap(f.first);await tick(100);final e=find.descendant(of:f.first,matching:find.byType(EditableText));(t.state(e) as EditableTextState).updateEditingValue(TextEditingValue(text:v,selection:TextSelection.collapsed(offset:v.length)));FocusManager.instance.primaryFocus?.unfocus();await tick();}
 void mount(Widget w)=>runApp(ChangeNotifierProvider<AppState>.value(value:app,child:MaterialApp(theme:StudioTheme.light(),home:w)));
 try{
 app.settings.language='zh-CN';app.settings.autoComplete=false;app.params.positivePrompt='base subject';
 app.extras.charCaptions=[CharCaptionItem(prompt:'scarf',negativePrompt:'hat',useCoords:true,x:.25,y:.75),CharCaptionItem(prompt:'disabled',enabled:false)];
 mount(V5ArtistWeightRepairScreen(mode:V5ArtistToolMode.draw,onBack:(){}));await tick(850);
 final roleSwitch=key('draw-include-characters');await locate(roleSwitch);
 check(!(t.widget(roleSwitch) as SwitchListTile).value,'default-off');await tap(roleSwitch);
 await tap(key('draw-edit-characters'));check(find.byType(WorkbenchCharacterEditor).evaluate().isNotEmpty,'opened-normal-generation-role-editor');
 final before=app.extras.charCaptions.length;await tap(find.text('添加').first);check(app.extras.charCaptions.length==before+1,'add-role-in-standard-editor');
 await tap(find.byType(BackButton).first);
 final source=find.byWidgetPredicate((w)=>w is TextField && (w.decoration?.hintText?.contains('artist:foo')==true||w.decoration?.hintText?.contains('pottsness')==true));
 await type(source,'artist:qa_artist, night');await tap(find.text('重新抽权重'));await tap(find.text('生成这一批'));
 check(app.rows.length>1 && app.rows.every((e)=>e.charCaptions.length==1 && e.charCaptions.first.prompt=='scarf' && e.charCaptions.first.negativePrompt=='hat' && e.charCaptions.first.useCoords && e.charCaptions.first.x==.25 && e.charCaptions.first.y==.75 && e.vibeImages.isEmpty && e.preciseReferences.isEmpty) && app.styles.every((s)=>s.contains('qa_artist')),'batch-uses-frozen-role-and-separate-style');
 final n=app.rows.length;await tap(roleSwitch);await tap(find.text('生成这一批'));check(app.rows.length==2*n && app.rows.skip(n).every((e)=>e.charCaptions.isEmpty)&&app.extras.charCaptions.first.prompt=='edited during batch','switch-off-no-roles-workbench-preserved');
 // The production dialog receives precisely the filtered presets, not the hidden C.
 final items=[for(final id in ['A','B','C']) StylePromptPreset(id:id,name:id,prompt:id,createdAt:'now')];app.settings.stylePromptPresets=items;app.settings.stylePromptPresetGroups=['Target'];
 Set<String>? selected;
 mount(Scaffold(body:Builder(builder:(ctx)=>Center(child:TextButton(onPressed:()async{
 final picked=await showDialog<MobileStyleMove>(context:ctx,builder:(_)=>MoveMobileStylesDialog(attach:true,styles:items.take(2).toList(),groups:const ['Target'],language:'en-US'));
 if(picked!=null)selected=picked.ids;
 },child:const Text('open batch'))))));await tick();await tap(find.text('open batch'));final toggle=key('batch-toggle-visible');await tap(toggle);check(t.widgetList<CheckboxListTile>(find.byType(CheckboxListTile)).every((w)=>w.value==true),'select-all-visible');await tap(toggle);check(t.widgetList<CheckboxListTile>(find.byType(CheckboxListTile)).every((w)=>w.value==false),'clear-selection');await tap(toggle); await tap(find.byType(FilledButton).last);check(selected!=null && selected!.length==2 && !selected!.contains('C'),'bulk-choice-excludes-hidden');await app.moveStylePresetsTogether(selected!,'Target');check(items[2].group!='Target' && app.settings.stylePromptPresets.where((p)=>p.group=='Target').length==2,'filtered-two-moved-other-unchanged'); final img=File('${(await getTemporaryDirectory()).path}/draw-qa-source.png');await img.writeAsBytes(base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLokAAAAASUVORK5CYII='));
 FilePicker.platform=FixturePicker(img);app.settings.language='en-US';for(final s in app.settings.stylePromptPresets){s.name=s.id=='C'?'hidden C':'visible ${s.id}';}
 mount(const StyleLibraryScreen());await tick(500);
 final search=find.byWidgetPredicate((w)=>w is TextField && w.decoration?.prefixIcon is Icon && (w.decoration?.prefixIcon as Icon).icon==Icons.search);
 await type(search,'visible');final attach=find.text(mobileBulkLabels('en-US')[12]);await tap(attach.first);await tap(toggle);
 check(t.widgetList<CheckboxListTile>(find.byType(CheckboxListTile)).length==2,'real-resource-list-filter-passed-to-batch');
 await tap(find.byType(FilledButton).last);await tap(find.byType(FilledButton).last);
 for(var i=0;i<25 && app.settings.stylePromptPresets.first.previewImages.isEmpty;i++){await tick(180);}
 final styles=app.settings.stylePromptPresets;check(styles.where((v)=>v.id!='C').every((v)=>v.previewImages.length==1 && File(v.previewImages.single.filePath).existsSync()) && styles.singleWhere((v)=>v.id=='C').previewImages.isEmpty && app.extras.vibeImages.isEmpty && app.extras.preciseReferences.isEmpty && app.workbenchImage==null,'actual-attach-confirm-copies-images-not-workbench-references');
 output['interceptedRequests']=app.rows.length;output['passed']=true;
 }catch(e,s){output['passed']=false;output['error']=e.toString();output['stack']=s.toString();}
 await file.writeAsString(jsonEncode(output),flush:true);debugPrint('DRAW_ROLE_QA ${jsonEncode(output)}');
}
