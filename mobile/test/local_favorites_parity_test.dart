import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile shell exposes a local original-image favorites destination', () {
    final shell = File('lib/main.dart').readAsStringSync();
    expect(shell, contains('const LocalFavoritesScreen()'));
    expect(shell, contains('localFavoritesLabelFor(language)'));
  });
}
