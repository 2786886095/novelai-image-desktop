import '../models/nai_models.dart';

const legacyBatchRedrawGroupName = '批量图生图';
const defaultBatchRedrawGroupName = 'Batch Img2Img';

enum BatchRedrawStep { import, params, prompts, generate }

enum BatchItemStatus { pending, generating, done, failed }

class BatchRedrawItem {
  String id;
  String name;
  String base64;
  String sourcePath;
  int width;
  int height;
  String prompt;
  double? strength;
  bool overrideParams;
  GenerateParams params;
  BatchItemStatus status;
  String outputPath;
  String error;
  bool selected;

  BatchRedrawItem({
    required this.id,
    required this.name,
    required this.base64,
    this.sourcePath = '',
    this.width = 0,
    this.height = 0,
    this.prompt = '',
    this.strength,
    this.overrideParams = false,
    GenerateParams? params,
    this.status = BatchItemStatus.pending,
    this.outputPath = '',
    this.error = '',
    this.selected = false,
  }) : params = params ?? GenerateParams();

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'base64': base64,
        'width': width,
        'height': height,
        'prompt': prompt,
        'strength': strength,
        'overrideParams': overrideParams,
        'params': params.toJson(),
        'status': status.name,
        'outputPath': outputPath,
      };

  factory BatchRedrawItem.fromJson(
    Map<String, dynamic> json,
    GenerateParams fallback, {
    bool trustOutputs = false,
  }) =>
      BatchRedrawItem(
        id: json['id']?.toString() ?? _id(),
        name: json['name']?.toString() ?? 'image',
        base64: json['base64']?.toString() ?? '',
        width: (json['width'] as num?)?.toInt() ?? 0,
        height: (json['height'] as num?)?.toInt() ?? 0,
        prompt: json['prompt']?.toString() ?? '',
        strength: (json['strength'] as num?)?.toDouble(),
        overrideParams: json['overrideParams'] == true,
        params: json['params'] is Map
            ? GenerateParams.fromJson(Map<String, dynamic>.from(json['params']))
            : fallback.copy(),
        status: BatchItemStatus.values.firstWhere(
          (value) => value.name == json['status']?.toString(),
          orElse: () => BatchItemStatus.pending,
        ),
        outputPath: trustOutputs ? json['outputPath']?.toString() ?? '' : '',
      );
}

class BatchRedrawProject {
  String groupName;
  List<BatchRedrawItem> items;
  double globalStrength;
  String globalStyle;
  String globalNegative;
  GenerateParams globalParams;
  ReversePromptMode aiMode;
  String promptBulk;
  bool reuseMainReferences;
  List<VibeTransferItem> vibeImages;
  List<PreciseReferenceItem> preciseReferences;
  String? historyGroupId;

  BatchRedrawProject({
    this.groupName = defaultBatchRedrawGroupName,
    List<BatchRedrawItem>? items,
    this.globalStrength = 0.4,
    this.globalStyle = '',
    this.globalNegative = '',
    GenerateParams? globalParams,
    this.aiMode = ReversePromptMode.tags,
    this.promptBulk = '',
    this.reuseMainReferences = false,
    List<VibeTransferItem>? vibeImages,
    List<PreciseReferenceItem>? preciseReferences,
    this.historyGroupId,
  })  : items = items ?? [],
        vibeImages = vibeImages ?? [],
        preciseReferences = preciseReferences ?? [],
        globalParams = globalParams ?? GenerateParams();

  factory BatchRedrawProject.empty(GenerateParams params) => BatchRedrawProject(
        globalStyle: params.stylePrompt,
        globalNegative: params.negativePrompt,
        globalParams: params.copy()..positivePrompt = '',
      );

  Map<String, dynamic> toJson() => {
        'schemaVersion': 1,
        'groupName': groupName,
        'items': items.map((item) => item.toJson()).toList(),
        'globalStrength': globalStrength,
        'globalStyle': globalStyle,
        'globalNegative': globalNegative,
        'globalParams': globalParams.toJson(),
        'aiMode': aiMode.value,
        'promptBulk': promptBulk,
        'reuseMainReferences': reuseMainReferences,
        'vibeImages': vibeImages.map((item) => item.toJson()).toList(),
        'preciseReferences':
            preciseReferences.map((item) => item.toJson()).toList(),
        'historyGroupId': historyGroupId,
      };

  factory BatchRedrawProject.fromJson(
    Map<String, dynamic> json,
    GenerateParams fallback, {
    bool trustOutputs = false,
  }) {
    final global = json['globalParams'] is Map
        ? GenerateParams.fromJson(
            Map<String, dynamic>.from(json['globalParams']))
        : fallback.copy();
    return BatchRedrawProject(
      groupName: json['groupName']?.toString() ?? defaultBatchRedrawGroupName,
      globalStrength: (json['globalStrength'] as num?)?.toDouble() ?? 0.4,
      globalStyle: json['globalStyle']?.toString() ?? '',
      globalNegative: json['globalNegative']?.toString() ?? '',
      globalParams: global,
      aiMode: ReversePromptMode.values.firstWhere(
        (value) => value.value == json['aiMode']?.toString(),
        orElse: () => ReversePromptMode.tags,
      ),
      promptBulk: json['promptBulk']?.toString() ?? '',
      reuseMainReferences: json['reuseMainReferences'] == true,
      vibeImages: (json['vibeImages'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              VibeTransferItem.fromJson(Map<String, dynamic>.from(item)))
          .where((item) => item.base64.isNotEmpty)
          .toList(),
      preciseReferences: (json['preciseReferences'] as List? ?? const [])
          .whereType<Map>()
          .map((item) =>
              PreciseReferenceItem.fromJson(Map<String, dynamic>.from(item)))
          .where((item) => item.base64.isNotEmpty)
          .toList(),
      historyGroupId: trustOutputs ? json['historyGroupId']?.toString() : null,
      items: (json['items'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => BatchRedrawItem.fromJson(
                Map<String, dynamic>.from(item),
                global,
                trustOutputs: trustOutputs,
              ))
          .where((item) => item.base64.isNotEmpty)
          .toList(),
    );
  }
}

var _counter = 0;
String _id() => '${DateTime.now().microsecondsSinceEpoch}-${_counter++}';
