import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/gallery_screen.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/i18n/platform_feature_text.dart';
import 'package:novelai_mobile/i18n/app_locales.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
Future<void> main()async{
 final binding=WidgetsFlutterBinding.ensureInitialized(), app=AppState();final t=LiveWidgetController(binding);
 final file=File('${(await getApplicationDocumentsDirectory()).path}/RESOURCES_QUEUE_QA.json');if(file.existsSync())file.deleteSync();
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
 if(f.evaluate().isEmpty)throw StateError('missing '+f.toString());
 await t.ensureVisible(f.first);await tick(170);
 }
 Future<void> tap(Finder f)async{await locate(f);await t.tap(f.hitTestable().first);await tick();}
 Future<void> type(Finder f,String v)async{await locate(f);await t.tap(f.first);await tick(100);final e=find.descendant(of:f.first,matching:find.byType(EditableText));(t.state(e) as EditableTextState).updateEditingValue(TextEditingValue(text:v,selection:TextSelection.collapsed(offset:v.length)));FocusManager.instance.primaryFocus?.unfocus();await tick();}
 void mount(Widget w)=>runApp(ChangeNotifierProvider<AppState>.value(value:app,child:MaterialApp(theme:StudioTheme.light(),home:w)));
 try{
 final root=await getTemporaryDirectory();
 app.settings.language='zh-CN';app.params.model='nai-diffusion-4-5-full';
 final stamp=DateTime.now().microsecondsSinceEpoch.toString();
 final rows=<HistoryItem>[];
 for(final id in ['A','B','C']){
 final file=File('${root.path}/qa-$stamp-$id.png');
 final im=img.Image(width:4,height:4);im.setPixelRgb(0,0,id.codeUnitAt(0),2,3);
 await file.writeAsBytes(img.encodePng(im));final date=id=='C'?'2026-01-02':'2026-01-01';
 rows.add(HistoryItem(id:id,filePath:file.path,date:date,createdAt:date+'T12:00:00Z',prompt:'subject-'+id,model:app.params.model,width:4,height:4,seed:1,params:app.params.toJson()));}
 app.groups=[const HistoryGroup(id:'test-destination',name:'QA Target',createdAt:'2026-01-01')];await app.storage.writeGroups(app.groups);
 app.history=rows;await app.storage.writeHistory(rows);mount(const GalleryScreen());await tick(800);
 Finder option(String v)=>find.byWidgetPredicate((w)=>w is PopupMenuItem<String> && w.value==v);
 final android=key('android-gallery-menu').evaluate().isNotEmpty;
 if(android){await tap(key('android-gallery-menu'));await tap(option('select'));}else{await tap(key('works-batch-edit'));}
 await tap(find.text(platformFeatureText('zh-CN','selectAll')));
 if(android){await tap(key('android-gallery-date-filter'));await tap(option('2026-01-01'));}else{await tap(find.text(mobileUiTextFor('zh-CN','gallery.allDates')).first);await tap(find.text('2026-01-01').last);}
 await tap(find.text(platformFeatureText('zh-CN','move')));await tap(find.descendant(of:find.byType(SimpleDialog),matching:find.text('QA Target')));
 final saved=await app.storage.getHistory();check(saved.length==3 && saved.where((v)=>v.groupId=='test-destination').map((v)=>v.id).toSet().containsAll(['A','B']) && saved.singleWhere((v)=>v.id=='C').groupId!='test-destination','gallery-filtered-move-A-B-only-durable');
 mount(const Scaffold(body:SafeArea(child:ReferencePresetLibraryPanel(standalone:true,showClose:false,allowedKind:ReferencePresetKind.precise))));await tick();
 await tap(find.text('本机预设'));await tap(key('reference-add-gallery'));await type(key('reference-gallery-search'),'subject-A');check(key('reference-gallery-C').evaluate().isEmpty,'preset-gallery-search-excludes-C');await tap(key('reference-gallery-A'));
 final fields=find.descendant(of:find.byType(AlertDialog),matching:find.byType(TextField));await type(fields.first,'QA Gallery A');
 await tap(find.descendant(of:find.byType(AlertDialog),matching:find.text('保存')));await tick(600);
 final preset=app.referencePresets.firstWhere((v)=>v.name=='QA Gallery A');
 check(base64Encode(File(preset.filePath).readAsBytesSync())==base64Encode(File(rows.first.filePath).readAsBytesSync()) && app.extras.preciseReferences.isEmpty && app.extras.vibeImages.isEmpty && app.workbenchImage==null,'gallery-preset-copied-no-auto-apply');
 mount(const Scaffold(key:ValueKey('workbench-picker'),body:SafeArea(child:ReferencePresetLibraryPanel(standalone:false,showClose:false,allowedKind:ReferencePresetKind.precise))));await tick(650);await tap(find.text('QA Gallery A').first);final apply=key('reference-preset-apply-fixed');await locate(apply);check((t.widget(apply) as ButtonStyleButton).onPressed!=null,'apply-button-enabled');await t.tap(apply);await tick(650);
 check(app.extras.preciseReferences.length==1 && app.extras.vibeImages.isEmpty && app.workbenchImage==null,'explicit-apply-precise-only');
 final c=app.batchRedraw;await c.load();c.project=BatchRedrawProject.empty(app.params)..items=[for(final h in rows) BatchRedrawItem(id:h.id,name:h.id+'.png',prompt:h.prompt,base64:base64Encode(File(h.filePath).readAsBytesSync()))];
 mount(BatchRedrawScreen(controller:c));await tick(650);
 await tap(key('batch-input-actions-B'));await tap(option('up'));
 check(c.project.items.map((v)=>v.id).join()=='BAC','queue-up-BAC');
 await tap(key('batch-input-actions-A'));await tap(option('down'));
 await c.flush();final reread=await app.storage.getBatchRedrawProject(app.params);
 check(reread.items.map((v)=>v.id).join()=='BCA' && reread.items.every((v)=>v.prompt=='subject-'+v.id && v.base64==base64Encode(File(rows.singleWhere((h)=>h.id==v.id).filePath).readAsBytesSync())),'queue-down-BCA-persisted-with-original-sources');
 output['passed']=true;
 }catch(e,s){output['passed']=false;output['error']=e.toString();output['stack']=s.toString();}
 await file.writeAsString(jsonEncode(output),flush:true);print('RESOURCES_QUEUE_QA '+jsonEncode(output));}


