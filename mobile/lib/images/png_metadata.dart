import 'dart:convert';
import 'dart:typed_data';

import '../models/nai_models.dart';

class ImportedGenerateParams {
  final String? model;
  final String? positivePrompt;
  final String? negativePrompt;
  final int? width;
  final int? height;
  final int? steps;
  final double? cfgScale;
  final double? cfgRescale;
  final String? sampler;
  final String? noiseSchedule;
  final int? seed;
  final bool? smea;
  final bool? smeaDyn;

  const ImportedGenerateParams({
    this.model,
    this.positivePrompt,
    this.negativePrompt,
    this.width,
    this.height,
    this.steps,
    this.cfgScale,
    this.cfgRescale,
    this.sampler,
    this.noiseSchedule,
    this.seed,
    this.smea,
    this.smeaDyn,
  });

  bool get isEmpty =>
      model == null &&
      positivePrompt == null &&
      negativePrompt == null &&
      width == null &&
      height == null &&
      steps == null &&
      cfgScale == null &&
      cfgRescale == null &&
      sampler == null &&
      noiseSchedule == null &&
      seed == null &&
      smea == null &&
      smeaDyn == null;

  void applyTo(GenerateParams target) {
    if (model case final value?) target.model = value;
    if (positivePrompt case final value?) target.positivePrompt = value;
    if (negativePrompt case final value?) target.negativePrompt = value;
    if (width case final value?) target.width = value;
    if (height case final value?) target.height = value;
    if (steps case final value?) target.steps = value;
    if (cfgScale case final value?) target.cfgScale = value;
    if (cfgRescale case final value?) target.cfgRescale = value;
    if (sampler case final value?) target.sampler = value;
    if (noiseSchedule case final value?) target.noiseSchedule = value;
    if (seed case final value?) {
      target
        ..seed = value
        ..seedMode = value > 0 ? 'fixed' : 'random';
    }
    if (smea case final value?) target.smea = value;
    if (smeaDyn case final value?) target.smeaDyn = value;
  }
}

Map<String, String> parsePngTextMetadata(Uint8List bytes) {
  const signature = <int>[137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8) return {};
  for (var index = 0; index < signature.length; index++) {
    if (bytes[index] != signature[index]) return {};
  }
  final data = ByteData.sublistView(bytes);
  final result = <String, String>{};
  var offset = 8;
  while (offset + 12 <= bytes.length) {
    final length = data.getUint32(offset, Endian.big);
    if (length > bytes.length - offset - 12) break;
    final type = ascii.decode(bytes.sublist(offset + 4, offset + 8));
    if (type == 'IEND') break;
    if (type == 'tEXt' && length > 0) {
      final chunk = bytes.sublist(offset + 8, offset + 8 + length);
      final separator = chunk.indexOf(0);
      if (separator >= 0) {
        final key = latin1.decode(chunk.sublist(0, separator));
        final value = utf8.decode(
          chunk.sublist(separator + 1),
          allowMalformed: true,
        );
        result[key] = value;
      }
    }
    offset += 12 + length;
  }
  return result;
}

Uint8List stripPngMetadata(Uint8List bytes) {
  const signature = <int>[137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8) return bytes;
  for (var index = 0; index < signature.length; index++) {
    if (bytes[index] != signature[index]) return bytes;
  }
  const metadataTypes = {'tEXt', 'iTXt', 'zTXt', 'eXIf'};
  final data = ByteData.sublistView(bytes);
  final output = BytesBuilder(copy: false)..add(bytes.sublist(0, 8));
  var offset = 8;
  while (offset + 12 <= bytes.length) {
    final length = data.getUint32(offset, Endian.big);
    final end = offset + 12 + length;
    if (end > bytes.length) return bytes;
    final type = ascii.decode(bytes.sublist(offset + 4, offset + 8));
    if (!metadataTypes.contains(type)) output.add(bytes.sublist(offset, end));
    offset = end;
    if (type == 'IEND') break;
  }
  return output.takeBytes();
}

ImportedGenerateParams parseImportedGenerateParams(
  Map<String, String> metadata,
) {
  Map<String, dynamic> comment = const {};
  try {
    final decoded = jsonDecode(metadata['Comment'] ?? '{}');
    if (decoded is Map) comment = Map<String, dynamic>.from(decoded);
  } catch (_) {
    comment = const {};
  }
  final modelValues = naiModels.map((item) => item.value).toSet();
  final samplerValues = naiSamplers.map((item) => item.value).toSet();
  final modelCandidate = comment['model'] is String
      ? comment['model'] as String
      : metadata['Source'];
  final prompt = metadata['Description'] ??
      (comment['prompt'] is String ? comment['prompt'] as String : null);

  return ImportedGenerateParams(
    model: modelCandidate != null && modelValues.contains(modelCandidate)
        ? modelCandidate
        : null,
    positivePrompt: _nonEmpty(prompt),
    negativePrompt:
        comment['uc'] is String ? _nonEmpty(comment['uc'] as String) : null,
    width: _intValue(comment['width']),
    height: _intValue(comment['height']),
    steps: _intValue(comment['steps']),
    cfgScale: _doubleValue(comment['scale']),
    cfgRescale: _doubleValue(comment['cfg_rescale']),
    sampler: comment['sampler'] is String &&
            samplerValues.contains(comment['sampler'])
        ? comment['sampler'] as String
        : null,
    noiseSchedule: comment['noise_schedule'] is String
        ? comment['noise_schedule'] as String
        : null,
    seed: _intValue(comment['seed']),
    smea: comment['sm'] is bool ? comment['sm'] as bool : null,
    smeaDyn: comment['sm_dyn'] is bool ? comment['sm_dyn'] as bool : null,
  );
}

String? _nonEmpty(String? value) {
  final normalized = value?.trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}

int? _intValue(Object? value) =>
    value is num && value.isFinite ? value.round() : null;

double? _doubleValue(Object? value) =>
    value is num && value.isFinite ? value.toDouble() : null;
