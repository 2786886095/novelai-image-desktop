import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

class PromptCodexBook {
  final String id;
  final String title;
  final String sourceUrl;
  final bool adult;

  const PromptCodexBook({
    required this.id,
    required this.title,
    required this.sourceUrl,
    required this.adult,
  });

  factory PromptCodexBook.fromJson(Map<String, dynamic> json) =>
      PromptCodexBook(
        id: json['id'] as String,
        title: json['title'] as String,
        sourceUrl: json['sourceUrl'] as String,
        adult: json['adult'] == true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'sourceUrl': sourceUrl,
        'adult': adult,
      };
}

class PromptCodexEntry {
  final String id;
  final String bookId;
  final String section;
  final String category;
  final String title;
  final String prompt;
  final bool adult;
  final String sourceUrl;

  const PromptCodexEntry({
    required this.id,
    required this.bookId,
    required this.section,
    required this.category,
    required this.title,
    required this.prompt,
    required this.adult,
    required this.sourceUrl,
  });

  factory PromptCodexEntry.fromJson(Map<String, dynamic> json) =>
      PromptCodexEntry(
        id: json['id'] as String,
        bookId: json['bookId'] as String,
        section: json['section'] as String,
        category: json['category'] as String,
        title: json['title'] as String,
        prompt: json['prompt'] as String,
        adult: json['adult'] == true,
        sourceUrl: json['sourceUrl'] as String,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'bookId': bookId,
        'section': section,
        'category': category,
        'title': title,
        'prompt': prompt,
        'adult': adult,
        'sourceUrl': sourceUrl,
      };
}

class PromptCodexSnapshot {
  final String generatedAt;
  final String sourceSite;
  final String permissionNote;
  final List<PromptCodexBook> books;
  final List<PromptCodexEntry> entries;

  const PromptCodexSnapshot({
    required this.generatedAt,
    required this.sourceSite,
    required this.permissionNote,
    required this.books,
    required this.entries,
  });

  factory PromptCodexSnapshot.fromJson(Map<String, dynamic> json) =>
      PromptCodexSnapshot(
        generatedAt: json['generatedAt'] as String,
        sourceSite: json['sourceSite'] as String,
        permissionNote: json['permissionNote'] as String? ?? '',
        books: (json['books'] as List)
            .whereType<Map>()
            .map((item) =>
                PromptCodexBook.fromJson(Map<String, dynamic>.from(item)))
            .toList(growable: false),
        entries: (json['entries'] as List)
            .whereType<Map>()
            .map((item) =>
                PromptCodexEntry.fromJson(Map<String, dynamic>.from(item)))
            .toList(growable: false),
      );

  Map<String, dynamic> toJson() => {
        'schemaVersion': 1,
        'generatedAt': generatedAt,
        'sourceSite': sourceSite,
        'permissionNote': permissionNote,
        'books': books.map((item) => item.toJson()).toList(),
        'entries': entries.map((item) => item.toJson()).toList(),
      };
}

PromptCodexSnapshot _decodeSnapshot(String source) =>
    PromptCodexSnapshot.fromJson(
        Map<String, dynamic>.from(jsonDecode(source) as Map));

String _encodeSnapshot(Map<String, dynamic> value) => jsonEncode(value);

String _decodeHtml(String source) => source
    .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
    .replaceAll(RegExp(r'<[^>]+>'), '')
    .replaceAllMapped(RegExp(r'&#(\d+);'), (match) {
      final value = int.tryParse(match.group(1) ?? '');
      return value == null ? '' : String.fromCharCode(value);
    })
    .replaceAllMapped(RegExp(r'&#x([\da-f]+);', caseSensitive: false), (match) {
      final value = int.tryParse(match.group(1) ?? '', radix: 16);
      return value == null ? '' : String.fromCharCode(value);
    })
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('\r', '')
    .replaceAll(RegExp(r'[ \t]+\n'), '\n')
    .replaceAll(RegExp(r'\n[ \t]+'), '\n')
    .replaceAll(RegExp(r'[ \t]{2,}'), ' ')
    .trim();

String _categoryFor(String section, String title, bool adult) {
  final value = '$section $title'.toLowerCase();
  if (RegExp(r'画师|artist|绘师|作者|编纂者').hasMatch(value)) return 'artist';
  if (RegExp(r'服装|服饰|衣|袜|鞋|内衣|装扮|饰品').hasMatch(value)) {
    return 'clothing';
  }
  if (RegExp(r'光|影|色|氛围|滤镜|lighting|color').hasMatch(value)) {
    return 'lighting';
  }
  if (RegExp(r'背景|场景|地点|环境|室内|室外').hasMatch(value)) return 'scene';
  if (RegExp(r'构图|镜头|视角|姿势|动作|手势|pose|angle').hasMatch(value)) {
    return 'composition';
  }
  if (RegExp(r'表情|脸|眼|嘴|头发|角色|人物|种族').hasMatch(value)) {
    return 'character';
  }
  if (RegExp(r'风格|画风|媒介|笔触|质感|style').hasMatch(value)) {
    return 'style';
  }
  return adult ? 'adult-other' : 'other';
}

List<PromptCodexEntry> _parsePage(String html, PromptCodexBook book) {
  final start = html.indexOf('<div class="sl-markdown-content">');
  if (start < 0) throw FormatException('Missing article body: ${book.title}');
  final body = html.substring(start);
  final matches = RegExp(
    r'<(h1|h2|h3|p)\b[^>]*>([\s\S]*?)</\1>',
    caseSensitive: false,
  ).allMatches(body);
  final entries = <PromptCodexEntry>[];
  var section = '前言';
  var pendingTitle = '';
  var pendingParts = <String>[];

  void flush() {
    final prompt = pendingParts.join('\n').trim();
    if (prompt.isEmpty) return;
    final parts = prompt.split(RegExp(r'\n|[，。；]'));
    final fallback = parts.isEmpty ? section : parts.first;
    final title = pendingTitle.isNotEmpty
        ? pendingTitle
        : fallback.substring(0, fallback.length.clamp(0, 48));
    entries.add(PromptCodexEntry(
      id: '${book.id}-${entries.length + 1}',
      bookId: book.id,
      section: section,
      category: _categoryFor(section, title, book.adult),
      title: title,
      prompt: prompt,
      adult: book.adult,
      sourceUrl: book.sourceUrl,
    ));
    pendingTitle = '';
    pendingParts = <String>[];
  }

  for (final match in matches) {
    final tag = match.group(1)!.toLowerCase();
    final text = _decodeHtml(match.group(2) ?? '');
    if (text.isEmpty || tag == 'h1') continue;
    if (tag == 'p' &&
        RegExp(r'^(note|tip|warning|caution)$', caseSensitive: false)
            .hasMatch(text)) {
      continue;
    }
    if (tag == 'h2') {
      flush();
      section = text.replaceFirst(RegExp(r'^#+\s*'), '');
    } else if (tag == 'h3') {
      flush();
      pendingTitle = text.replaceFirst(RegExp(r'^#+\s*'), '');
    } else if (pendingTitle.isNotEmpty) {
      pendingParts.add(text);
    } else {
      final titleMatch = RegExp(r'^(?:PS\d+[:：]?|\d+[.、）)]\s*)[^，。；\n]{0,42}')
          .firstMatch(text);
      pendingTitle = titleMatch?.group(0) ?? '';
      pendingParts.add(text);
      flush();
    }
  }
  flush();
  return entries;
}

PromptCodexSnapshot _parsePages(Map<String, Object?> payload) {
  final books = (payload['books'] as List)
      .whereType<Map>()
      .map((item) => PromptCodexBook.fromJson(Map<String, dynamic>.from(item)))
      .toList(growable: false);
  final pages = (payload['pages'] as List).cast<String>();
  final entries = <PromptCodexEntry>[];
  for (var index = 0; index < books.length; index += 1) {
    entries.addAll(_parsePage(pages[index], books[index]));
  }
  if (entries.length < 100) {
    throw const FormatException('Prompt codex update is incomplete.');
  }
  return PromptCodexSnapshot(
    generatedAt: DateTime.now().toUtc().toIso8601String(),
    sourceSite: 'https://nai4.top',
    permissionNote: '原页面声明为无偿免费分享；应用保留原始来源链接。',
    books: books,
    entries: entries,
  );
}

class PromptCodexService {
  static const _asset = 'assets/prompt_codex.json';
  static const _cacheName = 'prompt-codex-v1.json';

  Future<File> _cacheFile() async {
    final directory = await getApplicationSupportDirectory();
    return File('${directory.path}${Platform.pathSeparator}$_cacheName');
  }

  Future<PromptCodexSnapshot> load() async {
    try {
      final cache = await _cacheFile();
      if (await cache.exists()) {
        return compute(_decodeSnapshot, await cache.readAsString());
      }
    } catch (_) {}
    return compute(_decodeSnapshot, await rootBundle.loadString(_asset));
  }

  Future<PromptCodexSnapshot> update() async {
    final bundled =
        await compute(_decodeSnapshot, await rootBundle.loadString(_asset));
    final pages = await Future.wait(bundled.books.map((book) async {
      final response = await http.get(
        Uri.parse(book.sourceUrl),
        headers: const {
          'user-agent': 'Langbai-NovelAI-Studio-Mobile Prompt-Codex'
        },
      ).timeout(const Duration(seconds: 90));
      if (response.statusCode != 200) {
        throw HttpException('${book.title}: HTTP ${response.statusCode}');
      }
      return utf8.decode(response.bodyBytes);
    }));
    final updated = await compute(_parsePages, {
      'books': bundled.books.map((item) => item.toJson()).toList(),
      'pages': pages,
    });
    final cache = await _cacheFile();
    final encoded = await compute(_encodeSnapshot, updated.toJson());
    await cache.writeAsString(encoded, flush: true);
    return updated;
  }
}
