import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/import_limits.dart';

void main() {
  group('enforceImportLimits (P1-13)', () {
    test('accepts a normal-sized project', () {
      expect(
        () => enforceImportLimits(List.filled(5, 'a' * 1000), itemNoun: '张图片'),
        returnsNormally,
      );
    });

    test('rejects a project with too many items', () {
      final items = List.filled(kMaxImportedProjectItems + 1, 'a');
      expect(
        () => enforceImportLimits(items, itemNoun: '张图片'),
        throwsA(isA<ImportTooLargeException>()),
      );
    });

    test('rejects a single oversized item', () {
      final items = ['a' * (kMaxImportedItemBase64Bytes + 1)];
      expect(
        () => enforceImportLimits(items, itemNoun: '张图片'),
        throwsA(isA<ImportTooLargeException>()),
      );
    });

    test('rejects when the combined size crosses the total budget', () {
      final chunk = 'a' * (kMaxImportedItemBase64Bytes ~/ 2);
      final count = (kMaxImportedProjectBase64Bytes ~/ chunk.length) + 2;
      final items = List.filled(count, chunk);
      expect(
        () => enforceImportLimits(items, itemNoun: '张图片'),
        throwsA(isA<ImportTooLargeException>()),
      );
    });

    test('an empty project is fine', () {
      expect(() => enforceImportLimits(const [], itemNoun: '张图片'), returnsNormally);
    });
  });
}
