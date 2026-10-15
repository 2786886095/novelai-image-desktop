// ignore_for_file: curly_braces_in_flow_control_structures
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/studio_options.dart';
import 'package:novelai_mobile/agent/tavern_preset_import.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/ig5_image_prompts.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/unified_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null;
  test('shared IG5 body/provenance and full bundled legal assets remain exact',
      () {
    final source =
        jsonDecode(File('../shared/ig5-image-prompts.json').readAsStringSync())
            as Map;
    expect(ig5SourceCommit, source['commit']);
    for (final task in ['convert', 'reverse', 'studio']) {
      expect(ig5PromptBodies[task], source['prompts'][task]);
      expect(sha256.convert(utf8.encode(ig5PromptBodies[task]!)).toString(),
          ig5PromptHashes[task]);
    }
    for (final file in [
      'ig5-image-prompts.json',
      'ig5-NOTICE.txt',
      'ig5-LICENSE.txt'
    ])
      expect(File('assets/ig5/$file').readAsBytesSync(),
          File('../shared/$file').readAsBytesSync());
    expect(File('assets/ig5/THIRD_PARTY_NOTICES.md').readAsBytesSync(),
        File('../THIRD_PARTY_NOTICES.md').readAsBytesSync());
  });
  test(
      'fresh choices distinct; saved legacy custom and explicit disabled choices persist',
      () {
    final fresh = AppSettings();
    expect(fresh.convertSystemPromptPresetId, 'builtin-ig5-convert');
    expect(fresh.reverseSystemPromptPresetId, 'builtin-ig5-reverse');
    final custom = TavernSamplerPreset(
        id: 'custom',
        name: 'User',
        systemPrompt: 'USER BODY',
        jailbreakPrompt: 'USER POST');
    final saved = AppSettings.fromJson({
      'reverseConvertPromptPresets': [custom.toJson()],
      'reverseConvertPromptPresetId': 'custom',
      'reverseConvertDshEnabled': false,
      'convertPromptTemplates': {'natural': 'USER OUTPUT'}
    });
    expect(saved.convertSystemPromptPresetId, 'custom');
    expect(saved.reverseSystemPromptPresetId, 'custom');
    expect(saved.reverseConvertDshEnabled, false);
    expect(saved.reverseConvertPromptPresets.first.systemPrompt, 'USER BODY');
    final cold = AppSettings.fromJson(jsonDecode(jsonEncode(saved.toJson())));
    expect(cold.convertPromptTemplates['natural'], 'USER OUTPUT');
    expect(cold.reverseConvertPromptPresets.first.jailbreakPrompt, 'USER POST');
    expect(
        AppSettings.fromJson({'reverseConvertPromptPresets': []})
            .reverseConvertPromptPresets,
        isEmpty);
    expect(
        UnifiedStorage.presetKeys,
        containsAll(
            ['convertSystemPromptPresetId', 'reverseSystemPromptPresetId']));
  });
  for (final extension in ['txt', 'md'])
    test('UTF8 BOM $extension raw FS body and hash preserved', () {
      final dir = Directory.systemTemp.createTempSync('ig5-mobile-host-');
      final file = File('${dir.path}/input.$extension');
      const body = '# 完整 Ω 😀\r\nKeep literal lines.\n';
      final bytes = utf8.encode('\uFEFF$body');
      file.writeAsBytesSync(bytes);
      final p = importImageSystemPromptBytes(file.readAsBytesSync(),
              fileName: 'input.$extension')
          .preset;
      expect(p.systemPrompt, body);
      expect(p.jailbreakPrompt, '');
      expect(p.sourceHash, sha256.convert(bytes).toString());
      expect(file.readAsBytesSync(), bytes);
    });
  for (final key in ['systemPrompt', 'system_prompt'])
    test('top JSON $key ignores ids/permission fields and imports exact bodies',
        () {
      final source = jsonEncode({
        'id': 'builtin-ig5-convert',
        'source': 'builtin',
        key: 'EXACT JSON BODY',
        'jailbreak_prompt': 'POST',
        'studioApprovalMode': 'auto',
        'tools': ['arbitrary_shell']
      });
      final p =
          importImageSystemPrompt(source, fileName: 'fixture.json').preset;
      expect(p.systemPrompt, 'EXACT JSON BODY');
      expect(p.jailbreakPrompt, 'POST');
      expect(p.id, isNot('builtin-ig5-convert'));
      expect(p.source, 'langbai');
      expect(p.toJson().containsKey('studioApprovalMode'), false);
      expect(p.toJson().containsKey('tools'), false);
    });
  test(
      'ST order/disabled/assistant/executable exclusions and explicit empty postscript',
      () {
    final source = jsonEncode({
      'prompts': [
        {'identifier': 'b', 'role': 'user', 'content': 'SECOND'},
        {'identifier': 'a', 'role': 'system', 'content': 'FIRST'},
        {
          'identifier': 'script',
          'role': 'system',
          'content': '<script>fetch("https://never.example")</script>'
        },
        {
          'identifier': 'assistant',
          'role': 'assistant',
          'content': 'NEVER PREFILL'
        },
        {'identifier': 'off', 'content': 'DISABLED'}
      ],
      'prompt_order': [
        {
          'order': [
            {'identifier': 'a', 'enabled': true},
            {'identifier': 'b', 'enabled': true},
            {'identifier': 'script', 'enabled': true},
            {'identifier': 'assistant', 'enabled': true},
            {'identifier': 'off', 'enabled': false}
          ]
        }
      ]
    });
    final r = importImageSystemPrompt(source, fileName: 'st.json');
    expect(r.preset.systemPrompt, 'FIRST\n\nSECOND');
    expect(r.preset.jailbreakPrompt, '');
    expect(r.warnings.join(' '), contains('可执行'));
  });
  for (final entry in <(String, String, String)>[
    ('empty.txt', ' ', 'empty'),
    ('bad.json', '{', 'json'),
    ('empty.json', '{}', 'shape'),
    ('number.json', '{"systemPrompt":42}', 'shape'),
    ('script.js', 'text', 'extension'),
    ('big.md', 'x' * 200001, 'system-limit'),
    (
      'big-post.json',
      jsonEncode({'systemPrompt': 'ok', 'jailbreakPrompt': 'x' * 100001}),
      'postscript-limit'
    ),
    (
      'big-st.json',
      jsonEncode({
        'prompts': [
          {'role': 'system', 'content': 'x' * 200001}
        ]
      }),
      'system-limit'
    )
  ])
    test('strict ${entry.$1} refuses before truncation/fallback', () {
      expect(
          () => importImageSystemPrompt(entry.$2, fileName: entry.$1),
          throwsA(isA<SystemPromptImportError>()
              .having((e) => e.code, 'code', entry.$3)));
    });
  test('fatal UTF8/2MiB upper bound and exact 200k boundary', () {
    expect(
        () => decodeSystemPromptFile([0xc3, 0x28]),
        throwsA(isA<SystemPromptImportError>()
            .having((e) => e.code, 'code', 'utf8')));
    expect(
        () => decodeSystemPromptFile(List.filled(2097153, 120)),
        throwsA(isA<SystemPromptImportError>()
            .having((e) => e.code, 'code', 'bytes')));
    expect(
        importImageSystemPrompt('x' * 200000, fileName: 'limit.txt')
            .preset
            .systemPrompt
            .length,
        200000);
  });
  test(
      'same hash selects entire edited object, excludes builtin and collision ids cannot replace old',
      () {
    final input = importImageSystemPrompt('ORIGINAL', fileName: 'a.txt').preset;
    final library = [createIg5ImageSamplerPreset('convert'), input];
    input
      ..name = 'USER NAME'
      ..systemPrompt = 'USER EDIT'
      ..jailbreakPrompt = 'USER POST'
      ..temperature = .31
      ..updatedAt = '2001-01-01T00:00:00.000Z';
    final before = jsonEncode(input.toJson());
    final again = importImageSystemPrompt('ORIGINAL', fileName: 'b.txt').preset;
    expect(identical(selectImportedSystemPreset(library, again), input), true);
    expect(jsonEncode(input.toJson()), before);
    final collision = importImageSystemPrompt(
            jsonEncode({'id': input.id, 'systemPrompt': 'DIFFERENT'}),
            fileName: 'c.json')
        .preset;
    expect(selectImportedSystemPreset(library, collision).id, isNot(input.id));
    expect(input.systemPrompt, 'USER EDIT');
    final built = library.firstWhere((p) => p.source == 'builtin');
    final unique = importImageSystemPrompt('NEW', fileName: 'd.txt').preset;
    built.sourceHash = unique.sourceHash;
    expect(selectImportedSystemPreset(library, unique).id, unique.id);
    expect(built.systemPrompt, ig5PromptBodies['convert']);
  });
  test(
      'Studio selected body is single task layer; legacy/off choices survive and references contain no body',
      () {
    final workspace = AgentWorkspace();
    final chat = AgentConversation(id: 'fixture', title: 'host');
    expect(
        studioSelectedSystemPrompt(workspace, chat), ig5PromptBodies['studio']);
    expect(jsonDecode(studioCreativeContext(workspace, chat))['preset'],
        containsPair('id', 'dsh-infinite-gen-5'));
    final preset =
        importImageSystemPrompt('IMPORTED SYSTEM', fileName: 'custom.txt')
            .preset;
    workspace.samplerPresets.add(preset);
    chat.studioPresetId = 'tavern:${preset.id}';
    expect(studioSelectedSystemPrompt(workspace, chat), 'IMPORTED SYSTEM');
    expect(studioCreativeContext(workspace, chat),
        isNot(contains('IMPORTED SYSTEM')));
    chat.studioPresetId = studioLegacyPresetId;
    expect(studioSelectedSystemPrompt(workspace, chat), studioInfinitePrompt);
    chat.studioTemplateEnabled = false;
    expect(studioSelectedSystemPrompt(workspace, chat), '');
    expect(
        AgentConversation.fromJson({
          'id': 'old',
          'title': 'old',
          'studioPresetId': 'dsh-infinite-gen-4'
        }).studioPresetId,
        studioLegacyPresetId);
  });
  test(
      'actual loopback conversion/reverse keeps independent imported rules plus custom output; off disables only layer',
      () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final requests = <Map<String, dynamic>>[];
    server.listen((request) async {
      requests.add(jsonDecode(await utf8.decoder.bind(request).join()));
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode({
        'choices': [
          {
            'message': {
              'content':
                  'An anime girl stands centered against a plain white background, with both arms relaxed at her sides.'
            },
            'finish_reason': 'stop'
          }
        ]
      }));
      await request.response.close();
    });
    final c =
            importImageSystemPrompt('CUSTOM CONVERT SYSTEM', fileName: 'c.txt')
                .preset,
        r = importImageSystemPrompt('CUSTOM REVERSE SYSTEM', fileName: 'r.md')
            .preset;
    final settings = AppSettings(
        proxyMode: 'direct',
        convertApiUrl: 'http://127.0.0.1:${server.port}',
        visionApiUrl: 'http://127.0.0.1:${server.port}',
        convertApiModel: 'fixture',
        visionApiModel: 'fixture',
        reverseConvertPromptPresets: [c, r],
        convertSystemPromptPresetId: c.id,
        reverseSystemPromptPresetId: r.id,
        convertPromptTemplates: {
          'natural': 'CONVERT OUTPUT return natural English.'
        },
        reversePromptTemplates: {
          'natural': 'REVERSE OUTPUT return natural English.'
        },
        promptCodexEnhanceEnabled: false,
        promptCodexAdultEnabled: false,
        tagServerEnabled: false);
    final api = NaiApi();
    expect(
        (await api.convertPrompt(
                settings: settings,
                apiKey: 'fixture-only',
                text: '一个女孩',
                mode: ReversePromptMode.natural,
                knownCharacter: false,
                systemTemplate: ''))
            .ok,
        true);
    expect(
        (await api.reversePrompt(
                settings: settings,
                apiKey: 'fixture-only',
                image: Uint8List.fromList(base64Decode(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=')),
                mode: ReversePromptMode.natural,
                scope: ReversePromptScope.full,
                hint: '',
                knownCharacter: false,
                systemTemplate: ''))
            .ok,
        true);
    String system(int i) => (requests[i]['messages'] as List)
        .where((m) => m['role'] == 'system')
        .map((m) => m['content'])
        .join('\n');
    expect(system(0), contains(c.systemPrompt));
    expect(system(0), contains('CONVERT OUTPUT'));
    expect(system(0), isNot(contains(r.systemPrompt)));
    expect(system(1), contains(r.systemPrompt));
    expect(system(1), contains('REVERSE OUTPUT'));
    expect(system(1), isNot(contains(c.systemPrompt)));
    settings.reverseConvertDshEnabled = false;
    await api.convertPrompt(
        settings: settings,
        apiKey: 'fixture-only',
        text: '一个女孩',
        mode: ReversePromptMode.natural,
        knownCharacter: false,
        systemTemplate: '');
    expect(system(2), isNot(contains(c.systemPrompt)));
    expect(system(2), contains('CONVERT OUTPUT'));
    expect(requests, hasLength(3));
  });
}
