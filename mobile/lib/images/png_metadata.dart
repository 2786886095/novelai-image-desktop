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

  Map<String, Object> get compatibleValues => {
        if (positivePrompt != null) 'Positive prompt': positivePrompt!,
        if (negativePrompt != null) 'Negative prompt': negativePrompt!,
        if (model != null) 'Model': model!,
        if (width != null) 'Width': width!,
        if (height != null) 'Height': height!,
        if (steps != null) 'Steps': steps!,
        if (cfgScale != null) 'CFG scale': cfgScale!,
        if (cfgRescale != null) 'CFG rescale': cfgRescale!,
        if (sampler != null) 'Sampler': sampler!,
        if (noiseSchedule != null) 'Noise schedule': noiseSchedule!,
        if (seed != null) 'Seed': seed!,
        if (smea != null) 'SMEA': smea!,
        if (smeaDyn != null) 'SMEA Dyn': smeaDyn!,
      };

  Map<String, Object> get compatibleValuesByKey => {
        if (positivePrompt != null) 'positivePrompt': positivePrompt!,
        if (negativePrompt != null) 'negativePrompt': negativePrompt!,
        if (model != null) 'model': model!,
        if (width != null) 'width': width!,
        if (height != null) 'height': height!,
        if (steps != null) 'steps': steps!,
        if (cfgScale != null) 'cfgScale': cfgScale!,
        if (cfgRescale != null) 'cfgRescale': cfgRescale!,
        if (sampler != null) 'sampler': sampler!,
        if (noiseSchedule != null) 'noiseSchedule': noiseSchedule!,
        if (seed != null) 'seed': seed!,
        if (smea != null) 'smea': smea!,
        if (smeaDyn != null) 'smeaDyn': smeaDyn!,
      };

  ImportedGenerateParams selecting(Set<String> keys) => ImportedGenerateParams(
        model: keys.contains('model') ? model : null,
        positivePrompt: keys.contains('positivePrompt') ? positivePrompt : null,
        negativePrompt: keys.contains('negativePrompt') ? negativePrompt : null,
        width: keys.contains('width') ? width : null,
        height: keys.contains('height') ? height : null,
        steps: keys.contains('steps') ? steps : null,
        cfgScale: keys.contains('cfgScale') ? cfgScale : null,
        cfgRescale: keys.contains('cfgRescale') ? cfgRescale : null,
        sampler: keys.contains('sampler') ? sampler : null,
        noiseSchedule: keys.contains('noiseSchedule') ? noiseSchedule : null,
        seed: keys.contains('seed') ? seed : null,
        smea: keys.contains('smea') ? smea : null,
        smeaDyn: keys.contains('smeaDyn') ? smeaDyn : null,
      );
}

const importedGenerateParamKeys = <String>{
  'model',
  'positivePrompt',
  'negativePrompt',
  'width',
  'height',
  'steps',
  'cfgScale',
  'cfgRescale',
  'sampler',
  'noiseSchedule',
  'seed',
  'smea',
  'smeaDyn',
};

enum ImageMetadataKind { novelAi, stableDiffusion, comfyUi, unknown }

class ImageMetadataEntry {
  final String key;
  final String value;
  final String group;

  const ImageMetadataEntry({
    required this.key,
    required this.value,
    required this.group,
  });
}

class ImageMetadataReport {
  final ImageMetadataKind kind;
  final String software;
  final ImportedGenerateParams imported;
  final List<ImageMetadataEntry> entries;
  final Map<String, String> rawMetadata;
  final String rawText;
  final List<String> warnings;

  const ImageMetadataReport({
    required this.kind,
    required this.software,
    required this.imported,
    required this.entries,
    required this.rawMetadata,
    required this.rawText,
    this.warnings = const [],
  });
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
    } else if (type == 'iTXt' && length > 0) {
      final chunk = bytes.sublist(offset + 8, offset + 8 + length);
      final keywordEnd = chunk.indexOf(0);
      if (keywordEnd >= 0 && keywordEnd + 2 < chunk.length) {
        final key = latin1.decode(chunk.sublist(0, keywordEnd));
        final compressed = chunk[keywordEnd + 1] != 0;
        var cursor = keywordEnd + 3;
        final languageEnd = chunk.indexOf(0, cursor);
        if (languageEnd >= 0) {
          cursor = languageEnd + 1;
          final translatedEnd = chunk.indexOf(0, cursor);
          if (translatedEnd >= 0 && !compressed) {
            result[key] = utf8.decode(
              chunk.sublist(translatedEnd + 1),
              allowMalformed: true,
            );
          }
        }
      }
    }
    offset += 12 + length;
  }
  return result;
}

Map<String, String> parseImageTextMetadata(Uint8List bytes) {
  final png = parsePngTextMetadata(bytes);
  if (png.isNotEmpty) return png;
  final jpeg = _parseJpegMetadata(bytes);
  if (jpeg.isNotEmpty) return jpeg;
  return _parseWebpMetadata(bytes);
}

Map<String, String> _parseJpegMetadata(Uint8List bytes) {
  if (bytes.length < 4 || bytes[0] != 0xff || bytes[1] != 0xd8) return {};
  var offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] != 0xff) {
      offset++;
      continue;
    }
    final marker = bytes[offset + 1];
    if (marker == 0xda || marker == 0xd9) break;
    if (marker == 0x00 ||
        marker == 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    final length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker == 0xe1 &&
        length >= 8 &&
        latin1.decode(bytes.sublist(offset + 4, offset + 10)) ==
            'Exif\u0000\u0000') {
      return _readTiffMetadata(bytes, offset + 10);
    }
    offset += 2 + length;
  }
  return {};
}

Map<String, String> _parseWebpMetadata(Uint8List bytes) {
  if (bytes.length < 12 ||
      latin1.decode(bytes.sublist(0, 4)) != 'RIFF' ||
      latin1.decode(bytes.sublist(8, 12)) != 'WEBP') {
    return {};
  }
  final data = ByteData.sublistView(bytes);
  var offset = 12;
  while (offset + 8 <= bytes.length) {
    final type = latin1.decode(bytes.sublist(offset, offset + 4));
    final length = data.getUint32(offset + 4, Endian.little);
    final start = offset + 8;
    if (start + length > bytes.length) break;
    if (type == 'EXIF') {
      final hasPrefix = length >= 6 &&
          latin1.decode(bytes.sublist(start, start + 6)) == 'Exif\u0000\u0000';
      return _readTiffMetadata(bytes, start + (hasPrefix ? 6 : 0));
    }
    offset = start + length + (length.isOdd ? 1 : 0);
  }
  return {};
}

Map<String, String> _readTiffMetadata(Uint8List bytes, int tiffStart) {
  if (tiffStart < 0 || tiffStart + 8 > bytes.length) return {};
  final byteOrder = latin1.decode(bytes.sublist(tiffStart, tiffStart + 2));
  final little = byteOrder == 'II';
  if (!little && byteOrder != 'MM') return {};
  final data = ByteData.sublistView(bytes);
  int u16(int offset) => data.getUint16(
        offset,
        little ? Endian.little : Endian.big,
      );
  int u32(int offset) => data.getUint32(
        offset,
        little ? Endian.little : Endian.big,
      );
  if (u16(tiffStart + 2) != 42) return {};

  final result = <String, String>{};
  final visited = <int>{};

  Uint8List? readValue(int entry, int type, int count) {
    final unit = switch (type) {
      1 || 2 || 7 => 1,
      3 => 2,
      4 => 4,
      _ => 0,
    };
    if (unit == 0 || count <= 0 || count > 16000000) return null;
    final size = unit * count;
    final start = size <= 4 ? entry + 8 : tiffStart + u32(entry + 8);
    if (start < 0 || start + size > bytes.length) return null;
    return Uint8List.sublistView(bytes, start, start + size);
  }

  String decodeAscii(Uint8List value) {
    final zero = value.indexOf(0);
    return utf8
        .decode(zero >= 0 ? value.sublist(0, zero) : value,
            allowMalformed: true)
        .trim();
  }

  String decodeUtf16(Uint8List value, {required bool littleEndian}) {
    final units = <int>[];
    for (var index = 0; index + 1 < value.length; index += 2) {
      final unit = littleEndian
          ? value[index] | (value[index + 1] << 8)
          : (value[index] << 8) | value[index + 1];
      if (unit != 0) units.add(unit);
    }
    return String.fromCharCodes(units).trim();
  }

  String decodeUserComment(Uint8List value) {
    if (value.length <= 8) return '';
    final marker = latin1.decode(value.sublist(0, 8), allowInvalid: true);
    var payload = Uint8List.sublistView(value, 8);
    if (marker.startsWith('ASCII')) return decodeAscii(payload);
    if (marker.startsWith('UNICODE')) {
      if (payload.length >= 2 && payload[0] == 0xff && payload[1] == 0xfe) {
        payload = Uint8List.sublistView(payload, 2);
        return decodeUtf16(payload, littleEndian: true);
      }
      if (payload.length >= 2 && payload[0] == 0xfe && payload[1] == 0xff) {
        payload = Uint8List.sublistView(payload, 2);
      }
      return decodeUtf16(payload, littleEndian: false);
    }
    return decodeAscii(value);
  }

  void visitIfd(int relativeOffset) {
    final ifd = tiffStart + relativeOffset;
    if (relativeOffset <= 0 ||
        visited.contains(ifd) ||
        ifd + 2 > bytes.length) {
      return;
    }
    visited.add(ifd);
    final count = u16(ifd);
    if (count > 4096 || ifd + 2 + count * 12 > bytes.length) return;
    for (var index = 0; index < count; index++) {
      final entry = ifd + 2 + index * 12;
      final tag = u16(entry);
      final type = u16(entry + 2);
      final valueCount = u32(entry + 4);
      if (tag == 0x8769 || tag == 0x8825) {
        visitIfd(u32(entry + 8));
        continue;
      }
      final value = readValue(entry, type, valueCount);
      if (value == null) continue;
      if (tag == 0x010e) result['ImageDescription'] = decodeAscii(value);
      if (tag == 0x0131) result['Software'] = decodeAscii(value);
      if (tag == 0x9286) result['UserComment'] = decodeUserComment(value);
      if (tag == 0x9c9c) {
        result['XPComment'] = decodeUtf16(value, littleEndian: true);
      }
    }
  }

  visitIfd(u32(tiffStart + 4));
  for (final value in [
    result['UserComment'],
    result['XPComment'],
    result['ImageDescription'],
  ]) {
    if (value != null &&
        RegExp(r'(^|\n)Steps:\s*\d+', multiLine: true).hasMatch(value)) {
      result['parameters'] = value;
      break;
    }
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

int? _intValue(Object? value) {
  if (value is num && value.isFinite) return value.round();
  if (value is String) return double.tryParse(value.trim())?.round();
  return null;
}

double? _doubleValue(Object? value) {
  if (value is num && value.isFinite) return value.toDouble();
  if (value is String) return double.tryParse(value.trim());
  return null;
}

String? _textValue(Object? value) {
  if (value is! String || value.trim().isEmpty) return null;
  return value.trim();
}

String? _naiSampler(Object? value) {
  final text = _textValue(value);
  if (text == null) return null;
  if (naiSamplers.any((item) => item.value == text)) return text;
  final normalized = text
      .toLowerCase()
      .replaceAll(RegExp(r'[._-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  return const {
    'euler a': 'k_euler_ancestral',
    'euler ancestral': 'k_euler_ancestral',
    'euler': 'k_euler',
    'dpm++ 2m': 'k_dpmpp_2m',
    'dpmpp 2m': 'k_dpmpp_2m',
    'dpm++ 2m sde': 'k_dpmpp_2m_sde',
    'dpmpp 2m sde': 'k_dpmpp_2m_sde',
    'dpm++ sde': 'k_dpmpp_sde',
    'dpmpp sde': 'k_dpmpp_sde',
    'dpm++ 2s a': 'k_dpmpp_2s_ancestral',
    'dpm++ 2s ancestral': 'k_dpmpp_2s_ancestral',
    'ddim': 'ddim_v3',
    'ddim v3': 'ddim_v3',
  }[normalized];
}

String? _naiScheduler(Object? value) {
  final text = _textValue(value)?.toLowerCase();
  if (text == null) return null;
  if (text.contains('karras')) return 'karras';
  if (text.contains('exponential')) return 'exponential';
  if (text == 'normal' || text == 'simple' || text == 'native') {
    return 'native';
  }
  return null;
}

class _StableDiffusionInfo {
  final String? prompt;
  final String? negativePrompt;
  final Map<String, String> parameters;

  const _StableDiffusionInfo({
    required this.prompt,
    required this.negativePrompt,
    required this.parameters,
  });
}

_StableDiffusionInfo _parseStableDiffusionParameters(String text) {
  final normalized = text.replaceAll(RegExp(r'\r\n?'), '\n').trim();
  final markers = RegExp(r'(^|\n)Steps:\s*', multiLine: true)
      .allMatches(normalized)
      .toList();
  if (markers.isEmpty) {
    return const _StableDiffusionInfo(
        prompt: null, negativePrompt: null, parameters: {});
  }
  final marker = markers.last;
  final markerStart = marker.start;
  final parameterStart =
      markerStart + (marker.group(0)?.startsWith('\n') == true ? 1 : 0);
  final promptBlock = normalized.substring(0, markerStart).trim();
  final parameterText = normalized.substring(parameterStart).trim();
  const negativeMarker = '\nNegative prompt:';
  final negativeAt = promptBlock.lastIndexOf(negativeMarker);
  final prompt =
      (negativeAt >= 0 ? promptBlock.substring(0, negativeAt) : promptBlock)
          .trim();
  final negative = negativeAt >= 0
      ? promptBlock.substring(negativeAt + negativeMarker.length).trim()
      : '';

  final values = <String, String>{};
  final matches = RegExp(
    r'(?:^|,\s)([A-Za-z][A-Za-z0-9 +_./()%-]*?):\s',
  ).allMatches(parameterText).toList();
  for (var index = 0; index < matches.length; index++) {
    final match = matches[index];
    final key = match.group(1)!.trim();
    final end = index + 1 < matches.length
        ? matches[index + 1].start
        : parameterText.length;
    values[key] = parameterText
        .substring(match.end, end)
        .replaceFirst(RegExp(r',\s*$'), '')
        .trim();
  }
  return _StableDiffusionInfo(
    prompt: prompt.isEmpty ? null : prompt,
    negativePrompt: negative.isEmpty ? null : negative,
    parameters: values,
  );
}

ImportedGenerateParams _importedFromStableDiffusion(_StableDiffusionInfo info) {
  final p = info.parameters;
  final size = RegExp(r'(\d+)\s*[x×]\s*(\d+)', caseSensitive: false)
      .firstMatch(p['Size'] ?? '');
  final scheduler = p['Scheduler'] ?? p['Schedule type'];
  return ImportedGenerateParams(
    positivePrompt: info.prompt,
    negativePrompt: info.negativePrompt,
    steps: _intValue(p['Steps']),
    cfgScale: _doubleValue(p['CFG scale'] ?? p['CFG']),
    seed: _intValue(p['Seed']),
    width: size == null ? _intValue(p['Width']) : int.parse(size.group(1)!),
    height: size == null ? _intValue(p['Height']) : int.parse(size.group(2)!),
    sampler: _naiSampler(p['Sampler']),
    noiseSchedule: _naiScheduler(scheduler),
  );
}

Map<String, dynamic>? _jsonMap(String? value) {
  if (value == null || value.isEmpty) return null;
  try {
    final decoded = jsonDecode(value);
    return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
  } catch (_) {
    return null;
  }
}

Object? _jsonValue(String? value) {
  if (value == null || value.isEmpty) return null;
  try {
    return jsonDecode(value);
  } catch (_) {
    return null;
  }
}

const _comfyWidgetKeys = <String, List<String>>{
  'KSampler': [
    'Seed',
    'Seed mode',
    'Steps',
    'CFG scale',
    'Sampler',
    'Scheduler',
    'Denoise'
  ],
  'KSamplerAdvanced': [
    'Add noise',
    'Noise seed',
    'Seed mode',
    'Steps',
    'CFG scale',
    'Sampler',
    'Scheduler',
    'Start step',
    'End step',
    'Return with leftover noise'
  ],
  'CheckpointLoaderSimple': ['Model'],
  'CheckpointLoader': ['Model', 'Config'],
  'UNETLoader': ['Model', 'Weight dtype'],
  'VAELoader': ['VAE'],
  'CLIPLoader': ['CLIP model', 'CLIP type', 'Device'],
  'DualCLIPLoader': ['CLIP model 1', 'CLIP model 2', 'CLIP type', 'Device'],
  'CLIPTextEncode': ['Prompt'],
  'EmptyLatentImage': ['Width', 'Height', 'Batch size'],
  'EmptySD3LatentImage': ['Width', 'Height', 'Batch size'],
  'LatentUpscaleBy': ['Upscale method', 'Upscale scale'],
  'LatentUpscale': ['Upscale method', 'Width', 'Height', 'Crop'],
  'LoraLoader': ['LoRA', 'LoRA model strength', 'LoRA CLIP strength'],
  'LoraLoaderModelOnly': ['LoRA', 'LoRA model strength'],
  'ControlNetLoader': ['ControlNet model'],
  'LoadImage': ['Input image', 'Upload mode'],
  'SaveImage': ['Filename prefix'],
  'PreviewImage': [],
  'FluxGuidance': ['Guidance'],
  'CFGGuider': ['CFG scale'],
  'BasicScheduler': ['Scheduler', 'Steps', 'Denoise'],
  'RandomNoise': ['Seed', 'Seed mode'],
};

ImportedGenerateParams _mergeImported(
  ImportedGenerateParams primary,
  ImportedGenerateParams fallback,
) =>
    ImportedGenerateParams(
      model: primary.model ?? fallback.model,
      positivePrompt: primary.positivePrompt ?? fallback.positivePrompt,
      negativePrompt: primary.negativePrompt ?? fallback.negativePrompt,
      width: primary.width ?? fallback.width,
      height: primary.height ?? fallback.height,
      steps: primary.steps ?? fallback.steps,
      cfgScale: primary.cfgScale ?? fallback.cfgScale,
      cfgRescale: primary.cfgRescale ?? fallback.cfgRescale,
      sampler: primary.sampler ?? fallback.sampler,
      noiseSchedule: primary.noiseSchedule ?? fallback.noiseSchedule,
      seed: primary.seed ?? fallback.seed,
      smea: primary.smea ?? fallback.smea,
      smeaDyn: primary.smeaDyn ?? fallback.smeaDyn,
    );

({ImportedGenerateParams imported, List<ImageMetadataEntry> entries})
    _inspectComfyWorkflow(String? value) {
  final decoded = _jsonValue(value);
  final rawNodes = decoded is List
      ? decoded
      : decoded is Map && decoded['nodes'] is List
          ? decoded['nodes'] as List
          : const [];
  final entries = <ImageMetadataEntry>[];
  var imported = const ImportedGenerateParams();
  void add(String key, Object? raw, String type, Object? id) {
    if (raw == null || raw == '') return;
    final group = RegExp(r'model|vae|clip|lora|controlnet|dtype|config',
                caseSensitive: false)
            .hasMatch(key)
        ? 'model'
        : RegExp(r'width|height|size|upscale|crop|image', caseSensitive: false)
                .hasMatch(key)
            ? 'image'
            : 'generation';
    final text = raw is String ? raw : _metadataValue(raw);
    entries.add(ImageMetadataEntry(
      key: key,
      value: rawNodes.length > 1 ? '[$type #${id ?? '?'}] $text' : text,
      group: group,
    ));
  }

  for (final rawNode in rawNodes) {
    if (rawNode is! Map) continue;
    final node = Map<String, dynamic>.from(rawNode);
    if (_intValue(node['mode']) == 4) continue;
    final type = _textValue(node['type']) ?? 'ComfyUI node';
    final widgets = node['widgets_values'] is List
        ? node['widgets_values'] as List
        : const [];
    final known = _comfyWidgetKeys[type];
    if (known != null) {
      for (var index = 0; index < known.length; index++) {
        add(known[index], index < widgets.length ? widgets[index] : null, type,
            node['id']);
      }
    } else if (node['inputs'] is List) {
      var widgetIndex = 0;
      for (final rawInput in node['inputs'] as List) {
        if (rawInput is! Map || rawInput['widget'] == null) continue;
        if (rawInput['link'] != null) continue;
        add(
            '$type · ${rawInput['label'] ?? rawInput['name'] ?? 'Value ${widgetIndex + 1}'}',
            widgetIndex < widgets.length ? widgets[widgetIndex] : null,
            type,
            node['id']);
        widgetIndex++;
      }
    }
    if (type == 'KSampler') {
      imported = _mergeImported(
        ImportedGenerateParams(
          seed: widgets.isNotEmpty ? _intValue(widgets[0]) : null,
          steps: widgets.length > 2 ? _intValue(widgets[2]) : null,
          cfgScale: widgets.length > 3 ? _doubleValue(widgets[3]) : null,
          sampler:
              widgets.length > 4 ? _naiSampler(_textValue(widgets[4])) : null,
          noiseSchedule:
              widgets.length > 5 ? _naiScheduler(_textValue(widgets[5])) : null,
        ),
        imported,
      );
    } else if (type == 'EmptyLatentImage' || type == 'EmptySD3LatentImage') {
      imported = _mergeImported(
          ImportedGenerateParams(
            width: widgets.isNotEmpty ? _intValue(widgets[0]) : null,
            height: widgets.length > 1 ? _intValue(widgets[1]) : null,
          ),
          imported);
    } else if (type == 'CLIPTextEncode' && imported.positivePrompt == null) {
      imported = _mergeImported(
          ImportedGenerateParams(
              positivePrompt:
                  widgets.isNotEmpty ? _textValue(widgets[0]) : null),
          imported);
    }
  }
  final seen = <String>{};
  return (
    imported: imported,
    entries: entries
        .where((entry) => seen.add('${entry.key}\u0000${entry.value}'))
        .toList(),
  );
}

String? _referenceId(Object? value) {
  if (value is! List || value.isEmpty) return null;
  final id = value.first;
  return id is String || id is num ? id.toString() : null;
}

Map<String, dynamic>? _comfyNode(
  Map<String, dynamic> prompt,
  String id,
) {
  final value = prompt[id];
  return value is Map ? Map<String, dynamic>.from(value) : null;
}

Map<String, dynamic>? _findComfyUpstream(
  Map<String, dynamic> prompt,
  Object? start,
  bool Function(Map<String, dynamic>) predicate,
) {
  final first = _referenceId(start);
  if (first == null) return null;
  final queue = <String>[first];
  final seen = <String>{};
  while (queue.isNotEmpty) {
    final id = queue.removeAt(0);
    if (!seen.add(id)) continue;
    final node = _comfyNode(prompt, id);
    if (node == null) continue;
    if (predicate(node)) return node;
    final inputs = node['inputs'];
    if (inputs is! Map) continue;
    for (final value in inputs.values) {
      final next = _referenceId(value);
      if (next != null) queue.add(next);
    }
  }
  return null;
}

String? _comfyClass(Map<String, dynamic> node) =>
    _textValue(node['class_type']);

Map<String, dynamic> _comfyInputs(Map<String, dynamic>? node) {
  final value = node?['inputs'];
  return value is Map ? Map<String, dynamic>.from(value) : {};
}

String? _comfyText(Map<String, dynamic> prompt, Object? reference) {
  final node = _findComfyUpstream(prompt, reference, (candidate) {
    final inputs = _comfyInputs(candidate);
    return (_comfyClass(candidate) ?? '').contains('CLIPTextEncode') ||
        inputs['text'] is String;
  });
  return _textValue(_comfyInputs(node)['text']);
}

({
  ImportedGenerateParams imported,
  List<ImageMetadataEntry> entries,
  List<String> warnings
}) _inspectComfy(Map<String, String> metadata) {
  final workflow = _inspectComfyWorkflow(metadata['workflow']);
  final prompt = _jsonMap(metadata['prompt']);
  if (prompt == null) {
    return (
      imported: workflow.imported,
      entries: workflow.entries,
      warnings: const [
        'ComfyUI prompt JSON is missing or malformed; the raw workflow is still available.'
      ],
    );
  }
  Map<String, dynamic>? sampler;
  for (final entry in prompt.entries) {
    final node = entry.value is Map
        ? Map<String, dynamic>.from(entry.value as Map)
        : null;
    if (node != null && (_comfyClass(node) ?? '').contains('KSampler')) {
      sampler = node;
      break;
    }
  }
  if (sampler == null) {
    return (
      imported: workflow.imported,
      entries: workflow.entries,
      warnings: const [
        'No compatible ComfyUI KSampler node was found; view the raw workflow for all node data.'
      ],
    );
  }
  final inputs = _comfyInputs(sampler);
  final latent = _findComfyUpstream(prompt, inputs['latent_image'], (node) {
    final values = _comfyInputs(node);
    return _intValue(values['width']) != null &&
        _intValue(values['height']) != null;
  });
  final checkpoint = _findComfyUpstream(prompt, inputs['model'], (node) {
    final values = _comfyInputs(node);
    return values['ckpt_name'] is String ||
        (_comfyClass(node) ?? '').contains('CheckpointLoader');
  });
  final latentInputs = _comfyInputs(latent);
  final checkpointInputs = _comfyInputs(checkpoint);
  final positive = _comfyText(prompt, inputs['positive']);
  final negative = _comfyText(prompt, inputs['negative']);
  final samplerName = _textValue(inputs['sampler_name']);
  final scheduler = _textValue(inputs['scheduler']);
  final model = _textValue(checkpointInputs['ckpt_name']);

  final entries = <ImageMetadataEntry>[
    if (positive != null)
      ImageMetadataEntry(
          key: 'Positive prompt', value: positive, group: 'generation'),
    if (negative != null)
      ImageMetadataEntry(
          key: 'Negative prompt', value: negative, group: 'generation'),
    if (_intValue(inputs['seed']) case final value?)
      ImageMetadataEntry(
          key: 'Seed', value: value.toString(), group: 'generation'),
    if (_intValue(inputs['steps']) case final value?)
      ImageMetadataEntry(
          key: 'Steps', value: value.toString(), group: 'generation'),
    if (_doubleValue(inputs['cfg']) case final value?)
      ImageMetadataEntry(
          key: 'CFG scale', value: value.toString(), group: 'generation'),
    if (samplerName != null)
      ImageMetadataEntry(
          key: 'Sampler', value: samplerName, group: 'generation'),
    if (scheduler != null)
      ImageMetadataEntry(
          key: 'Scheduler', value: scheduler, group: 'generation'),
    if (_doubleValue(inputs['denoise']) case final value?)
      ImageMetadataEntry(
          key: 'Denoise', value: value.toString(), group: 'generation'),
    if (_intValue(latentInputs['width']) case final value?)
      ImageMetadataEntry(key: 'Width', value: value.toString(), group: 'image'),
    if (_intValue(latentInputs['height']) case final value?)
      ImageMetadataEntry(
          key: 'Height', value: value.toString(), group: 'image'),
    if (model != null)
      ImageMetadataEntry(key: 'Model', value: model, group: 'model'),
  ];

  final promptImported = ImportedGenerateParams(
    positivePrompt: positive,
    negativePrompt: negative,
    steps: _intValue(inputs['steps']),
    cfgScale: _doubleValue(inputs['cfg']),
    seed: _intValue(inputs['seed']),
    width: _intValue(latentInputs['width']),
    height: _intValue(latentInputs['height']),
    sampler: _naiSampler(samplerName),
    noiseSchedule: _naiScheduler(scheduler),
  );
  final seen = <String>{};
  return (
    imported: _mergeImported(promptImported, workflow.imported),
    entries: [...entries, ...workflow.entries]
        .where((entry) => seen.add('${entry.key}\u0000${entry.value}'))
        .toList(),
    warnings: const [],
  );
}

String _rawMetadataText(Map<String, String> metadata) => metadata.entries
    .map((entry) => '${entry.key}\n${entry.value}')
    .join('\n\n');

String _metadataValue(Object? value) {
  if (value is String) return value;
  if (value == null) return 'null';
  if (value is Map || value is List) {
    const encoder = JsonEncoder.withIndent('  ');
    return encoder.convert(value);
  }
  return value.toString();
}

ImageMetadataReport inspectImageMetadata(Map<String, String> metadata) {
  final lower = <String, String>{
    for (final entry in metadata.entries) entry.key.toLowerCase(): entry.value,
  };
  final software = metadata['Software'] ?? metadata['software'] ?? '';
  final parameters = lower['parameters'];
  if (parameters != null &&
      RegExp(r'(^|\n)Steps:\s*\d+', multiLine: true).hasMatch(parameters)) {
    final sd = _parseStableDiffusionParameters(parameters);
    final imported = _importedFromStableDiffusion(sd);
    final entries = <ImageMetadataEntry>[
      if (sd.prompt != null)
        ImageMetadataEntry(
            key: 'Positive prompt', value: sd.prompt!, group: 'generation'),
      if (sd.negativePrompt != null)
        ImageMetadataEntry(
            key: 'Negative prompt',
            value: sd.negativePrompt!,
            group: 'generation'),
      ...sd.parameters.entries.map((entry) => ImageMetadataEntry(
            key: entry.key,
            value: entry.value,
            group: RegExp(r'model|vae|lora|checkpoint', caseSensitive: false)
                    .hasMatch(entry.key)
                ? 'model'
                : RegExp(r'size|width|height', caseSensitive: false)
                        .hasMatch(entry.key)
                    ? 'image'
                    : 'generation',
          )),
    ];
    final warnings = <String>[];
    if (sd.parameters['Sampler'] != null && imported.sampler == null) {
      warnings.add(
          'Sampler “${sd.parameters['Sampler']}” is not available in NovelAI and will remain view-only.');
    }
    if (sd.parameters['Model'] != null || sd.parameters['Model hash'] != null) {
      warnings.add(
          'Stable Diffusion checkpoints cannot be selected in NovelAI; model fields are view-only.');
    }
    return ImageMetadataReport(
      kind: ImageMetadataKind.stableDiffusion,
      software: software.isEmpty ? 'Stable Diffusion WebUI' : software,
      imported: imported,
      entries: entries,
      rawMetadata: metadata,
      rawText: parameters,
      warnings: warnings,
    );
  }

  if (lower.containsKey('prompt') || lower.containsKey('workflow')) {
    final comfy = _inspectComfy({
      ...metadata,
      'prompt': lower['prompt'] ?? '',
      'workflow': lower['workflow'] ?? '',
    });
    return ImageMetadataReport(
      kind: ImageMetadataKind.comfyUi,
      software: software.isEmpty ? 'ComfyUI' : software,
      imported: comfy.imported,
      entries: comfy.entries,
      rawMetadata: metadata,
      rawText: _rawMetadataText(metadata),
      warnings: comfy.warnings,
    );
  }

  Map<String, dynamic> comment = {};
  final warnings = <String>[];
  try {
    final decoded =
        jsonDecode(metadata['Comment'] ?? metadata['comment'] ?? '{}');
    if (decoded is Map) comment = Map<String, dynamic>.from(decoded);
  } catch (_) {
    warnings.add('NovelAI Comment JSON is malformed.');
  }
  final description = metadata['Description'] ?? metadata['description'];
  final source = metadata['Source'] ?? metadata['source'];
  final looksNovelAi = software.toLowerCase().contains('novelai') ||
      description != null ||
      metadata.containsKey('Comment') ||
      RegExp(r'stable diffusion (xl|nai)', caseSensitive: false)
          .hasMatch(source ?? '');
  if (looksNovelAi) {
    final normalized = {
      ...metadata,
      if (description != null) 'Description': description,
      'Comment': metadata['Comment'] ?? metadata['comment'] ?? '{}',
      if (source != null) 'Source': source,
    };
    return ImageMetadataReport(
      kind: ImageMetadataKind.novelAi,
      software: software.isEmpty ? 'NovelAI' : software,
      imported: parseImportedGenerateParams(normalized),
      entries: [
        if (description != null)
          ImageMetadataEntry(
              key: 'Description', value: description, group: 'generation'),
        if (source != null)
          ImageMetadataEntry(key: 'Source', value: source, group: 'model'),
        ...comment.entries.map((entry) => ImageMetadataEntry(
              key: entry.key,
              value: _metadataValue(entry.value),
              group:
                  RegExp(r'model|source|lora|reference', caseSensitive: false)
                          .hasMatch(entry.key)
                      ? 'model'
                      : RegExp(r'width|height', caseSensitive: false)
                              .hasMatch(entry.key)
                          ? 'image'
                          : 'generation',
            )),
      ],
      rawMetadata: metadata,
      rawText: _rawMetadataText(metadata),
      warnings: warnings,
    );
  }

  return ImageMetadataReport(
    kind: ImageMetadataKind.unknown,
    software: software.isEmpty ? 'Unknown' : software,
    imported: const ImportedGenerateParams(),
    entries: metadata.entries
        .map((entry) => ImageMetadataEntry(
            key: entry.key, value: entry.value, group: 'raw'))
        .toList(),
    rawMetadata: metadata,
    rawText: _rawMetadataText(metadata),
    warnings: [
      if (metadata.isEmpty)
        'No supported embedded generation metadata was found.'
      else
        'Embedded metadata was found, but its generator format is not recognized.'
    ],
  );
}
