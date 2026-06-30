import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../i18n/app_locales.dart';
import '../state/app_state.dart';
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
    final language =
        context.select<AppState, String>((s) => s.settings.language);
    final text = mobileToolsHubTextFor(language);
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
