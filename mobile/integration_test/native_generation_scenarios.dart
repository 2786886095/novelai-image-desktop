// Real client state, native codecs/files and actual loopback HTTP. No paid model.
// ignore_for_file: avoid_print
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:image/image.dart' as im;
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'native_scenario_support.dart';

final suite=NativeScenarios(24);
final wires=<Map<String,dynamic>>[];
final parts=<Map<String,Uint8List>>[];
int generationStatus=200;
bool cancellationDisconnectExpected=false;
Completer<void>? entered,release;
Future<void> main()=>suite.run(_run);
Map<String,dynamic> decodeRequest(Uint8List bytes,String type,Map<String,Uint8List> binaries){
  if(!type.startsWith('multipart/'))return Map<String,dynamic>.from(jsonDecode(utf8.decode(bytes)) as Map);
  final boundary=RegExp(r'boundary="?([^";]+)').firstMatch(type)!.group(1)!;
  Map<String,dynamic>? body;
  for(final part in latin1.decode(bytes).split('--$boundary')){
    final split=part.indexOf('\r\n\r\n');if(split<0)continue;
    final head=part.substring(0,split),name=RegExp(r'name="([^"]+)"').firstMatch(head)?.group(1);
    final payload=part.substring(split+4).replaceFirst(RegExp(r'\r\n$'),'');
    if(name=='request'){body=Map<String,dynamic>.from(jsonDecode(payload) as Map);}
    else if(name!=null){binaries[name]=Uint8List.fromList(latin1.encode(payload));}
  }
  if(body==null)throw const FormatException('No multipart request');return body;
}
Future<void> _run()async{
  final c=await NativeContext.create('generation'),app=c.app,api=c.api,storage=c.storage;
  final sourceBytes=png(64,64),source=File('${c.root.path}/source.png');await source.writeAsBytes(sourceBytes);
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
  final serverErrors=<Object>[];
  server.listen((r)async{
    var heldRequest=false;
    try{
      require(r.connectionInfo!.remoteAddress.isLoopback,'Public fixture traffic');
      require(r.headers.value('authorization')=='Bearer $syntheticToken','Non-synthetic credential');
      final bytes=await r.fold<BytesBuilder>(BytesBuilder(),(b,v)=>b..add(v)).then((b)=>b.takeBytes());
      if(r.uri.path.endsWith('/user/data')){r.response.headers.contentType=ContentType.json;r.response.write('{"subscription":{"tier":3,"active":true,"trainingStepsLeft":{"fixedTrainingStepsLeft":100000,"purchasedTrainingSteps":0}}}');}
      else if(r.uri.path.endsWith('/request-price')){r.response.headers.contentType=ContentType.json;r.response.write('{"price":20}');}
      else if(r.uri.path.endsWith('/encode-vibe')){
        final body=jsonDecode(utf8.decode(bytes)) as Map;wires.add({'path':r.uri.path,'body':body});r.response.add([7,8,9,10]);
      }else if(r.uri.path.endsWith('/generate-image')||r.uri.path.endsWith('/augment-image')||r.uri.path.endsWith('/upscale')){
        final binaries=<String,Uint8List>{},body=decodeRequest(bytes,r.headers.contentType.toString(),binaries);
        wires.add({'path':r.uri.path,'body':body});parts.add(binaries);
        if(entered!=null&&!entered!.isCompleted){heldRequest=true;entered!.complete();await release!.future;}
        r.response.statusCode=generationStatus;
        if(generationStatus!=200){r.response.write('Synthetic upstream error');}
        else{
          int width=64,height=64;
          if(r.uri.path.endsWith('/generate-image')){width=(body['parameters']['width'] as num).toInt();height=(body['parameters']['height'] as num).toInt();}
          if(r.uri.path.endsWith('/upscale')){final input=im.decodeImage(base64Decode(body['image']))!;width=input.width*2;height=input.height*2;}
          final output=png(width,height,180),archive=Archive()..addFile(ArchiveFile('0.png',output.length,output));
          r.response.headers.contentType=ContentType('application','zip');r.response.add(ZipEncoder().encode(archive));
        }
      }else{throw StateError('Unexpected endpoint ${r.uri.path}');}
      await r.response.close();
    }catch(error){
      if(heldRequest&&cancellationDisconnectExpected&&(error is HttpException||error is SocketException)){
        print('FEATURE_FIXTURE_CANCELLED_SOCKET:${error.runtimeType}');
      }else{serverErrors.add(error);print('FEATURE_FIXTURE_ERROR:$error');}
    }
  });
  final base='http://127.0.0.1:${server.port}';app.settings..apiBaseUrl=base..imageBaseUrl=base;
  await storage.setSettings(app.settings);await storage.setToken(syntheticToken);
  int submitted()=>wires.where((w)=>w['path'].toString().endsWith('/generate-image')).length;
  Map<String,dynamic> lastGenerate()=>wires.lastWhere((w)=>w['path'].toString().endsWith('/generate-image'))['body'] as Map<String,dynamic>;
  Future<void> reset()async{app.workbenchImage=WorkingImage(filePath:source.path,width:64,height:64);app.i2iOriginalImage=app.workbenchImage;app.params..model='nai-diffusion-4-5-full'..positivePrompt='synthetic forest'..width=64..height=64;app.extras=GenerateExtras();app.batchCount=1;}
  try{
    await reset();await app.generate();
    require(app.history.length==1&&digest(await File(app.history.single.filePath).readAsBytes())==digest(png(64,64,180)),'Generation result/history');
    require((await Storage().getHistory()).single.id==app.history.single.id&&lastGenerate()['parameters']['seed']==42,'Generation not durable');
    suite.check('generation','submit-result-history',{'realHttpRequests':submitted(),'nativeFileHash':digest(png(64,64,180)),'durableHistory':true});
    final count=submitted(),history=app.history.length;app.params.positivePrompt=' ';await app.generate();
    require(submitted()==count&&app.history.length==history,'Invalid generation submitted');
    suite.check('generation','invalid-params-no-submit',{'emptyPromptPostCountDelta':0,'historyUnchanged':true});
    app.params.positivePrompt='synthetic forest';generationStatus=400;await app.generate();generationStatus=200;
    require(app.history.length==history&&!app.busy,'Upstream failure created result');
    entered=Completer<void>();release=Completer<void>();final cancelled=app.generate();await entered!.future.timeout(const Duration(seconds:30));cancellationDisconnectExpected=true;app.cancelGeneration();release!.complete();await cancelled.timeout(const Duration(seconds:30));entered=null;release=null;
    require(app.history.length==history&&!app.busy,'Cancelled generation created result or remained busy');
    suite.check('generation','cancel-and-upstream-error',{'upstream400NoResult':true,'actualActiveRequestCancelled':true,'busyCleared':true});

    await reset();app.i2i..strength=.4..noise=.1;app.i2iSizeMode='custom';await app.generateI2I();
    final i2i=lastGenerate();
    print('FEATURE_FIXTURE_I2I_SCALARS:${jsonEncode({'action':i2i['action'],'model':i2i['model'],'strength':i2i['parameters']['strength'],'noise':i2i['parameters']['noise'],'width':i2i['parameters']['width'],'height':i2i['parameters']['height']})}');
    require(i2i['action']=='img2img'&&i2i['parameters']['strength']==.4&&i2i['parameters']['noise']==0,'I2I params');
    require(im.decodeImage(base64Decode(i2i['parameters']['image']))!.width==64,'I2I input');
    suite.check('image-to-image','input-strength-and-params',{'action':i2i['action'],'strength':i2i['parameters']['strength'],'noise':i2i['parameters']['noise'],'staleLegacyNoiseInput':.1,'inputNativeDecoded':true});
    final imageResult=app.history.first;require(await File(imageResult.filePath).exists()&&im.decodeImage(await File(imageResult.filePath).readAsBytes())!.width==64,'I2I output decode/save');
    suite.check('image-to-image','decode-and-save',{'decodedSize':[imageResult.width,imageResult.height],'persisted':(await Storage().getHistory()).any((h)=>h.id==imageResult.id)});
    final beforeInvalid=submitted(),sourceHash=digest(await source.readAsBytes());
    await fails(()=>api.img2img(syntheticToken,app.settings,app.params,GenerateExtras(),Uint8List.fromList([1,2,3]),I2IParams()),'Malformed I2I accepted');
    require(submitted()==beforeInvalid&&digest(await source.readAsBytes())==sourceHash,'Invalid I2I mutated source/submitted');
    suite.check('image-to-image','invalid-image-no-mutation',{'invalidBytesRejectedBeforePost':true,'sourceHashUnchanged':true});

    await reset();app.enhanceScale=2;app.enhanceMagnitude=4;
    final oldSize=[app.params.width,app.params.height],oldStrength=app.i2i.strength;
    await app.enhance();final enhanced=app.history.first;
    require(enhanced.width==128&&enhanced.height==128&&im.decodeImage(await File(enhanced.filePath).readAsBytes())!.width==128,'Enhance scale output');
    require(app.params.width==oldSize[0]&&app.params.height==oldSize[1]&&app.i2i.strength==oldStrength,'Enhance leaked temporary parameters');
    suite.check('enhance','scale-output-valid',{'original':[64,64],'output':[128,128],'temporaryParamsRestored':true,'actualHttp':true});
    final beforeEnhance=submitted();app.workbenchImage=WorkingImage(filePath:source.path,width:2048,height:2048);await app.enhance();
    require(submitted()==beforeEnhance,'Overlarge enhance submitted');
    suite.check('enhance','boundary-invalid',{'overlargeOutputRejectedBeforePost':true,'sourceBytesUnchanged':digest(await source.readAsBytes())==sourceHash});
    await reset();app.enhanceScale=2;final enhanceHistory=app.history.length;
    generationStatus=400;await app.enhance();generationStatus=200;
    await reset();entered=Completer<void>();release=Completer<void>();final cancelEnhance=app.enhance();
    await entered!.future.timeout(const Duration(seconds:30));app.cancelGeneration();release!.complete();await cancelEnhance.timeout(const Duration(seconds:30));entered=null;release=null;
    require(app.history.length==enhanceHistory&&digest(await source.readAsBytes())==sourceHash&&!app.busy,'Enhance error/cancel lost source or created result');
    suite.check('enhance','error-cancel-preserves-source',{'upstream400AndActiveCancel':true,'originalHashUnchanged':true,'historyUnchanged':true});

    await reset();app.params.model='nai-diffusion-4-5-full';
    final chars=GenerateExtras(charCaptions:[CharCaptionItem(prompt:'synthetic one',negativePrompt:'uc one',useCoords:true,x:.2,y:.8),CharCaptionItem(prompt:'synthetic two',negativePrompt:'uc two',useCoords:true,x:.75,y:.25)]);
    await api.generate(syntheticToken,app.settings,app.params,chars);final cp=lastGenerate()['parameters'];
    require(cp['v4_prompt']['caption']['char_captions'].length==2&&cp['v4_prompt']['caption']['char_captions'][0]['centers'][0]['x']==.2&&cp['v4_prompt']['use_coords']==true,'Character centers');
    suite.check('characters','multi-caption-centers',{'characters':2,'explicitCenters':[[.2,.8],[.75,.25]],'realHttp':true});
    require(cp['v4_negative_prompt']['caption']['char_captions'][1]['char_caption']=='uc two'&&cp['v4_prompt']['caption']['char_captions'][0]['char_caption']=='synthetic one','Character negative JSON');
    suite.check('characters','positive-negative-json',{'positive':2,'negative':2,'pairedOrdering':true});
    final tooMany=GenerateExtras(charCaptions:List.generate(9,(i)=>CharCaptionItem(prompt:'character $i')));
    await api.generate(syntheticToken,app.settings,app.params,tooMany);
    require(lastGenerate()['parameters']['v4_prompt']['caption']['char_captions'].length==app.params.maxCharacterPrompts,'Character model cap');
    generationStatus=400;await fails(()=>api.generate(syntheticToken,app.settings,app.params,chars),'Character upstream failure accepted');generationStatus=200;
    require(chars.charCaptions.length==2&&chars.charCaptions.first.negativePrompt=='uc one','Character error mutated input');
    suite.check('characters','model-cap-and-errors',{'modelCap':app.params.maxCharacterPrompts,'upstreamFailureRetainsCharacters':true});

    await reset();require(await app.addVibeImage(source.path)==null,'Vibe file import');
    await api.generate(syntheticToken,app.settings,app.params,app.extras);
    final encoded=wires.where((w)=>w['path'].toString().endsWith('/encode-vibe')).toList();
    require(encoded.isNotEmpty&&encoded.last['body']['model']==app.params.model,'Vibe actual encoding model');
    require(lastGenerate()['parameters']['reference_image_multiple'][0]==base64Encode([7,8,9,10]),'Vibe encoded bytes not sent');
    suite.check('vibe-transfer','file-encoding-model',{'nativeFileImported':true,'model':app.params.model,'actualEncodeHttp':true,'encodedBytesSent':true});
    app.extras.vibeImages=[VibeTransferItem(base64:base64Encode(sourceBytes),strength:.3,infoExtracted:.4),VibeTransferItem(base64:base64Encode(png(64,64,90)),strength:.8,infoExtracted:.9)];
    await api.generate(syntheticToken,app.settings,app.params,app.extras);final multi=lastGenerate()['parameters'];
    require(multi['reference_image_multiple'].length==2&&jsonEncode(multi['reference_strength_multiple'])=='[0.3,0.8]','Multi vibe payload');
    suite.check('vibe-transfer','multi-vibe-request',{'references':2,'strengths':[.3,.8],'informationExtracted':[.4,.9]});
    app.extras.vibeImages=List.generate(16,(_)=>VibeTransferItem(base64:base64Encode(sourceBytes)));
    require(await app.addVibeImage(source.path)!=null&&app.extras.vibeImages.length==16,'Vibe UI cap');
    app.extras.vibeImages.clear();final beforeVibe=submitted();
    await fails(()=>api.generate(syntheticToken,app.settings,app.params.copy()..model='nai-diffusion-5-full',GenerateExtras(vibeImages:[VibeTransferItem(base64:base64Encode(sourceBytes))])),'V5 vibe unsupported accepted');
    require(await app.addVibeImage('${c.root.path}/missing.png')!=null&&submitted()==beforeVibe&&app.extras.vibeImages.isEmpty,'Vibe invalid/clear submitted');
    suite.check('vibe-transfer','clear-invalid-cap',{'cap16':true,'missingFileAndV5Rejected':true,'clearLeavesNoReferences':true});

    await reset();final types=['character','style','character&style'];
    final refs=[for(final type in types)PreciseReferenceItem(base64:base64Encode(sourceBytes),type:type,strength:.7,fidelity:.8)];
    await api.generate(syntheticToken,app.settings,app.params,GenerateExtras(preciseReferences:refs));final pp=lastGenerate()['parameters'];
    require(pp['director_reference_images_cached'].length==3&&parts.last.keys.toSet().containsAll(['director_ref_0','director_ref_1','director_ref_2']),'Precise multipart references missing');
    for(var i=0;i<types.length;i++){require(pp['director_reference_descriptions'][i]['caption']['base_caption']==types[i],'Precise type');require(im.decodeImage(parts.last['director_ref_$i']!)!=null,'Precise preprocessed image invalid');}
    suite.check('precise-reference','types-model-and-count',{'types':types,'multipartImages':3,'preprocessedImagesDecoded':true,'model':app.params.model});
    final baseQuote=calculateImageGenerationAnlas(params:app.params,batchCount:2,forcePaid:true).amount!;
    final prices=<String,int>{};for(final count in [1,2,5]){final quote=calculateImageGenerationAnlas(params:app.params,batchCount:2,preciseReferenceCount:count,forcePaid:true);require(quote.amount==baseQuote+count*2*5,'Precise count/sample cost');prices['$count']=quote.amount!;}
    require(jsonEncode(pp['director_reference_strength_values'])=='[0.7,0.7,0.7]','Precise strength');
    suite.check('precise-reference','multi-ref-cost-payload',{'twoSamplesPrices':prices,'costPerReferencePerSample':5,'multipartAndTypesMatched':true});
    final beforePrecise=wires.length;
    await fails(()=>api.generate(syntheticToken,app.settings,app.params.copy()..model='nai-diffusion-5-full',GenerateExtras(preciseReferences:refs)),'Unsupported precise accepted');
    await fails(()=>api.generate(syntheticToken,app.settings,app.params,GenerateExtras(preciseReferences:refs,vibeImages:[VibeTransferItem(base64:base64Encode(sourceBytes))])),'Mixed references accepted');
    require(wires.length==beforePrecise,'Rejected precise encoded or submitted');
    app.extras.preciseReferences=[refs.first];app.removePreciseReference(0);require(app.extras.preciseReferences.isEmpty,'Precise clear');
    suite.check('precise-reference','clear-invalid-failure',{'unsupportedAndMixedZeroRequests':true,'cleared':true});

    await reset();app.params.model='nai-diffusion-5-full';
    for(final effort in ['high','medium']){app.params.effort=effort;await storage.setParams(app.params);require((await Storage().getParams()).effort==effort,'Effort restore');await api.generate(syntheticToken,app.settings,app.params,GenerateExtras());}
    suite.check('effort','high-medium-and-restore',{'highAndMediumNativePersisted':true,'bothSent':true});
    require(lastGenerate()['model']=='nai-diffusion-5-full-medium'&&lastGenerate()['parameters']['steps']==14,'Medium model/steps');
    app.params.effort='high';await api.generate(syntheticToken,app.settings,app.params,GenerateExtras());
    require(lastGenerate()['model']=='nai-diffusion-5-full'&&lastGenerate()['parameters']['steps']==28,'High model/steps');
    suite.check('effort','model-steps-wire',{'medium':['nai-diffusion-5-full-medium',14],'high':['nai-diffusion-5-full',28],'actualHttp':true});
    final relay=calculateImageGenerationAnlas(params:app.params).asRelayReference('en-US');
    require(relay.referenceOnly&&relay.referenceAmount==relay.amount&&relay.message.toLowerCase().contains('unknown'),'Relay actual billing not unknown');
    suite.check('effort','unknown-price-policy',{'referenceOnly':true,'actualBillingUnknown':true,'notBillingVerification':true});

    // Every user-exposed Director tool is exercised using its actual production
    // path and native persisted result. This is not an upstream-quality check.
    await reset();final names=<String>[];
    for(final tool in directorTools){app.directorTool=tool.value;app.workbenchImage=WorkingImage(filePath:source.path,width:64,height:64);await app.augment();names.add(tool.value);require(wires.last['body']['req_type']==tool.value&&app.history.first.feature=='director-${tool.value}','Director tool omitted');}
    suite.check('postprocess','all-supported-tools',{'tools':names,'nativeResultsPersisted':true});
    app.directorTool='emotion';app.augmentOptions..emotion='happy'..emotionLevel=3..defry=2;app.workbenchImage=WorkingImage(filePath:source.path,width:64,height:64);await app.augment();
    require(wires.last['body']['prompt']=='happy;;3'&&wires.last['body']['defry']==2&&(await Storage().getHistory()).first.feature=='director-emotion','Director integer options');
    suite.check('postprocess','parameters-results-history',{'emotion':'happy;;3','defry':2,'nativeFileAndHistory':true});
    final previous=app.history.length;app.workbenchImage=null;await app.augment();
    require(app.history.length==previous,'No-source Director created result');
    generationStatus=400;app.workbenchImage=WorkingImage(filePath:source.path,width:64,height:64);await app.augment();generationStatus=200;
    require(app.history.length==previous&&digest(await source.readAsBytes())==digest(sourceBytes),'Director failure modified source');
    suite.check('postprocess','invalid-cancel-errors',{'noSourceAnd400NoHistory':true,'originalPreserved':true,'cancelControlNotExposedOrProven':true},complete:false);
    require(serverErrors.isEmpty,'Fixture server failed');
  }finally{if(release!=null&&!release!.isCompleted){release!.complete();}await server.close(force:true);await storage.clearToken();await c.close();}
}
