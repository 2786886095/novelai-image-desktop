enum ReferencePresetKind { vibe, precise }

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

  const ReferencePreset({
    required this.id,
    required this.name,
    required this.group,
    required this.kind,
    required this.filePath,
    required this.createdAt,
    this.infoExtracted = 0.7,
    this.strength = 0.6,
    this.preciseType = 'character',
    this.fidelity = 1,
    this.informationExtracted = 1,
    this.width = 0,
    this.height = 0,
  });

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
      );

  factory ReferencePreset.fromJson(Map<String, dynamic> json) =>
      ReferencePreset(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        group: json['group']?.toString() ?? '',
        kind: referencePresetKindFromJson(json['kind']),
        filePath: json['filePath']?.toString() ?? '',
        createdAt: json['createdAt']?.toString() ?? '',
        infoExtracted: (json['infoExtracted'] as num?)?.toDouble() ?? 0.7,
        strength: (json['strength'] as num?)?.toDouble() ?? 0.6,
        preciseType: json['preciseType']?.toString() ?? 'character',
        fidelity: (json['fidelity'] as num?)?.toDouble() ?? 1,
        informationExtracted:
            (json['informationExtracted'] as num?)?.toDouble() ?? 1,
        width: (json['width'] as num?)?.toInt() ?? 0,
        height: (json['height'] as num?)?.toInt() ?? 0,
      );
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
        groups: (json['groups'] as List<dynamic>? ?? const [])
            .map((value) => value.toString().trim())
            .where((value) => value.isNotEmpty)
            .toSet()
            .toList(),
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
