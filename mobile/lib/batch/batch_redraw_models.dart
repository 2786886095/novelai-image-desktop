import '../models/nai_models.dart';

const legacyBatchRedrawGroupName = '批量图生图';
const defaultBatchRedrawGroupName = 'Batch Img2Img';

enum BatchRedrawStep { import, params, prompts, generate }

enum BatchItemStatus { pending, generating, done, failed }

const maxBatchRedrawCandidates = 8;

int normalizeBatchRedrawCandidateCount(Object? value) {
  final parsed = value is num ? value.toInt() : int.tryParse('$value');
  if (parsed == null || parsed < 1) return 1;
  if (parsed > maxBatchRedrawCandidates) return maxBatchRedrawCandidates;
  return parsed;
}

class BatchRedrawCandidate {
  String id;
  String historyItemId;
  String outputPath;
  String createdAt;
  int? actualSeed;

  BatchRedrawCandidate({
    required this.id,
    required this.historyItemId,
    required this.outputPath,
    required this.createdAt,
    this.actualSeed,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'historyItemId': historyItemId,
        'outputPath': outputPath,
        'createdAt': createdAt,
        'actualSeed': actualSeed,
      };

  factory BatchRedrawCandidate.fromJson(Map<String, dynamic> json) =>
      BatchRedrawCandidate(
        id: json['id']?.toString() ?? _id(),
        historyItemId: json['historyItemId']?.toString() ?? '',
        outputPath: json['outputPath']?.toString() ?? '',
        createdAt:
            json['createdAt']?.toString() ?? DateTime.now().toIso8601String(),
        actualSeed: (json['actualSeed'] as num?)?.toInt(),
      );
}

class BatchRedrawItem {
  String id;
  String name;
  String base64;
  String sourcePath;
  int width;
  int height;
  int? outputWidth;
  int? outputHeight;
  String prompt;
  double? strength;
  bool overrideParams;
  GenerateParams params;
  BatchItemStatus status;
  List<BatchRedrawCandidate> candidates;
  String? selectedCandidateId;
  // Compatibility alias for builds that stored only one output.
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
    this.outputWidth,
    this.outputHeight,
    this.prompt = '',
    this.strength,
    this.overrideParams = false,
    GenerateParams? params,
    this.status = BatchItemStatus.pending,
    List<BatchRedrawCandidate>? candidates,
    this.selectedCandidateId,
    this.outputPath = '',
    this.error = '',
    this.selected = false,
  })  : params = params ?? GenerateParams(),
        candidates = candidates ?? [] {
    if (this.candidates.isNotEmpty) {
      syncSelectedCandidate();
    } else {
      selectedCandidateId = null;
    }
  }

  BatchRedrawCandidate? get selectedCandidate {
    if (candidates.isEmpty) return null;
    for (final candidate in candidates) {
      if (candidate.id == selectedCandidateId) return candidate;
    }
    return candidates.first;
  }

  void syncSelectedCandidate() {
    final selected = selectedCandidate;
    selectedCandidateId = selected?.id;
    outputPath = selected?.outputPath ?? '';
  }

  void addCandidate(BatchRedrawCandidate candidate) {
    if (!candidates.any((item) => item.id == candidate.id)) {
      candidates.add(candidate);
    }
    selectedCandidateId ??= candidate.id;
    syncSelectedCandidate();
  }

  bool selectCandidate(String candidateId) {
    if (!candidates.any((item) => item.id == candidateId)) return false;
    selectedCandidateId = candidateId;
    syncSelectedCandidate();
    return true;
  }

  void clearCandidates() {
    candidates.clear();
    selectedCandidateId = null;
    outputPath = '';
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'base64': base64,
        'width': width,
        'height': height,
        'outputWidth': outputWidth,
        'outputHeight': outputHeight,
        'prompt': prompt,
        'strength': strength,
        'overrideParams': overrideParams,
        'params': params.toJson(),
        'status': status.name,
        'candidates': candidates.map((item) => item.toJson()).toList(),
        'selectedCandidateId': selectedCandidateId,
        'outputPath': outputPath,
      };

  factory BatchRedrawItem.fromJson(
    Map<String, dynamic> json,
    GenerateParams fallback, {
    bool trustOutputs = false,
  }) {
    final candidates = trustOutputs
        ? (json['candidates'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => BatchRedrawCandidate.fromJson(
                  Map<String, dynamic>.from(item),
                ))
            .where((item) => item.outputPath.isNotEmpty)
            .toList()
        : <BatchRedrawCandidate>[];
    final legacyOutput =
        trustOutputs ? json['outputPath']?.toString() ?? '' : '';
    if (candidates.isEmpty && legacyOutput.isNotEmpty) {
      candidates.add(BatchRedrawCandidate(
        id: json['historyItemId']?.toString() ?? _id(),
        historyItemId: json['historyItemId']?.toString() ?? '',
        outputPath: legacyOutput,
        createdAt:
            json['createdAt']?.toString() ?? DateTime.now().toIso8601String(),
      ));
    }
    final selected = json['selectedCandidateId']?.toString();
    final selectedExists = candidates.any((item) => item.id == selected);
    return BatchRedrawItem(
      id: json['id']?.toString() ?? _id(),
      name: json['name']?.toString() ?? 'image',
      base64: json['base64']?.toString() ?? '',
      width: (json['width'] as num?)?.toInt() ?? 0,
      height: (json['height'] as num?)?.toInt() ?? 0,
      outputWidth: (json['outputWidth'] as num?)?.toInt(),
      outputHeight: (json['outputHeight'] as num?)?.toInt(),
      prompt: json['prompt']?.toString() ?? '',
      strength: (json['strength'] as num?)?.toDouble(),
      overrideParams: json['overrideParams'] == true,
      params: json['params'] is Map
          ? GenerateParams.fromJson(Map<String, dynamic>.from(json['params']))
          : fallback.copy(),
      status: candidates.isNotEmpty
          ? BatchItemStatus.done
          : BatchItemStatus.values.firstWhere(
              (value) => value.name == json['status']?.toString(),
              orElse: () => BatchItemStatus.pending,
            ),
      candidates: candidates,
      selectedCandidateId: selectedExists
          ? selected
          : (candidates.isEmpty ? null : candidates.first.id),
    );
  }
}

class BatchRedrawProject {
  String groupName;
  List<BatchRedrawItem> items;
  double globalStrength;
  String globalStyle;
  String globalNegative;
  GenerateParams globalParams;
  int candidateCount;
  String sizeMode;
  String sizeBulk;
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
    this.candidateCount = 1,
    this.sizeMode = 'adaptive',
    this.sizeBulk = '',
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
        'schemaVersion': 2,
        'groupName': groupName,
        'items': items.map((item) => item.toJson()).toList(),
        'globalStrength': globalStrength,
        'globalStyle': globalStyle,
        'globalNegative': globalNegative,
        'globalParams': globalParams.toJson(),
        'candidateCount': normalizeBatchRedrawCandidateCount(candidateCount),
        'sizeMode': sizeMode,
        'sizeBulk': sizeBulk,
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
      candidateCount:
          normalizeBatchRedrawCandidateCount(json['candidateCount']),
      sizeMode: const {'adaptive', 'custom', 'perImage'}
              .contains(json['sizeMode']?.toString())
          ? json['sizeMode'].toString()
          : 'adaptive',
      sizeBulk: json['sizeBulk']?.toString() ?? '',
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

class BatchSizeImportException implements Exception {
  final String code;
  final int? line;
  final int? expected;
  final int? actual;

  const BatchSizeImportException(
    this.code, {
    this.line,
    this.expected,
    this.actual,
  });
}

bool isValidBatchNaiSize(int width, int height) =>
    width >= naiMinDimension &&
    height >= naiMinDimension &&
    width <= naiMaxDimension &&
    height <= naiMaxDimension &&
    width % naiDimensionStep == 0 &&
    height % naiDimensionStep == 0 &&
    width * height <= naiMaxPixelArea;

List<(int, int)> parseBatchSizeImport(String text, int expectedCount) {
  final source = text
      .replaceFirst('\uFEFF', '')
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
  if (source.trim().isEmpty) throw const BatchSizeImportException('empty');
  // Allow a trailing Enter, but preserve leading/internal blank lines so the
  // Nth line can never be silently reassigned to the wrong image.
  final lines = source.trimRight().split('\n');
  if (lines.length != expectedCount) {
    throw BatchSizeImportException(
      'count',
      expected: expectedCount,
      actual: lines.length,
    );
  }
  return lines.asMap().entries.map((entry) {
    final line = entry.value.trim();
    if (line.isEmpty) {
      throw BatchSizeImportException('blank', line: entry.key + 1);
    }
    final match = RegExp(r'^(\d+)\s*[x×*]\s*(\d+)$', caseSensitive: false)
        .firstMatch(line);
    if (match == null) {
      throw BatchSizeImportException('format', line: entry.key + 1);
    }
    final width = int.parse(match.group(1)!);
    final height = int.parse(match.group(2)!);
    if (!isValidBatchNaiSize(width, height)) {
      throw BatchSizeImportException('unsupported', line: entry.key + 1);
    }
    return (width, height);
  }).toList();
}

var _counter = 0;
String _id() => '${DateTime.now().microsecondsSinceEpoch}-${_counter++}';
