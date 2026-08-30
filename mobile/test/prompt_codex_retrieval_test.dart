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
    expect(result.matches.any((item) => item.id == 'guidance:multi-character'),
        isTrue);
    expect(
        result.matches
            .any((item) => item.id == 'guidance:interaction-direction'),
        isTrue);
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
    expect(
        enabled.matches
            .any((item) => item.id == 'guidance:classified-clothing'),
        isTrue);
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

  test('mature Danbooru candidates are injected before codex references',
      () async {
    final result = await PromptCodexRetrievalService().retrieve(
      '女孩以七分身构图站立',
      mode: 'convert',
      allowAdult: false,
      matureTags: const [
        PromptCodexTagCandidate(
          tag: 'cowboy_shot',
          description: '七分身构图',
          count: 600000,
        ),
      ],
    );
    expect(result.matches.first.id, 'danbooru:cowboy_shot');
    expect(result.context, contains('禁止再叠加它的拆解词'));
    expect(
        result.matches
            .any((item) => item.id == 'guidance:canonical-tag-priority'),
        isTrue);
  });

  test('retrieves the dual-version known-character rule for conversion',
      () async {
    final result = await PromptCodexRetrievalService().retrieve(
      '芙宁娜\n已知角色 角色名版 特征版 动漫角色 游戏角色 角色 Tag',
      mode: 'convert',
      allowAdult: false,
    );
    expect(result.matches.any((item) => item.id == 'guidance:known-character'),
        isTrue);
    expect(result.context, contains('特征版必须删除角色名与作品名'));
    expect(result.context, contains('角色名版与特征版的场景'));
  });
}
