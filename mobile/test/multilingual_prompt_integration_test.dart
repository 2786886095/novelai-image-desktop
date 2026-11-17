import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/tags/multilingual_tag_packs.dart';
import 'package:sqflite/sqflite.dart';

class _Dictionary extends MultilingualTagPacks {
  final calls = <bool>[];
  @override
  Future<List<TagPackExactHit>?> lookupExact(Iterable<String> words,
      {bool translations = false}) async {
    calls.add(translations);
    const en = 'blue eyes', zh = '蓝眼睛';
    final hits = words.map(MultilingualTagPacks.key).toSet();
    final query = hits.contains(en) ? en : translations && hits.contains(zh) ? zh : null;
    return [
      if (query != null)
        (query: query, entry: (tag: 'blue_eyes', description: zh, count: 123, category: 0)),
    ];
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;

  test('conversion and image-only reverse use the same selected dictionary', () async {
    final service = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(service.close);
    final messages = <String>[];
    service.listen((req) async {
      final input = jsonDecode(await utf8.decoder.bind(req).join()) as Map;
      messages.add(jsonEncode(input['messages']));
      req.response.headers.contentType = ContentType.json;
      req.response.write(jsonEncode({'choices':[{'message':{'content':'1girl, blue eyes, solo'},'finish_reason':'stop'}]}));
      await req.response.close();
    });
    final url = 'http://127.0.0.1:${service.port}';
    final settings = AppSettings(proxyMode:'direct', convertApiUrl:url, visionApiUrl:url,
      convertApiModel:'fixture', visionApiModel:'fixture',
      convertPromptSkillVersion:'1.0.0', reversePromptSkillVersion:'1.0.0',
      convertPromptTemplates:{'tags':'Fixture text conversion'},
      reversePromptTemplates:{'tags':'Fixture image reverse'},
      promptCodexEnhanceEnabled:false,promptRuleAutoRepairEnabled:false,tagServerEnabled:false);
    final dict = _Dictionary();
    addTearDown(dict.dispose);
    final api = NaiApi()..multilingualTagPacks= dict;
    final converted = await api.convertPrompt(settings:settings, apiKey:'fixture',
      text:'她有蓝眼睛', mode:ReversePromptMode.tags, knownCharacter:false, systemTemplate:'Fixture text conversion');
    expect(converted.ok, isTrue, reason: converted.message);
    expect(messages.single, contains('Offline dictionary spellings'));
    expect(messages.single, contains('blue_eyes'));
    expect(converted.codexMatches.single.excerpt, '蓝眼睛');

    final reversed = await api.reversePrompt(settings:settings, apiKey:'fixture',
      image:Uint8List.fromList([137,80,78,71,13,10,26,10]),
      mode:ReversePromptMode.tags, scope:ReversePromptScope.full,
      hint:'', knownCharacter:false, systemTemplate:'Fixture image reverse');
    expect(reversed.ok, isTrue, reason: reversed.message);
    expect(messages.last, isNot(contains('Offline dictionary spellings')));
    expect(reversed.codexMatches.single.title, 'blue_eyes');
    expect(reversed.codexMatches.single.excerpt, '蓝眼睛');
    expect(dict.calls, [true, false, true, false]);

    final before = dict.calls.length;
    await api.convertPrompt(settings:settings, apiKey:'fixture',
      text:'她有蓝眼睛', mode:ReversePromptMode.natural, knownCharacter:false, systemTemplate:'Fixture text conversion');
    expect(dict.calls.length, before);
  });

  test('exact lookup uses parameterized SQLite input and canonical name wins', () async {
    databaseFactory = databaseFactorySqflitePlugin;
    addTearDown(() => databaseFactory = null);
    final dir = await Directory.systemTemp.createTemp('native-tag-dictionary-');
    addTearDown(() => dir.delete(recursive: true));
    final manifest = jsonDecode(File(MultilingualTagPacks.manifestPath).readAsStringSync()) as Map;
    final item = manifest['packs']['zh-CN'] as Map;
    final file = File('${dir.path}/${(item['file'] as String).replaceFirst('.gz', '')}');
    final handle = await file.open(mode:FileMode.write);
    await handle.truncate(item['databaseSize'] as int);
    await handle.close();
    await File('${dir.path}/active.json').writeAsString('"zh-CN"');
    final pack = MultilingualTagPacks(getRoot:() async => dir);
    addTearDown(pack.dispose);
    const channel = MethodChannel('com.tekartik.sqflite');
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(channel,(call) async {
      if (call.method == 'openDatabase') return {'id':1};
      if (call.method == 'closeDatabase') return null;
      expect(call.method,'query');
      final args = call.arguments as Map;
      final sql = args['sql'] as String;
      final translation = sql.contains('translated_key AS term');
      expect(sql, contains(translation ? 'IN (?,?)' : 'IN (?,?,?)'));
      expect(args['arguments'], translation ? ['蓝眼睛','短词'] : ['blue eyes','蓝眼睛','短词']);
      return {'columns':['tag','translated','count','category','term'],
        'rows': translation
          ? [['blue_eyes','蓝眼睛',123,0,'蓝眼睛'],
             ['short_hair','短词',99,0,'短词'],['short_sleeves','短词',21,0,'短词']]
          : [['blue_eyes','蓝眼睛',123,0,'blue eyes']]};
    });
    addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
    final hits = await pack.lookupExact(['blue_eyes','蓝眼睛','短词'], translations:true);
    expect(hits!.map((hit)=>hit.entry.tag), ['blue_eyes','blue_eyes']);
  });
}
