import '../models/nai_models.dart';

const defaultComicProjectTitle = 'Untitled comic project';

enum ComicStep { importTags, global, panels, generate }

enum ComicPanelStatus { ready, generating, done, failed }

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
    this.overrideParams = false,
    GenerateParams? params,
    this.status = ComicPanelStatus.ready,
    List<ComicCandidate>? candidates,
    this.selectedCandidateId,
    this.error = '',
  })  : params = params ?? GenerateParams(),
        candidates = candidates ?? [];

  ComicCandidate? get selectedCandidate {
    if (candidates.isEmpty) return null;
    for (final item in candidates) {
      if (item.id == selectedCandidateId) return item;
    }
    return candidates.first;
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'index': index,
        'title': title,
        'prompt': prompt,
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
    final selectedExists = candidates.any((item) => item.id == selected);
    return ComicPanel(
      id: json['id']?.toString() ?? comicId(),
      index: (json['index'] as num?)?.toInt() ?? fallbackIndex,
      title: json['title']?.toString().trim().isNotEmpty == true
          ? json['title'].toString().trim()
          : 'Panel $fallbackIndex',
      prompt: json['prompt']?.toString() ?? '',
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
  int initialGenerationCount;
  GenerateParams globalParams;
  List<ComicPanel> panels;

  ComicProject({
    required this.id,
    this.title = defaultComicProjectTitle,
    this.historyGroupId,
    this.globalStylePrompt = '',
    this.globalNegativePrompt = '',
    this.initialGenerationCount = 1,
    GenerateParams? globalParams,
    List<ComicPanel>? panels,
  })  : globalParams = globalParams ?? GenerateParams(),
        panels = panels ?? [];

  factory ComicProject.empty(GenerateParams params) => ComicProject(
        id: comicId(),
        globalParams: params.copy()..positivePrompt = '',
        globalStylePrompt: params.stylePrompt,
        globalNegativePrompt: params.negativePrompt,
      );

  Map<String, dynamic> toJson() => {
        'schemaVersion': 2,
        'id': id,
        'title': title,
        'historyGroupId': historyGroupId,
        'globalStylePrompt': globalStylePrompt,
        'globalNegativePrompt': globalNegativePrompt,
        'initialGenerationCount': initialGenerationCount.clamp(1, 10),
        'globalParams': globalParams.toJson(),
        'panels': panels.map((item) => item.toJson()).toList(),
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
      initialGenerationCount:
          ((json['initialGenerationCount'] as num?)?.toInt() ?? 1).clamp(1, 10),
      globalParams: globalParams,
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
    }
    return project;
  }
}

var _comicIdCounter = 0;
String comicId() =>
    '${DateTime.now().microsecondsSinceEpoch}-${_comicIdCounter++}';
