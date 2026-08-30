import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../state/app_state.dart';
import 'batch_redraw_screen.dart';
import 'comic_screen.dart';
import 'random_artist_lab_screen.dart';
import 'prompt_codex_screen.dart';
import 'v5_artist_weight_repair_screen.dart';

enum _ActiveTool {
  hub,
  comic,
  batchRedraw,
  randomArtist,
  promptCodex,
  v5ArtistRepair,
  artistStringDraw,
}

({String title, String subtitle}) _promptCodexTileText(String language) {
  switch (language) {
    case 'zh-TW':
      return (
        title: '所長 NovelAI 個人法典',
        subtitle: '三套法典離線收錄、原章節與統一分類搜尋、提示詞一鍵複製，並可手動更新'
      );
    case 'en-US':
      return (
        title: 'NovelAI Personal Codex',
        subtitle:
            'Three offline codices with section/category search, one-click copy, and manual updates'
      );
    case 'ja-JP':
      return (
        title: 'NovelAI 個人プロンプト法典',
        subtitle: '3冊をオフライン収録。章・分類検索、ワンクリックコピー、手動更新に対応'
      );
    case 'ko-KR':
      return (
        title: 'NovelAI 개인 프롬프트 법전',
        subtitle: '세 법전을 오프라인 제공하며 장·분류 검색, 원클릭 복사, 수동 업데이트 지원'
      );
    default:
      return (
        title: '所长 NovelAI 个人法典',
        subtitle: '三套法典离线收录、原章节与统一分类检索、提示词一键复制，并可手动更新'
      );
  }
}

class ToolsHubScreen extends StatefulWidget {
  const ToolsHubScreen({super.key});

  @override
  State<ToolsHubScreen> createState() => _ToolsHubScreenState();
}

class _ToolsHubScreenState extends State<ToolsHubScreen> {
  _ActiveTool active = _ActiveTool.hub;

  @override
  Widget build(BuildContext context) {
    if (active == _ActiveTool.comic) {
      return ComicScreen(
          onBack: () => setState(() => active = _ActiveTool.hub));
    }
    if (active == _ActiveTool.batchRedraw) {
      return BatchRedrawScreen(
          onBack: () => setState(() => active = _ActiveTool.hub));
    }
    if (active == _ActiveTool.randomArtist) {
      return RandomArtistLabScreen(
          onBack: () => setState(() => active = _ActiveTool.hub));
    }
    if (active == _ActiveTool.promptCodex) {
      return PromptCodexScreen(
          onBack: () => setState(() => active = _ActiveTool.hub));
    }
    if (active == _ActiveTool.v5ArtistRepair) {
      return V5ArtistWeightRepairScreen(
          onBack: () => setState(() => active = _ActiveTool.hub));
    }
    if (active == _ActiveTool.artistStringDraw) {
      return V5ArtistWeightRepairScreen(
        mode: V5ArtistToolMode.draw,
        onBack: () => setState(() => active = _ActiveTool.hub),
      );
    }
    final language =
        context.select<AppState, String>((s) => s.settings.language);
    final text = mobileToolsHubTextFor(language);
    final promptCodexText = _promptCodexTileText(language);
    return Scaffold(
      appBar: AppBar(title: Text(text.title)),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(16),
        children: [
          _ToolTile(
            icon: Icons.auto_stories_outlined,
            title: text.comicTitle,
            subtitle: text.comicSubtitle,
            onTap: () => setState(() => active = _ActiveTool.comic),
          ),
          const SizedBox(height: 10),
          _ToolTile(
            icon: Icons.collections_outlined,
            title: text.batchTitle,
            subtitle: text.batchSubtitle,
            onTap: () => setState(() => active = _ActiveTool.batchRedraw),
          ),
          const SizedBox(height: 10),
          _ToolTile(
            icon: Icons.casino_outlined,
            title: text.artistLabTitle,
            subtitle: text.artistLabSubtitle,
            onTap: () => setState(() => active = _ActiveTool.randomArtist),
          ),
          const SizedBox(height: 10),
          _ToolTile(
            icon: Icons.auto_fix_high_outlined,
            title: switch (language) {
              'zh-TW' => 'V4.5 畫師串修復器',
              'en-US' => 'V4.5 Artist-string Repair',
              'ja-JP' => 'V4.5 画家列修復',
              'ko-KR' => 'V4.5 작가 문자열 복구',
              _ => 'V4.5 画师串修复器',
            },
            subtitle: switch (language) {
              'zh-TW' => '把每個 V4.5 畫師權重獨立壓到原值的 1/3～1/2，並規範為 V5 數值格式',
              'en-US' =>
                'Sample each V4.5 artist weight at 1/3–1/2 and normalize it to V5 numeric syntax',
              'ja-JP' => '各 V4.5 画家ウェイトを 1/3～1/2 で個別抽選し、V5 数値形式へ正規化',
              'ko-KR' => '각 V4.5 작가 가중치를 1/3~1/2로 개별 추첨하고 V5 숫자 형식으로 정규화',
              _ => '把每个 V4.5 画师权重独立压到原值的 1/3～1/2，并规范为 V5 数值格式',
            },
            onTap: () => setState(() => active = _ActiveTool.v5ArtistRepair),
          ),
          const SizedBox(height: 10),
          _ToolTile(
            icon: Icons.tune_outlined,
            title: switch (language) {
              'zh-TW' => '輸入畫師串抽卡',
              'en-US' => 'Artist-string Weight Draw',
              'ja-JP' => '画家列ウェイト抽選',
              'ko-KR' => '작가 문자열 가중치 뽑기',
              _ => '输入画师串抽卡',
            },
            subtitle: switch (language) {
              'zh-TW' => '貼上完整畫師串，保留全部 Tag，只重抽畫師權重，批次生圖並收藏',
              'en-US' =>
                'Paste a complete artist string, retain every tag, reroll weights, batch-generate, and save favorites',
              'ja-JP' => '完全な画家列と全 Tag を保持し、画家ウェイトだけ再抽選・一括生成',
              'ko-KR' => '전체 문자열과 모든 Tag를 유지한 채 작가 가중치만 다시 뽑아 일괄 생성·저장',
              _ => '粘贴完整画师串，保留全部 Tag，只重抽画师权重，批量生图并收藏',
            },
            onTap: () => setState(() => active = _ActiveTool.artistStringDraw),
          ),
          const SizedBox(height: 10),
          _ToolTile(
            icon: Icons.menu_book_outlined,
            title: promptCodexText.title,
            subtitle: promptCodexText.subtitle,
            onTap: () => setState(() => active = _ActiveTool.promptCodex),
          ),
        ],
      ),
    );
  }
}

class _ToolTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  const _ToolTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          minVerticalPadding: 18,
          leading: Icon(icon, size: 32),
          title: Text(title, style: Theme.of(context).textTheme.titleMedium),
          subtitle: Text(subtitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: onTap,
        ),
      );
}
