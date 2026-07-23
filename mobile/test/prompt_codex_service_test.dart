import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/prompt_codex_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('bundled prompt codex contains all three structured books', () async {
    final snapshot = await PromptCodexService().load();
    expect(snapshot.books.map((item) => item.id),
        containsAll(['regular', 'adult-upper', 'adult-lower']));
    expect(snapshot.entries.length, greaterThan(14000));
    expect(
        snapshot.entries.where((item) => item.bookId == 'regular'), isNotEmpty);
    expect(snapshot.entries.every((item) => item.prompt.isNotEmpty), isTrue);
  });
}
