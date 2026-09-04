import 'dart:math';

String tavernNow() => DateTime.now().toUtc().toIso8601String();

String tavernId([String prefix = 'tavern']) {
  final now = DateTime.now().microsecondsSinceEpoch;
  final random = Random.secure().nextInt(1 << 32).toRadixString(16);
  return '$prefix-$now-$random';
}

Map<String, dynamic> _record(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

String _string(Object? value, [String fallback = '']) =>
    value is String ? value : fallback;

int _integer(Object? value, int fallback, int minimum, int maximum) {
  final parsed = value is num ? value.round() : int.tryParse('$value');
  return (parsed ?? fallback).clamp(minimum, maximum);
}

double _number(Object? value, double fallback, double minimum, double maximum) {
  final parsed = value is num ? value.toDouble() : double.tryParse('$value');
  return (parsed ?? fallback).clamp(minimum, maximum).toDouble();
}

List<String> _strings(Object? value) => value is List
    ? value
        .map((item) => '$item'.trim())
        .where((item) => item.isNotEmpty)
        .toList()
    : <String>[];

class TavernCharacterVisual {
  String positivePrompt;
  String negativePrompt;
  String stylePrompt;
  String? model;
  int? width;
  int? height;
  int? steps;
  double? scale;
  String? sampler;
  int count;
  Map<String, String> emotionPrompts;
  List<String> referencePresetIds;

  TavernCharacterVisual({
    this.positivePrompt = '',
    this.negativePrompt = '',
    this.stylePrompt = '',
    this.model,
    this.width,
    this.height,
    this.steps,
    this.scale,
    this.sampler,
    this.count = 1,
    Map<String, String>? emotionPrompts,
    List<String>? referencePresetIds,
  })  : emotionPrompts = emotionPrompts ?? {},
        referencePresetIds = referencePresetIds ?? [];

  factory TavernCharacterVisual.fromJson(Map<String, dynamic> json) =>
      TavernCharacterVisual(
        positivePrompt: _string(json['positivePrompt']),
        negativePrompt: _string(json['negativePrompt']),
        stylePrompt: _string(json['stylePrompt']),
        model: _string(json['model']).trim().isEmpty
            ? null
            : _string(json['model']),
        width: json['width'] is num
            ? _integer(json['width'], 1024, 64, 4096)
            : null,
        height: json['height'] is num
            ? _integer(json['height'], 1024, 64, 4096)
            : null,
        steps: json['steps'] is num ? _integer(json['steps'], 28, 1, 50) : null,
        scale: json['scale'] is num ? _number(json['scale'], 5, 0, 10) : null,
        sampler: _string(json['sampler']).trim().isEmpty
            ? null
            : _string(json['sampler']),
        count: _integer(json['count'], 1, 1, 8),
        emotionPrompts: _record(json['emotionPrompts'])
            .map((key, value) => MapEntry(key, '$value')),
        referencePresetIds: _strings(json['referencePresetIds']),
      );

  Map<String, dynamic> toJson() => {
        'positivePrompt': positivePrompt,
        'negativePrompt': negativePrompt,
        'stylePrompt': stylePrompt,
        if (model != null) 'model': model,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (steps != null) 'steps': steps,
        if (scale != null) 'scale': scale,
        if (sampler != null) 'sampler': sampler,
        'count': count,
        'emotionPrompts': emotionPrompts,
        'referencePresetIds': referencePresetIds,
      };
}

class TavernLorebookEntry {
  String id;
  List<String> keys;
  List<String> secondaryKeys;
  String content;
  bool enabled;
  bool constant;
  bool selective;
  bool caseSensitive;
  int insertionOrder;
  int priority;
  String position;
  int? depth;
  String? comment;
  Map<String, dynamic> extensions;

  TavernLorebookEntry({
    String? id,
    List<String>? keys,
    List<String>? secondaryKeys,
    this.content = '',
    this.enabled = true,
    this.constant = false,
    this.selective = false,
    this.caseSensitive = false,
    this.insertionOrder = 100,
    this.priority = 100,
    this.position = 'after-character',
    this.depth,
    this.comment,
    Map<String, dynamic>? extensions,
  })  : id = id ?? tavernId('lore'),
        keys = keys ?? [],
        secondaryKeys = secondaryKeys ?? [],
        extensions = extensions ?? {};

  factory TavernLorebookEntry.fromJson(Map<String, dynamic> json,
      [int index = 0]) {
    final extensions = _record(json['extensions']);
    final rawPosition =
        _string(json['position'] ?? extensions['position']).toLowerCase();
    final position = rawPosition == 'before-character' ||
            rawPosition.contains('before_char') ||
            rawPosition == '0'
        ? 'before-character'
        : rawPosition == 'before-examples' ||
                rawPosition.contains('before_example')
            ? 'before-examples'
            : rawPosition == 'after-examples' ||
                    rawPosition.contains('after_example')
                ? 'after-examples'
                : rawPosition.contains('depth') || json['depth'] != null
                    ? 'depth'
                    : 'after-character';
    return TavernLorebookEntry(
      id: _string(json['id'] ?? json['uid'], tavernId('lore')),
      keys: _strings(json['keys'] ?? json['key']),
      secondaryKeys: _strings(
        json['secondary_keys'] ?? json['keysecondary'] ?? json['secondaryKeys'],
      ),
      content: _string(json['content']),
      enabled: json['enabled'] != false && json['disable'] != true,
      constant: json['constant'] == true,
      selective: json['selective'] == true,
      caseSensitive:
          json['case_sensitive'] == true || json['caseSensitive'] == true,
      // `toJson` uses insertionOrder while SillyTavern exports commonly use
      // insertion_order/order. Accept every spelling so a local
      // save -> load -> merge cycle remains idempotent.
      insertionOrder: _integer(
        json['insertion_order'] ?? json['insertionOrder'] ?? json['order'],
        100 + index,
        -100000,
        100000,
      ),
      priority: _integer(json['priority'], 100, -100000, 100000),
      position: position,
      depth: json['depth'] is num ? _integer(json['depth'], 4, 0, 100) : null,
      comment: _string(json['comment'] ?? json['name']).trim().isEmpty
          ? null
          : _string(json['comment'] ?? json['name']),
      extensions: extensions,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'keys': keys,
        'secondaryKeys': secondaryKeys,
        'content': content,
        'enabled': enabled,
        'constant': constant,
        'selective': selective,
        'caseSensitive': caseSensitive,
        'insertionOrder': insertionOrder,
        'priority': priority,
        'position': position,
        if (depth != null) 'depth': depth,
        if (comment != null) 'comment': comment,
        'extensions': extensions,
      };
}

class TavernLorebook {
  String id;
  String name;
  String description;
  int scanDepth;
  int tokenBudget;
  bool recursiveScanning;
  List<TavernLorebookEntry> entries;
  Map<String, dynamic> extensions;
  String createdAt;
  String updatedAt;

  TavernLorebook({
    String? id,
    this.name = '世界书',
    this.description = '',
    this.scanDepth = 8,
    this.tokenBudget = 2048,
    this.recursiveScanning = false,
    List<TavernLorebookEntry>? entries,
    Map<String, dynamic>? extensions,
    String? createdAt,
    String? updatedAt,
  })  : id = id ?? tavernId('lorebook'),
        entries = entries ?? [],
        extensions = extensions ?? {},
        createdAt = createdAt ?? tavernNow(),
        updatedAt = updatedAt ?? tavernNow();

  factory TavernLorebook.fromJson(Map<String, dynamic> json,
      [String fallbackName = '世界书']) {
    final rawEntries = json['entries'] is List
        ? json['entries'] as List
        : _record(json['entries']).values.toList();
    return TavernLorebook(
      id: _string(json['id'], tavernId('lorebook')),
      name: _string(json['name'], fallbackName).trim().isEmpty
          ? fallbackName
          : _string(json['name'], fallbackName),
      description: _string(json['description']),
      scanDepth: _integer(json['scan_depth'] ?? json['scanDepth'], 8, 1, 100),
      tokenBudget: _integer(
          json['token_budget'] ?? json['tokenBudget'], 2048, 128, 131072),
      recursiveScanning: json['recursive_scanning'] == true ||
          json['recursiveScanning'] == true,
      entries: [
        for (var index = 0; index < rawEntries.length; index++)
          TavernLorebookEntry.fromJson(_record(rawEntries[index]), index)
      ],
      extensions: _record(json['extensions']),
      createdAt: _string(json['createdAt'], tavernNow()),
      updatedAt: _string(json['updatedAt'], tavernNow()),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'scanDepth': scanDepth,
        'tokenBudget': tokenBudget,
        'recursiveScanning': recursiveScanning,
        'entries': entries.map((item) => item.toJson()).toList(),
        'extensions': extensions,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class TavernCharacter {
  String id;
  String spec;
  String specVersion;
  String name;
  String nickname;
  String description;
  String personality;
  String scenario;
  String firstMessage;
  String exampleMessages;
  String creatorNotes;
  String systemPrompt;
  String postHistoryInstructions;
  List<String> alternateGreetings;
  List<String> groupOnlyGreetings;
  List<String> tags;
  String creator;
  String characterVersion;
  String? avatarDataUrl;
  String? backgroundDataUrl;
  String? lorebookId;
  TavernLorebook? embeddedLorebook;
  TavernCharacterVisual visual;
  Map<String, dynamic> extensions;
  List<String> source;
  bool favorite;
  String createdAt;
  String updatedAt;

  TavernCharacter({
    String? id,
    this.spec = 'chara_card_v3',
    this.specVersion = '3.0',
    this.name = '新角色',
    this.nickname = '',
    this.description = '',
    this.personality = '',
    this.scenario = '',
    this.firstMessage = '',
    this.exampleMessages = '',
    this.creatorNotes = '',
    this.systemPrompt = '',
    this.postHistoryInstructions = '',
    List<String>? alternateGreetings,
    List<String>? groupOnlyGreetings,
    List<String>? tags,
    this.creator = '',
    this.characterVersion = '1.0',
    this.avatarDataUrl,
    this.backgroundDataUrl,
    this.lorebookId,
    this.embeddedLorebook,
    TavernCharacterVisual? visual,
    Map<String, dynamic>? extensions,
    List<String>? source,
    this.favorite = false,
    String? createdAt,
    String? updatedAt,
  })  : id = id ?? tavernId('character'),
        alternateGreetings = alternateGreetings ?? [],
        groupOnlyGreetings = groupOnlyGreetings ?? [],
        tags = tags ?? [],
        visual = visual ?? TavernCharacterVisual(),
        extensions = extensions ?? {},
        source = source ?? [],
        createdAt = createdAt ?? tavernNow(),
        updatedAt = updatedAt ?? tavernNow();

  factory TavernCharacter.blank([String name = '新角色']) => TavernCharacter(
        name: name,
        description: '在这里填写角色设定、外貌、身份与背景。',
        personality: '在这里填写性格、说话方式与行为习惯。',
        firstMessage: '*角色抬起眼，等待你开启这段故事。*',
      );

  factory TavernCharacter.fromJson(Map<String, dynamic> json) =>
      TavernCharacter(
        id: _string(json['id'], tavernId('character')),
        spec: _string(json['spec'], 'chara_card_v3'),
        specVersion:
            _string(json['specVersion'] ?? json['spec_version'], '3.0'),
        name: _string(json['name'], '新角色'),
        nickname: _string(json['nickname']),
        description: _string(json['description']),
        personality: _string(json['personality']),
        scenario: _string(json['scenario']),
        firstMessage: _string(json['firstMessage'] ?? json['first_mes']),
        exampleMessages:
            _string(json['exampleMessages'] ?? json['mes_example']),
        creatorNotes: _string(json['creatorNotes'] ?? json['creator_notes']),
        systemPrompt: _string(json['systemPrompt'] ?? json['system_prompt']),
        postHistoryInstructions: _string(json['postHistoryInstructions'] ??
            json['post_history_instructions']),
        alternateGreetings:
            _strings(json['alternateGreetings'] ?? json['alternate_greetings']),
        groupOnlyGreetings: _strings(
            json['groupOnlyGreetings'] ?? json['group_only_greetings']),
        tags: _strings(json['tags']),
        creator: _string(json['creator']),
        characterVersion: _string(
            json['characterVersion'] ?? json['character_version'], '1.0'),
        avatarDataUrl: _string(json['avatarDataUrl']).trim().isEmpty
            ? null
            : _string(json['avatarDataUrl']),
        backgroundDataUrl: _string(json['backgroundDataUrl']).trim().isEmpty
            ? null
            : _string(json['backgroundDataUrl']),
        lorebookId: _string(json['lorebookId']).trim().isEmpty
            ? null
            : _string(json['lorebookId']),
        embeddedLorebook: json['embeddedLorebook'] is Map
            ? TavernLorebook.fromJson(_record(json['embeddedLorebook']))
            : null,
        visual: TavernCharacterVisual.fromJson(_record(json['visual'])),
        extensions: _record(json['extensions']),
        source: _strings(json['source']),
        favorite: json['favorite'] == true,
        createdAt: _string(json['createdAt'], tavernNow()),
        updatedAt: _string(json['updatedAt'], tavernNow()),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'spec': spec,
        'specVersion': specVersion,
        'name': name,
        'nickname': nickname,
        'description': description,
        'personality': personality,
        'scenario': scenario,
        'firstMessage': firstMessage,
        'exampleMessages': exampleMessages,
        'creatorNotes': creatorNotes,
        'systemPrompt': systemPrompt,
        'postHistoryInstructions': postHistoryInstructions,
        'alternateGreetings': alternateGreetings,
        'groupOnlyGreetings': groupOnlyGreetings,
        'tags': tags,
        'creator': creator,
        'characterVersion': characterVersion,
        if (avatarDataUrl != null) 'avatarDataUrl': avatarDataUrl,
        if (backgroundDataUrl != null) 'backgroundDataUrl': backgroundDataUrl,
        if (lorebookId != null) 'lorebookId': lorebookId,
        if (embeddedLorebook != null)
          'embeddedLorebook': embeddedLorebook!.toJson(),
        'visual': visual.toJson(),
        'extensions': extensions,
        'source': source,
        'favorite': favorite,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class TavernPersona {
  String id;
  String name;
  String description;
  String? avatarDataUrl;
  String? lorebookId;
  bool favorite;
  String createdAt;
  String updatedAt;

  TavernPersona({
    String? id,
    this.name = '旅行者',
    this.description = '',
    this.avatarDataUrl,
    this.lorebookId,
    this.favorite = false,
    String? createdAt,
    String? updatedAt,
  })  : id = id ?? tavernId('persona'),
        createdAt = createdAt ?? tavernNow(),
        updatedAt = updatedAt ?? tavernNow();

  factory TavernPersona.fromJson(Map<String, dynamic> json) => TavernPersona(
        id: _string(json['id'], tavernId('persona')),
        name: _string(json['name'], '旅行者'),
        description: _string(json['description']),
        avatarDataUrl: _string(json['avatarDataUrl']).trim().isEmpty
            ? null
            : _string(json['avatarDataUrl']),
        lorebookId: _string(json['lorebookId']).trim().isEmpty
            ? null
            : _string(json['lorebookId']),
        favorite: json['favorite'] == true,
        createdAt: _string(json['createdAt'], tavernNow()),
        updatedAt: _string(json['updatedAt'], tavernNow()),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        if (avatarDataUrl != null) 'avatarDataUrl': avatarDataUrl,
        if (lorebookId != null) 'lorebookId': lorebookId,
        'favorite': favorite,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class TavernSamplerPreset {
  String id;
  String name;
  String systemPrompt;
  String jailbreakPrompt;
  double temperature;
  double topP;
  double frequencyPenalty;
  double presencePenalty;
  int? maxOutputTokens;
  List<String> stop;
  String createdAt;
  String updatedAt;

  TavernSamplerPreset({
    String? id,
    this.name = '沉浸叙事',
    this.systemPrompt =
        'You are {{char}}. Stay in character, write vivid dialogue and actions, and never describe yourself as an AI or assistant.',
    this.jailbreakPrompt =
        'Continue the scene naturally. Respect established characterization, world facts, and the user\'s latest intent.',
    this.temperature = .9,
    this.topP = .95,
    this.frequencyPenalty = 0,
    this.presencePenalty = 0,
    this.maxOutputTokens,
    List<String>? stop,
    String? createdAt,
    String? updatedAt,
  })  : id = id ?? tavernId('sampler'),
        stop = stop ?? [],
        createdAt = createdAt ?? tavernNow(),
        updatedAt = updatedAt ?? tavernNow();

  factory TavernSamplerPreset.fromJson(Map<String, dynamic> json) =>
      TavernSamplerPreset(
        id: _string(json['id'], tavernId('sampler')),
        name: _string(json['name'], '沉浸叙事'),
        systemPrompt: _string(
            json['systemPrompt'], 'You are {{char}}. Stay in character.'),
        jailbreakPrompt: _string(json['jailbreakPrompt']),
        temperature: _number(json['temperature'], .9, 0, 2),
        topP: _number(json['topP'], .95, 0, 1),
        frequencyPenalty: _number(json['frequencyPenalty'], 0, -2, 2),
        presencePenalty: _number(json['presencePenalty'], 0, -2, 2),
        maxOutputTokens: json['maxOutputTokens'] is num
            ? _integer(json['maxOutputTokens'], 4096, 128, 131072)
            : null,
        stop: _strings(json['stop']),
        createdAt: _string(json['createdAt'], tavernNow()),
        updatedAt: _string(json['updatedAt'], tavernNow()),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'systemPrompt': systemPrompt,
        'jailbreakPrompt': jailbreakPrompt,
        'temperature': temperature,
        'topP': topP,
        'frequencyPenalty': frequencyPenalty,
        'presencePenalty': presencePenalty,
        if (maxOutputTokens != null) 'maxOutputTokens': maxOutputTokens,
        'stop': stop,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class TavernImageProposal {
  String id;
  String status;
  String positivePrompt;
  String negativePrompt;
  String stylePrompt;
  String? model;
  int? width;
  int? height;
  int? steps;
  double? scale;
  String? sampler;
  int count;
  String? error;
  String createdAt;

  TavernImageProposal({
    String? id,
    this.status = 'pending',
    required this.positivePrompt,
    this.negativePrompt = '',
    this.stylePrompt = '',
    this.model,
    this.width,
    this.height,
    this.steps,
    this.scale,
    this.sampler,
    this.count = 1,
    this.error,
    String? createdAt,
  })  : id = id ?? tavernId('image'),
        createdAt = createdAt ?? tavernNow();

  factory TavernImageProposal.fromJson(Map<String, dynamic> json) =>
      TavernImageProposal(
        id: _string(json['id'], tavernId('image')),
        status: _string(json['status'], 'pending'),
        positivePrompt: _string(json['positivePrompt']),
        negativePrompt: _string(json['negativePrompt']),
        stylePrompt: _string(json['stylePrompt']),
        model: _string(json['model']).trim().isEmpty
            ? null
            : _string(json['model']),
        width: json['width'] is num
            ? _integer(json['width'], 1024, 64, 2048)
            : null,
        height: json['height'] is num
            ? _integer(json['height'], 1024, 64, 2048)
            : null,
        steps: json['steps'] is num ? _integer(json['steps'], 28, 1, 50) : null,
        scale: json['scale'] is num ? _number(json['scale'], 5, 0, 10) : null,
        sampler: _string(json['sampler']).trim().isEmpty
            ? null
            : _string(json['sampler']),
        count: _integer(json['count'], 1, 1, 8),
        error: _string(json['error']).trim().isEmpty
            ? null
            : _string(json['error']),
        createdAt: _string(json['createdAt'], tavernNow()),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'status': status,
        'positivePrompt': positivePrompt,
        'negativePrompt': negativePrompt,
        'stylePrompt': stylePrompt,
        if (model != null) 'model': model,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        if (steps != null) 'steps': steps,
        if (scale != null) 'scale': scale,
        if (sampler != null) 'sampler': sampler,
        'count': count,
        if (error != null) 'error': error,
        'createdAt': createdAt,
      };
}
