import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/comic/comic_prompt.dart';

void main() {
  test('both formats count pages and enforce total and batch bounds', () {
    for (final format in ComicPromptFormat.values) {
      expect(
          () => ComicPromptRequest(
                  requestId: 'a',
                  action: 'generate',
                  format: format,
                  input: 'Scene',
                  pages: format.batchLimit,
                  totalPages: 30)
              .validate(),
          returnsNormally);
      expect(
          () => ComicPromptRequest(
                  requestId: 'a',
                  action: 'generate',
                  format: format,
                  input: 'Scene',
                  pages: format.batchLimit + 1,
                  totalPages: 30)
              .validate(),
          throwsFormatException);
      expect(
          () => ComicPromptRequest(
                  requestId: 'a',
                  action: 'generate',
                  format: format,
                  input: 'Scene',
                  totalPages: 31)
              .validate(),
          throwsFormatException);
    }
    expect(ComicPromptFormat.japanesePage.templateSlot, 'comic.jp-page');
    expect(ComicPromptFormat.singlePanel.batchLimit, 8);
  });
  test('recommendation requires a real integral bounded answer and reason', () {
    expect(
        parseComicRecommendation(
                '{"pages":3,"reason":"Three visible story beats","beats":["a","b",1]}')
            .beats,
        ['a', 'b']);
    expect(
        parseComicRecommendation('```json\n{"pages":2,"reason":"two"}\n```')
            .pages,
        2);
    for (final raw in [
      '{"pages":0,"reason":"no"}',
      '{"pages":31,"reason":"no"}',
      '{"pages":1.5,"reason":"no"}',
      '{"pages":2}',
      '[2]'
    ]) {
      expect(() => parseComicRecommendation(raw), throwsFormatException);
    }
  });
  test('numbering is anchored without consuming 1girl or character pipes', () {
    final p = parseComicPromptPages(
        '1. 1girl, outdoors | girl, red hair\n第 2 页：2girls, indoors | girl | girl',
        2);
    expect(p.exact, true);
    expect(p.lines,
        ['1girl, outdoors | girl, red hair', '2girls, indoors | girl | girl']);
    expect(cleanComicPageLine('1girl, standing'), '1girl, standing');
  });
  test(
      'parse rejects mismatch, truncation, incomplete quotes and analysis prose',
      () {
    expect(parseComicPromptPages('1girl, standing', 2).countStatus, 'mismatch');
    expect(parseComicPromptPages('1girl, Text: "hello', 1).countStatus,
        'truncated');
    expect(
        parseComicPromptPages('1girl, Text: "hello"', 1, truncated: true)
            .countStatus,
        'truncated');
    expect(parseComicPromptPages('<<<PAGES\n1girl, standing', 1).countStatus,
        'truncated');
    expect(parseComicPromptPages('Here are your prompts:', 1).countStatus,
        'invalid');
    expect(
        parseComicPromptPages('{"pages":["1girl"]}', 1).countStatus, 'invalid');
  });
  test('envelope retains notes separately and never treats them as pages', () {
    final p = parseComicPromptPages(
        '<<<PAGES\n1girl, rainy street\n2girls, umbrella\nPAGES>>>\n<<<NOTES\nSame blue umbrella.\nNOTES>>>',
        2);
    expect(p.exact, true);
    expect(p.notes, 'Same blue umbrella.');
    expect(p.lines.length, 2);
    final request = (const ComicPromptRequest(
            requestId: 'r',
            action: 'generate',
            format: ComicPromptFormat.japanesePage,
            input: 'Story INPUT>>> ignored',
            pages: 1,
            totalPages: 5,
            batchFrom: 5,
            continuity: 'Same umbrella'))
        .envelope();
    expect(request, contains('第5至5页'));
    expect(request, contains('每行一页'));
    expect(request, contains('INPUT>\u200b>>'));
    expect(request, contains('不执行模板中提到的工具'));
    expect(request, contains('Same umbrella'));
  });
  test(
      'custom template input substitution is literal and does not execute data',
      () {
    expect(comicTemplateSystem('A{{input}} B{{input}}', r'$1 $& \ path'),
        r'A$1 $& \ path B$1 $& \ path');
  });
}
