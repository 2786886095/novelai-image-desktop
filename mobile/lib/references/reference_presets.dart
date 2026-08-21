enum ReferencePresetKind { vibe, precise }

const defaultReferencePresetGroups = <String>[
  '原神',
  '妮姬',
  '崩坏三',
  '明日方舟',
  '星穹铁道',
  '绝区零',
  '蔚蓝档案',
  '鸣潮',
  '终末地',
  '异环',
];

List<String> referencePresetGroupsWithDefaults(Iterable<String> groups) =>
    <String>{...defaultReferencePresetGroups, ...groups}.toList();

ReferencePresetKind referencePresetKindFromJson(Object? value) =>
    value?.toString() == 'precise'
        ? ReferencePresetKind.precise
        : ReferencePresetKind.vibe;

extension ReferencePresetKindJson on ReferencePresetKind {
  String get jsonValue =>
      this == ReferencePresetKind.precise ? 'precise' : 'vibe';
}

class ReferencePreset {
  final String id;
  final String name;
  final String group;
  final ReferencePresetKind kind;
  final String filePath;
  final String createdAt;
  final double infoExtracted;
  final double strength;
  final String preciseType;
  final double fidelity;
  final double informationExtracted;
  final int width;
  final int height;
  final String sourceId;
  final Map<String, String> sourceNames;
  final Map<String, String> sourceGameNames;
  final String sourceGameId;
  final String sourceCategory;

  const ReferencePreset({
    required this.id,
    required this.name,
    required this.group,
    required this.kind,
    required this.filePath,
    required this.createdAt,
    this.infoExtracted = 1,
    this.strength = 1,
    this.preciseType = 'character',
    this.fidelity = 1,
    this.informationExtracted = 1,
    this.width = 0,
    this.height = 0,
    this.sourceId = '',
    this.sourceNames = const {},
    this.sourceGameNames = const {},
    this.sourceGameId = '',
    this.sourceCategory = '',
  });

  String localizedName(String language) =>
      sourceNames[language] ?? sourceNames['zh-CN'] ?? name;

  String localizedGameName(String language) =>
      sourceGameNames[language] ?? sourceGameNames['zh-CN'] ?? sourceGameId;

  String get localizedSearchText => <String>{
        name,
        group,
        sourceGameId,
        sourceCategory,
        ...sourceNames.values,
        ...sourceGameNames.values,
      }.join(' ').toLowerCase();

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'group': group,
        'kind': kind.jsonValue,
        'filePath': filePath,
        'createdAt': createdAt,
        'infoExtracted': infoExtracted,
        'strength': strength,
        'preciseType': preciseType,
        'fidelity': fidelity,
        'informationExtracted': informationExtracted,
        'width': width,
        'height': height,
        'sourceId': sourceId,
        'sourceNames': sourceNames,
        'sourceGameNames': sourceGameNames,
        'sourceGameId': sourceGameId,
        'sourceCategory': sourceCategory,
      };

  ReferencePreset copyWith({
    String? id,
    String? name,
    String? group,
    String? filePath,
  }) =>
      ReferencePreset(
        id: id ?? this.id,
        name: name ?? this.name,
        group: group ?? this.group,
        kind: kind,
        filePath: filePath ?? this.filePath,
        createdAt: createdAt,
        infoExtracted: infoExtracted,
        strength: strength,
        preciseType: preciseType,
        fidelity: fidelity,
        informationExtracted: informationExtracted,
        width: width,
        height: height,
        sourceId: sourceId,
        sourceNames: sourceNames,
        sourceGameNames: sourceGameNames,
        sourceGameId: sourceGameId,
        sourceCategory: sourceCategory,
      );

  factory ReferencePreset.fromJson(Map<String, dynamic> json) =>
      ReferencePreset(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        group: json['group']?.toString() ?? '',
        kind: referencePresetKindFromJson(json['kind']),
        filePath: json['filePath']?.toString() ?? '',
        createdAt: json['createdAt']?.toString() ?? '',
        infoExtracted: (json['infoExtracted'] as num?)?.toDouble() ?? 1,
        strength: (json['strength'] as num?)?.toDouble() ?? 1,
        preciseType: json['preciseType']?.toString() ?? 'character',
        fidelity: (json['fidelity'] as num?)?.toDouble() ?? 1,
        informationExtracted:
            (json['informationExtracted'] as num?)?.toDouble() ?? 1,
        width: (json['width'] as num?)?.toInt() ?? 0,
        height: (json['height'] as num?)?.toInt() ?? 0,
        sourceId: json['sourceId']?.toString() ?? '',
        sourceNames: _referencePresetStringMap(json['sourceNames']),
        sourceGameNames: _referencePresetStringMap(json['sourceGameNames']),
        sourceGameId: json['sourceGameId']?.toString() ?? '',
        sourceCategory: json['sourceCategory']?.toString() ?? '',
      );
}

Map<String, String> _referencePresetStringMap(Object? value) {
  if (value is! Map) return const {};
  return {
    for (final entry in value.entries)
      if (entry.value != null && entry.value.toString().trim().isNotEmpty)
        entry.key.toString(): entry.value.toString().trim(),
  };
}

class ReferencePresetLibrary {
  final List<String> groups;
  final List<ReferencePreset> presets;

  const ReferencePresetLibrary(
      {this.groups = const [], this.presets = const []});

  Map<String, dynamic> toJson() => {
        'version': 1,
        'groups': groups,
        'presets': presets.map((preset) => preset.toJson()).toList(),
      };

  factory ReferencePresetLibrary.fromJson(Map<String, dynamic> json) =>
      ReferencePresetLibrary(
        groups: referencePresetGroupsWithDefaults(
          (json['groups'] as List<dynamic>? ?? const [])
              .map((value) => value.toString().trim())
              .where((value) => value.isNotEmpty),
        ),
        presets: (json['presets'] as List<dynamic>? ?? const [])
            .whereType<Map>()
            .map((value) =>
                ReferencePreset.fromJson(Map<String, dynamic>.from(value)))
            .where((preset) => preset.id.isNotEmpty && preset.name.isNotEmpty)
            .toList(),
      );
}

class ReferencePresetImport {
  final List<String> groups;
  final List<ReferencePreset> presets;

  const ReferencePresetImport({required this.groups, required this.presets});
}
