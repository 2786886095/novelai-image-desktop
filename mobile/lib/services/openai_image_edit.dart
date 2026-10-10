import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image/image.dart' as im;
import 'openai_images.dart';

class OpenAIEditConfig {
  final String baseUrl, model, quality, inputFidelity, size;
  const OpenAIEditConfig(
      {this.baseUrl = 'https://api.openai.com/v1',
      this.model = 'gpt-image-2.5-sunburst',
      this.quality = 'auto',
      this.inputFidelity = '',
      this.size = 'fit'});
  factory OpenAIEditConfig.fromJson(Map<String, dynamic> v) => OpenAIEditConfig(
      baseUrl:
          v['baseUrl'] is String ? v['baseUrl'] : 'https://api.openai.com/v1',
      model: v['model'] is String ? v['model'] : 'gpt-image-2.5-sunburst',
      quality: ['auto', 'low', 'medium', 'high'].contains(v['quality'])
          ? v['quality']
          : 'auto',
      inputFidelity: ['', 'low', 'high'].contains(v['inputFidelity'])
          ? v['inputFidelity']
          : '',
      size: v['size'] is String ? v['size'] : 'fit');
  Map<String, dynamic> toJson() => {
        'baseUrl': baseUrl,
        'model': model,
        'quality': quality,
        'inputFidelity': inputFidelity,
        'size': size
      };
}

Uri imageEditEndpoint(String value) {
  final url = compatibleImageEndpoint(value);
  final base = url.path
      .replaceFirst(RegExp(r'/images/generations$'), '')
      .replaceFirst(RegExp(r'/images/(generations|edits)$'), '');
  return url.replace(path: '$base/images/edits');
}

class EditCanvasPlan {
  final int width, height, x, y, uploadWidth, uploadHeight;
  final String size;
  const EditCanvasPlan(this.width, this.height, this.x, this.y,
      this.uploadWidth, this.uploadHeight, this.size);
}

EditCanvasPlan planEditCanvas(int w, int h, String size) {
  if (w < 1 || h < 1 || w * h > 64 * 1024 * 1024) {
    throw const FormatException('Invalid dimensions');
  }
  if (size == 'auto') {
    final scale = math.min(1, 2048 / math.max(w, h));
    return EditCanvasPlan(w, h, 0, 0, math.max(1, (w * scale).round()),
        math.max(1, (h * scale).round()), 'auto');
  }
  final match = RegExp(r'^([1-9]\d{1,4})x([1-9]\d{1,4})$').firstMatch(size);
  var target = (1024, 1024);
  if (match != null) {
    target = (int.parse(match[1]!), int.parse(match[2]!));
  } else if (size == 'fit') {
    final aspect = math.log(w / h);
    for (final t in [(1536, 1024), (1024, 1536)]) {
      if ((math.log(t.$1 / t.$2) - aspect).abs() <
          (math.log(target.$1 / target.$2) - aspect).abs()) target = t;
    }
  } else {
    throw const FormatException('Invalid size');
  }
  if (target.$1 * target.$2 > 64 * 1024 * 1024) {
    throw const FormatException('Upload too large');
  }
  final aspect = target.$1 / target.$2;
  final cw = w / h > aspect ? w : math.max(w, (h * aspect).round());
  final ch = w / h > aspect ? math.max(h, (w / aspect).round()) : h;
  if (cw * ch > 64 * 1024 * 1024) {
    throw const FormatException('Canvas too large');
  }
  return EditCanvasPlan(cw, ch, ((cw - w) / 2).floor(), ((ch - h) / 2).floor(),
      target.$1, target.$2, '${target.$1}x${target.$2}');
}

im.Image _decode(Uint8List data) {
  if (data.isEmpty || data.length > 64 * 1024 * 1024) {
    throw const FormatException('Input too large');
  }
  final decoder = im.findDecoderForData(data),
      info = im.findDecoderForData(data)?.startDecode(data);
  if (decoder == null ||
      info == null ||
      info.width * info.height > 64 * 1024 * 1024) {
    throw const FormatException('Invalid image');
  }
  final decoded = decoder.decode(data);
  if (decoded == null) throw const FormatException('Decode failed');
  final result = decoded.convert(numChannels: 4);
  result.exif = im.ExifData();
  result.textData = null;
  result.iccProfile = null;
  return result;
}

Uint8List maskSelection(im.Image mask, int w, int h) {
  var alpha = false;
  for (final p in mask) {
    if (p.a != 255) {
      alpha = true;
      break;
    }
  }
  final out = Uint8List(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final p = mask.getPixel(
          math.min(mask.width - 1, ((x + .5) * mask.width / w).floor()),
          math.min(mask.height - 1, ((y + .5) * mask.height / h).floor()));
      out[y * w + x] =
          (alpha ? p.a > 155 : math.max(p.r, math.max(p.g, p.b)) > 155) ? 1 : 0;
    }
  }
  if (!out.any((n) => n != 0)) throw const FormatException('Empty mask');
  return out;
}

Uint8List _grow(Uint8List src, int w, int h, int radius, bool horizontal) {
  final out = Uint8List(src.length);
  final length = horizontal ? w : h, lines = horizontal ? h : w;
  for (var line = 0; line < lines; line++) {
    int at(int i) => horizontal ? line * w + i : i * w + line;
    final forward = Int32List(length);
    var last = -length - radius;
    for (var i = 0; i < length; i++) {
      if (src[at(i)] != 0) last = i;
      forward[i] = i - last;
    }
    var next = length + radius;
    for (var i = length - 1; i >= 0; i--) {
      if (src[at(i)] != 0) next = i;
      out[at(i)] = math.min(forward[i], next - i) <= radius ? 1 : 0;
    }
  }
  return out;
}

Float32List _blur(Float32List src, int w, int h, int radius, bool horizontal) {
  final out = Float32List(src.length);
  final length = horizontal ? w : h, lines = horizontal ? h : w;
  for (var line = 0; line < lines; line++) {
    int at(int i) => horizontal ? line * w + i : i * w + line;
    double value(int i) => src[at(i.clamp(0, length - 1))];
    var sum = 0.0;
    for (var i = -radius; i <= radius; i++) {
      sum += value(i);
    }
    for (var i = 0; i < length; i++) {
      out[at(i)] = sum / (2 * radius + 1);
      sum += value(i + radius + 1) - value(i - radius);
    }
  }
  return out;
}

Uint8List featherSelection(Uint8List selected, int w, int h,
    {int growPx = 4, int featherPx = 6}) {
  var grown = selected;
  if (growPx > 0) {
    grown = _grow(_grow(grown, w, h, growPx, true), w, h, growPx, false);
  }
  var alpha = Float32List.fromList(grown.map((n) => n * 255.0).toList());
  final radius = (featherPx / 2).round();
  if (radius > 0) {
    for (var pass = 0; pass < 2; pass++) {
      alpha = _blur(_blur(alpha, w, h, radius, true), w, h, radius, false);
    }
  }
  return Uint8List.fromList(List.generate(selected.length,
      (i) => selected[i] != 0 ? 255 : alpha[i].round().clamp(0, 255)));
}

void matchSeamColors(im.Image source, im.Image generated, Uint8List selection) {
  final w = source.width, h = source.height, count = w * h;
  final outside = _grow(_grow(selection, w, h, 16, true), w, h, 16, false);
  final weight = Float32List(count),
      diffs = List.generate(3, (_) => Float32List(count));
  var any = false;
  for (var i = 0; i < count; i++) {
    if (outside[i] == 0 || selection[i] != 0) continue;
    final a = source.getPixel(i % w, i ~/ w),
        b = generated.getPixel(i % w, i ~/ w);
    final d = [
      (a.r - b.r).toDouble(),
      (a.g - b.g).toDouble(),
      (a.b - b.b).toDouble()
    ];
    final rms = math.sqrt(d.fold<double>(0, (s, n) => s + n * n) / 3),
        v = 1 / (1 + math.pow(rms / 40, 2));
    weight[i] = v;
    for (var c = 0; c < 3; c++) {
      diffs[c][i] = v * d[c];
    }
    any = true;
  }
  if (!any) return;
  Float32List smooth(Float32List v) {
    for (var p = 0; p < 3; p++) {
      v = _blur(_blur(v, w, h, 24, true), w, h, 24, false);
    }
    return v;
  }

  final density = smooth(weight), offsets = diffs.map(smooth).toList();
  for (var i = 0; i < count; i++) {
    final d = density[i];
    if (d <= 1e-4) continue;
    final t = math.min(1.0, d / .12),
        fade = t * t * (3 - 2 * t),
        p = generated.getPixel(i % w, i ~/ w);
    final channels = [p.r, p.g, p.b];
    final corrected = List.generate(
        3,
        (c) => (channels[c] + (offsets[c][i] / d).clamp(-64, 64) * fade)
            .round()
            .clamp(0, 255));
    p
      ..r = corrected[0]
      ..g = corrected[1]
      ..b = corrected[2];
  }
}

class PreparedEdit {
  final Uint8List source, selection, upload, mask;
  final EditCanvasPlan plan;
  final int width, height;
  PreparedEdit(this.source, this.selection, this.upload, this.mask, this.plan,
      this.width, this.height);
}

PreparedEdit prepareOpenAIEdit(Map<String, Object> args) {
  final source = _decode(args['source'] as Uint8List),
      mask = _decode(args['mask'] as Uint8List);
  final selection = maskSelection(mask, source.width, source.height);
  final plan =
      planEditCanvas(source.width, source.height, args['size'] as String);
  // Replicate edge pixels while padding; never crop the user's source.
  final canvas =
      im.Image(width: plan.width, height: plan.height, numChannels: 4);
  for (var y = 0; y < plan.height; y++) {
    for (var x = 0; x < plan.width; x++) {
      canvas.setPixel(
          x,
          y,
          source.getPixel((x - plan.x).clamp(0, source.width - 1),
              (y - plan.y).clamp(0, source.height - 1)));
    }
  }
  final upload = im.copyResize(canvas,
      width: plan.uploadWidth,
      height: plan.uploadHeight,
      interpolation: im.Interpolation.linear);
  final uploadedMask = im.Image(
      width: plan.uploadWidth, height: plan.uploadHeight, numChannels: 4);
  for (var y = 0; y < uploadedMask.height; y++) {
    for (var x = 0; x < uploadedMask.width; x++) {
      final sx = ((x + .5) * plan.width / uploadedMask.width).floor() - plan.x,
          sy = ((y + .5) * plan.height / uploadedMask.height).floor() - plan.y;
      final selected = sx >= 0 &&
          sy >= 0 &&
          sx < source.width &&
          sy < source.height &&
          selection[sy * source.width + sx] != 0;
      uploadedMask.setPixelRgba(x, y, 0, 0, 0, selected ? 0 : 255);
    }
  }
  return PreparedEdit(im.encodePng(source), selection, im.encodePng(upload),
      im.encodePng(uploadedMask), plan, source.width, source.height);
}

Uint8List compositeOpenAIEdit(Map<String, Object> args) {
  final prepared = args['prepared'] as PreparedEdit,
      source = _decode(prepared.source),
      result = _decode(args['result'] as Uint8List);
  final mapped = im.copyCrop(
      im.copyResize(result,
          width: prepared.plan.width,
          height: prepared.plan.height,
          interpolation: im.Interpolation.linear),
      x: prepared.plan.x,
      y: prepared.plan.y,
      width: source.width,
      height: source.height);
  matchSeamColors(source, mapped, prepared.selection);
  final alpha =
      featherSelection(prepared.selection, source.width, source.height);
  for (var i = 0; i < alpha.length; i++) {
    final t = alpha[i] / 255,
        a = source.getPixel(i % source.width, i ~/ source.width),
        b = mapped.getPixel(i % source.width, i ~/ source.width);
    if (t == 0) {
      mapped.setPixel(i % source.width, i ~/ source.width, a);
      continue;
    }
    b
      ..r = (b.r * t + a.r * (1 - t)).round()
      ..g = (b.g * t + a.g * (1 - t)).round()
      ..b = (b.b * t + a.b * (1 - t)).round()
      ..a = (b.a * t + a.a * (1 - t)).round();
  }
  return im.encodePng(mapped);
}

class OpenAIEditOutput {
  final CompatibleImageBatch batch;
  final List<Uint8List> images;
  final Map<String, Object> request;
  final int width, height;
  OpenAIEditOutput(
      this.batch, this.images, this.request, this.width, this.height);
}

Future<OpenAIEditOutput> runOpenAIImageEdit(OpenAIEditConfig settings,
    {required String apiKey,
    required Uint8List source,
    required Uint8List mask,
    required String prompt,
    List<Uint8List> references = const [],
    CompatibleImageCancellation? cancellation,
    void Function()? beforeSubmit,
    Future<http.Client> Function(Uri)? clientForUri,
    Duration timeout = const Duration(minutes: 3)}) async {
  PreparedEdit? prepared;
  final summary = <String, Object>{
    'endpoint': 'images/edits',
    'model': settings.model,
    'prompt': prompt,
    'quality': settings.quality,
    'input_fidelity': settings.inputFidelity,
    'mask': true,
    'references': references.length
  };
  final batch = await submitCompatibleImageRequest(
      CompatibleImageConfig(
          baseUrl: settings.baseUrl, model: settings.model, apiKey: apiKey),
      n: 1,
      cancellation: cancellation,
      beforeSubmit: beforeSubmit,
      clientForUri: clientForUri,
      timeout: timeout, prepare: () async {
    final endpoint = imageEditEndpoint(settings.baseUrl);
    if (settings.model.trim().isEmpty ||
        settings.model.length > 256 ||
        RegExp(r'[\r\n]').hasMatch(settings.model) ||
        prompt.trim().isEmpty ||
        prompt.length > 32000 ||
        references.length > 15 ||
        !['auto', 'low', 'medium', 'high'].contains(settings.quality) ||
        !['', 'low', 'high'].contains(settings.inputFidelity)) {
      throw const FormatException('Invalid edit configuration');
    }
    prepared = await compute(prepareOpenAIEdit, {
      'source': Uint8List.fromList(source),
      'mask': Uint8List.fromList(mask),
      'size': settings.size
    });
    summary['size'] = prepared!.plan.size;
    final req = http.MultipartRequest('POST', endpoint)
      ..fields.addAll({
        'model': settings.model.trim(),
        'prompt': prompt,
        'n': '1',
        'size': prepared!.plan.size
      });
    if (settings.quality != 'auto') req.fields['quality'] = settings.quality;
    if (settings.inputFidelity.isNotEmpty) {
      req.fields['input_fidelity'] = settings.inputFidelity;
    }
    final field = references.isEmpty ? 'image' : 'image[]';
    req.files.add(http.MultipartFile.fromBytes(field, prepared!.upload,
        filename: 'image.png', contentType: MediaType('image', 'png')));
    req.files.add(http.MultipartFile.fromBytes('mask', prepared!.mask,
        filename: 'mask.png', contentType: MediaType('image', 'png')));
    for (var i = 0; i < references.length; i++) {
      final clean =
          await compute(_referencePng, Uint8List.fromList(references[i]));
      req.files.add(http.MultipartFile.fromBytes(field, clean,
          filename: 'reference-${i + 1}.png',
          contentType: MediaType('image', 'png')));
    }
    if (req.contentLength > 64 * 1024 * 1024) {
      throw const FormatException('Request too large');
    }
    final body = await req.finalize().toBytes();
    return CompatibleImageRequest(endpoint, body, req.headers['content-type']!);
  });
  final images = <Uint8List>[];
  try {
    for (final bytes in batch.images) {
      images.add(await compute(
          compositeOpenAIEdit, {'prepared': prepared!, 'result': bytes}));
    }
  } catch (_) {
    return OpenAIEditOutput(
        CompatibleImageBatch(
            images: [],
            complete: false,
            submitted: batch.submitted,
            cancelled: batch.cancelled,
            timedOut: batch.timedOut,
            error: const CompatibleImageFailure('decode')),
        [],
        summary,
        prepared?.width ?? 0,
        prepared?.height ?? 0);
  }
  return OpenAIEditOutput(batch, List.unmodifiable(images), summary,
      prepared?.width ?? 0, prepared?.height ?? 0);
}

Uint8List _referencePng(Uint8List bytes) {
  final source = _decode(bytes);
  final scale = math.min(1.0, 2048 / math.max(source.width, source.height));
  return im.encodePng(im.copyResize(source,
      width: math.max(1, (source.width * scale).round()),
      height: math.max(1, (source.height * scale).round())));
}
