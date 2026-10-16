// Framing for actual Android/iOS native proof logs, not JSON error recovery.
// Every physical line stays below 900 ASCII bytes, including worst-case PID.
// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';

List<String> nativeCheckLogLines(Map<String, Object?> record,
    {required String entry, required int nativePid, required int id}) {
  final literal = jsonEncode(record), bytes = utf8.encode(literal);
  if (bytes.length <= 700) return ['FEATURE_ACCEPTANCE_CHECK:$literal'];
  if (bytes.length > 32768) {
    throw StateError('Native proof exceeds bounded 32KiB record');
  }
  final count = (bytes.length / 384).ceil();
  final hash = sha256.convert(bytes).toString();
  return List.generate(count, (index) => 'NATIVE_PROOF_CHUNK:${jsonEncode({
        'v': 1, 'pid': nativePid, 'entry': entry, 'id': id, 'index': index,
        'count': count, 'bytes': bytes.length, 'sha256': hash,
        'data': base64Encode(bytes.sublist(index * 384,
            min(bytes.length, (index + 1) * 384))),
      })}');
}

void printNativeCheck(Map<String, Object?> record,
    {required String entry, required int id}) {
  for (final line in nativeCheckLogLines(record,
      entry: entry, nativePid: pid, id: id)) { print(line); }
}
