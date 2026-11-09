import 'dart:convert';
import 'dart:io';

import 'package:novelai_mobile/services/segmented_preference_archive.dart';

Future<void> main(List<String> args) async {
  if (args.length < 2 ||
      args.length > 3 ||
      !((args[0] == 'verify' && args.length == 2) ||
          (args[0] == 'extract' && args.length == 3))) {
    stderr.writeln(
        'Usage: dart run tool/preferences_rescue.dart verify ARCHIVE | extract ARCHIVE NEW_DIRECTORY');
    exitCode = 64;
    return;
  }
  try {
    if (!stdin.hasTerminal) throw StateError('A terminal is required.');
    stderr.write('Rescue password: ');
    final echo = stdin.echoMode;
    String? password;
    try {
      stdin.echoMode = false;
      password = stdin.readLineSync(encoding: utf8);
    } finally {
      stdin.echoMode = echo;
      stderr.writeln();
    }
    if (password == null) throw StateError('Missing password.');
    final file = File(args[1]);
    if (args[0] == 'verify') {
      stdout.writeln(
          jsonEncode(await SegmentedPreferenceArchive.verify(file, password)));
    } else {
      await SegmentedPreferenceArchive.extract(
          file, Directory(args[2]), password);
      stdout.writeln(
          'Authenticated extraction completed into the new directory.');
    }
  } catch (_) {
    stderr.writeln(
        'Rescue verification/extraction failed. No live app data was changed.');
    exitCode = 1;
  }
}
