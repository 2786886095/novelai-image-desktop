import 'package:flutter/material.dart';

/// Shared settings disclosure. New sections inherit the same typography,
/// outer spacing and borders instead of defining another card style.
class SettingsSection extends StatelessWidget {
  final String title;
  final List<Widget> children;
  final Key? sectionKey;
  final bool maintainState;
  const SettingsSection(
      {super.key,
      required this.title,
      required this.children,
      this.sectionKey,
      this.maintainState = false});

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(top: 12),
        clipBehavior: Clip.antiAlias,
        child: ExpansionTile(
          key: sectionKey,
          maintainState: maintainState,
          title: Text(title, style: Theme.of(context).textTheme.titleMedium),
          shape: const Border(),
          collapsedShape: const Border(),
          childrenPadding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
          expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var index = 0; index < children.length; index++) ...[
              if (index > 0) const SizedBox(height: 8),
              children[index],
            ],
          ],
        ),
      );
}
