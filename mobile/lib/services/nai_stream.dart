import 'dart:convert';
import 'dart:typed_data';

import 'package:msgpack_dart/msgpack_dart.dart' as msgpack;

const _maxFrameBytes = 128 * 1024 * 1024;

class NaiGenerationPreview {
  final Uint8List image;
  final double progress;
  final int currentStep;
  final int totalSteps;
  final int sampleIndex;
  final bool finalImage;

  const NaiGenerationPreview({
    required this.image,
    required this.progress,
    required this.currentStep,
    required this.totalSteps,
    required this.sampleIndex,
    required this.finalImage,
  });
}

class NaiStreamResult {
  final List<Uint8List> images;
  final Uint8List? archive;

  const NaiStreamResult({this.images = const [], this.archive});
}

class NaiStreamException implements Exception {
  final String message;
  final bool previewStarted;

  const NaiStreamException(this.message, {this.previewStarted = false});

  @override
  String toString() => message;
}

class _Frame {
  final String eventType;
  final int sampleIndex;
  final int? stepIndex;
  final Uint8List? image;
  final String? error;

  const _Frame({
    required this.eventType,
    required this.sampleIndex,
    this.stepIndex,
    this.image,
    this.error,
  });
}

Map<String, dynamic>? _record(Object? value) {
  if (value is! Map) return null;
  return value.map((key, value) => MapEntry(key.toString(), value));
}

int? _optionalInteger(Object? value) =>
    value is num ? value.round() : int.tryParse(value?.toString() ?? '');

bool _looksLikeBase64(String value) {
  final compact = value.replaceAll(RegExp(r'\s+'), '');
  return compact.length >= 4 &&
      compact.length % 4 == 0 &&
      RegExp(r'^[A-Za-z0-9+/]*={0,2}$').hasMatch(compact);
}

Uint8List? _decodeImage(Object? value) {
  if (value is Uint8List) return Uint8List.fromList(value);
  if (value is ByteBuffer) return value.asUint8List();
  if (value is List && value.every((entry) => entry is int)) {
    return Uint8List.fromList(value.cast<int>());
  }
  if (value is String && value.isNotEmpty) {
    final compact = value
        .replaceFirst(
            RegExp(r'^data:image/[^;]+;base64,', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s+'), '');
    if (!_looksLikeBase64(compact)) return null;
    try {
      return base64Decode(compact);
    } catch (_) {
      return null;
    }
  }
  return null;
}

_Frame _frameFromRecord(Map<String, dynamic> message,
    [String fallbackEventType = '']) {
  final nested = _record(message['payload']) ?? _record(message['data']);
  final source = nested != null &&
          message['image'] == null &&
          message['event_type'] == null
      ? {...message, ...nested}
      : message;
  final eventType = (source['event_type'] ??
          source['eventType'] ??
          source['type'] ??
          fallbackEventType.ifEmpty('intermediate'))
      .toString();
  final error = source['message'] ?? source['error'];
  return _Frame(
    eventType: eventType,
    sampleIndex: _optionalInteger(source['samp_ix'] ??
            source['sampleIndex'] ??
            source['sample_index']) ??
        0,
    stepIndex: _optionalInteger(
        source['step_ix'] ?? source['stepIndex'] ?? source['step_index']),
    image: _decodeImage(source['image'] ??
        source['data'] ??
        source['image_data'] ??
        source['imageData']),
    error: eventType == 'error' || source['error'] != null
        ? (error ?? 'Stream generation failed').toString()
        : null,
  );
}

_Frame? _decodeMessagePack(Uint8List bytes) {
  final value = msgpack.deserialize(bytes, copyBinaryData: true);
  final message = _record(value);
  return message == null ? null : _frameFromRecord(message);
}

class _MessagePackFrameDecoder {
  Uint8List _pending = Uint8List(0);

  List<_Frame> push(List<int> chunk) {
    if (chunk.isEmpty) return const [];
    final next = Uint8List(_pending.length + chunk.length)
      ..setRange(0, _pending.length, _pending)
      ..setRange(_pending.length, _pending.length + chunk.length, chunk);
    _pending = next;
    final output = <_Frame>[];
    var offset = 0;
    while (_pending.length - offset >= 4) {
      final data = ByteData.sublistView(_pending, offset, offset + 4);
      final length = data.getUint32(0, Endian.big);
      if (length <= 0 || length > _maxFrameBytes) {
        throw NaiStreamException(
            'Invalid NovelAI stream frame length: $length');
      }
      if (_pending.length - offset < 4 + length) break;
      final frame = _decodeMessagePack(
          Uint8List.sublistView(_pending, offset + 4, offset + 4 + length));
      if (frame != null) output.add(frame);
      offset += 4 + length;
    }
    if (offset > 0) _pending = Uint8List.sublistView(_pending, offset);
    return output;
  }
}

class _SseFrameDecoder {
  final List<int> _pending = [];
  String _eventType = '';
  final List<String> _dataLines = [];

  List<_Frame> _dispatch() {
    if (_dataLines.isEmpty) {
      _eventType = '';
      return const [];
    }
    final value = _dataLines.join('\n').trim();
    final eventType = _eventType;
    _eventType = '';
    _dataLines.clear();
    if (value.isEmpty || value == '[DONE]') return const [];
    try {
      final parsed = jsonDecode(value);
      final record = _record(parsed);
      if (record != null) return [_frameFromRecord(record, eventType)];
      if (parsed is String) return _decodeSseValue(eventType, parsed);
    } catch (_) {
      // Proxies may send base64 MessagePack or a direct image instead of JSON.
    }
    return _decodeSseValue(eventType, value);
  }

  List<_Frame> _decodeSseValue(String eventType, String value) {
    if (!_looksLikeBase64(value)) {
      return eventType == 'error'
          ? [_Frame(eventType: eventType, sampleIndex: 0, error: value)]
          : const [];
    }
    final bytes = base64Decode(value.replaceAll(RegExp(r'\s+'), ''));
    try {
      final decoded = _decodeMessagePack(bytes);
      if (decoded != null) {
        return [
          _Frame(
            eventType:
                decoded.eventType == 'intermediate' && eventType.isNotEmpty
                    ? eventType
                    : decoded.eventType,
            sampleIndex: decoded.sampleIndex,
            stepIndex: decoded.stepIndex,
            image: decoded.image,
            error: decoded.error,
          )
        ];
      }
    } catch (_) {
      // A valid base64 payload can also be the preview image itself.
    }
    return [
      _Frame(
        eventType: eventType.ifEmpty('intermediate'),
        sampleIndex: 0,
        image: bytes,
      )
    ];
  }

  List<_Frame> push(List<int> chunk) {
    _pending.addAll(chunk);
    final output = <_Frame>[];
    while (true) {
      final newline = _pending.indexOf(0x0a);
      if (newline < 0) break;
      final raw = _pending.sublist(0, newline);
      _pending.removeRange(0, newline + 1);
      if (raw.isNotEmpty && raw.last == 0x0d) raw.removeLast();
      final line = utf8.decode(raw, allowMalformed: true);
      if (line.isEmpty) {
        output.addAll(_dispatch());
      } else if (!line.startsWith(':')) {
        final colon = line.indexOf(':');
        final field = colon < 0 ? line : line.substring(0, colon);
        var value = colon < 0 ? '' : line.substring(colon + 1);
        if (value.startsWith(' ')) value = value.substring(1);
        if (field == 'event') _eventType = value.trim();
        if (field == 'data') _dataLines.add(value);
      }
    }
    return output;
  }

  List<_Frame> finish() {
    if (_pending.isNotEmpty) {
      var raw = List<int>.from(_pending);
      _pending.clear();
      if (raw.isNotEmpty && raw.last == 0x0d) raw.removeLast();
      final line = utf8.decode(raw, allowMalformed: true);
      final colon = line.indexOf(':');
      final field = colon < 0 ? line : line.substring(0, colon);
      var value = colon < 0 ? '' : line.substring(colon + 1);
      if (value.startsWith(' ')) value = value.substring(1);
      if (field == 'event') _eventType = value.trim();
      if (field == 'data') _dataLines.add(value);
    }
    return _dispatch();
  }
}

enum _StreamMode { unknown, messagePack, sse, zip }

Future<NaiStreamResult> consumeNaiGenerationStream(
  Stream<List<int>> stream, {
  required int totalSteps,
  required void Function(NaiGenerationPreview preview) onPreview,
  String contentType = '',
}) async {
  final messagePack = _MessagePackFrameDecoder();
  final sse = _SseFrameDecoder();
  final finals = <int, Uint8List>{};
  var mode = contentType.toLowerCase().contains('text/event-stream')
      ? _StreamMode.sse
      : _StreamMode.unknown;
  final prefix = <int>[];
  final zip = BytesBuilder(copy: false);
  var previewStarted = false;
  var lastPreviewAt = DateTime.fromMillisecondsSinceEpoch(0);

  void consumeFrames(List<_Frame> frames) {
    for (final frame in frames) {
      if (frame.error != null) {
        throw NaiStreamException(frame.error!, previewStarted: previewStarted);
      }
      final image = frame.image;
      if (image == null || image.isEmpty) continue;
      previewStarted = true;
      final currentStep = (frame.stepIndex ?? 0) + 1;
      final finalImage = frame.eventType == 'final';
      if (finalImage) finals[frame.sampleIndex] = image;
      final now = DateTime.now();
      if (finalImage ||
          now.difference(lastPreviewAt).inMilliseconds >= 110 ||
          currentStep >= totalSteps) {
        lastPreviewAt = now;
        onPreview(NaiGenerationPreview(
          image: image,
          progress: finalImage
              ? 1
              : (currentStep / maxOf(1, totalSteps)).clamp(0, .99).toDouble(),
          currentStep: finalImage ? totalSteps : currentStep,
          totalSteps: totalSteps,
          sampleIndex: frame.sampleIndex,
          finalImage: finalImage,
        ));
      }
    }
  }

  try {
    await for (final chunk in stream) {
      if (mode == _StreamMode.unknown) {
        prefix.addAll(chunk);
        if (prefix.length < 4) continue;
        final textual = utf8
            .decode(prefix.take(32).toList(), allowMalformed: true)
            .replaceFirst('\ufeff', '')
            .trimLeft();
        final length = ByteData.sublistView(Uint8List.fromList(prefix), 0, 4)
            .getUint32(0, Endian.big);
        mode = prefix[0] == 0x50 && prefix[1] == 0x4b
            ? _StreamMode.zip
            : RegExp(r'^(?:event|data|id|retry)\s*:|^:').hasMatch(textual)
                ? _StreamMode.sse
                : length > 0 && length <= _maxFrameBytes
                    ? _StreamMode.messagePack
                    : _StreamMode.sse;
        if (mode == _StreamMode.zip) {
          zip.add(prefix);
        } else if (mode == _StreamMode.sse) {
          consumeFrames(sse.push(prefix));
        } else {
          consumeFrames(messagePack.push(prefix));
        }
        prefix.clear();
        continue;
      }
      if (mode == _StreamMode.zip) {
        zip.add(chunk);
      } else if (mode == _StreamMode.sse) {
        consumeFrames(sse.push(chunk));
      } else {
        consumeFrames(messagePack.push(chunk));
      }
    }
    if (mode == _StreamMode.zip) {
      return NaiStreamResult(archive: zip.takeBytes());
    }
    if (mode == _StreamMode.sse) consumeFrames(sse.finish());
    if (finals.isEmpty) {
      throw NaiStreamException(
        '流式生成结束，但没有收到最终图片。为避免重复扣费，未自动重发请求。',
        previewStarted: previewStarted,
      );
    }
    final entries = finals.entries.toList()
      ..sort((left, right) => left.key.compareTo(right.key));
    return NaiStreamResult(
        images: entries.map((entry) => entry.value).toList());
  } on NaiStreamException {
    rethrow;
  } catch (error) {
    throw NaiStreamException(error.toString(), previewStarted: previewStarted);
  }
}

int maxOf(int left, int right) => left > right ? left : right;

extension _StringFallback on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
