import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import '../models/completion_sound.dart';

class CompletionAudio {
  static const channel = MethodChannel('langbai.novelai/completion_sound');
  static bool shouldPlay({required bool cancelled, required int completed}) =>
      !cancelled && completed > 0;
  static Future<bool> play(CompletionSound sound,
      {bool preview = false}) async {
    if ((!sound.enabled && !preview) || sound.volume == 0) return false;
    try {
      return await channel.invokeMethod<bool>('play', {
            'dataUrl': sound.dataUrl.isEmpty ? _builtin : sound.dataUrl,
            'volume': sound.volume
          }) ??
          false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> stop() async {
    try {
      await channel.invokeMethod<void>('stop');
    } catch (_) {}
  }

  static final String _builtin = _wave();
  static String _wave() {
    const rate = 22050;
    final count = (rate * .46).round();
    final data = ByteData(44 + count * 2);
    void ascii(int offset, String text) {
      for (var i = 0; i < text.length; i++) {
        data.setUint8(offset + i, text.codeUnitAt(i));
      }
    }

    ascii(0, 'RIFF');
    data.setUint32(4, 36 + count * 2, Endian.little);
    ascii(8, 'WAVEfmt ');
    data.setUint32(16, 16, Endian.little);
    data.setUint16(20, 1, Endian.little);
    data.setUint16(22, 1, Endian.little);
    data.setUint32(24, rate, Endian.little);
    data.setUint32(28, rate * 2, Endian.little);
    data.setUint16(32, 2, Endian.little);
    data.setUint16(34, 16, Endian.little);
    ascii(36, 'data');
    data.setUint32(40, count * 2, Endian.little);
    for (var i = 0; i < count; i++) {
      final t = i / rate;
      data.setInt16(
          44 + i * 2,
          (sin(2 * pi * (t < .15 ? 660 : 880) * t) *
                  6000 *
                  exp(-t * 10) *
                  min(1, t * 100))
              .round(),
          Endian.little);
    }
    return 'data:audio/wav;base64,${base64Encode(data.buffer.asUint8List())}';
  }
}
