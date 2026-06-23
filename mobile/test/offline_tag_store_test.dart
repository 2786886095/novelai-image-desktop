import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/tags/offline_tag_store.dart';

void main() {
  test('CSV parser handles quoted commas and keeps Chinese-only rows', () {
    final tags = parseTagCsv(
      'name,cn_name,wiki,post_count,category,nsfw\n'
      '1girl,"1个女孩,单个女孩","wiki, text",100000,0,0\n'
      'no_translation,,wiki,50,0,0\n'
      'furina_(genshin_impact),芙宁娜,wiki,9000,4,0\n',
    );
    expect(tags.length, 2);
    expect(tags.first.tag, '1girl');
    expect(tags.first.chinese, contains('单个女孩'));
    expect(tags.last.category, 4);
  });

  test('CSV parser rejects an HTML or malformed download', () {
    expect(
      () => parseTagCsv('<html>not a dataset</html>'),
      throwsFormatException,
    );
  });

  test('CSV line parser supports escaped quotes', () {
    expect(
      parseCsvLine('tag,"中文,别名","a ""quoted"" wiki",123,0,0'),
      ['tag', '中文,别名', 'a "quoted" wiki', '123', '0', '0'],
    );
  });
}
