import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../i18n/image_actions_text.dart';
import '../services/composer_transfers.dart';
import '../state/app_state.dart';

/// Explicit paste/drop only; a gallery-picker replacement stays image-only.
class GenerationImageTransfers extends StatefulWidget {
  final Widget child;
  const GenerationImageTransfers({super.key, required this.child});
  @override
  State<GenerationImageTransfers> createState() =>
      _GenerationImageTransfersState();
}

class _GenerationImageTransfersState extends State<GenerationImageTransfers> {
  final regionKey = GlobalKey();
  bool importing = false;
  ScrollPosition? scrollPosition;
  @override
  void initState() {
    super.initState();
    ComposerTransfers.listenFor(this, _import);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = Scrollable.maybeOf(context)?.position;
    if (next != scrollPosition) {
      scrollPosition?.removeListener(_publishRegion);
      scrollPosition = next;
      scrollPosition?.addListener(_publishRegion);
    }
    _publishRegion();
  }

  void _publishRegion() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final box = regionKey.currentContext?.findRenderObject() as RenderBox?;
      final app = context.read<AppState>();
      Rect? rect;
      if (TickerMode.of(context) &&
          !app.busy &&
          !importing &&
          ModalRoute.of(context)?.isCurrent == true &&
          box != null &&
          box.hasSize) {
        rect = (box.localToGlobal(Offset.zero) & box.size)
            .intersect(Offset.zero & MediaQuery.sizeOf(context));
        final viewport =
            Scrollable.maybeOf(context)?.context.findRenderObject();
        if (viewport is RenderBox && viewport.hasSize) {
          rect = rect
              .intersect(viewport.localToGlobal(Offset.zero) & viewport.size);
        }
        if (rect.isEmpty) rect = null;
      }
      unawaited(ComposerTransfers.regionFor(this, rect));
    });
  }

  @override
  void dispose() {
    scrollPosition?.removeListener(_publishRegion);
    ComposerTransfers.listenFor(this, null);
    unawaited(ComposerTransfers.regionFor(this, null));
    super.dispose();
  }

  Future<void> _import(List<String> paths) async {
    if (!mounted ||
        importing ||
        ModalRoute.of(context)?.isCurrent != true ||
        !TickerMode.of(context) ||
        context.read<AppState>().busy) return;
    setState(() => importing = true);
    try {
      // The workbench holds one input, not an implicit batch. Ignore documents.
      for (final path in paths) {
        if (!RegExp(r'\.(png|jpe?g|webp|gif|bmp|avif)$', caseSensitive: false)
            .hasMatch(path)) continue;
        await context.read<AppState>().importGenerationImage(path);
        break;
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    } finally {
      if (mounted) setState(() => importing = false);
    }
  }

  Future<void> _paste() async {
    try {
      await _import(await ComposerTransfers.paste());
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppState>();
    _publishRegion();
    return Focus(
      onKeyEvent: (_, event) {
        final focusContext = FocusManager.instance.primaryFocus?.context;
        final editing =
            focusContext?.findAncestorWidgetOfExactType<EditableText>() != null;
        if (!editing &&
            event is KeyDownEvent &&
            event.logicalKey == LogicalKeyboardKey.keyV &&
            (HardwareKeyboard.instance.isControlPressed ||
                HardwareKeyboard.instance.isMetaPressed)) {
          unawaited(_paste());
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        KeyedSubtree(key: regionKey, child: widget.child),
        Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton.icon(
                key: const ValueKey('generation-paste-image'),
                onPressed: app.busy || importing ? null : _paste,
                icon: const Icon(Icons.content_paste),
                label: Text(imageActionsText(app.settings.language, 'paste')))),
      ]),
    );
  }
}
