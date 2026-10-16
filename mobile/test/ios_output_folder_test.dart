// Pure bridge result/path admission only. No platform-channel replacement or
// picker simulation; these tests are not native bookmark/IO acceptance.
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/ios_output_folder.dart';

void main() {
  test('a real granted canonical folder result is required', () {
    final value = {
      'path': '/private/Files/Originals',
      'available': true,
      'bookmarkSaved': true
    };
    expect(IosOutputFolder.selectedPath(value), '/private/Files/Originals');
    for (final invalid in <Object?>[
      null,
      '',
      {},
      {...value, 'available': false},
      {...value, 'bookmarkSaved': false},
      {...value, 'path': 'relative'},
      {...value, 'path': '/'},
      {...value, 'path': '/private//Files'},
      {...value, 'path': '/private/../Files'},
      {...value, 'path': '/private/./Files'},
      {...value, 'path': '/private/Files/'},
      {...value, 'path': '/private/\u0000Files'},
      {...value, 'path': '/private/\nFiles'}
    ]) {
      expect(() => IosOutputFolder.selectedPath(invalid), throwsFormatException,
          reason: '$invalid');
    }
  });
  test('returned output stays strictly inside the selected root', () {
    const root = '/private/Files/输出';
    expect(
        IosOutputFolder.isWithin(root, '$root/2026-10-17/group/图.png'), isTrue);
    for (final file in [
      root,
      '$root/',
      '$root-other/image.png',
      '/elsewhere/a.png',
      '$root/../a.png',
      '$root/./a.png',
      '$root//a.png',
      '$root/a.png\u0000'
    ]) {
      expect(IosOutputFolder.isWithin(root, file), isFalse, reason: file);
    }
    expect(IosOutputFolder.isWithin('/a/../b', '/a/../b/image.png'), isFalse);
  });
}
