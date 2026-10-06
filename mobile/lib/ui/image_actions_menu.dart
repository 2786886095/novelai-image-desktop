import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../i18n/image_actions_text.dart';
import '../i18n/local_favorites_text.dart';
import '../services/image_clipboard.dart';
import '../services/local_favorites.dart';
import '../state/app_state.dart';

/// Shared by the generation preview and history thumbnails. Opening the menu
/// is read-only; only the explicitly selected action is executed.
Future<void> showLocalImageActions(BuildContext context, String path) async {
  final state = context.read<AppState>();
  final language = state.settings.language;
  final exists = File(path).existsSync();
  final item = state.history.where((item) => item.filePath == path).firstOrNull;
  final messenger = ScaffoldMessenger.maybeOf(context);
  final action = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (sheet) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min, children: [
      ListTile(leading: const Icon(Icons.copy), title: Text(imageActionsText(language, 'copy')),
        enabled: exists, onTap: exists ? () => Navigator.pop(sheet, 'copy') : null),
      ListTile(leading: const Icon(Icons.star_border), title: Text(localFavoritesText(language, 'add')),
        enabled: exists && item != null, onTap: exists && item != null ? () => Navigator.pop(sheet, 'favorite') : null),
      ListTile(leading: const Icon(Icons.settings_backup_restore), title: Text(localFavoritesText(language, 'apply')),
        enabled: exists && !state.busy, onTap: exists && !state.busy ? () => Navigator.pop(sheet, 'apply') : null),
    ])),
  );
  if (action == null || !context.mounted) {
    return;
  }
  try {
    if (action == 'copy') {
      final copied = await ImageClipboard.copy(path, withOriginalMetadata: state.settings.copyImageMetadata);
      messenger?.showSnackBar(SnackBar(content: Text(imageActionsText(language, copied ? 'copied' : 'unsupported'))));
    } else if (action == 'favorite' && item != null) {
      await MobileLocalFavorites.instance.add(item);
      messenger?.showSnackBar(SnackBar(content: Text(localFavoritesText(language, 'added'))));
    } else if (action == 'apply' && !state.busy) {
      await state.importGenerationImage(path);
    }
  } catch (error) {
    messenger?.showSnackBar(SnackBar(content: Text('${localFavoritesText(language, 'error')}: $error')));
  }
}
