import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../state/app_state.dart';
import '../prompts/negative_prompt_library.dart';

class NegativePromptLibraryButton extends StatelessWidget {
 final String value;final void Function(String prompt,String mode) onApply;
 const NegativePromptLibraryButton({super.key,required this.value,required this.onApply});
 @override Widget build(BuildContext context){final text=negativeLibraryLabels(context.watch<AppState>().settings.language);
  return IconButton(icon:const Icon(Icons.library_books_outlined),tooltip:text[0],onPressed:()async{
   final result=await showDialog<(String,String)>(context:context,builder:(_)=>_LibraryDialog(current:value));
   if(context.mounted&&result!=null)onApply(result.$1,result.$2);
  });
 }
}
class _LibraryDialog extends StatefulWidget {
 final String current;const _LibraryDialog({required this.current});
 @override State<_LibraryDialog> createState()=>_LibraryDialogState();
}
class _LibraryDialogState extends State<_LibraryDialog> {
 String query='',selectedId='',error='';bool busy=false;Map<String,String>? draft;
 final name=TextEditingController(),prompt=TextEditingController();
 @override void dispose(){name.dispose();prompt.dispose();super.dispose();}
 String id()=>'negative-${DateTime.now().microsecondsSinceEpoch}-${math.Random.secure().nextInt(1<<30)}';
 void edit(Map<String,String> entry){setState((){draft={...entry};name.text=entry['name']!;prompt.text=entry['prompt']!;error='';});}
 void create(bool current)=>edit({'id':id(),'name':'','prompt':current?widget.current:'','createdAt':DateTime.now().toUtc().toIso8601String()});
 Future<void> run(Future<void> Function() action)async{setState((){busy=true;error='';});try{await action();}catch(e){if(mounted)setState(()=>error='$e');}finally{if(mounted)setState(()=>busy=false);}}
 Future<void> save()async{if(draft==null||name.text.trim().isEmpty||prompt.text.trim().isEmpty)return;final entry={...draft!,'name':name.text.trim(),'prompt':prompt.text};await context.read<AppState>().mutateNegativePresets((old)=>old.any((p)=>p['id']==entry['id'])?old.map((p)=>p['id']==entry['id']?entry:p).toList():mergeNegativeLibrary(old,[entry],id));if(mounted)setState((){selectedId=entry['id']!;draft=null;});}
 Future<void> importFile()async{
  final result=await FilePicker.platform.pickFiles(type:FileType.custom,allowedExtensions:['json'],withData:true);
  if(result==null)return;final picked=result.files.single;if(picked.size>5000000)throw const FormatException('Library file exceeds 5 MB');
  final raw=picked.bytes!=null?String.fromCharCodes(picked.bytes!):await File(picked.path!).readAsString();
  // File.readAsString uses UTF-8; decode byte-based picker results identically.
  final imported=parseNegativeLibrary(picked.bytes!=null?decodeNegativeFile(picked.bytes!):raw);
  if(!mounted)return;await context.read<AppState>().mutateNegativePresets((old)=>mergeNegativeLibrary(old,imported,id));
 }
 Future<void> exportFile()async{
  final entries=context.read<AppState>().settings.negativePromptPresets;
  final dir=await getTemporaryDirectory();final file=File('${dir.path}/negative-prompt-library-${DateTime.now().microsecondsSinceEpoch}.json');await file.writeAsString(exportNegativeLibrary(entries));
  if(!mounted)return;final box=context.findRenderObject();final origin=box is RenderBox?box.localToGlobal(Offset.zero)&box.size:const Rect.fromLTWH(0,0,1,1);
  await Share.shareXFiles([XFile(file.path,mimeType:'application/json')],sharePositionOrigin:origin);
 }
 Future<void> remove(Map<String,String> entry,List<String> t)async{
  final confirmed=await showDialog<bool>(context:context,builder:(c)=>AlertDialog(title:Text(t[6]),content:Text(t[19]),actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:Text(t[13])),FilledButton(onPressed:()=>Navigator.pop(c,true),child:Text(t[6]))]));
  if(confirmed!=true||!mounted)return;await context.read<AppState>().mutateNegativePresets((old)=>old.where((p)=>p['id']!=entry['id']).toList());
 }
 @override Widget build(BuildContext context){final state=context.watch<AppState>(),t=negativeLibraryLabels(state.settings.language),entries=state.settings.negativePromptPresets;
  final selected=entries.where((p)=>p['id']==selectedId).firstOrNull??entries.firstOrNull;
  final filtered=entries.where((p)=>('${p['name']}\n${p['prompt']}').toLowerCase().contains(query.toLowerCase())).toList();
  final list=Card(margin:EdgeInsets.zero,child:ListView(children:[if(filtered.isEmpty)Padding(padding:const EdgeInsets.all(16),child:Text(t[16])),for(final p in filtered)ListTile(selected:p['id']==selected?['id'],title:Text(p['name']!),subtitle:Text(p['prompt']!,maxLines:1,overflow:TextOverflow.ellipsis),onTap:busy||draft!=null?null:()=>setState(()=>selectedId=p['id']!))]));
  final detail=Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   if(draft!=null) ...[
    TextField(controller:name,enabled:!busy,maxLength:100,decoration:InputDecoration(labelText:t[14])),const SizedBox(height:8),
    Expanded(child:TextField(controller:prompt,enabled:!busy,maxLength:100000,maxLines:null,expands:true,textAlignVertical:TextAlignVertical.top,decoration:InputDecoration(labelText:t[15],alignLabelWithHint:true))),
    Wrap(alignment:WrapAlignment.end,spacing:8,children:[TextButton(onPressed:busy?null:()=>setState(()=>draft=null),child:Text(t[13])),FilledButton(onPressed:busy?null:()=>run(save),child:Text(t[12]))]),
   ]else if(selected!=null) ...[
    Wrap(alignment:WrapAlignment.spaceBetween,spacing:8,crossAxisAlignment:WrapCrossAlignment.center,children:[Text(selected['name']!,style:Theme.of(context).textTheme.titleMedium),TextButton.icon(onPressed:busy?null:()=>edit(selected),icon:const Icon(Icons.edit_outlined),label:Text(t[5])),TextButton.icon(onPressed:busy?null:()=>run(()=>remove(selected,t)),icon:const Icon(Icons.delete_outline),label:Text(t[6]))]),
    Expanded(child:SingleChildScrollView(padding:const EdgeInsets.all(12),child:SelectableText(selected['prompt']!))),
    Wrap(alignment:WrapAlignment.end,spacing:8,children:[OutlinedButton(onPressed:busy?null:()=>Navigator.pop(context,(selected['prompt']!,'append')),child:Text(t[10])),FilledButton(onPressed:busy?null:()=>Navigator.pop(context,(selected['prompt']!,'replace')),child:Text(t[9]))]),
   ]else Expanded(child:Center(child:Text(t[16]))),
  ]);
  final size=MediaQuery.sizeOf(context);
  return PopScope(canPop:!busy,child:Dialog(child:SizedBox(width:math.min(1000,size.width-32),height:size.height*.88,child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   Row(children:[Expanded(child:Text(t[0],style:Theme.of(context).textTheme.titleLarge)),IconButton(tooltip:t[11],onPressed:busy?null:()=>Navigator.pop(context),icon:const Icon(Icons.close))]),Text(t[1]),const SizedBox(height:8),
   TextField(decoration:InputDecoration(labelText:t[2],prefixIcon:const Icon(Icons.search)),onChanged:(v)=>setState(()=>query=v)),
   Wrap(spacing:8,runSpacing:4,children:[TextButton(onPressed:busy?null:()=>create(false),child:Text(t[4])),TextButton(onPressed:busy||widget.current.trim().isEmpty?null:()=>create(true),child:Text(t[3])),TextButton(onPressed:busy?null:()=>run(importFile),child:Text(t[7])),TextButton(onPressed:busy?null:()=>run(exportFile),child:Text(t[8]))]),
   if(error.isNotEmpty)Text(error,style:TextStyle(color:Theme.of(context).colorScheme.error)),if(busy)const LinearProgressIndicator(),const SizedBox(height:8),
   Expanded(child:LayoutBuilder(builder:(context,box)=>box.maxWidth>=650?Row(crossAxisAlignment:CrossAxisAlignment.stretch,children:[SizedBox(width:220,child:list),const SizedBox(width:16),Expanded(child:detail)]):SingleChildScrollView(child:Column(children:[SizedBox(height:96,child:list),const SizedBox(height:8),SizedBox(height:math.max(320,box.maxHeight-104),child:detail)])))),
  ])))));
 }
}

