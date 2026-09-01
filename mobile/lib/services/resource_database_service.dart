import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

enum ResourceDatabaseId { tagCatalog, cooccurrence }

class ResourceTagSuggestion {
  final String tag;
  final int count;
  final int category;
  final String description;

  const ResourceTagSuggestion({
    required this.tag,
    this.count = 0,
    this.category = 0,
    this.description = '',
  });
}

enum ResourceDownloadPhase {
  idle,
  downloading,
  paused,
  verifying,
  extracting,
  installing,
  complete,
  error,
}

class ResourceDatabaseDefinition {
  final ResourceDatabaseId id;
  final String label;
  final String description;
  final String dataVersion;
  final int schemaVersion;
  final String databaseName;
  final String downloadName;
  final String downloadUrl;
  final int downloadSize;
  final String downloadSha256;
  final int databaseSize;
  final String databaseSha256;
  final int expectedTags;
  final int? expectedEdges;
  final bool compressed;
  final String sourceName;
  final String sourceUrl;
  final String license;

  const ResourceDatabaseDefinition({
    required this.id,
    required this.label,
    required this.description,
    required this.dataVersion,
    required this.schemaVersion,
    required this.databaseName,
    required this.downloadName,
    required this.downloadUrl,
    required this.downloadSize,
    required this.downloadSha256,
    required this.databaseSize,
    required this.databaseSha256,
    required this.expectedTags,
    required this.compressed,
    required this.sourceName,
    required this.sourceUrl,
    required this.license,
    this.expectedEdges,
  });
}

const resourceDatabaseDefinitions =
    <ResourceDatabaseId, ResourceDatabaseDefinition>{
  ResourceDatabaseId.tagCatalog: ResourceDatabaseDefinition(
    id: ResourceDatabaseId.tagCatalog,
    label: '基础 Danbooru 标签目录',
    description: '完整标签、类别、热度与别名；安装后作为本地补全主数据库。',
    dataVersion: '42f35be9d394',
    schemaVersion: 2,
    databaseName: 'tag_catalog.db',
    downloadName: 'tag_catalog.db',
    downloadUrl:
        'https://github.com/Aaalice233/Aaalice_NAI_Launcher/releases/download/autocomplete-data-tag-catalog-42f35be9-v1/tag_catalog.db',
    downloadSize: 46772224,
    downloadSha256:
        '270538fc623bb1a88acf1f347372568d51bf55510c53e0fb700cb370e0da798d',
    databaseSize: 46772224,
    databaseSha256:
        '270538fc623bb1a88acf1f347372568d51bf55510c53e0fb700cb370e0da798d',
    expectedTags: 221787,
    compressed: false,
    sourceName: 'ComfyUI-Lora-Manager tag catalog snapshot',
    sourceUrl: 'https://github.com/willmiao/ComfyUI-Lora-Manager',
    license: 'Unlicense / public-domain upstream data',
  ),
  ResourceDatabaseId.cooccurrence: ResourceDatabaseDefinition(
    id: ResourceDatabaseId.cooccurrence,
    label: '本地相关标签数据库',
    description: '约 323 万组共现关系；安装后替代内置小型相关推荐表。',
    dataVersion: '2dadc5bfcbcc-v2',
    schemaVersion: 2,
    databaseName: 'cooccurrence-v2.db',
    downloadName: 'cooccurrence-v2.db.gz',
    downloadUrl:
        'https://github.com/Aaalice233/Aaalice_NAI_Launcher/releases/download/autocomplete-data-cooccurrence-2dadc5bf-v2/cooccurrence-v2.db.gz',
    downloadSize: 31804631,
    downloadSha256:
        '63c87b92e2ae7ff7206a5ecb0012a616284fec0795a77b9e3098d64cc21ee63a',
    databaseSize: 82505728,
    databaseSha256:
        'df5e58d94d00db9e000aa7a9962e0aaf9b1615a78985fdb11a6b1c203d103a50',
    expectedTags: 31060,
    expectedEdges: 6473918,
    compressed: true,
    sourceName: 'newtextdoc1111/danbooru-tag-csv',
    sourceUrl:
        'https://huggingface.co/datasets/newtextdoc1111/danbooru-tag-csv',
    license: 'MIT',
  ),
};

class ResourceDatabaseProgress {
  final ResourceDatabaseId id;
  final ResourceDownloadPhase phase;
  final int receivedBytes;
  final int totalBytes;
  final double speedBytesPerSecond;
  final String message;

  const ResourceDatabaseProgress({
    required this.id,
    required this.phase,
    this.receivedBytes = 0,
    this.totalBytes = 0,
    this.speedBytesPerSecond = 0,
    this.message = '',
  });

  double get percent =>
      totalBytes <= 0 ? 0 : (receivedBytes / totalBytes).clamp(0, 1).toDouble();
}

class ResourceDatabaseStatus {
  final ResourceDatabaseDefinition definition;
  final bool installed;
  final bool valid;
  final String version;
  final int count;
  final int sizeBytes;
  final int resumableBytes;
  final bool hasPrevious;
  final String message;

  const ResourceDatabaseStatus({
    required this.definition,
    this.installed = false,
    this.valid = false,
    this.version = '',
    this.count = 0,
    this.sizeBytes = 0,
    this.resumableBytes = 0,
    this.hasPrevious = false,
    this.message = '',
  });
}

class ResourceDatabaseOverview {
  final String dataDirectory;
  final List<ResourceDatabaseStatus> resources;
  final int memoryEntries;
  final int memoryHits;
  final int memoryMisses;

  const ResourceDatabaseOverview({
    required this.dataDirectory,
    required this.resources,
    required this.memoryEntries,
    required this.memoryHits,
    required this.memoryMisses,
  });

  double get memoryHitRate {
    final total = memoryHits + memoryMisses;
    return total == 0 ? 0 : memoryHits / total;
  }
}

class ResourceDatabaseService {
  static final ResourceDatabaseService shared = ResourceDatabaseService._();
  ResourceDatabaseService._();

  final _progress = StreamController<ResourceDatabaseProgress>.broadcast();
  final Map<ResourceDatabaseId, http.Client> _activeClients = {};
  final Set<ResourceDatabaseId> _paused = {};
  final Map<String, List<ResourceTagSuggestion>> _queryCache = {};
  int _cacheHits = 0;
  int _cacheMisses = 0;

  Stream<ResourceDatabaseProgress> get progress => _progress.stream;

  Future<Directory> _root() async {
    final support = await getApplicationSupportDirectory();
    final directory =
        Directory(p.join(support.path, 'resources', 'autocomplete'));
    if (!directory.existsSync()) await directory.create(recursive: true);
    return directory;
  }

  Future<File> _database(ResourceDatabaseDefinition definition) async =>
      File(p.join((await _root()).path, definition.databaseName));
  Future<File> _previous(ResourceDatabaseDefinition definition) async =>
      File(p.join((await _root()).path, '${definition.databaseName}.previous'));
  Future<File> _partial(ResourceDatabaseDefinition definition) async =>
      File(p.join((await _root()).path, '${definition.downloadName}.part'));
  Future<File> _staged(ResourceDatabaseDefinition definition) async => File(
      p.join((await _root()).path, '${definition.databaseName}.installing'));

  int _length(File file) => file.existsSync() ? file.lengthSync() : 0;

  Future<ResourceDatabaseOverview> overview() async {
    final root = await _root();
    final resources = <ResourceDatabaseStatus>[];
    for (final definition in resourceDatabaseDefinitions.values) {
      resources.add(await _status(definition));
    }
    return ResourceDatabaseOverview(
      dataDirectory: root.path,
      resources: resources,
      memoryEntries: _queryCache.length,
      memoryHits: _cacheHits,
      memoryMisses: _cacheMisses,
    );
  }

  Future<ResourceDatabaseStatus> _status(
      ResourceDatabaseDefinition definition) async {
    final live = await _database(definition);
    final previous = await _previous(definition);
    final partial = await _partial(definition);
    var valid = false;
    var version = '';
    var count = 0;
    var message = '';
    if (live.existsSync()) {
      try {
        final metadata = await _validateDatabase(
          definition,
          live,
          thorough: false,
          requireCurrentVersion: false,
        );
        valid = true;
        version = metadata['data_version'] ?? definition.dataVersion;
        count = int.tryParse(metadata['tag_count'] ??
                metadata['directed_edge_count'] ??
                '') ??
            definition.expectedTags;
      } catch (error) {
        message = error.toString().replaceFirst('Exception: ', '');
      }
    }
    return ResourceDatabaseStatus(
      definition: definition,
      installed: live.existsSync(),
      valid: valid,
      version: version,
      count: count,
      sizeBytes: _length(live),
      resumableBytes: _length(partial),
      hasPrevious: previous.existsSync(),
      message: message,
    );
  }

  void _emit(
    ResourceDatabaseDefinition definition,
    ResourceDownloadPhase phase, {
    int received = 0,
    int? total,
    double speed = 0,
    String message = '',
  }) {
    _progress.add(ResourceDatabaseProgress(
      id: definition.id,
      phase: phase,
      receivedBytes: received,
      totalBytes: total ?? definition.downloadSize,
      speedBytesPerSecond: speed,
      message: message,
    ));
  }

  Future<String> _sha256(File file) async {
    final output = _SingleDigestSink();
    final sink = sha256.startChunkedConversion(output);
    await for (final chunk in file.openRead()) {
      sink.add(chunk);
    }
    sink.close();
    return output.value?.toString() ?? '';
  }

  Future<void> _verifyFile(
    File file,
    int expectedSize,
    String expectedSha,
  ) async {
    final size = _length(file);
    if (size != expectedSize) {
      throw StateError('File size mismatch: $size / $expectedSize');
    }
    if (await _sha256(file) != expectedSha) {
      throw StateError(
          'SHA-256 validation failed; the current database was not changed.');
    }
  }

  Future<Map<String, String>> _validateDatabase(
    ResourceDatabaseDefinition definition,
    File file, {
    required bool thorough,
    bool requireCurrentVersion = true,
  }) async {
    if (!file.existsSync()) throw StateError('Database file does not exist');
    final header = await file
        .openRead(0, 16)
        .fold<List<int>>(<int>[], (all, chunk) => all..addAll(chunk));
    if (utf8.decode(header, allowMalformed: true) != 'SQLite format 3\u0000') {
      throw const FormatException('Downloaded file is not a SQLite database');
    }
    final db =
        await openDatabase(file.path, readOnly: true, singleInstance: false);
    try {
      Future<Set<String>> columns(String table) async =>
          (await db.rawQuery('PRAGMA table_info($table)'))
              .map((row) => row['name']?.toString() ?? '')
              .where((name) => name.isNotEmpty)
              .toSet();
      Future<void> requireColumns(String table, List<String> expected) async {
        final actual = await columns(table);
        for (final field in expected) {
          if (!actual.contains(field)) {
            throw StateError('Database table $table is missing $field');
          }
        }
      }

      await requireColumns('metadata', ['key', 'value']);
      await requireColumns('tags', ['id', 'name']);
      final rows = await db.query('metadata', columns: ['key', 'value']);
      final metadata = <String, String>{
        for (final row in rows)
          if (row['key'] != null)
            row['key'].toString(): row['value']?.toString() ?? '',
      };
      if (metadata['schema_version'] != '${definition.schemaVersion}') {
        throw StateError('Database schema version mismatch');
      }
      if ((metadata['data_version'] ?? '').isEmpty) {
        throw StateError('Database data version is missing');
      }
      if (requireCurrentVersion &&
          metadata['data_version'] != definition.dataVersion) {
        throw StateError('Database data version mismatch');
      }
      if (definition.id == ResourceDatabaseId.tagCatalog) {
        await requireColumns('tags', ['category', 'post_count']);
        await requireColumns('aliases', ['tag_id', 'alias']);
        await requireColumns(
            'tag_search', ['term', 'search_key', 'tag_id', 'kind']);
      } else {
        await requireColumns(
            'edges', ['source_tag_id', 'target_tag_id', 'count']);
      }
      if (thorough) {
        final check = await db.rawQuery('PRAGMA quick_check');
        if (check.isEmpty ||
            check.first.values.firstOrNull?.toString() != 'ok') {
          throw StateError('SQLite integrity check failed');
        }
        final tagCount = Sqflite.firstIntValue(
                await db.rawQuery('SELECT COUNT(*) FROM tags')) ??
            0;
        if (tagCount <= 0 ||
            (requireCurrentVersion && tagCount != definition.expectedTags)) {
          throw StateError('Tag count mismatch: $tagCount');
        }
        if (definition.expectedEdges != null) {
          final edgeCount = Sqflite.firstIntValue(
                  await db.rawQuery('SELECT COUNT(*) FROM edges')) ??
              0;
          if (edgeCount <= 0 ||
              (requireCurrentVersion &&
                  edgeCount != definition.expectedEdges)) {
            throw StateError('Related-tag count mismatch: $edgeCount');
          }
        }
      }
      return metadata;
    } finally {
      await db.close();
    }
  }

  Future<File> _downloadToPartial(ResourceDatabaseDefinition definition) async {
    final partial = await _partial(definition);
    var initial = _length(partial);
    if (initial > definition.downloadSize) {
      await partial.delete();
      initial = 0;
    }
    if (initial == definition.downloadSize) return partial;

    Future<http.StreamedResponse> start(http.Client client, int offset) {
      final request = http.Request('GET', Uri.parse(definition.downloadUrl));
      if (offset > 0) request.headers['Range'] = 'bytes=$offset-';
      request.headers['User-Agent'] =
          'Langbai-NovelAI-Studio-Mobile/Resource-Database';
      return client.send(request).timeout(const Duration(minutes: 2));
    }

    var client = http.Client();
    _activeClients[definition.id] = client;
    _paused.remove(definition.id);
    var response = await start(client, initial);
    if (initial > 0 && response.statusCode != 206) {
      client.close();
      if (partial.existsSync()) await partial.delete();
      initial = 0;
      client = http.Client();
      _activeClients[definition.id] = client;
      response = await start(client, 0);
    }
    if (response.statusCode != 200 && response.statusCode != 206) {
      throw http.ClientException('HTTP ${response.statusCode}');
    }
    final range = response.headers['content-range'] ?? '';
    final rangeTotal =
        int.tryParse(RegExp(r'/(\d+)$').firstMatch(range)?.group(1) ?? '');
    final total = rangeTotal ?? initial + (response.contentLength ?? 0);
    var received = initial;
    final startedAt = DateTime.now();
    var lastEmit = DateTime.fromMillisecondsSinceEpoch(0);
    final output =
        partial.openWrite(mode: initial > 0 ? FileMode.append : FileMode.write);
    try {
      await for (final chunk
          in response.stream.timeout(const Duration(minutes: 2))) {
        if (_paused.contains(definition.id)) {
          throw const _PausedDownload();
        }
        output.add(chunk);
        received += chunk.length;
        final now = DateTime.now();
        if (now.difference(lastEmit).inMilliseconds >= 120) {
          final elapsed =
              max(.1, now.difference(startedAt).inMilliseconds / 1000);
          _emit(
            definition,
            ResourceDownloadPhase.downloading,
            received: received,
            total: total > 0 ? total : definition.downloadSize,
            speed: (received - initial) / elapsed,
          );
          lastEmit = now;
        }
      }
      await output.flush();
      return partial;
    } finally {
      await output.close();
      client.close();
      _activeClients.remove(definition.id);
    }
  }

  Future<void> _atomicInstall(
      ResourceDatabaseDefinition definition, File staged) async {
    final live = await _database(definition);
    final previous = await _previous(definition);
    final rollback = File('${live.path}.rollback');
    if (rollback.existsSync()) await rollback.delete();
    if (live.existsSync()) {
      final previousTemp = File('${previous.path}.tmp');
      if (previousTemp.existsSync()) await previousTemp.delete();
      await live.copy(previousTemp.path);
      if (previous.existsSync()) await previous.delete();
      await previousTemp.rename(previous.path);
      await live.rename(rollback.path);
    }
    try {
      await staged.rename(live.path);
      if (rollback.existsSync()) await rollback.delete();
      clearMemoryCache();
    } catch (_) {
      if (rollback.existsSync() && !live.existsSync()) {
        await rollback.rename(live.path);
      }
      rethrow;
    }
  }

  Future<String> install(ResourceDatabaseId id) async {
    final definition = resourceDatabaseDefinitions[id]!;
    if (_activeClients.containsKey(id)) {
      throw StateError('Download already running');
    }
    try {
      final archive = await _downloadToPartial(definition);
      _emit(definition, ResourceDownloadPhase.verifying,
          received: _length(archive), message: 'Verifying download');
      await _verifyFile(
          archive, definition.downloadSize, definition.downloadSha256);
      final staged = await _staged(definition);
      if (staged.existsSync()) await staged.delete();
      if (definition.compressed) {
        _emit(definition, ResourceDownloadPhase.extracting,
            received: definition.downloadSize, message: 'Extracting database');
        final output = staged.openWrite();
        try {
          await output.addStream(gzip.decoder.bind(archive.openRead()));
          await output.flush();
        } finally {
          await output.close();
        }
        await _verifyFile(
            staged, definition.databaseSize, definition.databaseSha256);
      } else {
        await archive.rename(staged.path);
      }
      _emit(definition, ResourceDownloadPhase.installing,
          received: definition.downloadSize,
          message: 'Validating and replacing database');
      await _validateDatabase(definition, staged, thorough: true);
      await _atomicInstall(definition, staged);
      if (definition.compressed && archive.existsSync()) await archive.delete();
      _emit(definition, ResourceDownloadPhase.complete,
          received: definition.downloadSize, message: 'Installed');
      return '${definition.label} installed safely. The previous database is retained for rollback.';
    } on _PausedDownload {
      final partial = await _partial(definition);
      _emit(definition, ResourceDownloadPhase.paused,
          received: _length(partial), message: 'Download paused');
      return 'Download paused';
    } catch (error) {
      final paused = _paused.contains(id);
      final partial = await _partial(definition);
      final staged = await _staged(definition);
      if (!paused && staged.existsSync()) await staged.delete();
      _emit(
        definition,
        paused ? ResourceDownloadPhase.paused : ResourceDownloadPhase.error,
        received: _length(partial),
        message: error.toString().replaceFirst('Exception: ', ''),
      );
      if (paused) return 'Download paused';
      rethrow;
    } finally {
      _activeClients.remove(id)?.close();
      _paused.remove(id);
    }
  }

  void pause(ResourceDatabaseId id) {
    _paused.add(id);
    _activeClients.remove(id)?.close();
  }

  Future<String> restorePrevious(ResourceDatabaseId id) async {
    final definition = resourceDatabaseDefinitions[id]!;
    final previous = await _previous(definition);
    if (!previous.existsSync()) {
      throw StateError('No previous database is available');
    }
    final staged = await _staged(definition);
    if (staged.existsSync()) await staged.delete();
    await previous.copy(staged.path);
    await _validateDatabase(definition, staged,
        thorough: true, requireCurrentVersion: false);
    await _atomicInstall(definition, staged);
    _emit(definition, ResourceDownloadPhase.complete,
        received: definition.databaseSize,
        total: definition.databaseSize,
        message: 'Previous database restored');
    return 'Previous database restored';
  }

  Future<void> delete(ResourceDatabaseId id) async {
    final definition = resourceDatabaseDefinitions[id]!;
    pause(id);
    for (final file in [
      await _database(definition),
      await _previous(definition),
      await _partial(definition),
      await _staged(definition),
    ]) {
      if (file.existsSync()) await file.delete();
    }
    clearMemoryCache();
  }

  Future<List<ResourceTagSuggestion>> searchTagCatalog(String query,
      {int limit = 20}) async {
    final normalized = query.trim();
    if (normalized.isEmpty) return const [];
    final safeLimit = limit.clamp(1, 200).toInt();
    final key = 'search:${normalized.toLowerCase()}:$safeLimit';
    final cached = _cacheGet(key);
    if (cached != null) return cached;
    final definition =
        resourceDatabaseDefinitions[ResourceDatabaseId.tagCatalog]!;
    final file = await _database(definition);
    if (!file.existsSync()) return const [];
    final expression = normalized
        .replaceAll('_', ' ')
        .toLowerCase()
        .split(RegExp(r'\s+'))
        .map((token) => token.replaceAll(
            RegExp(r'[^a-z0-9_\-\u00c0-\uffff()]', caseSensitive: false), ''))
        .where((token) => token.isNotEmpty)
        .map((token) => '"${token.replaceAll('"', '""')}"*')
        .join(' ');
    if (expression.isEmpty) return const [];
    final db =
        await openDatabase(file.path, readOnly: true, singleInstance: false);
    try {
      final rows = await db.rawQuery('''
        SELECT f.term, f.kind, t.id, t.name, t.category, t.post_count,
          (SELECT GROUP_CONCAT(alias, ' ') FROM aliases WHERE tag_id = t.id) AS aliases
        FROM tag_search f
        JOIN tags t ON t.id = f.tag_id
        WHERE tag_search MATCH ?
        ORDER BY bm25(tag_search), t.post_count DESC, t.name ASC
        LIMIT ?
      ''', [expression, safeLimit * 5]);
      final seen = <int>{};
      final output = <ResourceTagSuggestion>[];
      for (final row in rows) {
        final id = _asInt(row['id']);
        if (!seen.add(id)) continue;
        output.add(ResourceTagSuggestion(
          tag: row['name']?.toString() ?? '',
          category: _asInt(row['category']),
          count: _asInt(row['post_count']),
          description: row['aliases']?.toString().trim() ?? '',
        ));
        if (output.length >= safeLimit) break;
      }
      return _cacheSet(key, output);
    } catch (_) {
      return const [];
    } finally {
      await db.close();
    }
  }

  Future<List<ResourceTagSuggestion>> relatedTags(List<String> tags,
      {int limit = 8}) async {
    final normalized = tags
        .map((tag) => tag.trim().toLowerCase().replaceAll(' ', '_'))
        .where((tag) => tag.isNotEmpty)
        .toSet()
        .toList()
        .reversed
        .take(12)
        .toList()
        .reversed
        .toList();
    if (normalized.isEmpty) return const [];
    final safeLimit = limit.clamp(1, 50).toInt();
    final key = 'related:${normalized.join('|')}:$safeLimit';
    final cached = _cacheGet(key);
    if (cached != null) return cached;
    final definition =
        resourceDatabaseDefinitions[ResourceDatabaseId.cooccurrence]!;
    final file = await _database(definition);
    if (!file.existsSync()) return const [];
    final db =
        await openDatabase(file.path, readOnly: true, singleInstance: false);
    try {
      final aggregate = <String, int>{};
      for (final tag in normalized) {
        final rows = await db.rawQuery('''
          SELECT target.name AS related_tag, edge.count AS count
          FROM tags source
          JOIN edges edge ON edge.source_tag_id = source.id
          JOIN tags target ON target.id = edge.target_tag_id
          WHERE source.name = ? COLLATE NOCASE
          ORDER BY edge.count DESC
          LIMIT 48
        ''', [tag]);
        for (final row in rows) {
          final related = row['related_tag']?.toString() ?? '';
          if (related.isEmpty || normalized.contains(related.toLowerCase())) {
            continue;
          }
          aggregate[related] = (aggregate[related] ?? 0) + _asInt(row['count']);
        }
      }
      final output = aggregate.entries.toList()
        ..sort((left, right) {
          final count = right.value.compareTo(left.value);
          return count != 0 ? count : left.key.compareTo(right.key);
        });
      return _cacheSet(
        key,
        output
            .take(safeLimit)
            .map((entry) => ResourceTagSuggestion(
                  tag: entry.key,
                  count: entry.value,
                  category: 0,
                  description: '本地共现数据库',
                ))
            .toList(),
      );
    } catch (_) {
      return const [];
    } finally {
      await db.close();
    }
  }

  List<ResourceTagSuggestion>? _cacheGet(String key) {
    final value = _queryCache[key];
    if (value == null) {
      _cacheMisses++;
    } else {
      _cacheHits++;
    }
    return value;
  }

  List<ResourceTagSuggestion> _cacheSet(
      String key, List<ResourceTagSuggestion> value) {
    if (_queryCache.length >= 240) _queryCache.remove(_queryCache.keys.first);
    _queryCache[key] = value;
    return value;
  }

  void clearMemoryCache() {
    _queryCache.clear();
    _cacheHits = 0;
    _cacheMisses = 0;
  }
}

class _SingleDigestSink implements Sink<Digest> {
  Digest? value;

  @override
  void add(Digest data) => value = data;

  @override
  void close() {}
}

int _asInt(Object? value) =>
    value is num ? value.round() : int.tryParse(value?.toString() ?? '') ?? 0;

class _PausedDownload implements Exception {
  const _PausedDownload();
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
