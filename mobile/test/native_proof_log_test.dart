import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import '../integration_test/native_proof_log.dart';

void main() {
  test('short proof remains literal; explicit frames preserve full UTF8 and SHA', () {
    expect(nativeCheckLogLines({'x': 1}, entry: 'gallery3', nativePid: 1234, id: 1),
        ['FEATURE_ACCEPTANCE_CHECK:{"x":1}']);
    final record = <String, Object?>{'literal': List.filled(1000, '龙白🙂').join()};
    final lines = nativeCheckLogLines(record,
        entry: 'gallery3', nativePid: 1234, id: 2);
    final bytes = <int>[];
    for (var i = 0; i < lines.length; i++) {
      expect(utf8.encode(lines[i]).length, lessThan(900));
      final p = jsonDecode(lines[i].substring('NATIVE_PROOF_CHUNK:'.length)) as Map;
      expect(p['v'], 1); expect(p['pid'], 1234); expect(p['id'], 2);
      expect(p['entry'], 'gallery3'); expect(p['index'], i);
      expect(p['count'], lines.length);
      bytes.addAll(base64Decode(p['data'] as String));
      expect(p['sha256'], sha256.convert(utf8.encode(jsonEncode(record))).toString());
    }
    expect(jsonDecode(utf8.decode(bytes)), record);
  });
  test('oversize record is rejected, not silently shortened', () {
    expect(() => nativeCheckLogLines({'x': 'a' * 40000},
        entry: 'gallery3', nativePid: 1234, id: 1), throwsStateError);
  });
}
