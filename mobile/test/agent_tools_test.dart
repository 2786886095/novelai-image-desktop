import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _ToolStorage extends Storage {
  GenerateParams? storedParams;

  @override
  Future<void> setParams(GenerateParams params) async {
    storedParams = params.copy();
  }

  @override
  Future<void> setSettings(AppSettings settings) async {}
}

class _ToolAppState extends AppState {
  final Directory root;
  GenerateParams? generatedParams;
  GenerateExtras? generatedExtras;
  String? generatedModelMode;
  String? generatedGroupId;
  _ToolAppState({required this.root, required super.storage});

  @override
  Future<void> generate() async {
    generatedParams = params.copy();
    generatedExtras = extras.copy();
    generatedModelMode = settings.modelMode;
    generatedGroupId = generationGroupId;
    final file = File('${root.path}/generated.png')
      ..writeAsBytesSync([137, 80, 78, 71]);
    history.insert(
      0,
      HistoryItem(
        id: 'generated-image',
        filePath: file.path,
        date: '2026-09-02',
        createdAt: '2026-09-02T00:00:00.000Z',
        seed: 7,
        model: params.model,
        width: params.width,
        height: params.height,
        prompt: params.positivePrompt,
        params: params.toJson(),
      ),
    );
    status = 'generated';
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('paid image tools restore the current studio state afterwards',
      () async {
    final root = Directory.systemTemp.createTempSync('agent-tool-state-');
    addTearDown(() => root.deleteSync(recursive: true));
    final storage = _ToolStorage();
    final app = _ToolAppState(root: root, storage: storage)
      ..params = GenerateParams(
        positivePrompt: 'original',
        negativePrompt: 'original negative',
        stylePrompt: 'original style',
      )
      ..batchCount = 3
      ..settings = AppSettings(
        lockStylePrompt: true,
        savedStylePrompt: 'original style',
        lockNegativePrompt: true,
        savedNegativePrompt: 'original negative',
      );
    final executor = AgentToolExecutor(
      app: app,
      listMemories: () => const [],
      upsertMemory: (input) async => const {},
      deleteMemory: (id) async => false,
    );

    final result = await executor.execute(
      'langbai_generate_image',
      {
        'positivePrompt': 'temporary',
        'stylePrompt': 'temporary style',
        'negativePrompt': 'temporary negative',
        'count': 1,
      },
      const [],
    );

    expect(result.ok, isTrue);
    expect(result.generatedImages.single.id, 'generated-image');
    expect(app.generatedParams?.stylePrompt, 'original style');
    expect(app.generatedParams?.negativePrompt, 'original negative');
    expect(app.params.positivePrompt, 'original');
    expect(app.params.stylePrompt, 'original style');
    expect(app.batchCount, 3);
    expect(app.settings.savedStylePrompt, 'original style');
    expect(storage.storedParams?.positivePrompt, 'original');
  });

  test('apply prompt is intentionally durable', () async {
    final root = Directory.systemTemp.createTempSync('agent-apply-state-');
    addTearDown(() => root.deleteSync(recursive: true));
    final app = _ToolAppState(root: root, storage: _ToolStorage())
      ..params = GenerateParams(positivePrompt: 'before');
    final executor = AgentToolExecutor(
      app: app,
      listMemories: () => const [],
      upsertMemory: (input) async => const {},
      deleteMemory: (id) async => false,
    );

    final result = await executor.execute(
      'langbai_apply_prompt',
      {'positivePrompt': 'after'},
      const [],
    );

    expect(result.ok, isTrue);
    expect(app.params.positivePrompt, 'after');
  });

  test('generation tool supports advanced params and attachment references',
      () async {
    final root = Directory.systemTemp.createTempSync('agent-reference-tool-');
    addTearDown(() => root.deleteSync(recursive: true));
    final reference = File('${root.path}/reference.png')
      ..writeAsBytesSync([137, 80, 78, 71]);
    final app = _ToolAppState(root: root, storage: _ToolStorage())
      ..params = GenerateParams(
        model: 'nai-diffusion-5-full',
        positivePrompt: 'original',
      )
      ..extras = GenerateExtras(
        charCaptions: [CharCaptionItem(prompt: 'existing')],
      )
      ..generationGroupId = 'original-group'
      ..settings = AppSettings(modelMode: 'anime');
    final executor = AgentToolExecutor(
      app: app,
      listMemories: () => const [],
      upsertMemory: (input) async => const {},
      deleteMemory: (id) async => false,
    );
    final attachment = AgentAttachment(
      id: 'reference',
      name: 'reference.png',
      mime: 'image/png',
      size: reference.lengthSync(),
      kind: 'image',
      filePath: reference.path,
      width: 640,
      height: 960,
    );

    final result = await executor.execute(
      'langbai_generate_image',
      {
        'positivePrompt': 'agent prompt',
        'model': 'nai-diffusion-4-5-full',
        'modelMode': 'furry',
        'historyGroupId': 'agent-group',
        'sampler': 'k_dpmpp_2m',
        'noiseSchedule': 'exponential',
        'cfgRescale': 0.4,
        'seed': 4294967295,
        'seedMode': 'fixed',
        'characterPrompts': [
          {
            'prompt': '1girl, blue hair',
            'negativePrompt': 'bad anatomy',
            'useCoords': true,
            'x': 0.25,
            'y': 0.75,
          }
        ],
        'vibeReferences': [
          {
            'attachmentId': 'reference',
            'infoExtracted': 0.8,
            'strength': 0.6,
          }
        ],
        'preciseReferences': [
          {
            'attachmentId': 'reference',
            'type': 'character',
            'strength': 0.9,
            'fidelity': 0.7,
          }
        ],
      },
      [attachment],
    );

    expect(result.ok, isTrue);
    expect(app.generatedParams?.model, 'nai-diffusion-4-5-full');
    expect(app.generatedParams?.sampler, 'k_dpmpp_2m');
    expect(app.generatedParams?.noiseSchedule, 'exponential');
    expect(app.generatedParams?.seed, 4294967295);
    expect(app.generatedExtras?.charCaptions.single.prompt, '1girl, blue hair');
    expect(app.generatedExtras?.vibeImages.single.strength, 0.6);
    expect(app.generatedExtras?.preciseReferences.single.width, 640);
    expect(app.generatedModelMode, 'furry');
    expect(app.generatedGroupId, 'agent-group');

    // The paid tool uses an isolated snapshot and cannot silently replace the
    // user's current Studio references or destination.
    expect(app.params.model, 'nai-diffusion-5-full');
    expect(app.extras.charCaptions.single.prompt, 'existing');
    expect(app.extras.vibeImages, isEmpty);
    expect(app.generationGroupId, 'original-group');
    expect(app.settings.modelMode, 'anime');
  });

  test('discovers reusable presets and reads embedded image parameters',
      () async {
    final root = Directory.systemTemp.createTempSync('agent-preset-tools-');
    addTearDown(() => root.deleteSync(recursive: true));
    final reference = File('${root.path}/character.png')
      ..writeAsBytesSync(_makePng({
        'Software': 'NovelAI',
        'Source': 'NovelAI Diffusion V4.5',
        'Description': '1girl, blue hair, looking at viewer',
        'Comment': jsonEncode({
          'uc': 'lowres, bad anatomy',
          'steps': 28,
          'scale': 6,
          'seed': 12345,
          'width': 832,
          'height': 1216,
          'model': 'nai-diffusion-4-5-full',
        }),
      }));
    final app = _ToolAppState(root: root, storage: _ToolStorage())
      ..settings = AppSettings(
        positivePromptPresets: [
          PositivePromptPreset(
            id: 'positive-1',
            name: '蓝发角色',
            prompt: '1girl, blue hair',
            createdAt: '2026-09-02T00:00:00.000Z',
          ),
        ],
        stylePromptPresets: [
          StylePromptPreset(
            id: 'style-1',
            name: '电影光影',
            prompt: 'cinematic lighting, rim lighting',
            group: '光影',
            createdAt: '2026-09-02T00:00:00.000Z',
          ),
        ],
      )
      ..referencePresetGroups = ['角色']
      ..referencePresets = [
        ReferencePreset(
          id: 'reference-1',
          name: '蓝发角色参考',
          group: '角色',
          kind: ReferencePresetKind.precise,
          filePath: reference.path,
          createdAt: '2026-09-02T00:00:00.000Z',
          preciseType: 'character',
          strength: 0.8,
          fidelity: 0.7,
          width: 832,
          height: 1216,
        ),
      ];
    final executor = AgentToolExecutor(
      app: app,
      listMemories: () => const [],
      upsertMemory: (input) async => const {},
      deleteMemory: (id) async => false,
    );

    final prompts = await executor.execute(
      'langbai_list_prompt_presets',
      {'query': '光影', 'kind': 'all'},
      const [],
    );
    final promptPayload = jsonDecode(prompts.output) as Map<String, dynamic>;
    expect(prompts.ok, isTrue);
    expect(promptPayload['total'], 1);
    expect(promptPayload['items'][0]['kind'], 'style');
    expect(promptPayload['items'][0]['prompt'], contains('cinematic lighting'));

    final references = await executor.execute(
      'langbai_list_reference_presets',
      {'query': '蓝发', 'kind': 'precise'},
      const [],
    );
    final referencePayload =
        jsonDecode(references.output) as Map<String, dynamic>;
    expect(references.ok, isTrue);
    expect(references.generatedImages, hasLength(1));
    expect(
        references.generatedImages.single.id, 'reference-preset:reference-1');
    expect(referencePayload['items'][0]['preciseReference']['fidelity'], 0.7);

    final metadata = await executor.execute(
      'langbai_read_image_metadata',
      {'attachmentId': references.generatedImages.single.id},
      references.generatedImages,
    );
    final metadataPayload = jsonDecode(metadata.output) as Map<String, dynamic>;
    expect(metadata.ok, isTrue);
    expect(metadataPayload['found'], isTrue);
    expect(metadataPayload['kind'], 'novelAi');
    expect(metadataPayload['parameters']['positivePrompt'],
        '1girl, blue hair, looking at viewer');
    expect(metadataPayload['parameters']['model'], 'nai-diffusion-4-5-full');
  });
}

Uint8List _makePng(Map<String, String> values) {
  final bytes = <int>[137, 80, 78, 71, 13, 10, 26, 10];
  void addChunk(String type, List<int> data) {
    final length = data.length;
    bytes.addAll([
      (length >> 24) & 255,
      (length >> 16) & 255,
      (length >> 8) & 255,
      length & 255,
      ...ascii.encode(type),
      ...data,
      0,
      0,
      0,
      0,
    ]);
  }

  for (final entry in values.entries) {
    addChunk(
        'tEXt', [...utf8.encode(entry.key), 0, ...utf8.encode(entry.value)]);
  }
  addChunk('IEND', const []);
  return Uint8List.fromList(bytes);
}
