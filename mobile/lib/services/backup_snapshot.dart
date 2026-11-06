import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'bounded_backup_archive.dart';
import 'portable_projects.dart';

/// Runs in an isolate. Only paths and the small manifest cross its boundary.
/// Copy first so inspection and import never consume a subsequently edited URI.
Future<Map<String, dynamic>> prepareBackupSnapshot((String, String) job) async {
  final source = File(job.$1), target = File(job.$2);
  final before = await source.stat();
  BoundedBackupArchive.validateFileLength(before.size);
  final output = target.openWrite();
  var copied = 0;
  try {
    await for (final chunk in source.openRead()) {
      copied += chunk.length;
      if (copied > before.size || copied > BoundedBackupArchive.maxFileBytes) {
        throw const FormatException(
            'Backup changed during copy. Original data retained.');
      }
      output.add(chunk);
      // IOSink.add alone can queue the entire multi-GiB archive in memory.
      await output.flush();
    }
  } finally {
    await output.close();
  }
  final after = await source.stat();
  if (copied != before.size ||
      after.size != before.size ||
      after.modified != before.modified) {
    throw const FormatException(
        'Backup changed during copy. Original data retained.');
  }
  return validateBackupSnapshot(target.path);
}

Future<Map<String, dynamic>> validateBackupSnapshot(String path) async {
  final backing = await BoundedBackupArchive.open(path);
  try {
    final archive = backing.archive;
    final manifestEntry = archive.findFile('manifest.json');
    if (manifestEntry == null || !manifestEntry.isFile) {
      throw const FormatException('Missing backup manifest.');
    }
    final raw = jsonDecode(utf8.decode(readBoundedBackupEntry(manifestEntry)));
    if (raw is! Map ||
        raw['format'] != 'langbai-novelai-studio-backup' ||
        raw['version'] != 1) {
      throw const FormatException('Unsupported backup format or version.');
    }
    final assets = <String, (int, String)>{};
    // Release each decoded entry before reading the next; never decodeBytes(ZIP).
    for (final entry in archive.files.where((e) => e.isFile)) {
      final bytes = readBoundedBackupEntry(entry); // actual size + CRC
      if (entry.name.startsWith('assets/')) {
        final hash = sha256.convert(bytes).toString();
        final expected = RegExp(r'^assets/([a-f0-9]{64})\.[a-z0-9]{1,8}$')
            .firstMatch(entry.name);
        if (expected != null && expected.group(1) != hash) {
          throw const FormatException('Backup asset checksum failed.');
        }
        assets[entry.name] = (bytes.length, hash);
      }
      if (entry.name.toLowerCase().endsWith('.json')) {
        final json = jsonDecode(utf8.decode(bytes));
        const objects = {'manifest.json', 'data/configuration.json',
          'data/generation-params.json', 'data/mobile-configuration.json',
          'data/api-credentials.json', 'data/image-history.json',
          'data/text-history.json', 'data/artist-library.json',
          'data/reference-presets.json', 'data/prompt-presets.json',
          'data/prompt-template-library.json', 'data/agent-workspace.json',
          'data/mobile-state.json', 'data/workspace.json'};
        if (objects.contains(entry.name) && json is! Map) {
          throw const FormatException('Invalid backup category object. Original data retained.');
        }
        if (entry.name == 'data/api-credentials.json' &&
            json is Map && json['settings'] is! Map) {
          throw const FormatException('Invalid backup API settings. Original data retained.');
        }
      }
    }
    void checkReferences(dynamic value) {
      if (value is Map) {
        if (value['asset'] is String && value['sha256'] is String) {
          final asset = assets[value['asset']];
          if (asset == null ||
              asset.$2 != value['sha256'] ||
              (value['bytes'] != null && asset.$1 != value['bytes'])) {
            throw const FormatException(
                'Missing or corrupt backup asset reference.');
          }
        }
        for (final child in value.values) {
          checkReferences(child);
        }
      } else if (value is List) {
        for (final child in value) {
          checkReferences(child);
        }
      }
    }

    for (final entry in archive.files
        .where((e) => e.isFile && e.name.toLowerCase().endsWith('.json'))) {
      checkReferences(jsonDecode(utf8.decode(readBoundedBackupEntry(entry))));
    }
    // Validate passive native capsules as well before any rescue/preferences writes.
    PortableProjects.inspect(archive, {'tavernAgent', 'styleLab'});
    return Map<String, dynamic>.from(raw);
  } finally {
    backing.close();
  }
}
