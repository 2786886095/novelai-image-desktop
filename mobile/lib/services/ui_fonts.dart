import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import '../models/ui_typography.dart';
import '../models/builtin_ui_fonts.dart';
const uiFontMaxBytes=20*1024*1024;
class UiFont {
  final String id,name;
  const UiFont(this.id,this.name);
  Map<String,String> toJson()=>{'id':id,'name':name};
}
void validateUiFont(Uint8List bytes) {
  if(bytes.length<12||bytes.length>uiFontMaxBytes)throw const FormatException('FONT_SIZE');
  final d=ByteData.sublistView(bytes);
  if(![0x00010000,0x4f54544f].contains(d.getUint32(0)))throw const FormatException('FONT_FORMAT');
  final count=d.getUint16(4);
  if(count<1||count>256||12+16*count>bytes.length)throw const FormatException('FONT_TABLES');
  final tags=<String>{};
  for(var i=0;i<count;i++){
    final pos=12+i*16,offset=d.getUint32(pos+8),length=d.getUint32(pos+12);
    if(offset>bytes.length||length>bytes.length-offset)throw const FormatException('FONT_BOUNDS');
    tags.add(String.fromCharCodes(bytes.sublist(pos,pos+4)));
  }
  if(!['cmap','head','name','hhea','hmtx','maxp'].every(tags.contains)||!['glyf','CFF ','CFF2'].any(tags.contains))throw const FormatException('FONT_TABLES');
}
class UiFontRepository {
  final Directory directory;
  UiFontRepository(this.directory);
  File _file(String id){if(!UiTypography.isImported(id))throw const FormatException('FONT_ID');return File(p.join(directory.path,'$id.font'));}
  Future<List<UiFont>> list() async {
    final file=File(p.join(directory.path,'catalog.json'));
    if(!await file.exists())return [];
    if(await FileSystemEntity.isLink(file.path)||await file.length()>64*1024)throw const FormatException('FONT_CATALOG');
    final raw=jsonDecode(await file.readAsString());if(raw is! List)throw const FormatException('FONT_CATALOG');
    return raw.whereType<Map>().where((x)=>x['id'] is String&&UiTypography.isImported(x['id'])&&x['name'] is String&&(x['name'] as String).length<=180).take(16).map((x)=>UiFont(x['id'],x['name'])).toList();
  }
  Future<void> _save(List<UiFont> items) async {
    await directory.create(recursive:true);if(await FileSystemEntity.isLink(directory.path))throw const FormatException('FONT_DIRECTORY');
    final target=p.join(directory.path,'catalog.json'),tmp=File('$target.tmp');
    try{await tmp.writeAsString(jsonEncode(items.map((x)=>x.toJson()).toList()),flush:true);await tmp.rename(target);}finally{if(await tmp.exists())await tmp.delete();}
  }
  Future<Uint8List> read(String id) async {
    final file=_file(id);
    if(!(await list()).any((x)=>x.id==id))throw const FormatException('FONT_MISSING');
    if(await FileSystemEntity.isLink(file.path)||await file.length()>uiFontMaxBytes)throw const FormatException('FONT_SIZE');
    final bytes=await file.readAsBytes();validateUiFont(bytes);if('font-${sha256.convert(bytes)}'!=id)throw const FormatException('FONT_HASH');return bytes;
  }
  Future<UiFont> importFile(String source) async {
    if(!RegExp(r'\.(ttf|otf)$',caseSensitive:false).hasMatch(source))throw const FormatException('FONT_FORMAT');
    final input=File(source);if(await input.length()>uiFontMaxBytes)throw const FormatException('FONT_SIZE');
    final bytes=await input.readAsBytes();validateUiFont(bytes);
    final id='font-${sha256.convert(bytes)}',items=await list();
    for(final item in items){if(item.id==id){await loadUiFont(id,await read(id));return item;}}
    if(items.length>=16)throw const FormatException('FONT_LIMIT');
    await loadUiFont(id,bytes); // Engine acceptance precedes catalog or active-setting changes.
    var name=p.basename(source).replaceAll(RegExp(r'[\x00-\x1f\x7f]'),'');if(name.length>180)name=name.substring(0,180);
    final entry=UiFont(id,name);
    await directory.create(recursive:true);if(await FileSystemEntity.isLink(directory.path))throw const FormatException('FONT_DIRECTORY');
    final file=_file(id);if(await file.exists())throw const FormatException('FONT_EXISTS');
    await file.writeAsBytes(bytes,flush:true);try{await _save([...items,entry]);}catch(_){await file.delete();rethrow;}return entry;
  }
  Future<void> remove(String id) async {
    final file=_file(id);await _save((await list()).where((x)=>x.id!=id).toList());
    if(await file.exists()){if(await FileSystemEntity.isLink(file.path))throw const FormatException('FONT_LINK');await file.delete();}
  }
}
final _loadedUiFonts=<String>{};
Future<void> loadUiFont(String id,Uint8List bytes) async {
  if(_loadedUiFonts.contains(id))return;
  final loader=FontLoader('Studio-$id')..addFont(Future.value(ByteData.sublistView(bytes)));await loader.load();_loadedUiFonts.add(id);
}
bool uiFontLoaded(String id)=>_loadedUiFonts.contains(id);
Future<UiFontRepository> uiFontRepository() async=>UiFontRepository(Directory(p.join((await getApplicationSupportDirectory()).path,'ui-fonts')));
final _pendingUiFonts=<String,Future<void>>{};
Future<void> ensureUiFont(String id) async {
  final bundled=builtinUiFont(id);
  if(bundled==null&&!UiTypography.isImported(id))return;
  if(uiFontLoaded(id))return;
  final old=_pendingUiFonts[id];if(old!=null)return old;
  final work=()async{
    final bytes=bundled!=null ? (await rootBundle.load('assets/ui-fonts/${bundled.file}')).buffer.asUint8List() : await (await uiFontRepository()).read(id);
    await loadUiFont(id,bytes);
  }();_pendingUiFonts[id]=work;
  try{await work;}finally{_pendingUiFonts.remove(id);}
}
String? uiFontFamily(String id) {
  if(id=='default')return null;
  if(UiTypography.isImported(id)||builtinUiFont(id)!=null)return uiFontLoaded(id)?'Studio-$id':null;
  return switch(id){'serif'=>Platform.isIOS?'Times New Roman':'serif','mono'=>Platform.isIOS?'Menlo':'monospace',_=>Platform.isIOS?'Helvetica Neue':'sans-serif'};
}
