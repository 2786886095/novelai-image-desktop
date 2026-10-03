import 'package:http/testing.dart';
import 'package:novelai_mobile/services/novelai_image_envelope.dart';
import 'package:http/http.dart' as http;
import 'package:novelai_mobile/agent/agent_provider.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:image/image.dart' as image;
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/image_provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _Paths extends PathProviderPlatform {
  final String root;
  _Paths(this.root);
  @override
  Future<String?> getApplicationDocumentsPath() async => root;
  @override
  Future<String?> getTemporaryPath() async => root;
}

class _Vault extends Storage {
  int nativeReads = 0;
  Completer<void>? pauseWorkspace;
  Completer<void>? workspaceEntered;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace workspace) async {
    final pause=pauseWorkspace;pauseWorkspace=null;
    if(pause!=null){workspaceEntered?.complete();await pause.future;}
    return super.setAgentWorkspace(workspace);
  }

  bool failHistory = false;
  @override
  Future<String?> getToken() async {
    nativeReads++;
    return super.getToken();
  }

  @override
  Future<String?> getConvertKey() async => 'fixture-conversion-only';
  @override
  Future<void> writeHistory(List<HistoryItem> items) async {
    if (failHistory) throw StateError('fixture history failure');
    return super.writeHistory(items);
  }
}

class _Conversion extends NaiApi {
 @override Future<void> verifyCompatibleNovelAi(AppSettings s,Map<String,dynamic> c,String key)=>fixtureVerifyEnvelope(s,c,key);
  int calls = 0;
  FutureOr<void> Function()? duringConversion;
  @override
  Future<AiTextResult> convertPrompt(
      {required AppSettings settings,
      required String apiKey,
      required String text,
      required ReversePromptMode mode,
      required bool knownCharacter,
      required String systemTemplate}) async {
    calls++;
    await duringConversion?.call();
    return const AiTextResult(
        ok: true,
        message: 'fixture converted',
        text: 'A forest with a winding path.');
  }
}

class _LegacyProvider extends AgentProviderClient {
  final bool scene;
  final void Function()? duringChat;
  _LegacyProvider(this.scene,{this.duringChat});
  @override
  Future<AgentProviderTurn> complete({required AppSettings settings,required String apiKey,required List<Map<String,dynamic>> messages,required List<Map<String,dynamic>> tools,required void Function(String) onDelta,bool toolsEnabled=true,Map<String,dynamic>? generationConfig})async{
    duringChat?.call();
    final input=scene?{'scene':jsonDecode(File('../shared/tavern-scene-fixtures.json').readAsStringSync())['scene']}:{'positivePrompt':'A forest'};
    return AgentProviderTurn(content:'<langbai-image>${jsonEncode(input)}</langbai-image>',usage:AgentTokenUsage());
  }
}

Future<void> fixtureVerifyEnvelope(AppSettings settings,Map<String,dynamic> config,String key) async {
 final client=MockClient((request)async {if(request.method!='GET'||!request.url.path.endsWith('/models'))throw StateError('Not readonly');return http.Response(jsonEncode({'data':[{'id':config['model']}]}),200);});
 try {await verifyNovelAiImageEnvelope(client,config,key);}finally{client.close();}
}
class _VerifiedFixtureApi extends NaiApi {@override Future<void> verifyCompatibleNovelAi(AppSettings s,Map<String,dynamic> c,String key)=>fixtureVerifyEnvelope(s,c,key);}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  late _Vault storage;
  late _Conversion conversion;
  late AppState app;
  late AgentToolExecutor tools;
  LocalAgentBridge? bridge;
  late HttpClient client;
  var sequence = 0;
  final servers = <HttpServer>[];
  const key = 'fixture-agent-image-key';
  final png = image.encodePng(image.Image(width: 8, height: 6));
  Future<String> serve(FutureOr<void> Function(HttpRequest) handler) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    servers.add(server);
    server.listen(handler);
    return 'http://127.0.0.1:${server.port}/v1';
  }

  Future<void> configure(String url) => app.saveCompatibleSettings({
        'baseUrl': url,
        'model': 'nai-diffusion-5-full',
        'size': 'auto',
        'responseFormat': 'auto'
      }, key);
  Future<void> startBridge() async {
    bridge = LocalAgentBridge(
        journal: Directory('${root.path}/journal'),
        prepareImage: (tool, args, session) =>
            tools.prepareImageOperation(tool, args, [], sessionId: session),
        authorizeImage: tools.sessions.authorize,
        cancelImages: tools.sessions.close,
        executeScoped: (tool, args, session) =>
            tools.execute(tool, args, [], sessionId: session),
        execute: (tool, args) => tools.execute(tool, args, []));
    await bridge!.start();
  }

  Future<Map<String, dynamic>> call(String tool,
      [Map<String, dynamic> args = const {}, String? id]) async {
    final request = await client.postUrl(Uri.parse('${bridge!.url}/v1/tool'));
    request.headers.set('Authorization', 'Bearer ${bridge!.token}');
    request.write(jsonEncode({
      'tool': tool,
      'args': args,
      'sessionId': 'fixture-session',
      'callId': id ?? 'call-${++sequence}',
      'imageProviderBinding': {'provider': 'novelai', 'revision': 'forged'}
    }));
    final response = await request.close();
    expect(response.statusCode, 200);
    return jsonDecode(await utf8.decoder.bind(response).join())
        as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> approval() async {
    for (var i = 0; i < 100; i++) {
      final result = await call('studio_image_approval');
      if (result['data'] is Map) {
        return Map<String, dynamic>.from(result['data']);
      }
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    throw StateError('Missing approval');
  }

  setUp(() async {
    HttpOverrides.global = null;
    root = Directory.systemTemp.createTempSync('issue32-agent-mobile-');
    PathProviderPlatform.instance = _Paths(root.path);
    UnifiedStorage.active = null;
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    storage = _Vault();
    conversion = _Conversion();
    bridge = null;
    sequence = 0;
    client = HttpClient();
    app = AppState(
        storage: storage, api: conversion, preloadCompletedImage: (_) async {})
      ..settings = AppSettings(proxyMode: 'direct', saveToGallery: false);
    app.promptTemplates = await PromptTemplateLibrary.load();
    app.settings.agentPromptTemplateMode = 'natural';
    app.settings.convertPromptTemplates = {'natural': 'QA template: {{input}}'};
    await storage.setSettings(app.settings);
    tools = AgentToolExecutor(
        app: app,
        listMemories: () => [],
        upsertMemory: (_) async => {},
        deleteMemory: (_) async => false);
  });
  tearDown(() async {
    await bridge?.close();
    client.close(force: true);
    tools.sessions.close();
    app.dispose();
    for (final server in servers) {
      await server.close(force: true);
    }
    servers.clear();
    if (root.parent.absolute.path != Directory.systemTemp.absolute.path ||
        !root.uri.pathSegments
            .any((s) => s.startsWith('issue32-agent-mobile-'))) {
      throw StateError('Unexpected fixture path');
    }
    await root.delete(recursive: true);
  });
  test(
      'Agent state reports selected compatible model and capabilities instead of native defaults',
      () async {
    await configure('https://fixture.invalid/v1');
    final result = await tools.execute('langbai_get_generation_state', {}, []);
    final state = jsonDecode(result.output);
    expect(state['imageProvider'], 'openai-images');
    expect(state['params']['model'], 'nai-diffusion-5-full');
    expect(state['referenceCapabilities']['maxCharacterPrompts'], 0);
    expect(result.output, isNot(contains(key)));
  });
  test(
      'Agent preserves partial outputs but does not claim full success or submit again',
      () async {
    var posts = 0;
    await configure(await serve((request) async {
      posts++;
      expect(request.headers.value('authorization'), 'Bearer $key');
      await request.drain<void>();
      request.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(png)},
          {'b64_json': 'invalid'}
        ]
      }));
      await request.response.close();
    }));
    final result = await tools.execute(
        'langbai_generate_image', {'positivePrompt': 'forest', 'count': 2}, []);
    expect(result.ok, false);
    expect(result.generatedImages, hasLength(1));
    expect(posts, 1);
    expect(await File(result.generatedImages.single.filePath).exists(), true);
  });
  test(
      'actual bridge default-auto workflow sends one POST with exact converted prompt, keeps drafts, and replays after restart',
      () async {
    var posts = 0;
    await configure(await serve((request) async {
      posts++;
      expect(request.headers.value('authorization'), 'Bearer $key');
      final body = jsonDecode(await utf8.decoder.bind(request).join());
      expect(body, {
        'model': 'nai-diffusion-5-full',
        'prompt': 'A forest with a winding path.',
        'size': 'auto',
        'n': 2
      });
      request.response.write(jsonEncode({
        'data': List.generate(2, (_) => {'b64_json': base64Encode(png)})
      }));
      await request.response.close();
    }));
    app.params.positivePrompt = 'user draft';
    app.batchCount = 5;
    await startBridge();
    const input = {
      'text': 'forest',
      'generate': {'count': 2}
    };
    final result =
        await call('studio_generate_from_description', input, 'once');
    expect(result['ok'], true);
    expect(result['generatedImages'], hasLength(2));
    expect(posts, 1);
    expect(conversion.calls, 1);
    expect((await call('studio_image_approval'))['data'], isNull);
    expect(app.params.positivePrompt, 'user draft');
    expect(app.batchCount, 5);
    expect(storage.nativeReads, 0);
    expect(
        await call('studio_generate_from_description', input, 'once'), result);
    await bridge!.close();
    await startBridge();
    expect(
        await call('studio_generate_from_description', input, 'once'), result);
    expect(posts, 1);
    expect(conversion.calls, 1);
    await for (final file in Directory('${root.path}/journal').list()) {
      final text = await (file as File).readAsString();
      expect(text, isNot(contains(key)));
      expect(text, isNot(contains('forged')));
    }
  });
  test(
      'one confirmation displays the selected service and cancellation invokes neither conversion nor generation',
      () async {
    var posts = 0;
    await configure(await serve((_) {
      posts++;
    }));
    await startBridge();
    await call('studio_generation_policy', {'mode': 'confirm'});
    final pending = call('studio_generate_from_description', {
      'text': 'cancel',
      'generate': {'count': 1}
    });
    final card = await approval();
    expect(card['parameters']['imageService']['model'], 'nai-diffusion-5-full');
    expect(jsonEncode(card), isNot(contains(key)));
    await call(
        'studio_resolve_image_approval', {'id': card['id'], 'approved': false});
    expect((await pending)['ok'], false);
    expect(posts, 0);
    expect(conversion.calls, 0);
  });
  test(
      'one accepted workflow confirmation covers conversion and URL image retrieval without sending GET credentials',
      () async {
    var posts = 0, gets = 0;
    late String url;
    url = await serve((request) async {
      if (request.method == 'GET') {
        gets++;
        expect(request.headers.value('authorization'), isNull);
        request.response.add(png);
        await request.response.close();
        return;
      }
      posts++;
      await request.drain<void>();
      request.response.write(jsonEncode({
        'data': [
          {'url': '${url.replaceFirst('/v1', '')}/image'}
        ]
      }));
      await request.response.close();
    });
    await configure(url);
    await startBridge();
    await call('studio_generation_policy', {'mode': 'confirm'});
    final pending = call('studio_generate_from_description', {
      'text': 'approve',
      'generate': {'count': 1}
    });
    final card = await approval();
    expect(posts, 0);
    expect(conversion.calls, 0);
    await call(
        'studio_resolve_image_approval', {'id': card['id'], 'approved': true});
    final result = await pending;
    expect(result['ok'], true);
    expect(result['generatedImages'], hasLength(1));
    expect(posts, 1);
    expect(gets, 1);
    expect(conversion.calls, 1);
    expect((await call('studio_image_approval'))['data'], isNull);
    expect(app.history.first.width, 8);
    expect(app.history.first.height, 6);
    expect(app.history.first.seed, -1);
  });
  for (final field in ['key', 'provider', 'model', 'output', 'proxy']) {
    test(
        '$field change while confirmation is pending invalidates the old operation without a billed POST',
        () async {
      var posts = 0;
      final url = await serve((_) {
        posts++;
      });
      await configure(url);
      await startBridge();
      await call('studio_generation_policy', {'mode': 'confirm'});
      final pending = call('studio_generate_from_description', {
        'text': 'change',
        'generate': {'count': 1}
      });
      final card = await approval();
      if (field == 'key') {
        await app.saveCompatibleSettings(
            Map.of(app.settings.compatibleImage), 'fixture-other-key');
      }
      if (field == 'provider') app.settings.imageProvider = 'novelai';
      if (field == 'model') app.settings.compatibleImage['model'] = 'changed';
      if (field == 'output') app.settings.imageOutputDir = '${root.path}/other';
      if (field == 'proxy') app.settings.proxyMode = 'auto';
      await call('studio_resolve_image_approval',
          {'id': card['id'], 'approved': true});
      final result = await pending;
      expect(result['ok'], false);
      expect(result['output'], contains('配置已变化'));
      expect(posts, 0);
      expect(conversion.calls, 0);
      expect(storage.nativeReads, 0);
    });
  }
  test('a provider change during conversion stops before generation', () async {
    var posts = 0;
    await configure(await serve((_) {
      posts++;
    }));
    await startBridge();
    conversion.duringConversion = () {
      app.settings.imageProvider = 'novelai';
    };
    final result = await call('studio_generate_from_description', {
      'text': 'change',
      'generate': {'count': 1}
    });
    expect(result['ok'], false);
    expect(posts, 0);
    expect(conversion.calls, 1);
    expect(storage.nativeReads, 0);
  });
  test(
      'in-flight generation uses its bound request and does not restore over concurrent user edits',
      () async {
    final received = Completer<void>(), release = Completer<void>();
    await configure(await serve((request) async {
      final body = jsonDecode(await utf8.decoder.bind(request).join());
      expect(body['prompt'], 'agent prompt');
      received.complete();
      await release.future;
      request.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(png)}
        ]
      }));
      await request.response.close();
    }));
    final oldRoot = '${root.path}/original';
    app.settings.imageOutputDir = oldRoot;
    final task = tools.execute(
        'langbai_generate_image', {'positivePrompt': 'agent prompt'}, [],
        sessionId: 'session');
    await received.future;
    app.params.positivePrompt = 'new user draft';
    app.batchCount = 6;
    await configure('https://different.invalid/v1');
    app.settings.imageOutputDir = '${root.path}/new';
    release.complete();
    final result = await task;
    expect(result.ok, true);
    expect(result.generatedImages.single.filePath.replaceAll('\\', '/'),
        startsWith(oldRoot.replaceAll('\\', '/')));
    expect(app.params.positivePrompt, 'new user draft');
    expect(app.batchCount, 6);
  });
  test('session stop aborts a pending POST and never falls back or repeats',
      () async {
    var posts = 0;
    final received = Completer<void>();
    await configure(await serve((_) {
      posts++;
      received.complete();
    }));
    await startBridge();
    final task = call('langbai_generate_image', {'positivePrompt': 'stop'});
    await received.future;
    await call('studio_stop_generation');
    final result = await task;
    expect(result['ok'], false);
    expect(posts, 1);
    expect(app.busy, false);
    expect(storage.nativeReads, 0);
  });
  test(
      'bridge shutdown cancels running images before waiting for journal completion',
      () async {
    final received = Completer<void>();
    await configure(await serve((_) {
      received.complete();
    }));
    await startBridge();
    final task = call('langbai_generate_image', {'positivePrompt': 'close'})
        .catchError((Object _) => <String, dynamic>{});
    await received.future;
    await bridge!.close().timeout(const Duration(seconds: 3));
    await task;
    expect(app.busy, false);
  });
  test('HTTP 429 does not expose provider body or resubmit', () async {
    var posts = 0;
    await configure(await serve((request) async {
      posts++;
      request.response.statusCode = 429;
      request.response.write(key);
      await request.response.close();
    }));
    final result = await tools
        .execute('langbai_generate_image', {'positivePrompt': 'error'}, []);
    expect(result.ok, false);
    expect(result.output, contains('429'));
    expect(result.output, isNot(contains(key)));
    expect(posts, 1);
  });
  test(
      'failed paid results are durably replayed after bridge restart without trying another provider',
      () async {
    var posts = 0;
    await configure(await serve((request) async {
      posts++;
      request.response.statusCode = 429;
      request.response.write(key);
      await request.response.close();
    }));
    await startBridge();
    const input = {'positivePrompt': 'failed once'};
    final first = await call('langbai_generate_image', input, 'failed-once');
    expect(first['ok'], false);
    await bridge!.close();
    await startBridge();
    expect(await call('langbai_generate_image', input, 'failed-once'), first);
    expect(posts, 1);
    expect(storage.nativeReads, 0);
  });
  test(
      'a failed history write preserves the durable image receipt and reports failure',
      () async {
    await configure(await serve((request) async {
      await request.drain<void>();
      request.response.write(jsonEncode({
        'data': [
          {'b64_json': base64Encode(png)}
        ]
      }));
      await request.response.close();
    }));
    storage.failHistory = true;
    final result = await tools
        .execute('langbai_generate_image', {'positivePrompt': 'retain'}, []);
    expect(result.ok, false);
    expect(result.generatedImages, hasLength(1));
    expect(await File(result.generatedImages.single.filePath).exists(), true);
  });
  test(
      'missing secure key is not advertised as configured and fails before confirmation or conversion',
      () async {
    await configure('https://fixture.invalid/v1');
    FlutterSecureStorage.setMockInitialValues({});
    final state = await tools.execute('langbai_get_generation_state', {}, []);
    expect(jsonDecode(state.output)['imageService']['credentialConfigured'],
        false);
    await startBridge();
    final result = await call('studio_generate_from_description', {
      'text': 'missing',
      'generate': {'count': 1}
    });
    expect(result['ok'], false);
    expect(conversion.calls, 0);
    expect((await call('studio_image_approval'))['data'], isNull);
  });
  test(
      'native-only tools and arguments are rejected, while unrelated appearance does not invalidate a binding',
      () async {
    await configure('https://fixture.invalid/v1');
    final binding = AgentImageBinding(app.settings, app.generationGroupId);
    app.settings.theme = 'dark';
    expect(() => binding.ensureCurrent(app.settings, app.generationGroupId),
        returnsNormally);
    for (final tool in [
      'langbai_redraw_image',
      'langbai_inpaint_image',
      'langbai_upscale_image',
      'langbai_director'
    ]) {
      final result = await tools.execute(tool, {}, []);
      expect(result.ok, false);
      expect(result.output, contains('没有切换到 NovelAI'));
    }
    for (final extra in [
      {'width': 512},
      {'model': 'nai-diffusion-5-full'},
      {'count': '2'},
      {'count': 9},
      {'apiKey': 'model-key'},
      {'stylePrompt': 'native'}
    ]) {
      final result = await tools.execute('langbai_generate_image',
          {'positivePrompt': 'invalid', ...extra}, []);
      expect(result.ok, false);
    }
    expect(storage.nativeReads, 0);
  });

  Future<(AgentController, AgentMessage)> legacyProposal({bool scene=false, int count=1}) async {
    final controller=AgentController(app:app);addTearDown(controller.dispose);
    await controller.load();
    controller.activeCharacter!.visual..stylePrompt='watercolor'..negativePrompt='text';
    final proposal=TavernImageProposal(positivePrompt:'A forest',model:'nai-diffusion-5-full',width:832,height:1216,steps:28,scale:5.5,sampler:'k_euler',count:count,
      scene:scene?Map<String,dynamic>.from(jsonDecode(File('../shared/tavern-scene-fixtures.json').readAsStringSync())['scene']):null);
    final message=AgentMessage(id:'legacy-image',role:'assistant',imageProposal:proposal);
    controller.selectedConversation!.messages.add(message);
    return (controller,message);
  }
  for(final scene in [false,true]) {test('legacy compatible controller routes a real request: $scene',()async{
    final requests=<Map<String,dynamic>>[];
    final url=await serve((r)async{requests.add(jsonDecode(await utf8.decoder.bind(r).join()));
      r.response.write(jsonEncode({'data':[{'b64_json':base64Encode(png)}]}));await r.response.close();});
    await configure(url);
    final (controller,message)=await legacyProposal(scene:scene);
    final canonical=jsonEncode(message.imageProposal!.scene);
    await controller.generateTavernImage(message.id);
    expect(message.imageProposal!.status,'complete',reason:message.imageProposal!.error);
    expect(requests,hasLength(1));final body=requests.single;
    expect(body.keys.toSet(),{'model','prompt','size','n'});
    expect(body['model'],'nai-diffusion-5-full');expect(body['size'],'auto');
    expect(body['prompt'],endsWith('Visual style: watercolor\nAvoid: text'));
    if(scene){expect(body['prompt'],contains('Wearing coat, red, leather.'));expect(body['prompt'],contains('Wearing jacket, blue.'));}
    expect(message.imageProposal!.positivePrompt,'A forest');expect(jsonEncode(message.imageProposal!.scene),canonical);
    expect(storage.nativeReads,0);expect(message.tools.single.generatedImages,hasLength(1));
    expect(File(message.tools.single.generatedImages.single.filePath).existsSync(),true);
  });}
  test('legacy compatible partial result retains image without retry',()async{
    var posts=0;await configure(await serve((r)async{posts++;r.response.write(jsonEncode({'data':[{'b64_json':base64Encode(png)},{'b64_json':'broken'}]}));await r.response.close();}));
    final(controller,message)=await legacyProposal(count:2);await controller.generateTavernImage(message.id);
    expect(message.imageProposal!.status,'error');expect(message.tools.single.generatedImages,hasLength(1));expect(posts,1);expect(storage.nativeReads,0);
  });
  test('legacy provider change during persistence rejects before POST or native fallback',()async{
    var posts=0;await configure(await serve((r)async{posts++;r.response.statusCode=500;await r.response.close();}));
    final(controller,message)=await legacyProposal();
    final pause=Completer<void>();storage.pauseWorkspace=pause;storage.workspaceEntered=Completer<void>();
    final pending=controller.generateTavernImage(message.id);await storage.workspaceEntered!.future;
    await controller.generateTavernImage(message.id); // duplicate stays blocked while persisting
    app.settings.imageProvider='novelai';pause.complete();await pending;
    expect(message.imageProposal!.status,'error');expect(message.imageProposal!.error,contains('配置已变化'));expect(posts,0);expect(storage.nativeReads,0);
  });

  for(final scene in [false,true]) {
    test('legacy automatic compatible controller submits once: $scene',()async{
      var posts=0;await configure(await serve((r)async{posts++;r.response.write(jsonEncode({'data':[{'b64_json':base64Encode(png)}]}));await r.response.close();}));
      app.settings..agentApiBaseUrl='https://chat.invalid/v1'..agentApiModel='chat-fixture'..agentAutoCompact=false;
      await storage.setAgentApiKey('fixture-chat-key');
      final controller=AgentController(app:app,provider:_LegacyProvider(scene));addTearDown(controller.dispose);await controller.load();
      await controller.updateActiveCharacterVisual(model:'nai-diffusion-5-full',stylePrompt:'',negativePrompt:'',count:1);
      await controller.setGenerationMode('auto');await controller.send(scene?'Draw two adult hikers':'Draw an empty forest');
      final message=controller.selectedConversation!.messages.last;
      expect(message.imageProposal!.status,'complete',reason:message.imageProposal!.error);expect(posts,1);expect(message.tools.single.generatedImages,hasLength(1));expect(storage.nativeReads,0);
    });
  }

  test('legacy auto provider changed during chat submits neither service',()async{
    var posts=0;await configure(await serve((r)async{posts++;r.response.statusCode=500;await r.response.close();}));
    app.settings..agentApiBaseUrl='https://chat.invalid/v1'..agentApiModel='chat-fixture'..agentAutoCompact=false;await storage.setAgentApiKey('fixture-chat-key');
    final controller=AgentController(app:app,provider:_LegacyProvider(false,duringChat:()=>app.settings.imageProvider='novelai'));addTearDown(controller.dispose);await controller.load();await controller.setGenerationMode('auto');await controller.send('Draw an empty forest');
    final message=controller.selectedConversation!.messages.last;expect(message.imageProposal!.status,'error');expect(message.imageProposal!.error,contains('配置已变化'));expect(posts,0);expect(storage.nativeReads,0);
  });
}
