import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('comic UI no longer exposes a second image service or its settings', () {
    final source = File('lib/screens/comic_screen.dart').readAsStringSync();
    expect(source, isNot(contains("import 'compatible_images.dart'")));
    expect(source, isNot(contains('CompatibleImageSettingsCard()')));
    expect(source, isNot(contains('_CompatibleComicNotice')));
  });
}
