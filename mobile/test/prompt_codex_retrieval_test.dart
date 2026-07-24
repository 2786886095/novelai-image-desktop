import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/prompt_codex_retrieval.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('retrieves interaction guidance for a multi-character scene', () async {
    final result = await PromptCodexRetrievalService().retrieve(
      '两个女孩互相拥抱',
      mode: 'convert',
      allowAdult: true,
    );
    expect(result.matches.any(
        (item) => item.id == 'guidance:multi-character'), isTrue);
    expect(result.matches.any(
        (item) => item.id == 'guidance:interaction-direction'), isTrue);
    expect(result.context, contains('本地 NovelAI 提示词法典'));
  });

  test('classified entries require both relevance and the setting', () async {
    final service = PromptCodexRetrievalService();
    final enabled = await service.retrieve(
      '成年女性穿着破损连裤袜',
      mode: 'convert',
      allowAdult: true,
    );
    final disabled = await service.retrieve(
      '成年女性穿着破损连裤袜',
      mode: 'convert',
      allowAdult: false,
    );
    expect(enabled.matches.any(
        (item) => item.id == 'guidance:classified-clothing'), isTrue);
    expect(disabled.matches.any((item) => item.adult), isFalse);
  });

  test('classified entries do not leak into an unrelated prompt', () async {
    final result = await PromptCodexRetrievalService().retrieve(
      '白发女孩站在雪山前',
      mode: 'reverse',
      allowAdult: true,
    );
    expect(result.matches.any((item) => item.adult), isFalse);
  });
}
