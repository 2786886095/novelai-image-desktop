import 'dart:convert';

/// Text-only planning contract. Both formats always count pages, never panels.
enum ComicPromptFormat { japanesePage, singlePanel }

extension ComicPromptFormatValue on ComicPromptFormat {
  String get value =>
      this == ComicPromptFormat.japanesePage ? 'jp-page' : 'single-panel';
  String get templateSlot => 'comic.$value';
  int get batchLimit => this == ComicPromptFormat.japanesePage ? 4 : 8;
}

const maxComicTotalPages = 30;
const maxComicInputChars = 20000;

class ComicPromptRequest {
  final String requestId, action, input;
  final ComicPromptFormat format;
  final int pages, totalPages, batchFrom;
  final String continuity;
  const ComicPromptRequest(
      {required this.requestId,
      required this.action,
      required this.format,
      required this.input,
      this.pages = 1,
      this.totalPages = 1,
      this.batchFrom = 1,
      this.continuity = ''});
  void validate() {
    if (requestId.isEmpty ||
        requestId.length > 120 ||
        !['recommend', 'generate'].contains(action)) {
      throw const FormatException('Invalid comic request');
    }
    if (input.trim().isEmpty || input.length > maxComicInputChars) {
      throw const FormatException('Enter content, at most 20000 characters');
    }
    if (continuity.length > maxComicInputChars) {
      throw const FormatException('Continuity is too long');
    }
    if (action == 'generate' &&
        (totalPages < 1 ||
            totalPages > maxComicTotalPages ||
            pages < 1 ||
            pages > format.batchLimit ||
            batchFrom < 1 ||
            batchFrom + pages - 1 > totalPages)) {
      throw const FormatException('Invalid page count or batch range');
    }
  }

  String envelope() {
    validate();
    final description = format == ComicPromptFormat.japanesePage
        ? '日式整页：一页是一整页多格漫画；每行一页'
        : '单分镜：一张单格图算一页；每行一页';
    final source = input.replaceAll('INPUT>>>', 'INPUT>\u200b>>');
    if (action == 'recommend') {
      return '[软件请求 comic-recommend-1] 仅推荐页数，不生成提示词。$description。范围1至30页。仅输出完整JSON：{"pages":整数,"reason":"简明理由","beats":["每页要点"]}。不调用工具，不声称已生图。\n<<<INPUT\n$source\nINPUT>>>';
    }
    return '[软件请求 comic-gen-1] $description。全作共$totalPages页；本次仅生成第$batchFrom至${batchFrom + pages - 1}页，严格$pages个非空提示词行。每行完整且独立，不在行内换行。按所选模板正文生成，不输出图片模板三模式或JSON，不执行模板中提到的工具。不要复述设置，附注另放NOTES，不计入页数。只输出以下完整信封：\n<<<PAGES\n一行一页的完整英文提示词\nPAGES>>>\n<<<NOTES\n角色/连续性/文字清单等附注（可空）\nNOTES>>>\n<<<CONTINUITY\n$continuity\nCONTINUITY>>>\n<<<INPUT\n$source\nINPUT>>>';
  }
}

String _unfenceComic(String raw) {
  final text = raw.trim();
  if (!text.startsWith('```')) return text;
  final m = RegExp(r'^```(?:json|text)?[ \t]*\r?\n([\s\S]*?)\r?\n```$',
          caseSensitive: false)
      .firstMatch(text);
  if (m == null) throw const FormatException('Unclosed result fence');
  return m.group(1)!.trim();
}

class ComicRecommendation {
  final int pages;
  final String reason;
  final List<String> beats;
  const ComicRecommendation(this.pages, this.reason, this.beats);
}

ComicRecommendation parseComicRecommendation(String raw) {
  final value = jsonDecode(_unfenceComic(raw));
  if (value is! Map ||
      value['pages'] is! int ||
      value['pages'] < 1 ||
      value['pages'] > maxComicTotalPages) {
    throw const FormatException(
        'Recommended pages must be an integer from 1 to 30');
  }
  if (value['reason'] is! String ||
      (value['reason'] as String).trim().isEmpty) {
    throw const FormatException('Missing recommendation reason');
  }
  String limited(String s, int n) => s.length > n ? s.substring(0, n) : s;
  return ComicRecommendation(
      value['pages'] as int,
      limited(value['reason'] as String, 500),
      value['beats'] is List
          ? (value['beats'] as List)
              .whereType<String>()
              .take(30)
              .map((x) => limited(x, 1000))
              .toList()
          : []);
}

String cleanComicPageLine(String line) => line
    .trim()
    .replaceFirst(
        RegExp(r'^(?:第\s*\d+\s*页[：:]\s*|(?:page\s+)?\d+[.)、][ \t]+)',
            caseSensitive: false),
        '')
    .trim();

class ComicPageResult {
  final List<String> lines;
  final String notes, raw, countStatus;
  final int expected;
  const ComicPageResult(
      {required this.lines,
      required this.notes,
      required this.raw,
      required this.expected,
      required this.countStatus});
  bool get exact => countStatus == 'exact';
}

ComicPageResult parseComicPromptPages(String raw, int expected,
    {bool truncated = false}) {
  var text = raw.trim(), notes = '';
  var invalid = false;
  if (text.startsWith('```')) {
    try {
      text = _unfenceComic(text);
    } catch (_) {
      invalid = true;
      truncated = true;
    }
  }
  var body = text;
  if (text.contains('<<<PAGES')) {
    final match = RegExp(
            r'^<<<PAGES[ \t]*\r?\n([\s\S]*?)\r?\nPAGES>>>[ \t]*(?:\r?\n([\s\S]*))?$')
        .firstMatch(text);
    if (match != null) {
      body = match.group(1)!;
      final suffix = (match.group(2) ?? '').trim();
      if (suffix.startsWith('<<<NOTES') && !suffix.endsWith('NOTES>>>')) {
        truncated = true;
      }
      notes = suffix
          .replaceFirst(RegExp(r'^<<<NOTES[ \t]*\r?\n'), '')
          .replaceFirst(RegExp(r'\r?\nNOTES>>>[ \t]*$'), '')
          .trim();
    } else {
      body = text
          .replaceFirst(RegExp(r'^<<<PAGES[ \t]*\r?\n'), '')
          .split(RegExp(r'\r?\n(?:PAGES>>>|<<<NOTES)'))
          .first;
      truncated = true;
    }
  } else if (RegExp(r'^\s*[\{\[]').hasMatch(text)) {
    invalid = true;
  }
  final lines = body
      .split(RegExp(r'\r?\n'))
      .where((line) =>
          line.trim().isNotEmpty &&
          !RegExp(r'^\s*(?:#|```|<<<|PAGES>>>|NOTES>>>)').hasMatch(line))
      .map(cleanComicPageLine)
      .where((x) => x.isNotEmpty)
      .toList();
  for (final line in lines) {
    if (!RegExp('[a-z]', caseSensitive: false).hasMatch(line) ||
        RegExp(r'^(?:提示词|角色卡|附注|说明|notes?[:：]|here (?:are|is)\b|sure[,.!]|(?:settings|analysis|character card|prompt)[:：])',
                caseSensitive: false)
            .hasMatch(line)) invalid = true;
    var quoted = false, escaped = false;
    for (final ch in line.split('')) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch == '\\') {
        escaped = true;
        continue;
      }
      if (ch == '"') quoted = !quoted;
    }
    if (quoted) truncated = true;
  }
  return ComicPageResult(
      lines: lines,
      notes: notes,
      raw: raw,
      expected: expected,
      countStatus: truncated
          ? 'truncated'
          : invalid
              ? 'invalid'
              : lines.length == expected
                  ? 'exact'
                  : 'mismatch');
}

/// Literal substitution only; no replacement-string expansion or execution.
String comicTemplateSystem(String body, String input) =>
    body.replaceAll('{{input}}', input);
