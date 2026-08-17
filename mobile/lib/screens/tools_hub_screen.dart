import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../state/app_state.dart';
import 'batch_redraw_screen.dart';
import 'comic_screen.dart';
import 'aitag_gallery_screen.dart';
import 'random_artist_lab_screen.dart';
import 'prompt_codex_screen.dart';
import 'generate_screen.dart' show ReferencePresetLibraryPanel;

enum _ActiveTool {
  hub,
  comic,
  referencePresets,
  batchRedraw,
  aitag,
  randomArtist,
  promptCodex
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
    if (active == _ActiveTool.referencePresets) {
      return Scaffold(
        body: SafeArea(
          child: ReferencePresetLibraryPanel(
            standalone: true,
            onClose: () => setState(() => active = _ActiveTool.hub),
          ),
        ),
      );
    }
    if (active == _ActiveTool.batchRedraw) {
      return BatchRedrawScreen(
          onBack: () => setState(() => active = _ActiveTool.hub));
    }
    if (active == _ActiveTool.aitag) {
      return AitagGalleryScreen(
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
            icon: Icons.collections_bookmark_outlined,
            title: mobileUiTextFor(language, 'referencePresets.title'),
            subtitle: mobileUiTextFor(language, 'referencePresets.subtitle'),
            onTap: () => setState(() => active = _ActiveTool.referencePresets),
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
            icon: Icons.auto_awesome_mosaic_outlined,
            title: text.aitagTitle,
            subtitle: text.aitagSubtitle,
            onTap: () => setState(() => active = _ActiveTool.aitag),
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
