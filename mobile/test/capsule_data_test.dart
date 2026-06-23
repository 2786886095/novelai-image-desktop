import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/capsule_data.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('loads the complete desktop capsule taxonomy asset', () async {
    final categories = await loadCapsuleTaxonomy();
    expect(categories, hasLength(14));
    expect(categories.first.name, '人物');
    expect(categories.first.subgroups.first.tags.first.tag, '1girl');
    expect(categories.last.isNegative, isTrue);
    expect(
      categories.last.subgroups.first.tags.map((tag) => tag.tag),
      contains('bad_hands'),
    );
  });
}
