import '../models/nai_models.dart';

const legacyComicProjectTitle = '未命名漫画项目';
const defaultComicProjectTitle = 'Untitled comic project';
const legacyComicReferenceName = '参考图';
const defaultComicReferenceName = 'Reference';

enum ComicStep { story, global, panels, generate }

enum ComicPanelStatus { draft, converted, generating, done, failed }

extension ComicPanelStatusLabel on ComicPanelStatus {
  String get label => switch (this) {
        ComicPanelStatus.draft => 'Draft',
        ComicPanelStatus.converted => 'Converted',
        ComicPanelStatus.generating => 'Generating',
        ComicPanelStatus.done => 'Done',
        ComicPanelStatus.failed => 'Failed',
      };
}

class ComicReference {
  String id;
  String name;
  String kind;
  String scope;
  String subjectHint;
  String base64;
  String sourcePath;
  String reversePrompt;
  double infoExtracted;
  double strength;
  bool useForGeneration;
  int width;
  int height;

  ComicReference({
    required this.id,
    required this.name,
    this.kind = 'character',
    this.scope = 'full',
    this.subjectHint = '',
    required this.base64,
    this.sourcePath = '',
    this.reversePrompt = '',
    this.infoExtracted = 1,
    this.strength = 0.65,
    this.useForGeneration = true,
    this.width = 0,
    this.height = 0,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'kind': kind,
        'scope': scope,
        'subjectHint': subjectHint,
        'base64': base64,
        'reversePrompt': reversePrompt,
        'infoExtracted': infoExtracted,
        'strength': strength,
        'useForGeneration': useForGeneration,
        'width': width,
        'height': height,
      };

  factory ComicReference.fromJson(Map<String, dynamic> json) => ComicReference(
        id: json['id']?.toString() ?? _id(),
        name: json['name']?.toString() ?? defaultComicReferenceName,
        kind: json['kind']?.toString() ?? 'character',
        scope: json['scope']?.toString() ?? 'full',
        subjectHint: json['subjectHint']?.toString() ?? '',
        base64: json['base64']?.toString() ?? '',
        reversePrompt: json['reversePrompt']?.toString() ?? '',
        infoExtracted: (json['infoExtracted'] as num?)?.toDouble() ?? 1,
        strength: (json['strength'] as num?)?.toDouble() ?? 0.65,
        useForGeneration: json['useForGeneration'] != false,
        width: (json['width'] as num?)?.toInt() ?? 0,
        height: (json['height'] as num?)?.toInt() ?? 0,
      );
}

class ComicPanel {
  String id;
  int index;
  String cnPrompt;
  String contextSummary;
  String enPrompt;
  String localNegativePrompt;
  bool overrideNegative;
  bool overrideParams;
  GenerateParams params;
  ComicPanelStatus status;
  String outputPath;
  String error;
  int? actualAnlas;

  ComicPanel({
    required this.id,
    required this.index,
    this.cnPrompt = '',
    this.contextSummary = '',
    this.enPrompt = '',
    this.localNegativePrompt = '',
    this.overrideNegative = false,
    this.overrideParams = false,
    GenerateParams? params,
    this.status = ComicPanelStatus.draft,
    this.outputPath = '',
    this.error = '',
    this.actualAnlas,
  }) : params = params ?? GenerateParams();

  Map<String, dynamic> toJson() => {
        'id': id,
        'index': index,
        'cnPrompt': cnPrompt,
        'contextSummary': contextSummary,
        'enPrompt': enPrompt,
        'localNegativePrompt': localNegativePrompt,
        'overrideNegative': overrideNegative,
        'overrideParams': overrideParams,
        'params': params.toJson(),
        'status': status.name,
        'outputPath': outputPath,
        'error': error,
        'actualAnlas': actualAnlas,
      };

  factory ComicPanel.fromJson(
    Map<String, dynamic> json,
    int fallbackIndex,
    GenerateParams globalParams,
    bool trustOutputs,
  ) {
    final statusName = json['status']?.toString() ?? 'draft';
    return ComicPanel(
      id: json['id']?.toString() ?? _id(),
      index: (json['index'] as num?)?.toInt() ?? fallbackIndex,
      cnPrompt: json['cnPrompt']?.toString() ?? '',
      contextSummary: json['contextSummary']?.toString() ?? '',
      enPrompt: json['enPrompt']?.toString() ?? '',
      localNegativePrompt: json['localNegativePrompt']?.toString() ?? '',
      overrideNegative: json['overrideNegative'] == true ||
          json['negativeMode']?.toString() == 'override',
      overrideParams: json['overrideParams'] == true ||
          (json['paramsOverride'] is Map &&
              (json['paramsOverride'] as Map)['enabled'] == true),
      params: json['params'] is Map
          ? GenerateParams.fromJson(Map<String, dynamic>.from(json['params']))
          : globalParams.copy(),
      status: ComicPanelStatus.values.firstWhere(
        (value) => value.name == statusName,
        orElse: () => ComicPanelStatus.draft,
      ),
      outputPath: trustOutputs ? json['outputPath']?.toString() ?? '' : '',
      error: json['error']?.toString() ?? '',
      actualAnlas: (json['actualAnlas'] as num?)?.toInt(),
    );
  }
}

class ComicProject {
  String id;
  String title;
  String? historyGroupId;
  String rawScript;
  ReversePromptMode mode;
  int desiredPanelCount;
  String globalPrompt;
  String globalCharacterSetting;
  String globalStylePrompt;
  String globalNegativePrompt;
  bool autoExportZip;
  GenerateParams globalParams;
  List<ComicReference> references;
  List<ComicPanel> panels;

  ComicProject({
    required this.id,
    this.title = defaultComicProjectTitle,
    this.historyGroupId,
    this.rawScript = '',
    this.mode = ReversePromptMode.natural,
    this.desiredPanelCount = 0,
    this.globalPrompt = '',
    this.globalCharacterSetting = '',
    this.globalStylePrompt = '',
    this.globalNegativePrompt = '',
    this.autoExportZip = false,
    GenerateParams? globalParams,
    List<ComicReference>? references,
    List<ComicPanel>? panels,
  })  : globalParams = globalParams ?? GenerateParams(),
        references = references ?? [],
        panels = panels ?? [];

  factory ComicProject.empty(GenerateParams params) => ComicProject(
        id: _id(),
        globalParams: params.copy()..positivePrompt = '',
        globalStylePrompt: params.stylePrompt,
        globalNegativePrompt: params.negativePrompt,
      );

  Map<String, dynamic> toJson() => {
        'schemaVersion': 1,
        'id': id,
        'title': title,
        'historyGroupId': historyGroupId,
        'rawScript': rawScript,
        'mode': mode.value,
        'desiredPanelCount':
            desiredPanelCount == 0 ? 'auto' : desiredPanelCount,
        'globalPrompt': globalPrompt,
        'globalCharacterSetting': globalCharacterSetting,
        'globalStylePrompt': globalStylePrompt,
        'globalNegativePrompt': globalNegativePrompt,
        'autoExportZip': autoExportZip,
        'globalParams': globalParams.toJson(),
        'references': references.map((item) => item.toJson()).toList(),
        'panels': panels.map((item) => item.toJson()).toList(),
      };

  factory ComicProject.fromJson(
      Map<String, dynamic> json, GenerateParams fallbackParams,
      {bool trustOutputs = false}) {
    final globalParams = json['globalParams'] is Map
        ? GenerateParams.fromJson(
            Map<String, dynamic>.from(json['globalParams']))
        : fallbackParams.copy();
    final rawCount = json['desiredPanelCount'];
    final project = ComicProject(
      id: json['id']?.toString() ?? _id(),
      title: json['title']?.toString() ?? defaultComicProjectTitle,
      historyGroupId: trustOutputs ? json['historyGroupId']?.toString() : null,
      rawScript: json['rawScript']?.toString() ?? '',
      mode: ReversePromptMode.values.firstWhere(
        (value) => value.value == json['mode']?.toString(),
        orElse: () => ReversePromptMode.natural,
      ),
      desiredPanelCount: rawCount is num ? rawCount.toInt().clamp(0, 500) : 0,
      globalPrompt: json['globalPrompt']?.toString() ?? '',
      globalCharacterSetting: json['globalCharacterSetting']?.toString() ?? '',
      globalStylePrompt: json['globalStylePrompt']?.toString() ?? '',
      globalNegativePrompt: json['globalNegativePrompt']?.toString() ?? '',
      autoExportZip: json['autoExportZip'] == true,
      globalParams: globalParams,
      references: (json['references'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              ComicReference.fromJson(Map<String, dynamic>.from(item)))
          .where((item) => item.base64.isNotEmpty)
          .toList(),
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
              trustOutputs,
            ))
        .toList();
    return project;
  }
}

var _idCounter = 0;
String _id() => '${DateTime.now().microsecondsSinceEpoch}-${_idCounter++}';
