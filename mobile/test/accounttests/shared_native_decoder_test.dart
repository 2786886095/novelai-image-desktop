import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_test/flutter_test.dart';
import 'dart:async';
import 'package:novelai_mobile/services/generation_scope.dart';
import 'package:novelai_mobile/images/image_processing.dart';

void main() {
  _registerCancellationCases();
  for (final name in ['novelai-native-response-fixture.json', 'novelai-native-response-extended-fixture.json']) {
    final fixture = jsonDecode(File('test/accounttests/fixtures/$name').readAsStringSync()) as Map;
    for (final row in fixture['cases'] as List) {
      test('shared strict native final decoder $name ${row['id']}', () async {
        Object? error;
        var images = <List<int>>[];
        try {
          images = await decodeNovelAiNativeResponse(base64Decode(row['body'] as String));
        } catch (caught) {
          error = caught;
        }
        final expected = row['expectedImages'] as List?;
        final originalBytesPreserved = expected == null ||
            (expected.length == images.length && List.generate(images.length,
                (i) => base64Encode(images[i]) == expected[i]).every((value) => value));
        final passed = originalBytesPreserved && images.length == row['expectedCount'] &&
            ((row['expectedCount'] == 0) == (error != null));
        debugPrint('NOVELAI_SHARED_NATIVE_RESPONSE=${jsonEncode({'fixture': name, 'id': row['id'],
            'count': images.length, 'originalBytesPreserved': originalBytesPreserved,
            'errorType': error?.runtimeType.toString() ?? '', 'passed': passed})}');
        expect(passed, true);
      });
    }
  }
}

void _registerCancellationCases() {
  final fixture = jsonDecode(File('test/accounttests/fixtures/novelai-native-response-fixture.json').readAsStringSync()) as Map;
  final png = base64Decode((fixture['cases'] as List).firstWhere((row) => row['id'] == 'raw-png')['body'] as String);
  for (final kind in ['cancelled-before-decode', 'cancel-during-codec', 'guard-rejection']) {
    test('shared native decoder scope $kind', () async {
      var checks = 0;
      late final GenerationScope scope;
      scope = GenerationScope(beforeSubmit: () {
        checks++;
        if (kind == 'guard-rejection') throw StateError('OWNED GUARD REJECTION');
        if (kind == 'cancel-during-codec' && checks == 2) scheduleMicrotask(scope.cancel);
      });
      if (kind == 'cancelled-before-decode') scope.cancel();
      Object? error;
      var count = 0;
      try {
        count = (await scope.run(() => decodeNovelAiNativeResponse(png, checkCancelled: GenerationScope.current?.check))).length;
      } catch (caught) {
        error = caught;
      }
      final passed = count == 0 && error is StateError;
      debugPrint('NOVELAI_LEGACY_CANCEL=${jsonEncode({'kind': kind, 'count': count,
          'cancelled': scope.cancelled, 'errorType': error?.runtimeType.toString() ?? '', 'passed': passed})}');
      expect(passed, true);
    });
  }
}
