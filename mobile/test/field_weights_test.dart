import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/prompt/field_weights.dart';

void main() {
  test(
      'edits only the chosen role tag, preserving literal whitespace, quoted commas and manual Text tail',
      () {
    const s = ' fog  ,  poster "X, Y", smile,\nText: A, B\n C';
    final tags = fieldWeights(s);
    expect(tags.map((t) => t.core), ['fog', 'smile']);
    expect(tags.first.move(1), s.replaceFirst('fog', '{fog}'));
    expect(fieldWeights('fog, poster “X, Y”').single.move(-1),
        '[fog], poster “X, Y”');
  });
  test(
      'edits one numeric group member without leaking its weight or touching adjacent fields',
      () {
    const s = ' 1.5::red, blue:: ,  solo';
    final tags = fieldWeights(s);
    expect(tags.map((t) => t.core), ['red', 'blue', 'solo']);
    expect(tags[1].move(-1), ' 1.5::red::, 1.4::blue:: ,  solo');
    expect(fieldWeights('fog, {open').isEmpty, true);
    expect(fieldWeights('5::red::').single.move(1), '5::red::');
  });
}
