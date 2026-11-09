import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart'
    show SecretBoxAuthenticationError;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/android_backup_rescue.dart';
import 'package:novelai_mobile/services/segmented_preference_archive.dart';

void main() {
  final oom = PlatformException(
    code:
        'java.lang.IllegalStateException: java.lang.OutOfMemoryError: fixture',
    message: 'IllegalStateException',
  );

  test('OOM falls back exactly once, other errors and platforms do not',
      () async {
    var attempted = 0, rescued = 0;
    Future<String> rescue() async {
      rescued++;
      return 'segmented';
    }

    expect(
        await exportWithMemoryFallback(
          allowRescue: true,
          normal: () async {
            attempted++;
            throw oom;
          },
          rescue: rescue,
        ),
        'segmented');
    expect([attempted, rescued], [1, 1]);
    expect(
        await exportWithMemoryFallback(
          allowRescue: true,
          normal: () async => 'normal',
          rescue: rescue,
        ),
        'normal');
    for (final error in [const FileSystemException('Disk is full'), oom]) {
      await expectLater(
          exportWithMemoryFallback(
            allowRescue: error != oom,
            normal: () async => throw error,
            rescue: rescue,
          ),
          throwsA(same(error)));
    }
    expect(rescued, 1);
    stdout.writeln(
        'ROUTING: OOM=segmented normal=normal disk=original-error non-Android=original-error');
  });

  test(
      'segmented archive authenticates large legacy files and preserves originals',
      () async {
    final root = await Directory.systemTemp
        .createTemp('android-preferences-rescue-test-');
    addTearDown(() => root.delete(recursive: true));
    final source = await Directory('${root.path}/source').create();
    const name = 'FlutterSharedPreferences.xml';
    final original = File('${source.path}/$name');
    // 170 MiB synthetic XML shaped like the reported allocation, written in bounded chunks.
    final writer = await original.open(mode: FileMode.write);
    final repeated = Uint8List(SegmentedPreferenceArchive.chunkSize)
      ..fillRange(0, SegmentedPreferenceArchive.chunkSize, 120);
    try {
      await writer
          .writeFrom(utf8.encode('<map><string name="flutter.synthetic">'));
      for (var i = 0; i < 680; i++) {
        await writer.writeFrom(repeated);
      }
      await writer.writeFrom(utf8.encode('</string></map>'));
    } finally {
      await writer.close();
    }
    final backup = File('${source.path}/$name.bak');
    await backup.writeAsString(
        '<map><string name="flutter.old">backup fixture</string></map>');
    final before = await sha256.bind(original.openRead()).first;
    final output = File('${root.path}/preferences.naisrescue');
    const password = 'synthetic test password 1234';
    await SegmentedPreferenceArchive.write(source, output, password);
    final restored = Directory('${root.path}/restored');
    await SegmentedPreferenceArchive.extract(output, restored, password);
    expect(await sha256.bind(File('${restored.path}/$name').openRead()).first,
        before);
    expect(await File('${restored.path}/$name.bak').readAsString(),
        await backup.readAsString());
    expect(await sha256.bind(original.openRead()).first, before);
    await expectLater(
        SegmentedPreferenceArchive.extract(output, restored, password),
        throwsA(isA<FileSystemException>()));
    stdout.writeln(
        'ARCHIVE: originalBytes=${await original.length()} originalSha256=$before restoredHashMatches=true backupMatches=true');
  }, timeout: const Timeout(Duration(minutes: 5)));

  test('wrong passwords and truncated archives do not commit extraction',
      () async {
    final root =
        await Directory.systemTemp.createTemp('android-rescue-rejection-');
    addTearDown(() => root.delete(recursive: true));
    final source = await Directory('${root.path}/source').create();
    await File('${source.path}/FlutterSharedPreferences.xml')
        .writeAsString('<map/>');
    final output = File('${root.path}/preferences.naisrescue');
    const password = 'synthetic test password 1234';
    await SegmentedPreferenceArchive.write(source, output, password);
    final restored = Directory('${root.path}/restored');
    await expectLater(
        SegmentedPreferenceArchive.extract(
            output, restored, 'incorrect password'),
        throwsA(isA<SecretBoxAuthenticationError>()));
    final length = await output.length();
    final handle = await output.open(mode: FileMode.append);
    try {
      await handle.truncate(length - 1);
    } finally {
      await handle.close();
    }
    await expectLater(
        SegmentedPreferenceArchive.extract(output, restored, password),
        throwsA(isA<FormatException>()));
    expect(await restored.exists(), isFalse);
    expect(
        await root
            .list()
            .where((e) => e.path.contains('preferences-extract-'))
            .length,
        0);
    stdout.writeln(
        'REJECTION: wrong-password and truncated archive rejected; destination absent');
  });
}
