import '../models/nai_models.dart';

const defaultComicProjectTitle = 'Untitled comic project';

enum ComicStep { importTags, global, panels, generate }

enum ComicPanelStatus { ready, generating, done, failed }

enum ComicSizeMode { uniform, perPanel }

class ComicImageSize {
  final int width;
  final int height;
  const ComicImageSize(this.width, this.height);

  Map<String, dynamic> toJson() => {'width': width, 'height': height};
}

class ComicReferenceAsset {
  String id;
  String name;
  String filePath;
  String type;
  double strength;
  double fidelity;
  double informationExtracted;

  ComicReferenceAsset({
    required this.id,
    required this.name,
    required this.filePath,
    this.type = 'character',
    this.strength = 1,
    this.fidelity = 1,
    this.informationExtracted = 1,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'filePath': filePath,
        'type': type,
        'strength': strength,
        'fidelity': fidelity,
        'informationExtracted': informationExtracted,
      };

  factory ComicReferenceAsset.fromJson(Map<String, dynamic> json) =>
      ComicReferenceAsset(
        id: json['id']?.toString() ?? comicId(),
        name: json['name']?.toString() ?? 'reference',
        filePath: json['filePath']?.toString() ?? '',
        type: _referenceType(json['type']),
        strength: _referenceValue(json['strength']),
        fidelity: _referenceValue(json['fidelity']),
        informationExtracted: _referenceValue(json['informationExtracted']),
      );
}

class ComicPanelReference {
  String referenceId;
  String type;
  double strength;
  double fidelity;
  double informationExtracted;

  ComicPanelReference({
    required this.referenceId,
    this.type = 'character',
    this.strength = 1,
    this.fidelity = 1,
    this.informationExtracted = 1,
  });

  Map<String, dynamic> toJson() => {
        'referenceId': referenceId,
        'type': type,
        'strength': strength,
        'fidelity': fidelity,
        'informationExtracted': informationExtracted,
      };

  factory ComicPanelReference.fromJson(Map<String, dynamic> json) =>
      ComicPanelReference(
        referenceId: json['referenceId']?.toString() ?? '',
        type: _referenceType(json['type']),
        strength: _referenceValue(json['strength']),
        fidelity: _referenceValue(json['fidelity']),
        informationExtracted: _referenceValue(json['informationExtracted']),
      );
}

String _referenceType(Object? value) =>
    value == 'style' || value == 'character&style'
        ? value.toString()
        : 'character';

double _referenceValue(Object? value) =>
    ((value as num?)?.toDouble() ?? 1).clamp(0, 1).toDouble();

const comicSizePresets = <ComicImageSize>[
  ComicImageSize(1024, 1024),
  ComicImageSize(1216, 832),
  ComicImageSize(832, 1216),
  ComicImageSize(1024, 1536),
  ComicImageSize(1536, 1024),
];

class ComicSizeImportException implements Exception {
  final String code;
  final int? line;
  final int? expected;
  final int? actual;
  const ComicSizeImportException(
    this.code, {
    this.line,
    this.expected,
    this.actual,
  });
}

String comicSizeTemplate(int count, ComicImageSize size) =>
    List.filled(count.clamp(0, 100000).toInt(), '${size.width}×${size.height}')
        .join('\n');

List<ComicImageSize> parseComicSizeImport(String text, int expectedCount) {
  final source = text
      .replaceFirst('\uFEFF', '')
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
  if (source.trim().isEmpty) throw const ComicSizeImportException('empty');
  final lines = source.trim().split('\n');
  if (lines.length != expectedCount) {
    throw ComicSizeImportException(
      'count',
      expected: expectedCount,
      actual: lines.length,
    );
  }
  final allowed =
      comicSizePresets.map((size) => '${size.width}x${size.height}').toSet();
  return lines.asMap().entries.map((entry) {
    final line = entry.value.trim();
    if (line.isEmpty) {
      throw ComicSizeImportException('blank', line: entry.key + 1);
    }
    final match = RegExp(r'^(\d+)\s*[x×]\s*(\d+)$', caseSensitive: false)
        .firstMatch(line);
    if (match == null) {
      throw ComicSizeImportException('format', line: entry.key + 1);
    }
    final width = int.parse(match.group(1)!);
    final height = int.parse(match.group(2)!);
    if (!allowed.contains('${width}x$height')) {
      throw ComicSizeImportException('unsupported', line: entry.key + 1);
    }
    return ComicImageSize(width, height);
  }).toList();
}

class ComicCandidate {
  String id;
  String historyItemId;
  String outputPath;
  String createdAt;
  int? actualAnlas;

  ComicCandidate({
    required this.id,
    required this.historyItemId,
    required this.outputPath,
    required this.createdAt,
    this.actualAnlas,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'historyItemId': historyItemId,
        'outputPath': outputPath,
        'createdAt': createdAt,
        'actualAnlas': actualAnlas,
      };

  factory ComicCandidate.fromJson(Map<String, dynamic> json) => ComicCandidate(
        id: json['id']?.toString() ?? comicId(),
        historyItemId: json['historyItemId']?.toString() ?? '',
        outputPath: json['outputPath']?.toString() ?? '',
        createdAt:
            json['createdAt']?.toString() ?? DateTime.now().toIso8601String(),
        actualAnlas: (json['actualAnlas'] as num?)?.toInt(),
      );
}

class ComicPanel {
  String id;
  int index;
  String title;
  String prompt;
  int? imageWidth;
  int? imageHeight;
  List<ComicPanelReference> preciseReferences;
  bool overrideParams;
  GenerateParams params;
  ComicPanelStatus status;
  List<ComicCandidate> candidates;
  String? selectedCandidateId;
  String error;

  ComicPanel({
    required this.id,
    required this.index,
    required this.title,
    this.prompt = '',
    this.imageWidth,
    this.imageHeight,
    List<ComicPanelReference>? preciseReferences,
    this.overrideParams = false,
    GenerateParams? params,
    this.status = ComicPanelStatus.ready,
    List<ComicCandidate>? candidates,
    this.selectedCandidateId,
    this.error = '',
  })  : preciseReferences = preciseReferences ?? [],
        params = params ?? GenerateParams(),
        candidates = candidates ?? [];

  ComicCandidate? get selectedCandidate {
    if (candidates.isEmpty) return null;
    for (final item in candidates) {
      if (item.id == selectedCandidateId) return item;
    }
    return candidates.first;
  }

  Map<String, dynamic> toJson({bool includeLocalReferences = true}) => {
        'id': id,
        'index': index,
        'title': title,
        'prompt': prompt,
        'imageSize': imageWidth == null || imageHeight == null
            ? null
            : {'width': imageWidth, 'height': imageHeight},
        'preciseReferences': includeLocalReferences
            ? preciseReferences.map((item) => item.toJson()).toList()
            : <Object>[],
        'paramsOverride': overrideParams,
        'params': params.toJson(),
        'status': status.name,
        'candidates': candidates.map((item) => item.toJson()).toList(),
        'selectedCandidateId': selectedCandidateId,
        'error': error,
      };

  factory ComicPanel.fromJson(
    Map<String, dynamic> json,
    int fallbackIndex,
    GenerateParams globalParams, {
    required bool trustOutputs,
  }) {
    final candidates = trustOutputs
        ? (json['candidates'] as List? ?? const [])
            .whereType<Map>()
            .map((item) =>
                ComicCandidate.fromJson(Map<String, dynamic>.from(item)))
            .where((item) => item.outputPath.isNotEmpty)
            .toList()
        : <ComicCandidate>[];
    final selected = json['selectedCandidateId']?.toString();
    final imageSize = json['imageSize'] is Map
        ? Map<String, dynamic>.from(json['imageSize'] as Map)
        : const <String, dynamic>{};
    final selectedExists = candidates.any((item) => item.id == selected);
    return ComicPanel(
      id: json['id']?.toString() ?? comicId(),
      index: (json['index'] as num?)?.toInt() ?? fallbackIndex,
      title: json['title']?.toString().trim().isNotEmpty == true
          ? json['title'].toString().trim()
          : 'Panel $fallbackIndex',
      prompt: json['prompt']?.toString() ?? '',
      imageWidth: (imageSize['width'] as num?)?.toInt(),
      imageHeight: (imageSize['height'] as num?)?.toInt(),
      preciseReferences: trustOutputs
          ? (json['preciseReferences'] as List? ?? const [])
              .whereType<Map>()
              .map((item) =>
                  ComicPanelReference.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : <ComicPanelReference>[],
      overrideParams: json['paramsOverride'] == true,
      params: json['params'] is Map
          ? GenerateParams.fromJson(Map<String, dynamic>.from(json['params']))
          : globalParams.copy(),
      status:
          candidates.isEmpty ? ComicPanelStatus.ready : ComicPanelStatus.done,
      candidates: candidates,
      selectedCandidateId: selectedExists
          ? selected
          : (candidates.isEmpty ? null : candidates.first.id),
      error: '',
    );
  }
}

class ComicProject {
  String id;
  String title;
  String? historyGroupId;
  String globalStylePrompt;
  String globalNegativePrompt;
  ComicSizeMode sizeMode;
  int initialGenerationCount;
  GenerateParams globalParams;
  List<ComicReferenceAsset> preciseReferences;
  List<ComicPanel> panels;

  ComicProject({
    required this.id,
    this.title = defaultComicProjectTitle,
    this.historyGroupId,
    this.globalStylePrompt = '',
    this.globalNegativePrompt = '',
    this.sizeMode = ComicSizeMode.uniform,
    this.initialGenerationCount = 1,
    GenerateParams? globalParams,
    List<ComicReferenceAsset>? preciseReferences,
    List<ComicPanel>? panels,
  })  : globalParams = globalParams ?? GenerateParams(),
        preciseReferences = preciseReferences ?? [],
        panels = panels ?? [];

  factory ComicProject.empty(GenerateParams params) => ComicProject(
        id: comicId(),
        globalParams: params.copy()..positivePrompt = '',
        globalStylePrompt: params.stylePrompt,
        globalNegativePrompt: params.negativePrompt,
      );

  Map<String, dynamic> toJson({bool includeLocalReferences = true}) => {
        'schemaVersion': 2,
        'id': id,
        'title': title,
        'historyGroupId': historyGroupId,
        'globalStylePrompt': globalStylePrompt,
        'globalNegativePrompt': globalNegativePrompt,
        'sizeMode': sizeMode.name,
        'initialGenerationCount': initialGenerationCount.clamp(1, 10),
        'globalParams': globalParams.toJson(),
        'preciseReferences': includeLocalReferences
            ? preciseReferences.map((item) => item.toJson()).toList()
            : <Object>[],
        'panels': panels
            .map((item) =>
                item.toJson(includeLocalReferences: includeLocalReferences))
            .toList(),
      };

  factory ComicProject.fromJson(
    Map<String, dynamic> json,
    GenerateParams fallbackParams, {
    bool trustOutputs = false,
  }) {
    if ((json['schemaVersion'] as num?)?.toInt() != 2) {
      throw const FormatException('Unsupported comic project schema');
    }
    final globalParams = json['globalParams'] is Map
        ? GenerateParams.fromJson(
            Map<String, dynamic>.from(json['globalParams']))
        : fallbackParams.copy();
    final project = ComicProject(
      id: json['id']?.toString() ?? comicId(),
      title: json['title']?.toString() ?? defaultComicProjectTitle,
      historyGroupId: trustOutputs ? json['historyGroupId']?.toString() : null,
      globalStylePrompt: json['globalStylePrompt']?.toString() ?? '',
      globalNegativePrompt: json['globalNegativePrompt']?.toString() ?? '',
      sizeMode: json['sizeMode']?.toString() == 'perPanel'
          ? ComicSizeMode.perPanel
          : ComicSizeMode.uniform,
      initialGenerationCount:
          ((json['initialGenerationCount'] as num?)?.toInt() ?? 1).clamp(1, 10),
      globalParams: globalParams,
      preciseReferences: trustOutputs
          ? (json['preciseReferences'] as List? ?? const [])
              .whereType<Map>()
              .map((item) =>
                  ComicReferenceAsset.fromJson(Map<String, dynamic>.from(item)))
              .where((item) => item.filePath.isNotEmpty)
              .toList()
          : <ComicReferenceAsset>[],
    );
    project.panels = (json['panels'] as List? ?? const [])
        .whereType<Map>()
        .toList()
        .asMap()
        .entries
        .map((entry) => ComicPanel.fromJson(
              Map<String, dynamic>.from(entry.value),
              entry.key + 1,
              globalParams,
              trustOutputs: trustOutputs,
            ))
        .toList();
    for (var index = 0; index < project.panels.length; index++) {
      project.panels[index].index = index + 1;
      final ids = project.preciseReferences.map((item) => item.id).toSet();
      project.panels[index].preciseReferences
          .removeWhere((item) => !ids.contains(item.referenceId));
    }
    return project;
  }
}

var _comicIdCounter = 0;
String comicId() =>
    '${DateTime.now().microsecondsSinceEpoch}-${_comicIdCounter++}';
