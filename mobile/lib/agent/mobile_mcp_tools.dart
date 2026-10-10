import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart';
import 'package:image/image.dart' as im;
import 'agent_controller.dart';
import 'agent_tools.dart';
import 'agent_models.dart';
import 'external_mcp_server.dart';
import '../state/app_state.dart';
import '../models/nai_models.dart';
import '../billing/anlas.dart';

const _agentNames={'get_state':'langbai_get_generation_state','generate_image':'langbai_generate_image',
  'img2img':'langbai_redraw_image','inpaint':'langbai_inpaint_image','upscale':'langbai_upscale_image',
  'director_tool':'langbai_director','list_history':'langbai_list_history','read_image_metadata':'langbai_read_image_metadata',
  'search_tags':'langbai_search_tags'};
const _paid={'generate_image','img2img','inpaint','upscale','director_tool'};
Map<String,dynamic> _schema(Map<String,dynamic> props,[List<String> required=const []])=>{'type':'object','properties':props,'required':required,'additionalProperties':false};
const _string={'type':'string'};
List<Map<String,dynamic>> mobileMcpSchemas() {
  final definitions=agentToolSchemas().map((v)=>v['function'] as Map<String,dynamic>).toList();
  final schemas=<Map<String,dynamic>>[];
  for(final entry in _agentNames.entries) {
    final definition=definitions.firstWhere((v)=>v['name']==entry.value);
    final input=jsonDecode(jsonEncode(definition['parameters'])) as Map<String,dynamic>;
    final props=input['properties'] as Map<String,dynamic>,required=input['required'] as List;
    for(final pair in [('attachmentId','image'),('maskAttachmentId','mask')]) {
      if(props.containsKey(pair.$1)){props[pair.$2]=props.remove(pair.$1);for(var i=0;i<required.length;i++){if(required[i]==pair.$1)required[i]=pair.$2;}}
    }
    if(entry.key=='get_state') {props.clear();required.clear();}
    schemas.add({'name':entry.key,'description':definition['description'],'inputSchema':input,
      'annotations':{'readOnlyHint':!_paid.contains(entry.key),'openWorldHint':_paid.contains(entry.key)}});
  }
  final region=_schema({'x':{'type':'number','minimum':0,'maximum':1},'y':{'type':'number','minimum':0,'maximum':1},
    'width':{'type':'number','minimum':0.000001,'maximum':1},'height':{'type':'number','minimum':0.000001,'maximum':1}},['x','y','width','height']);
  Map<String,dynamic> tool(String name,Map<String,dynamic> input,bool read)=>{'name':name,'description':name,'inputSchema':input,'annotations':{'readOnlyHint':read,'openWorldHint':false}};
  schemas.addAll([
    tool('view_image',_schema({'image':_string,'maxSize':{'type':'integer','minimum':64,'maximum':2048},'region':region},['image']),true),
    tool('import_image',_schema({'path':_string},['path']),false),
    tool('make_mask',_schema({'image':_string,'units':{'type':'string','enum':['fraction','pixel']},'invert':{'type':'boolean'},
      'shapes':{'type':'array','minItems':1,'maxItems':64,'items':_schema({...region['properties'] as Map<String,dynamic>,
        'x':{'type':'number'},'y':{'type':'number'},'width':{'type':'number','minimum':0.000001},'height':{'type':'number','minimum':0.000001},
        'shape':{'type':'string','enum':['rect','ellipse']}},['x','y','width','height'])}},['image','shapes']),false),
    tool('apply_to_workbench',_schema({'image':_string},['image']),false),
    tool('estimate_cost',_schema({'operation':{'type':'string','enum':_paid.toList()},'arguments':{'type':'object'}},['operation']),true)
  ]);
  return schemas;
}
class MobileMcpTools {
  final AppState app;final Directory assets;final int Function() budget;
  late final AgentController controller=AgentController(app:app);
  final imported=<AgentAttachment>[];
  MobileMcpTools({required this.app,required this.assets,required this.budget});
  Future<void> load() async {await assets.create(recursive:true);await controller.load();}
  Future<AgentAttachment> _resolve(String value) async {
    final found=imported.where((a)=>a.id==value);
    if(found.isNotEmpty)return found.first;
    final history=app.history.where((h)=>h.id==value);
    if(history.isNotEmpty){final h=history.first;return AgentAttachment(id:h.id,name:'history.png',mime:'image/png',size:await File(h.filePath).length(),kind:'image',filePath:h.filePath,width:h.width,height:h.height);}
    throw StateError('Unknown image ID. Import an image first.');
  }
  Future<im.Image> _read(String path) async {
    if(await FileSystemEntity.type(path,followLinks:false)!=FileSystemEntityType.file || await File(path).length()>64*1024*1024)throw StateError('Image is not a bounded regular file');
    final bytes=await File(path).readAsBytes();
    if(bytes.length>64*1024*1024)throw StateError('Image too large');
    final decoder=im.findDecoderForData(bytes);
    final info=decoder?.startDecode(bytes);
    if(info==null || info.width*info.height>64*1024*1024)throw StateError('Image dimensions unavailable');
    return compute(_decodeMcpImage,bytes);
  }
  Future<AgentAttachment> _register(im.Image image) async {
    if(imported.length>=1024)throw StateError('Attachment limit');
    image.exif=im.ExifData();image.textData=null;image.iccProfile=null;
    final id=agentId('mcp-image'),file=File('${assets.path}/$id.png'),bytes=im.encodePng(image);
    await file.writeAsBytes(bytes,flush:true);
    final a=AgentAttachment(id:id,name:'$id.png',mime:'image/png',size:bytes.length,kind:'image',filePath:file.path,width:image.width,height:image.height);imported.add(a);return a;
  }
  Map<String,dynamic> _ok(Object? data,[List<Map<String,dynamic>> extra=const []])=>{'content':[{'type':'text','text':jsonEncode(data)},...extra]};
  String _revision()=>sha256.convert(utf8.encode(jsonEncode([app.settings.toJson(),app.params.toJson(),app.extras.toJson(),
    app.generationGroupId,app.inpaintEngine,app.inpaintSourceMode,app.inpaintModel,app.inpaintSizeMode,
    app.inpaintCustomSize.width,app.inpaintCustomSize.height,app.i2iSizeMode,app.i2iSourceMode,
    app.workbenchImage?.filePath,app.i2iOriginalImage?.filePath]))).toString();
  Future<Map<String,dynamic>> _args(String name,Map<String,dynamic> raw) async {
    final args=Map<String,dynamic>.from(raw);
    for(final pair in [('image','attachmentId'),('mask','maskAttachmentId')]) {
      if(args[pair.$1] is String){args[pair.$2]=(await _resolve(args.remove(pair.$1) as String)).id;}
    }
    return args;
  }
  Future<AnlasQuote> _quote(String name,Map<String,dynamic> args) async {
    if(app.settings.imageProvider!='novelai' || name=='inpaint' && (args['engine']??app.inpaintEngine)=='openai') {
      throw StateError('Provider money cost is unknown. Use the in-app editor. No automatic submission.');
    }
    final p=app.params.copy();
    if(args['model'] is String && naiModels.any((v)=>v.value==args['model']))p.model=args['model'];
    if(args['width'] is int)p.width=((args['width'] as int)/64).round()*64;
    if(args['height'] is int)p.height=((args['height'] as int)/64).round()*64;
    if(args['steps'] is int)p.steps=args['steps'];
    if(args['effort'] is String)p.effort=args['effort'];
    final count=args['count'] as int? ?? 1;
    WorkingImage? source;
    if(args['image'] is String){final a=await _resolve(args['image']);source=WorkingImage(filePath:a.filePath,width:a.width!,height:a.height!);}
    if(name=='upscale')return calculateUpscaleAnlas(image:source,account:app.account,scale:args['scale'] as int? ?? 2);
    if(name=='director_tool')return calculateDirectorAnlas(tool:args['tool'] as String? ?? app.directorTool,account:app.account);
    if(name=='inpaint') {
      if(app.inpaintSizeMode=='original' && source!=null){p.width=source.width;p.height=source.height;}
      else {p.width=app.inpaintCustomSize.width;p.height=app.inpaintCustomSize.height;}
      return calculateInpaintAnlas(params:p,account:app.account,image:source,inpaintModel:app.inpaintModel,strength:(args['strength'] as num? ?? 1).toDouble());
    }
    final extras=app.extras.copy();
    // Refuse ambiguous added references rather than underestimate their encoding cost.
    if(args.containsKey('vibeReferences') || args.containsKey('preciseReferences'))throw StateError('Configure references in the app before external generation');
    return calculateImageGenerationAnlas(params:p,account:app.account,extras:extras,batchCount:count,
      imageToImage:name=='img2img',strength:(args['strength'] as num? ?? .7).toDouble(),forcePaid:true);
  }
  Future<McpOperation> prepare(String name,Map<String,dynamic> raw) async {
    final args=jsonDecode(jsonEncode(raw)) as Map<String,dynamic>;
    final revision=_revision();AnlasQuote? quote;
    if(_paid.contains(name)) {
      quote=await _quote(name,args);
      if(!quote.ok || quote.amount==null || quote.amount!>budget())throw StateError('Cost unavailable or above the human budget');
    }
    final transformed=_agentNames.containsKey(name)?await _args(name,args):args;
    final imageHashes=<String,String>{};
    for(final key in ['image','mask']) {if(args[key] is String){final image=await _resolve(args[key]);imageHashes[image.filePath]=sha256.convert(await File(image.filePath).readAsBytes()).toString();}}
    final prepared=_paid.contains(name)?await controller.tools.prepareImageOperation(_agentNames[name]!,transformed,List.of(imported)):null;
    return McpOperation(mutating:_paid.contains(name)||['import_image','make_mask','apply_to_workbench'].contains(name),
      summary:{'operation':name,'parameters':args,if(quote!=null)'estimatedAnlas':quote.amount,'maxAnlasPerCall':budget()},
      execute:() async {
        if(_paid.contains(name)||['import_image','make_mask','apply_to_workbench'].contains(name)) {
          if(app.busy || revision!=_revision())throw StateError('Context changed after preparation');
          for(final entry in imageHashes.entries) {if(sha256.convert(await File(entry.key).readAsBytes()).toString()!=entry.value)throw StateError('Image changed');}
        }
        if(prepared!=null){final fresh=await _quote(name,args);if(!fresh.ok || fresh.amount==null || fresh.amount!>budget())throw StateError('Budget changed');
          final output=await app.withExternalAnlasLimit(budget(),prepared.execute);return {'isError':!output.ok,'content':[{'type':'text','text':output.output}],
            'structuredContent':{'images':output.generatedImages.map((v)=>v.toJson()).toList()}};}
        if(name=='estimate_cost') {final q=await _quote(args['operation'],Map<String,dynamic>.from(args['arguments'] as Map? ?? {}));return _ok({'amount':q.amount,'ok':q.ok,'source':q.source.name});}
        if(name=='import_image'){
          final path=args['path'] as String;await _read(path);
          final bytes=await File(path).readAsBytes();
          if(bytes.length>64*1024*1024 || imported.length>=1024)throw StateError('Attachment limit');
          final info=im.findDecoderForData(bytes)?.startDecode(bytes);
          if(info==null || info.width*info.height>64*1024*1024)throw StateError('Image changed');
          final id=agentId('mcp-import'),ext=im.findDecoderForData(bytes) is im.WebPDecoder?'webp':im.findDecoderForData(bytes) is im.PngDecoder?'png':'img';
          final file=File('${assets.path}/$id.$ext');await file.writeAsBytes(bytes,flush:true);
          final a=AgentAttachment(id:id,name:'$id.$ext',mime:ext=='webp'?'image/webp':ext=='png'?'image/png':'application/octet-stream',size:bytes.length,kind:'image',filePath:file.path,width:info.width,height:info.height);imported.add(a);
          return _ok({'attachmentId':a.id,'filePath':a.filePath,'width':a.width,'height':a.height});
        }
        if(name=='apply_to_workbench'){final a=await _resolve(args['image']);await app.setWorkbenchPath(a.filePath);return _ok({'attachmentId':a.id});}
        if(name=='view_image') {
          final a=await _resolve(args['image']);var image=await _read(a.filePath);
          if(args['region'] is Map){final r=args['region'] as Map;final x=((r['x'] as num)*image.width).round().clamp(0,image.width-1),y=((r['y'] as num)*image.height).round().clamp(0,image.height-1);
            image=im.copyCrop(image,x:x,y:y,width:math.max(1,((r['width'] as num)*image.width).round().clamp(1,image.width-x)),height:math.max(1,((r['height'] as num)*image.height).round().clamp(1,image.height-y)));}
          final max=args['maxSize'] as int? ?? 1024,scale=math.min(1,max/math.max(image.width,image.height));
          image=im.copyResize(image,width:math.max(1,(image.width*scale).round()),height:math.max(1,(image.height*scale).round()));
          image.exif=im.ExifData();image.iccProfile=null;image.textData=null;
          return _ok({'attachmentId':a.id},[{'type':'image','mimeType':'image/jpeg','data':base64Encode(im.encodeJpg(image,quality:88))}]);
        }
        if(name=='make_mask') {
          final source=await _read((await _resolve(args['image'])).filePath),w=source.width,h=source.height;
          final rendered=await compute(_renderMcpMask,{'source':source,'args':args});
          final mask=rendered['mask'] as im.Image,preview=rendered['preview'] as im.Image,count=rendered['count'] as int;
          if(count==0)throw StateError('Empty mask');final a=await _register(mask),b=await _register(preview);
          return _ok({'maskId':a.id,'maskPath':a.filePath,'previewId':b.id,'previewPath':b.filePath,'coverage':count/(w*h)});
        }
        final output=await controller.tools.execute(_agentNames[name]!,transformed,List.of(imported));
        return {'isError':!output.ok,'content':[{'type':'text','text':output.output}]};
      });
  }
  void dispose(){controller.tools.sessions.close();controller.dispose();}
}

im.Image _decodeMcpImage(Uint8List bytes) {
  final decoded=im.decodeImage(bytes);
  if(decoded==null)throw StateError('Cannot decode image');
  return decoded;
}
Map<String,Object> _renderMcpMask(Map<String,Object> input) {
  final source=input['source'] as im.Image,args=input['args'] as Map<String,dynamic>;
  final w=source.width,h=source.height;
          final mask=im.Image(width:w,height:h,numChannels:4),preview=source.clone();var count=0;
          for(var y=0;y<h;y++){for(var x=0;x<w;x++){
            var selected=false;
            for(final rawShape in args['shapes'] as List) {final s=rawShape as Map,pixels=args['units']=='pixel';
              final left=(s['x'] as num)*(pixels?1:w),top=(s['y'] as num)*(pixels?1:h),sw=(s['width'] as num)*(pixels?1:w),sh=(s['height'] as num)*(pixels?1:h);
              if(x>=left && x<left+sw && y>=top && y<top+sh && (s['shape']!='ellipse'||math.pow((x+.5-left-sw/2)/(sw/2),2)+math.pow((y+.5-top-sh/2)/(sh/2),2)<=1))selected=true;
            }
            if(args['invert']==true)selected=!selected;
            if(selected){count++;mask.setPixelRgba(x,y,255,255,255,255);final p=preview.getPixel(x,y);p..r=(p.r*.5+127).round()..g=(p.g*.5).round()..b=(p.b*.5).round();}
          }}
  return {'mask':mask,'preview':preview,'count':count};
}
