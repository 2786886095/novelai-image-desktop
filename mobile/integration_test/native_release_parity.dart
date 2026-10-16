// ignore_for_file: avoid_print
// Seven bounded native client scenarios; never a declaration that all 195 pass.
import 'dart:convert';
import 'native_foreground.dart';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:image/image.dart' as im;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/inpaint/inpaint_mask.dart';
import 'package:novelai_mobile/inpaint/focused_inpaint.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/screens/inpaint_mask_editor.dart';
import 'package:novelai_mobile/screens/tools_screen.dart';
import 'package:novelai_mobile/services/background_queue_service.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

const _sha=String.fromEnvironment('FEATURE_SOURCE_SHA',defaultValue:'uncommitted');
const _profile=String.fromEnvironment('FEATURE_PROFILE_SHA',defaultValue:'uncommitted');
final _checks=<Map<String,Object?>>[],_errors=<Object>[];
void _assert(bool value,String message){if(!value)throw StateError(message);}
void _checked(String feature,String scenario,Map<String,Object?> observed){
 final record=<String,Object?>{'sourceSha':_sha,'profileSha':_profile,'platform':Platform.operatingSystem,'feature':feature,'scenario':scenario,'journey':scenario,'kind':'device','status':'passed','acceptanceLevel':feature=='inpaint'?'scenario':'component','scope':'bounded client-scenario, not full-feature certification','mockOnly':false,'paidCalls':0,'observed':observed};
 _checks.add(record);print('FEATURE_ACCEPTANCE_CHECK:${jsonEncode(record)}');
}
Uint8List _png(int width,int height,int red)=>Uint8List.fromList(im.encodePng(im.Image(width:width,height:height,numChannels:4)..clear(im.ColorRgba8(red,40,50,255))));
Element? _element(Key key){Element? found;void visit(Element e){if(e.widget.key==key){found=e;}else{e.visitChildren(visit);}}WidgetsBinding.instance.rootElement?.visitChildren(visit);return found;}
Future<void> _frame()async{await Future<void>.delayed(const Duration(milliseconds:30));WidgetsBinding.instance.scheduleFrame();await WidgetsBinding.instance.endOfFrame;}
Map<String,dynamic> _wire(List<int> bytes,String contentType){
 if(!contentType.startsWith('multipart/'))return jsonDecode(utf8.decode(bytes)) as Map<String,dynamic>;
 final b=RegExp(r'boundary="?([^";]+)').firstMatch(contentType)!.group(1)!;
 for(final part in latin1.decode(bytes).split('--$b')){final cut=part.indexOf('\r\n\r\n');if(cut<0)continue;if(RegExp(r'name="request"').hasMatch(part.substring(0,cut)))return jsonDecode(part.substring(cut+4).replaceFirst(RegExp(r'\r\n$'),'')) as Map<String,dynamic>;}
 throw const FormatException('Fixture multipart has no request');
}
Future<void> main()async{
 WidgetsFlutterBinding.ensureInitialized();
 ui.PlatformDispatcher.instance.onError=(error,stack){_errors.add(error);print('FEATURE_NATIVE_ASYNC_ERROR:$error\n$stack');return true;};
 FlutterError.onError=(details){_errors.add(details.exception);FlutterError.presentError(details);};
 try{
  _assert(Platform.isAndroid||Platform.isIOS,'Requires native Android/iOS');
  _assert(const bool.fromEnvironment('FEATURE_ISOLATED_DEVICE'),'Disposable device flag required');
  _assert(RegExp(r'^[a-f0-9]{40}$').hasMatch(_sha),'Source SHA required');
  _assert(RegExp(r'^[a-f0-9]{64}$').hasMatch(_profile),'Profile SHA required');
  if(Platform.isAndroid)FlutterForegroundTask.initCommunicationPort();BackgroundQueueService.initialize();
  await nativeForegroundBarrier();
  await _run();_assert(_checks.length==7&&_errors.isEmpty,'Incomplete scenarios or native async error');
  print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha':_sha,'profileSha':_profile,'exitStatus':0,'checks':_checks.length,'platform':Platform.operatingSystem,'paidCalls':0})}');
 }catch(error,stack){print('FEATURE_ACCEPTANCE_FAILURE:$error\n$stack');print('FEATURE_ACCEPTANCE_DONE:${jsonEncode({'sourceSha':_sha,'profileSha':_profile,'exitStatus':1,'checks':_checks.length,'platform':Platform.operatingSystem,'paidCalls':0})}');}
}
Future<void> _run()async{
 await (await SharedPreferences.getInstance()).clear();
 final docs=await UnifiedStorage.documents(),root=await Directory(docs.path).createTemp('release-parity-native-');
 final sourceBytes=_png(3840,2160,30),generated=_png(1024,1024,230),sourceFile=File('${root.path}/source.png');await sourceFile.writeAsBytes(sourceBytes);
 final source=WorkingImage(filePath:sourceFile.path,width:3840,height:2160),storage=Storage(),api=NaiApi();
 final wires=<Map<String,dynamic>>[];var chatCount=0;
 dynamic chat={'content':'A woman stands beside a window.'};
 final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
 server.listen((r)async{
  try{
   _assert(r.connectionInfo!.remoteAddress.isLoopback,'No public fixture traffic');
   final bytes=await r.fold<BytesBuilder>(BytesBuilder(),(b,v)=>b..add(v)).then((b)=>b.takeBytes());
   if(r.uri.path.endsWith('/chat/completions')){chatCount++;final body=jsonDecode(utf8.decode(bytes));_assert(!body.containsKey('response_format'),'Unsupported fixture provider was forced to accept JSON mode');r.response.headers.contentType=ContentType.json;r.response.write(jsonEncode({'choices':[{'message':chat,'finish_reason':'stop'}]}));}
   else if(r.uri.path.endsWith('/user/data')){r.response.headers.contentType=ContentType.json;r.response.write(jsonEncode({'subscription':{'tier':1,'active':true,'trainingStepsLeft':{'fixedTrainingStepsLeft':100000,'purchasedTrainingSteps':0}}}));}
   else if(r.uri.path.endsWith('/request-price')){r.response.headers.contentType=ContentType.json;r.response.write('{"price":20}');}
   else if(r.uri.path.endsWith('/generate-image')){wires.add(_wire(bytes,r.headers.contentType.toString()));r.response.add(generated);}
   else{throw StateError('Unexpected fixture endpoint ${r.uri.path}');}await r.response.close();
  }catch(error,stack){_errors.add(error);print('FEATURE_FIXTURE_ERROR:$error\n$stack');r.response.statusCode=500;await r.response.close();}
 });
 final base='http://127.0.0.1:${server.port}';
 final app=AppState(api:api,storage:storage)..settings=AppSettings(imageBaseUrl:base,apiBaseUrl:base,visionApiUrl:base,visionApiModel:'fixture',allowCustomEndpoint:true,allowCustomEndpointFallback:false,proxyMode:'direct',saveToGallery:false,streamPreviewEnabled:false,imageOutputDir:root.path,reverseConvertDshEnabled:false,promptCodexEnhanceEnabled:false,promptRuleAutoRepairEnabled:false,reversePromptSkillVersion:'1.0.0',reversePromptTemplates:{'natural':'Neutral natural caption'})..params=GenerateParams(width:1024,height:1024,seed:42,seedMode:'fixed')..workbenchImage=source..i2iOriginalImage=source..inpaintSourceMode='latest';
 await storage.setSettings(app.settings);
 try{
  await storage.setToken('FIXTURE_ONLY_NOT_A_USER_TOKEN');await storage.setVisionKey('FIXTURE_ONLY_NOT_A_USER_KEY');
  final strokes=[InpaintStroke(brushCells:16,points:[const Offset(.37,.42),const Offset(.39,.44)])];
  final mask=await renderInpaintMask(strokes:strokes,width:3840,height:2160,inverted:false);final decodedMask=im.decodePng(mask)!;
  final selectedMaskPixel=decodedMask.getPixel(1420,907),unselectedMaskPixel=decodedMask.getPixel(0,0);
  print('FEATURE_FIXTURE_MASK_PIXELS:${jsonEncode({'sourceSize':[decodedMask.width,decodedMask.height],'selectedRgba':[selectedMaskPixel.r,selectedMaskPixel.g,selectedMaskPixel.b,selectedMaskPixel.a],'unselectedRgba':[unselectedMaskPixel.r,unselectedMaskPixel.g,unselectedMaskPixel.b,unselectedMaskPixel.a]})}');
  _assert(decodedMask.width==3840&&decodedMask.height==2160&&selectedMaskPixel.r==255&&selectedMaskPixel.g==255&&selectedMaskPixel.b==255&&selectedMaskPixel.a==255&&unselectedMaskPixel.r==0&&unselectedMaskPixel.g==0&&unselectedMaskPixel.b==0&&unselectedMaskPixel.a==255,'Mask source pixels changed');
  // Actual rendered editor, real pointer events, not a helper-only cap assertion.
  runApp(MaterialApp(home:InpaintMaskEditor(image:source,language:'en-US')));await _frame();await _frame();
  final toggle=_element(const ValueKey('select-inpaint-region'))!;(toggle.widget as IconButton).onPressed!();await _frame();
  final box=_element(const ValueKey('inpaint-mask-canvas'))!.findRenderObject()! as RenderBox;
  final p=box.localToGlobal(const Offset(2,2)),q=box.localToGlobal(Offset(box.size.width-2,box.size.height-2));
  GestureBinding.instance.handlePointerEvent(PointerDownEvent(pointer:27,position:p));GestureBinding.instance.handlePointerEvent(PointerMoveEvent(pointer:27,position:q,delta:q-p));GestureBinding.instance.handlePointerEvent(PointerUpEvent(pointer:27,position:q));await _frame();
  final overlay=_element(const ValueKey('focused-inpaint-region'));_assert(overlay!=null,'Selection overlay absent');
  final size=overlay!.findRenderObject()! as RenderBox;final area=size.size.width/box.size.width*3840*size.size.height/box.size.height*2160;
  _assert(area<=focusedSelectionMaxPixels+1,'Rendered selection exceeds source-pixel cap');
  _checked('inpaint','mask-source-pixel-preservation',{'source':[3840,2160],'maskSha256':sha256.convert(mask).toString(),'renderedSelectionPixels':area,'actualPointerEvents':true});
  app.setInpaintEditorData(strokes,false);app.setInpaintRegion((x:1024,y:512,width:768,height:768));
  final quoteSize=(app.inpaintOutputParams.width,app.inpaintOutputParams.height);await app.inpaint(mask);
  _assert(wires.length==1,'Expected exactly one synthetic infill request');final parameters=wires.single['parameters'] as Map;
  _assert(parameters['width']==quoteSize.$1&&parameters['height']==quoteSize.$2&&quoteSize.$1*quoteSize.$2<=1048576,'Work request differs from quote');
  final result=app.history.single,output=im.decodePng(await File(result.filePath).readAsBytes())!;
  _assert(output.width==3840&&output.height==2160&&output.getPixel(0,0).r==30&&output.getPixel(1420,907).r>200,'Original canvas exterior was resized or changed');
  _checked('inpaint','focused4k-work-pasteback',{'work':[parameters['width'],parameters['height']],'output':[output.width,output.height],'outsideRed':output.getPixel(0,0).r.toInt(),'generationRequests':1});
  final savedHistory=app.history.length;
  runApp(ChangeNotifierProvider.value(value:app,child:const MaterialApp(home:ToolsScreen(kind:ToolPageKind.inpaint))));await _frame();await _frame();
  final button=_element(const ValueKey('inpaint-return-edit'));_assert(button!=null,'Return-edit toolbar button absent');(button!.widget as OutlinedButton).onPressed!();
  for(var i=0;i<200&&app.isRestoringInpaintEditSession;i++){await Future<void>.delayed(const Duration(milliseconds:20));}await _frame();
  _assert(app.workbenchImage?.filePath==sourceFile.path&&app.inpaintRegion==(x:1024,y:512,width:768,height:768),'Original source/ROI was not restored');
  final restored=await renderInpaintMask(strokes:app.inpaintEditorStrokes,width:3840,height:2160,inverted:app.inpaintEditorInverted);
  _assert(sha256.convert(mask).toString()==sha256.convert(restored).toString()&&app.history.length==savedHistory,'Mask changed or result history disappeared');
  _checked('inpaint','restore-before-image-mask-roi',{'maskBytesEqual':true,'roi':[1024,512,768,768],'historyPreserved':true,'actualToolbarCallback':true});
  final before=wires.length;var rejected=false;try{await api.inpaint('FIXTURE_ONLY_NOT_A_USER_TOKEN',app.settings,app.params,sourceBytes,mask,app.inpaintModel,3840,2160,1,0,region:(x:0,y:0,width:1600,height:900));}catch(_){rejected=true;}
  _assert(rejected&&wires.length==before,'Invalid ROI was submitted');_checked('inpaint','invalid-roi-no-submit',{'requestDelta':wires.length-before,'rejected':true});
  Future<AiTextResult> reverse(String mode)=>api.reversePrompt(settings:app.settings,apiKey:'FIXTURE_ONLY_NOT_A_USER_KEY',image:sourceBytes,mode:mode=='tags'?ReversePromptMode.tags:ReversePromptMode.natural,scope:ReversePromptScope.full,hint:'',knownCharacter:false,systemTemplate:mode=='tags'?'计数口径：1–3 个有效 Tag':'Neutral natural caption');
  app.settings.reversePromptTemplates={'tags':'计数口径：1–3 个有效 Tag','natural':'Neutral natural caption'};
  chat={'content':'```json\n${jsonEncode({'segments':[{'units':[{'kind':'tag','text':'Text: "Sorry, Mom"'}]}]})}\n```'};
  final jsonResult=await reverse('tags');_assert(jsonResult.ok&&jsonResult.text=='Text: "Sorry, Mom"','JSON fence or literal punctuation was corrupted');_checked('reverse','raw-json-transport',{'literalPreserved':true,'ok':true});
  final count=chatCount;chat={'content':'','refusal':'PRIVATE_FIXTURE_REFUSAL'};final typed=await reverse('natural');chat={'content':"I'm sorry, but I can't assist with this request. I can describe non-sensitive elements instead."};final plain=await reverse('natural');
  _assert(!typed.ok&&!plain.ok&&chatCount-count==2,'Typed/untyped refusal was accepted or retried');_checked('reverse','typed-and-opening-refusal',{'responses':2,'requestDelta':2,'ok':[typed.ok,plain.ok]});
  app.reverseMode=ReversePromptMode.natural;app.reverseResult='prior usable prompt';app.reversePromptVariants=const PromptVariants(namePrompt:'prior name',featurePrompt:'prior features');final oldHistory=app.reverseHistory.length;await app.reversePrompt();
  _assert(app.reverseResult=='prior usable prompt'&&app.reversePromptVariants?.namePrompt=='prior name'&&app.reverseHistory.length==oldHistory,'Refusal erased last usable result');_checked('reverse','preserve-last-usable-result',{'textRetained':true,'variantsRetained':true,'historyUnchanged':true});
 }finally{app.dispose();await server.close(force:true);await storage.clearToken();await storage.setVisionKey('');}
}
