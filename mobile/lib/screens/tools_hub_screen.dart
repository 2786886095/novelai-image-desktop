import 'package:flutter/material.dart';

import 'batch_redraw_screen.dart';
import 'comic_screen.dart';

enum _ActiveTool { hub, comic, batchRedraw }

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
    return Scaffold(
      appBar: AppBar(title: const Text('工具')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _ToolTile(
            icon: Icons.auto_stories_outlined,
            title: '漫画生成器',
            subtitle: '故事拆分、连续分镜、一致性检测、串行出图与 ZIP',
            onTap: () => setState(() => active = _ActiveTool.comic),
          ),
          const SizedBox(height: 10),
          _ToolTile(
            icon: Icons.collections_outlined,
            title: '批量图生图',
            subtitle: '多图导入、逐图提示词和参数、AI 反推、串行重绘',
            onTap: () => setState(() => active = _ActiveTool.batchRedraw),
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
