import 'dart:io';
import 'dart:isolate';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import 'segmented_preference_archive.dart';

bool isBackupMemoryFailure(Object error) {
  if (error is OutOfMemoryError) return true;
  if (error is! PlatformException) return false;
  final marker = RegExp(r'\bjava\.lang\.OutOfMemoryError\b');
  return marker.hasMatch(error.code) ||
      marker.hasMatch(error.message ?? '') ||
      (error.details is String && marker.hasMatch(error.details as String));
}

Future<T> exportWithMemoryFallback<T>({
  required bool allowRescue,
  required Future<T> Function() normal,
  required Future<T> Function() rescue,
}) async {
  try {
    return await normal();
  } catch (error) {
    if (!allowRescue || !isBackupMemoryFailure(error)) rethrow;
    return await rescue();
  }
}

/// A cancelled picker is a successful null result, not a reason to retry.
Future<T> exportBackupInOrder<T>({
  required bool allowSegments,
  required Future<T> Function() complete,
  required Future<T> Function() segmented,
  required Future<T> Function(Object failure) onSegmentFailure,
}) async {
  try {
    return await complete();
  } catch (error) {
    if (!allowSegments || !isBackupMemoryFailure(error)) rethrow;
  }
  try {
    return await segmented();
  } catch (error) {
    return await onSegmentFailure(error);
  }
}

class AndroidBackupRescue {
  static const _channel = MethodChannel('langbai.novelai/storage');

  static Future<bool> saveFullBackup(File backup, String password) async {
    final temp = await getTemporaryDirectory();
    final name = 'studio-segmented-${DateTime.now().microsecondsSinceEpoch}.naisparts';
    final path = '${temp.path}${Platform.pathSeparator}$name';
    final source = backup.path;
    await Isolate.run(() => SegmentedPreferenceArchive.writeFullBackup(
        File(source), File(path), password));
    try {
      return await _channel.invokeMethod<bool>('saveRescueDocument', name) == true;
    } finally {
      try { await File(path).delete(); } on FileSystemException { /* cache only */ }
    }
  }

  /// Plaintext is private and scoped to a single authenticated operation.
  static Future<T> withFullBackup<T>(String path, String password,
      Future<T> Function(String path) use) async {
    final stage = await (await getTemporaryDirectory()).createTemp('segmented-backup-');
    final destination = '${stage.path}${Platform.pathSeparator}authenticated';
    try {
      await Isolate.run(() => SegmentedPreferenceArchive.extractFullBackup(
          File(path), Directory(destination), password));
      return await use('$destination${Platform.pathSeparator}${SegmentedPreferenceArchive.fullBackupEntry}');
    } finally {
      await stage.delete(recursive: true);
    }
  }

  static Future<bool> export(String password) async {
    final source =
        await _channel.invokeMethod<String>('legacyPreferencesDirectory');
    if (source == null) {
      throw StateError('Android preference storage is unavailable.');
    }
    final temp = await getTemporaryDirectory();
    final name =
        'studio-recovery-${DateTime.now().microsecondsSinceEpoch}.naisrescue';
    final path = '${temp.path}${Platform.pathSeparator}$name';
    await Isolate.run(() async {
      await SegmentedPreferenceArchive.write(
          Directory(source), File(path), password);
    });
    final file = File(path);
    try {
      return await _channel.invokeMethod<bool>('saveRescueDocument', name) ==
          true;
    } finally {
      // Only our newly created encrypted cache file may be removed.
      try {
        if (await file.exists()) await file.delete();
      } on FileSystemException {
        // A cache cleanup failure must not turn a verified save into a failure.
      }
    }
  }
}
