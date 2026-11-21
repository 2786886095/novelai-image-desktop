import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

const tagPackNames = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
};

typedef TagPackHit = ({
  String tag,
  String description,
  int count,
  int category
});
typedef TagPackExactHit = ({String query, TagPackHit entry});

class MultilingualTagPacks extends ChangeNotifier {
  MultilingualTagPacks({Future<Directory> Function()? getRoot})
      : _getRoot = getRoot ?? _defaultRoot;
  final Future<Directory> Function() _getRoot;
  static const manifestPath = 'assets/tags/multilingual-tag-packs.json';
  static Future<Directory> _defaultRoot() async {
    final root = await getApplicationSupportDirectory();
    return Directory('${root.path}/multilingual-tags');
  }

  Future<void>? _loaded;
  late Directory _root;
  Map<String, dynamic> _packs = {};
  String updatedAt = '';
  String? active;
  final installed = <String>{};
  bool busy = false;
  double? progress;
  String? error;

  int size(String lang) => (_packs[lang] as Map?)?['size'] as int? ?? 0;
  int count(String lang) => (_packs[lang] as Map?)?['count'] as int? ?? 0;

  Future<void> load() => _loaded ??= _load();

  Future<void> _load() async {
    try {
      final m = jsonDecode(await rootBundle.loadString(manifestPath))
          as Map<String, dynamic>;
      updatedAt = m['updatedAt'] as String;
      _packs = m['packs'] as Map<String, dynamic>;
      _root = await _getRoot();
      for (final lang in tagPackNames.keys) {
        final file = _database(lang);
        if (await file.exists() &&
            await file.length() == _packs[lang]['databaseSize']) {
          installed.add(lang);
        }
      }
      final selection = File('${_root.path}/active.json');
      if (await selection.exists()) {
        final lang = jsonDecode(await selection.readAsString());
        if (installed.contains(lang)) active = lang as String;
      }
    } catch (e) {
      // A corrupt activation file must not prevent switching dictionaries.
      if (_packs.isEmpty) error = e.toString();
    }
    _notify();
  }

  bool _disposed = false;
  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  File _database(String lang) => File(
      '${_root.path}/${(_packs[lang]['file'] as String).replaceFirst(RegExp(r"\.gz$"), "")}');

  Future<void> install(
      String lang, http.Client Function() clientFactory) async {
    await load();
    if (busy || !_packs.containsKey(lang)) return;
    busy = true;
    progress = null;
    error = null;
    _notify();
    Directory? staging;
    http.Client? client;
    Timer? deadline;
    try {
      await _root.create(recursive: true);
      final work = await _root.createTemp('install-');
      staging = work;
      if (!installed.contains(lang)) {
        final pack = _packs[lang] as Map<String, dynamic>;
        client = clientFactory();
        deadline = Timer(const Duration(minutes: 6), client.close);
        final archive = File('${work.path}/pack.gz');
        final database = File('${work.path}/pack.sqlite');
        final compressedSize = pack['size'] as int;
        final stream =
            await _download(client, updatedAt, pack['file'] as String);
        var lastPercent = -1;
        await copyVerified(
            stream, archive, compressedSize, pack['sha256'] as String,
            onBytes: (bytes) {
          final percent = (bytes * 100 ~/ compressedSize);
          if (percent == lastPercent) return;
          progress = bytes / compressedSize;
          lastPercent = percent;
          _notify();
        });
        progress = null;
        _notify();
        await copyVerified(
          gzip.decoder.bind(archive.openRead()),
          database,
          pack['databaseSize'] as int,
          pack['databaseSha256'] as String,
        );
        final db =
            await openReadOnlyDatabase(database.path, singleInstance: false);
        try {
          final info = (await db
                  .rawQuery('SELECT language,updated_at FROM info LIMIT 1'))
              .single;
          if (info['language'] != lang || info['updated_at'] != updatedAt) {
            throw const FormatException('Wrong tag pack language or version.');
          }
        } finally {
          await db.close();
        }
        await database.rename(_database(lang).path);
        installed.add(lang);
      }
      final next = File('${work.path}/active.json');
      await next.writeAsString(jsonEncode(lang), flush: true);
      await next.rename('${_root.path}/active.json');
      active = lang;
    } catch (e) {
      error = e.toString();
    } finally {
      deadline?.cancel();
      client?.close();
      try {
        await staging?.delete(recursive: true);
      } on FileSystemException {/* no activation change */}
      busy = false;
      progress = null;
      _notify();
    }
  }

  static Future<Stream<List<int>>> _download(
      http.Client client, String stamp, String name) async {
    var url = Uri.https('github.com',
        '/2786886095/novelai-image-desktop/releases/download/tag-packs-$stamp/$name');
    for (var i = 0; i < 4; i++) {
      if (url.scheme != 'https' ||
          url.userInfo.isNotEmpty ||
          url.port != 443 ||
          !{
            'github.com',
            'release-assets.githubusercontent.com',
            'objects.githubusercontent.com'
          }.contains(url.host)) {
        throw const FormatException('Unexpected download host.');
      }
      final request = http.Request('GET', url)..followRedirects = false;
      final response =
          await client.send(request).timeout(const Duration(seconds: 30));
      if (response.statusCode == 200) return response.stream;
      // Cancel immediately: never consume arbitrary redirect/error bodies.
      await response.stream.listen((_) {}).cancel();
      final redirect = response.headers['location'];
      if (redirect == null ||
          !{301, 302, 303, 307, 308}.contains(response.statusCode)) {
        throw HttpException(
            'Tag pack download failed: HTTP ${response.statusCode}');
      }
      url = url.resolve(redirect);
    }
    throw const FormatException('Too many redirects.');
  }

  @visibleForTesting
  static Future<void> copyVerified(
      Stream<List<int>> source, File destination, int size, String expected,
      {void Function(int)? onBytes}) async {
    var length = 0;
    final sink = destination.openWrite();
    try {
      await for (final data in source) {
        length += data.length;
        if (length > size) {
          throw const FormatException('Tag pack exceeds declared size.');
        }
        sink.add(data);
        await sink.flush();
        onBytes?.call(length);
      }
    } finally {
      await sink.close();
    }
    if (length != size ||
        (await sha256.bind(destination.openRead()).first).toString() !=
            expected) {
      throw const FormatException('Tag pack checksum or size mismatch.');
    }
  }

  /// Page across the whole selected language pack, independent of the browsed category.
  Future<({int total,List<TagPackHit> rows})?> capsulePage(String query,
      {required int page, required String sort, Iterable<String> topic=const []}) async {
    await load();
    final lang=active, q=key(String.fromCharCodes(query.runes.take(255)));
    if(lang==null)return null;
    final db=await openReadOnlyDatabase(_database(lang).path,singleInstance:false);
    try {
      final topics=topic.map(key).toSet();
      final clause=topics.isEmpty?'':' OR key IN ('+List.filled(topics.length,'?').join(',')+')';
      final filter=q.isEmpty?'1':'(instr(key,?)>0 OR instr(translated_key,?)>0$clause)';
      final args=<Object?>[if(q.isNotEmpty)...[q,q,...topics]];
      final count=Sqflite.firstIntValue(await db.rawQuery('SELECT count(*) FROM terms WHERE $filter',args))??0;
      const priority='CASE WHEN key=? OR translated_key=? THEN 0 WHEN instr(key,?)=1 OR instr(translated_key,?)=1 THEN 1 WHEN instr(key,?)>0 OR instr(translated_key,?)>0 THEN 2 ELSE 3 END';
      final order=sort=='alpha'?'tag':sort=='usage'||q.isEmpty?'count DESC,tag':'$priority,count DESC,tag';
      final rows=await db.rawQuery('SELECT tag,translated,count,category FROM terms WHERE $filter ORDER BY $order LIMIT 24 OFFSET ?', [...args,if(q.isNotEmpty && sort!='alpha' && sort!='usage')...List.filled(6,q),page.clamp(0,count==0?0:(count-1)~/24)*24]);
      return (total:count,rows:rows.map((r)=>(tag:r['tag'] as String,description:r['translated'] as String,count:r['count'] as int,category:r['category'] as int)).toList());
    }finally{await db.close();}
  }

  /// Null means not installed. An empty list is an authoritative offline miss.
  Future<List<TagPackHit>?> search(String input, {int limit = 12}) async {
    await load();
    final lang = active;
    if (lang == null) return null;
    final raw = String.fromCharCodes(input.runes.take(255));
    final word = raw
        .toLowerCase()
        .replaceAll('_', ' ')
        .trim()
        .replaceAll(RegExp(r'\s+'), ' ');
    if (word.isEmpty) return const [];
    final db =
        await openReadOnlyDatabase(_database(lang).path, singleInstance: false);
    try {
      final n = limit.clamp(1, 200);
      final byTag = <String, Map<String, Object?>>{};
      for (final col in ['key', 'translated_key']) {
        final rows = await db.rawQuery(
            'SELECT tag,translated,category,count,CASE WHEN $col = ? THEN 0 ELSE 1 END AS priority '
            'FROM terms WHERE $col >= ? AND $col < ? ORDER BY priority,count DESC,tag LIMIT ?',
            [word, word, word + String.fromCharCode(0x10ffff), n]);
        for (final row in rows) {
          final tag = row['tag'] as String;
          final existing = byTag[tag];
          if (existing == null ||
              (row['priority'] as int) < (existing['priority'] as int)) {
            byTag[tag] = row;
          }
        }
      }
      final rows = byTag.values.toList()
        ..sort((a, b) {
          final priority =
              (a['priority'] as int).compareTo(b['priority'] as int);
          if (priority != 0) return priority;
          final count = (b['count'] as int).compareTo(a['count'] as int);
          return count != 0
              ? count
              : (a['tag'] as String).compareTo(b['tag'] as String);
        });
      return rows
          .take(n)
          .map((r) => (
                tag: r['tag'] as String,
                description: r['translated'] as String,
                count: r['count'] as int,
                category: r['category'] as int
              ))
          .toList();
    } finally {
      await db.close();
    }
  }

  static String key(String word) => word
      .toLowerCase()
      .replaceAll('_', ' ')
      .trim()
      .replaceAll(RegExp(r'\s+'), ' ');

  /// Return exact canonical matches and, optionally, exact translated matches.
  /// Translated labels with more than one canonical tag are for search only.
  /// Searches are bounded; no full dictionary is loaded into Dart.
  Future<List<TagPackExactHit>?> lookupExact(Iterable<String> terms,
      {bool translations = false}) async {
    await load();
    final lang = active;
    if (lang == null) return null;
    final keys = terms.map(key).where((t) => t.isNotEmpty && t.length <= 255)
        .toSet().take(480).toList();
    if (keys.isEmpty) return const [];
    final db = await openReadOnlyDatabase(_database(lang).path, singleInstance: false);
    try {
      final found = <String, TagPackHit>{};
      for (final col in ['key', if (translations) 'translated_key']) {
        for (var start = 0; start < keys.length; start += 160) {
          final batch = keys.skip(start).take(160)
              .where((term) => col == 'key' || !found.containsKey(term)).toList();
          if (batch.isEmpty) continue;
          final marks = List.filled(batch.length, '?').join(',');
          final rows = await db.rawQuery(
              'SELECT tag,translated,count,category,$col AS term FROM terms '
              'WHERE $col IN ($marks) ORDER BY count DESC,tag', batch);
          final matches = <String, TagPackHit>{};
          final ambiguous = <String>{};
          for (final row in rows) {
            final term = row['term'] as String;
            final tag = row['tag'] as String;
            if (col == 'translated_key' && matches[term]?.tag != null && matches[term]!.tag != tag) {
              ambiguous.add(term);
            }
            matches.putIfAbsent(term, () => (
              tag: tag, description: row['translated'] as String,
              count: row['count'] as int, category: row['category'] as int,
            ));
          }
          found.addEntries(matches.entries.where((entry) => !ambiguous.contains(entry.key)));
        }
      }
      return [for (final k in keys) if (found.containsKey(k)) (query: k, entry: found[k]!)];
    } finally {
      await db.close();
    }
  }
}
