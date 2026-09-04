import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../comic/comic_controller.dart';
import '../comic/comic_models.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../references/reference_presets.dart';
import '../state/app_state.dart';
import '../ui/quality_preset_control.dart';
import '../ui/studio_shell.dart';
import 'generate_screen.dart';

class ComicScreen extends StatelessWidget {
  final ComicController? controller;
  final VoidCallback? onBack;
  const ComicScreen({super.key, this.controller, this.onBack});

  @override
  Widget build(BuildContext context) {
    if (controller != null) {
      return ChangeNotifierProvider.value(
        value: controller!,
        child: _ComicBody(onBack: onBack),
      );
    }
    return ChangeNotifierProvider(
      create: (_) => ComicController(context.read<AppState>())..load(),
      child: _ComicBody(onBack: onBack),
    );
  }
}

class _ComicBody extends StatelessWidget {
  final VoidCallback? onBack;
  const _ComicBody({this.onBack});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final t = _text(context);
    if (!controller.loaded) {
      return Scaffold(body: Center(child: Text(t('comic.loading'))));
    }
    return Scaffold(
      appBar: AppBar(
        leading: onBack == null
            ? null
            : IconButton(
                tooltip: t('batch.backToTools'),
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back),
              ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(controller.displayTitle, overflow: TextOverflow.ellipsis),
            Text(
              t('comic.subtitle'),
              style: Theme.of(context).textTheme.labelSmall,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: t('comic.newProject'),
            onPressed: controller.createNewProject,
            icon: const Icon(Icons.note_add_outlined),
          ),
          IconButton(
            tooltip: t('comic.saveProjectJson'),
            onPressed: () => _run(context, controller.exportProjectJson),
            icon: const Icon(Icons.save_alt),
          ),
          IconButton(
            tooltip: t('comic.importProjectJson'),
            onPressed: () => _run(context, controller.importProjectJson),
            icon: const Icon(Icons.file_open_outlined),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            _StepBar(controller: controller),
            Expanded(
              child: switch (controller.step) {
                ComicStep.importTags => const _ImportStep(),
                ComicStep.global => const _GlobalStep(),
                ComicStep.panels => const _PanelsStep(),
                ComicStep.generate => const _GenerateStep(),
              },
            ),
            _StatusBar(controller: controller),
          ],
        ),
      ),
    );
  }
}

class _StepBar extends StatelessWidget {
  final ComicController controller;
  const _StepBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    final t = _text(context);
    final labels = [
      t('comic.step.import'),
      t('comic.step.global'),
      t('comic.step.panels'),
      t('comic.step.generate'),
    ];
    return LayoutBuilder(builder: (context, constraints) {
      final compact = constraints.maxWidth < 620;
      return SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        child: Row(
          children: List.generate(ComicStep.values.length, (index) {
            final selected = controller.step.index == index;
            return Padding(
              padding: EdgeInsets.only(right: index == 3 ? 0 : 8),
              child: SizedBox(
                width: compact ? 132 : (constraints.maxWidth - 48) / 4,
                height: 56,
                child: Material(
                  color: selected
                      ? Theme.of(context).colorScheme.primaryContainer
                      : Theme.of(context).colorScheme.surfaceContainer,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(
                      color: selected
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).dividerColor,
                    ),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => controller.setStep(ComicStep.values[index]),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 14,
                            backgroundColor: selected
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context)
                                    .colorScheme
                                    .surfaceContainerHighest,
                            foregroundColor: selected
                                ? Theme.of(context).colorScheme.onPrimary
                                : null,
                            child: Text('${index + 1}'),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              labels[index],
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      );
    });
  }
}

class _StatusBar extends StatelessWidget {
  final ComicController controller;
  const _StatusBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: [
            if (controller.queueRunning) ...[
              const SizedBox.square(
                dimension: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: Text(
                controller.displayStatus,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (controller.queueRunning)
              Text('${controller.queueDone}/${controller.queueTotal}'),
          ],
        ),
      ),
    );
  }
}

class _ImportStep extends StatefulWidget {
  const _ImportStep();

  @override
  State<_ImportStep> createState() => _ImportStepState();
}

class _ImportStepState extends State<_ImportStep> {
  final input = TextEditingController();

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final t = _text(context);
    return StudioContent(
      maxWidth: 1180,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 100),
        children: [
          _SectionCard(
            title: t('comic.importHeading'),
            subtitle: t('comic.importDescription'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: input,
                  minLines: 8,
                  maxLines: 16,
                  decoration: InputDecoration(
                    hintText: t('comic.importHint'),
                    border: const OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    FilledButton.icon(
                      onPressed: input.text.trim().isEmpty
                          ? null
                          : () => _run(context, () async {
                                await controller.importText(input.text);
                                if (mounted) setState(() {});
                              }),
                      icon: const Icon(Icons.playlist_add),
                      label: Text(t('comic.importText')),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _run(context, controller.pickImportFile),
                      icon: const Icon(Icons.upload_file),
                      label: Text(t('comic.chooseFile')),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            title: t('comic.importedPanels'),
            subtitle: '${controller.project.panels.length}',
            child: controller.project.panels.isEmpty
                ? _EmptyState(
                    icon: Icons.view_carousel_outlined,
                    text: t('comic.panelsEmpty'),
                  )
                : Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: controller.project.panels
                        .map((panel) => Chip(
                              avatar:
                                  CircleAvatar(child: Text('${panel.index}')),
                              label: Text(panel.title),
                            ))
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}

class _GlobalStep extends StatelessWidget {
  const _GlobalStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final project = controller.project;
    final t = _text(context);
    return StudioContent(
      maxWidth: 1180,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 110),
        children: [
          _SectionCard(
            title: t('comic.globalHeading'),
            action: OutlinedButton.icon(
              onPressed: controller.syncCurrentParams,
              icon: const Icon(Icons.sync),
              label: Text(t('comic.syncParams')),
            ),
            child: Column(
              children: [
                _Field(
                  value: project.title,
                  label: t('comic.projectName'),
                  onChanged: (value) {
                    project.title = value;
                    controller.changed();
                  },
                ),
                const SizedBox(height: 12),
                _Field(
                  value: project.globalStylePrompt,
                  label: t('comic.globalStyle'),
                  minLines: 3,
                  onChanged: (value) {
                    project.globalStylePrompt = value;
                    controller.changed();
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  value: project.initialGenerationCount,
                  decoration: InputDecoration(
                    labelText: t('comic.initialCount'),
                    helperText: t('comic.initialCountHint'),
                    border: const OutlineInputBorder(),
                  ),
                  items: List.generate(
                    10,
                    (index) => DropdownMenuItem(
                      value: index + 1,
                      child: Text('${index + 1}'),
                    ),
                  ),
                  onChanged: (value) {
                    project.initialGenerationCount = value ?? 1;
                    controller.changed();
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          const _PanelSizeSection(),
          const SizedBox(height: 12),
          const _PreciseReferenceSection(),
          const SizedBox(height: 12),
          _ParamsEditor(
            params: project.globalParams,
            onChanged: controller.changed,
            negativePrompt: project.globalNegativePrompt,
            onNegativeChanged: (value) {
              project.globalNegativePrompt = value;
              controller.changed();
            },
          ),
        ],
      ),
    );
  }
}

class _PreciseReferenceSection extends StatelessWidget {
  const _PreciseReferenceSection();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final refs = controller.project.preciseReferences;
    final t = _text(context);
    return _SectionCard(
      title: t('comic.preciseHeading'),
      subtitle: t('comic.preciseHint'),
      action: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          OutlinedButton.icon(
            onPressed: refs.length >= 5
                ? null
                : () => showReferencePresetLibrary(
                      context,
                      allowedKind: ReferencePresetKind.precise,
                      onApplyPreset: controller.addPreciseReferencePreset,
                    ),
            icon: const Icon(Icons.collections_bookmark_outlined),
            label: Text(t('referencePresets.title')),
          ),
          OutlinedButton.icon(
            onPressed: refs.length >= 5
                ? null
                : () => _run(context, controller.pickPreciseReferences),
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: Text(t('comic.preciseUpload')),
          ),
        ],
      ),
      child: refs.isEmpty
          ? Text(t('comic.preciseEmpty'))
          : LayoutBuilder(builder: (context, constraints) {
              final width = constraints.maxWidth >= 760
                  ? (constraints.maxWidth - 12) / 2
                  : constraints.maxWidth;
              return Wrap(
                spacing: 12,
                runSpacing: 12,
                children: refs.map((reference) {
                  return SizedBox(
                    width: width,
                    child: Card.outlined(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Image.file(
                                File(reference.filePath),
                                width: 84,
                                height: 112,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) => const SizedBox(
                                  width: 84,
                                  height: 112,
                                  child: Icon(Icons.broken_image_outlined),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text(reference.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis),
                                  const SizedBox(height: 6),
                                  DropdownButtonFormField<String>(
                                    value: reference.type,
                                    isExpanded: true,
                                    decoration: const InputDecoration(
                                      isDense: true,
                                      border: OutlineInputBorder(),
                                    ),
                                    items: [
                                      DropdownMenuItem(
                                          value: 'character',
                                          child: Text(
                                              t('comic.preciseCharacter'))),
                                      DropdownMenuItem(
                                          value: 'style',
                                          child: Text(t('comic.preciseStyle'))),
                                      DropdownMenuItem(
                                          value: 'character&style',
                                          child: Text(t('comic.preciseBoth'))),
                                    ],
                                    onChanged: (value) {
                                      reference.type = value ?? 'character';
                                      controller.changed();
                                    },
                                  ),
                                  _ReferenceSlider(
                                    label: t('comic.preciseStrength'),
                                    value: reference.strength,
                                    onChanged: (value) {
                                      reference.strength = value;
                                      controller.changed();
                                    },
                                  ),
                                  _ReferenceSlider(
                                    label: t('comic.preciseFidelity'),
                                    value: reference.fidelity,
                                    onChanged: (value) {
                                      reference
                                        ..fidelity = value
                                        ..informationExtracted = value;
                                      controller.changed();
                                    },
                                  ),
                                  _ReferenceScopeEditor(
                                    key: ValueKey(
                                      '${reference.id}-${reference.scope.name}-${reference.scopePanelIds.join(',')}-${controller.project.panels.map((panel) => panel.id).join(',')}',
                                    ),
                                    reference: reference,
                                  ),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: TextButton.icon(
                                      onPressed: () => _run(
                                        context,
                                        () => controller.removePreciseReference(
                                            reference.id),
                                      ),
                                      icon: const Icon(Icons.delete_outline),
                                      label: Text(t('comic.preciseRemove')),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              );
            }),
    );
  }
}

class _ReferenceScopeEditor extends StatefulWidget {
  final ComicReferenceAsset reference;
  const _ReferenceScopeEditor({super.key, required this.reference});

  @override
  State<_ReferenceScopeEditor> createState() => _ReferenceScopeEditorState();
}

class _ReferenceScopeEditorState extends State<_ReferenceScopeEditor> {
  late final TextEditingController input;

  @override
  void initState() {
    super.initState();
    final controller = context.read<ComicController>();
    input = TextEditingController(
      text: formatComicPanelRange(
        widget.reference.scopePanelIds,
        controller.project.panels,
      ),
    );
  }

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final reference = widget.reference;
    final t = _text(context);
    final coverage = t('comic.preciseCoverage')
        .replaceAll('{count}', '${controller.referenceCoverage(reference)}')
        .replaceAll('{total}', '${controller.project.panels.length}');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(t('comic.preciseScope'),
            style: Theme.of(context).textTheme.labelSmall),
        const SizedBox(height: 5),
        SegmentedButton<ComicReferenceScope>(
          showSelectedIcon: false,
          segments: [
            ButtonSegment(
                value: ComicReferenceScope.all,
                label: Text(t('comic.preciseScopeAll'))),
            ButtonSegment(
                value: ComicReferenceScope.include,
                label: Text(t('comic.preciseScopeInclude'))),
            ButtonSegment(
                value: ComicReferenceScope.exclude,
                label: Text(t('comic.preciseScopeExclude'))),
          ],
          selected: {reference.scope},
          onSelectionChanged: (value) {
            controller.setReferenceScope(reference, value.first);
            if (value.first == ComicReferenceScope.all) input.clear();
          },
        ),
        if (reference.scope != ComicReferenceScope.all) ...[
          const SizedBox(height: 8),
          TextField(
            controller: input,
            decoration: InputDecoration(
              labelText: t('comic.preciseRange'),
              hintText: t('comic.preciseRangeHint'),
              border: const OutlineInputBorder(),
              suffixIcon: IconButton(
                tooltip: t('comic.preciseApplyRange'),
                onPressed: () => _run(context, () async {
                  controller.applyReferenceRange(reference, input.text);
                }),
                icon: const Icon(Icons.check),
              ),
            ),
            onSubmitted: (value) => _run(context, () async {
              controller.applyReferenceRange(reference, value);
            }),
          ),
        ],
        const SizedBox(height: 5),
        Text(coverage, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _ReferenceSlider extends StatelessWidget {
  final String label;
  final double value;
  final ValueChanged<double> onChanged;
  const _ReferenceSlider({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label · ${value.toStringAsFixed(2)}',
              style: Theme.of(context).textTheme.labelSmall),
          Slider(value: value, min: 0, max: 1, onChanged: onChanged),
        ],
      );
}

class _PanelSizeSection extends StatefulWidget {
  const _PanelSizeSection();

  @override
  State<_PanelSizeSection> createState() => _PanelSizeSectionState();
}

class _PanelSizeSectionState extends State<_PanelSizeSection> {
  final input = TextEditingController();

  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final project = controller.project;
    final t = _text(context);
    return _SectionCard(
      title: t('comic.sizeMode'),
      subtitle: t('comic.sizeModeHint'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SegmentedButton<ComicSizeMode>(
            segments: [
              ButtonSegment(
                value: ComicSizeMode.uniform,
                label: Text(t('comic.sizeUniform')),
                icon: const Icon(Icons.aspect_ratio),
              ),
              ButtonSegment(
                value: ComicSizeMode.perPanel,
                label: Text(t('comic.sizePerPanel')),
                icon: const Icon(Icons.view_carousel_outlined),
              ),
            ],
            selected: {project.sizeMode},
            onSelectionChanged: (value) => controller.setSizeMode(value.first),
          ),
          if (project.sizeMode == ComicSizeMode.perPanel) ...[
            const SizedBox(height: 12),
            TextField(
              controller: input,
              minLines: 4,
              maxLines: 12,
              decoration: InputDecoration(
                labelText: t('comic.sizesInput'),
                hintText: '832×1216\n1216×832\n1024×1024',
                border: const OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: comicSizePresets
                  .map((size) => Chip(
                        visualDensity: VisualDensity.compact,
                        label: Text('${size.width}×${size.height}'),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                OutlinedButton.icon(
                  onPressed: project.panels.isEmpty
                      ? null
                      : () => setState(
                            () => input.text = controller.createSizeTemplate(),
                          ),
                  icon: const Icon(Icons.description_outlined),
                  label: Text(t('comic.sizeTemplate')),
                ),
                FilledButton.icon(
                  onPressed: project.panels.isEmpty || input.text.trim().isEmpty
                      ? null
                      : () => _run(context, () async {
                            controller.importPanelSizes(input.text);
                          }),
                  icon: const Icon(Icons.playlist_add_check),
                  label: Text(t('comic.importSizes')),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _PanelsStep extends StatelessWidget {
  const _PanelsStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final t = _text(context);
    if (controller.project.panels.isEmpty) {
      return _EmptyState(
        icon: Icons.view_carousel_outlined,
        text: t('comic.panelsEmpty'),
        action: FilledButton.icon(
          onPressed: controller.addPanel,
          icon: const Icon(Icons.add),
          label: Text(t('comic.addPanel')),
        ),
      );
    }
    return LayoutBuilder(builder: (context, constraints) {
      final wide = constraints.maxWidth >= 760;
      final list = _PanelList(controller: controller);
      final editor = _PanelEditor(
        key: ValueKey(controller.activePanel?.id),
        panel: controller.activePanel!,
      );
      if (!wide) {
        return ListView(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 110),
          children: [list, const SizedBox(height: 12), editor],
        );
      }
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(width: 300, child: SingleChildScrollView(child: list)),
            const SizedBox(width: 12),
            Expanded(child: SingleChildScrollView(child: editor)),
          ],
        ),
      );
    });
  }
}

class _PanelList extends StatelessWidget {
  final ComicController controller;
  const _PanelList({required this.controller});

  @override
  Widget build(BuildContext context) {
    final t = _text(context);
    return _SectionCard(
      title: t('comic.panelsHeading'),
      action: IconButton.filledTonal(
        tooltip: t('comic.addPanel'),
        onPressed: controller.addPanel,
        icon: const Icon(Icons.add),
      ),
      child: Column(
        children: [
          Text(t('comic.dragPanel'),
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 6),
          ReorderableListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            buildDefaultDragHandles: false,
            itemCount: controller.project.panels.length,
            onReorder: controller.reorderPanel,
            itemBuilder: (context, itemIndex) {
              final panel = controller.project.panels[itemIndex];
              final selected = controller.activePanelId == panel.id;
              return Padding(
                key: ValueKey(panel.id),
                padding: const EdgeInsets.only(bottom: 6),
                child: ListTile(
                  selected: selected,
                  selectedTileColor:
                      Theme.of(context).colorScheme.primaryContainer,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  leading: CircleAvatar(child: Text('${panel.index}')),
                  title: Text(panel.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(
                    panel.prompt,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (panel.candidates.isNotEmpty)
                        Badge(label: Text('${panel.candidates.length}')),
                      ReorderableDragStartListener(
                        index: itemIndex,
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Icon(Icons.drag_indicator,
                              semanticLabel: t('comic.dragPanel')),
                        ),
                      ),
                    ],
                  ),
                  onTap: () => controller.selectPanel(panel.id),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _PanelEditor extends StatelessWidget {
  final ComicPanel panel;
  const _PanelEditor({super.key, required this.panel});

  @override
  Widget build(BuildContext context) {
    final controller = context.read<ComicController>();
    final t = _text(context);
    return _SectionCard(
      title: '${panel.index}. ${panel.title}',
      action: Wrap(
        spacing: 4,
        children: [
          IconButton(
            tooltip: t('comic.moveUp'),
            onPressed: panel.index <= 1
                ? null
                : () => controller.movePanel(panel.id, -1),
            icon: const Icon(Icons.arrow_upward),
          ),
          IconButton(
            tooltip: t('comic.moveDown'),
            onPressed: panel.index >= controller.project.panels.length
                ? null
                : () => controller.movePanel(panel.id, 1),
            icon: const Icon(Icons.arrow_downward),
          ),
          IconButton(
            tooltip: t('comic.delete'),
            onPressed: () => controller.removePanel(panel.id),
            icon: const Icon(Icons.delete_outline),
          ),
        ],
      ),
      child: Column(
        children: [
          _Field(
            value: panel.title,
            label: t('comic.panelTitle'),
            onChanged: (value) {
              panel.title = value;
              controller.changed();
            },
          ),
          const SizedBox(height: 12),
          _Field(
            value: panel.prompt,
            label: t('comic.panelPrompt'),
            minLines: 8,
            onChanged: (value) {
              panel.prompt = value;
              controller.changed();
            },
          ),
          if (controller.project.sizeMode == ComicSizeMode.perPanel) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: panel.imageWidth == null || panel.imageHeight == null
                  ? null
                  : '${panel.imageWidth}x${panel.imageHeight}',
              isExpanded: true,
              decoration: InputDecoration(
                labelText: t('comic.panelSize'),
                border: const OutlineInputBorder(),
              ),
              items: comicSizePresets
                  .map((size) => DropdownMenuItem(
                        value: '${size.width}x${size.height}',
                        child: Text('${size.width}×${size.height}'),
                      ))
                  .toList(),
              onChanged: (value) {
                final size = comicSizePresets
                    .where((item) => '${item.width}x${item.height}' == value)
                    .firstOrNull;
                if (size == null) return;
                panel
                  ..imageWidth = size.width
                  ..imageHeight = size.height;
                controller.changed();
              },
            ),
          ],
          if (controller.project.preciseReferences.isNotEmpty) ...[
            const SizedBox(height: 12),
            _PanelPreciseReferences(panel: panel),
          ],
          const SizedBox(height: 8),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text(t('comic.override')),
            subtitle: Text(t('comic.overrideHint')),
            value: panel.overrideParams,
            onChanged: (value) {
              panel.overrideParams = value;
              if (value) panel.params = controller.project.globalParams.copy();
              controller.changed();
            },
          ),
          if (panel.overrideParams) ...[
            const SizedBox(height: 8),
            _ParamsEditor(params: panel.params, onChanged: controller.changed),
          ],
        ],
      ),
    );
  }
}

class _PanelPreciseReferences extends StatelessWidget {
  final ComicPanel panel;
  const _PanelPreciseReferences({required this.panel});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final t = _text(context);
    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(t('comic.precisePanelHeading'),
                style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 3),
            Text(t('comic.precisePanelHint'),
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            for (final asset in controller.project.preciseReferences)
              Builder(builder: (context) {
                final matches = panel.preciseReferences
                    .where((item) => item.referenceId == asset.id)
                    .toList();
                final manualOverride = matches.isEmpty ? null : matches.first;
                final inherited = comicReferenceApplies(asset, panel.id);
                final enabled = manualOverride?.enabled ?? inherited;
                final selection = enabled
                    ? manualOverride ??
                        ComicPanelReference(
                          referenceId: asset.id,
                          type: asset.type,
                          strength: asset.strength,
                          fidelity: asset.fidelity,
                          informationExtracted: asset.informationExtracted,
                        )
                    : null;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      children: [
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          value: enabled,
                          onChanged: (value) => controller.togglePanelReference(
                              panel, asset, value == true),
                          secondary: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.file(File(asset.filePath),
                                width: 48,
                                height: 48,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) =>
                                    const Icon(Icons.broken_image_outlined)),
                          ),
                          title: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(asset.name,
                                  maxLines: 1, overflow: TextOverflow.ellipsis),
                              if (manualOverride != null)
                                Text(t('comic.preciseManual'),
                                    style:
                                        Theme.of(context).textTheme.labelSmall),
                            ],
                          ),
                        ),
                        if (selection != null) ...[
                          DropdownButtonFormField<String>(
                            value: selection.type,
                            isExpanded: true,
                            decoration: const InputDecoration(
                                border: OutlineInputBorder()),
                            items: [
                              DropdownMenuItem(
                                  value: 'character',
                                  child: Text(t('comic.preciseCharacter'))),
                              DropdownMenuItem(
                                  value: 'style',
                                  child: Text(t('comic.preciseStyle'))),
                              DropdownMenuItem(
                                  value: 'character&style',
                                  child: Text(t('comic.preciseBoth'))),
                            ],
                            onChanged: (value) {
                              controller.updatePanelReference(panel, asset,
                                  type: value ?? 'character');
                            },
                          ),
                          _ReferenceSlider(
                            label: t('comic.preciseStrength'),
                            value: selection.strength,
                            onChanged: (value) {
                              controller.updatePanelReference(panel, asset,
                                  strength: value);
                            },
                          ),
                          _ReferenceSlider(
                            label: t('comic.preciseFidelity'),
                            value: selection.fidelity,
                            onChanged: (value) {
                              controller.updatePanelReference(panel, asset,
                                  fidelity: value);
                            },
                          ),
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () => controller
                                  .clearPanelReferenceOverride(panel, asset.id),
                              child: Text(t('comic.preciseReset')),
                            ),
                          ),
                        ],
                        if (manualOverride != null && selection == null)
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed: () => controller
                                  .clearPanelReferenceOverride(panel, asset.id),
                              child: Text(t('comic.preciseReset')),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}

class _GenerateStep extends StatelessWidget {
  const _GenerateStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final t = _text(context);
    final panels = controller.project.panels;
    return LayoutBuilder(builder: (context, constraints) {
      final columns = constraints.maxWidth >= 1100
          ? 4
          : constraints.maxWidth >= 760
              ? 3
              : constraints.maxWidth >= 500
                  ? 2
                  : 1;
      return CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
              child: _SectionCard(
                title: t('comic.generateHeading'),
                subtitle: t('comic.exportHint'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (controller.queueRunning) ...[
                      LinearProgressIndicator(
                        value: controller.queueTotal == 0
                            ? null
                            : controller.queueDone / controller.queueTotal,
                      ),
                      const SizedBox(height: 10),
                    ],
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        FilledButton.icon(
                          onPressed: controller.queueRunning || panels.isEmpty
                              ? null
                              : () => _confirmAndRun(
                                    context,
                                    controller,
                                    controller.generateInitial,
                                    () => controller.quoteTasks(
                                      panels,
                                      each: controller
                                          .project.initialGenerationCount,
                                    ),
                                  ),
                          icon: const Icon(Icons.play_arrow),
                          label: Text(t('comic.generateInitial')),
                        ),
                        OutlinedButton.icon(
                          onPressed: controller.queueRunning || panels.isEmpty
                              ? null
                              : () => _confirmAndRun(
                                    context,
                                    controller,
                                    controller.regenerateAll,
                                    () => controller.quoteTasks(
                                      panels,
                                      each: controller
                                          .project.initialGenerationCount,
                                    ),
                                  ),
                          icon: const Icon(Icons.refresh),
                          label: Text(t('comic.regenerateAll')),
                        ),
                        OutlinedButton.icon(
                          onPressed: controller.queueRunning || panels.isEmpty
                              ? null
                              : () => _confirmAndRun(
                                    context,
                                    controller,
                                    controller.addOneToAll,
                                    () => controller.quoteTasks(panels),
                                  ),
                          icon: const Icon(Icons.add_photo_alternate_outlined),
                          label: Text(t('comic.addAll')),
                        ),
                        if (controller.queueRunning)
                          FilledButton.tonalIcon(
                            onPressed: controller.cancelQueue,
                            icon: const Icon(Icons.stop),
                            label: Text(t('comic.stop')),
                          ),
                        OutlinedButton.icon(
                          onPressed: panels
                                  .any((item) => item.selectedCandidate != null)
                              ? () =>
                                  _run(context, controller.exportSelectedZip)
                              : null,
                          icon: const Icon(Icons.archive_outlined),
                          label: Text(t('comic.exportZip')),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (panels.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: _EmptyState(
                icon: Icons.image_outlined,
                text: t('comic.panelsEmpty'),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 110),
              sliver: SliverGrid.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: columns,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
                  mainAxisExtent: columns == 1 ? 520 : 480,
                ),
                itemCount: panels.length,
                itemBuilder: (context, index) =>
                    _ResultCard(panel: panels[index]),
              ),
            ),
        ],
      );
    });
  }
}

class _ResultCard extends StatelessWidget {
  final ComicPanel panel;
  const _ResultCard({required this.panel});

  @override
  Widget build(BuildContext context) {
    final controller = context.read<ComicController>();
    final t = _text(context);
    final selected = panel.selectedCandidate;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            dense: true,
            leading: CircleAvatar(child: Text('${panel.index}')),
            title:
                Text(panel.title, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text(
              '${t('comic.currentMain')} · ${panel.candidates.length}',
              maxLines: 1,
            ),
            trailing: IconButton(
              tooltip: panel.status == ComicPanelStatus.failed
                  ? t('comic.retry')
                  : t('comic.addOne'),
              onPressed: controller.queueRunning
                  ? null
                  : () => _confirmAndRun(
                        context,
                        controller,
                        () => controller.addOne(panel),
                        () => controller.quoteTasks([panel]),
                      ),
              icon: Icon(panel.status == ComicPanelStatus.failed
                  ? Icons.refresh
                  : Icons.add),
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: selected == null
                  ? null
                  : () => _preview(context, selected.outputPath),
              child: selected == null
                  ? _EmptyState(
                      icon: panel.status == ComicPanelStatus.generating
                          ? Icons.hourglass_top
                          : Icons.image_outlined,
                      text: panel.error.isNotEmpty
                          ? panel.error
                          : t('comic.noCandidate'),
                    )
                  : Hero(
                      tag: 'comic-${selected.id}',
                      child: Image.file(
                        File(selected.outputPath),
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) =>
                            Center(child: Text(t('comic.imageMissing'))),
                      ),
                    ),
            ),
          ),
          if (panel.candidates.length > 1)
            ExpansionTile(
              title: Text(t('comic.showCandidates')),
              childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              children: [
                SizedBox(
                  height: 82,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: panel.candidates.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final candidate = panel.candidates[index];
                      final active = candidate.id == panel.selectedCandidateId;
                      return InkWell(
                        onTap: () =>
                            controller.selectCandidate(panel, candidate.id),
                        onLongPress: () =>
                            _preview(context, candidate.outputPath),
                        child: Container(
                          width: 68,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: active
                                  ? Theme.of(context).colorScheme.primary
                                  : Theme.of(context).dividerColor,
                              width: active ? 3 : 1,
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Image.file(
                            File(candidate.outputPath),
                            fit: BoxFit.cover,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class _ParamsEditor extends StatelessWidget {
  final GenerateParams params;
  final VoidCallback onChanged;
  final String? negativePrompt;
  final ValueChanged<String>? onNegativeChanged;
  const _ParamsEditor({
    required this.params,
    required this.onChanged,
    this.negativePrompt,
    this.onNegativeChanged,
  });

  @override
  Widget build(BuildContext context) {
    final t = _text(context);
    final language = context.watch<AppState>().settings.language;
    return _SectionCard(
      title: t('comic.paramsHeading'),
      child: LayoutBuilder(builder: (context, constraints) {
        final width = constraints.maxWidth >= 760
            ? (constraints.maxWidth - 24) / 3
            : constraints.maxWidth >= 480
                ? (constraints.maxWidth - 12) / 2
                : constraints.maxWidth;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            if (negativePrompt != null && onNegativeChanged != null)
              SizedBox(
                width: constraints.maxWidth,
                child: _Field(
                  value: negativePrompt!,
                  label: t('comic.globalNegative'),
                  minLines: 3,
                  onChanged: onNegativeChanged!,
                ),
              ),
            SizedBox(
              width: width,
              child: DropdownButtonFormField<String>(
                isExpanded: true,
                value: naiModels.any((item) => item.value == params.model)
                    ? params.model
                    : naiModels.first.value,
                decoration: InputDecoration(
                    labelText: t('comic.model'),
                    border: const OutlineInputBorder()),
                items: naiModels
                    .map((item) => DropdownMenuItem(
                          value: item.value,
                          child:
                              Text(item.label, overflow: TextOverflow.ellipsis),
                        ))
                    .toList(),
                onChanged: (value) {
                  params.model = value ?? params.model;
                  if (!params.isV5) {
                    if (params.qualityPreset == 'light') {
                      params.qualityPreset = 'standard';
                    }
                    params.transparentBackground = false;
                  }
                  params.qualityToggle = params.qualityPreset != 'none';
                  onChanged();
                },
              ),
            ),
            _CommittedDimensionField(
              width: width,
              label: t('comic.width'),
              value: params.width,
              normalize: (value) => snapNaiDimensionWithinArea(
                value,
                params.height,
                params.width,
              ),
              onCommit: (value) {
                params.width = value;
                onChanged();
              },
            ),
            _CommittedDimensionField(
              width: width,
              label: t('comic.height'),
              value: params.height,
              normalize: (value) => snapNaiDimensionWithinArea(
                value,
                params.width,
                params.height,
              ),
              onCommit: (value) {
                params.height = value;
                onChanged();
              },
            ),
            _NumberField(
              width: width,
              label: t('comic.steps'),
              value: params.steps,
              onChanged: (value) => params.steps = value.clamp(1, 50),
              notify: onChanged,
            ),
            _DecimalField(
              width: width,
              label: t('comic.cfg'),
              value: params.cfgScale,
              onChanged: (value) => params.cfgScale = value.clamp(0, 10),
              notify: onChanged,
            ),
            _NumberField(
              width: width,
              label: t('comic.seed'),
              value: params.seed,
              onChanged: (value) => params.seed = value,
              notify: onChanged,
            ),
            SizedBox(
              width: constraints.maxWidth,
              child: QualityPresetControl(
                language: language,
                model: params.model,
                value: params.qualityPreset,
                transparentBackground: params.transparentBackground,
                onChanged: (value) {
                  params
                    ..qualityPreset = value
                    ..qualityToggle = value != 'none';
                  onChanged();
                },
                onTransparentChanged: (value) {
                  params.transparentBackground = value;
                  onChanged();
                },
              ),
            ),
          ],
        );
      }),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? action;
  final Widget child;
  const _SectionCard({
    required this.title,
    this.subtitle,
    this.action,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        if (subtitle != null) ...[
          const SizedBox(height: 2),
          Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
        ],
      ],
    );
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            LayoutBuilder(
              builder: (context, constraints) {
                if (action != null && constraints.maxWidth < 520) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      heading,
                      const SizedBox(height: 10),
                      Align(alignment: Alignment.centerLeft, child: action!),
                    ],
                  );
                }
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: heading),
                    if (action != null) action!,
                  ],
                );
              },
            ),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final String value;
  final String label;
  final int minLines;
  final ValueChanged<String> onChanged;
  const _Field({
    required this.value,
    required this.label,
    this.minLines = 1,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => TextFormField(
        key: ValueKey('$label-$value'),
        initialValue: value,
        minLines: minLines,
        maxLines: minLines == 1 ? 1 : minLines + 4,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          alignLabelWithHint: minLines > 1,
        ),
        onChanged: onChanged,
      );
}

class _CommittedDimensionField extends StatefulWidget {
  final double width;
  final String label;
  final int value;
  final int Function(int value) normalize;
  final ValueChanged<int> onCommit;
  const _CommittedDimensionField({
    required this.width,
    required this.label,
    required this.value,
    required this.normalize,
    required this.onCommit,
  });

  @override
  State<_CommittedDimensionField> createState() =>
      _CommittedDimensionFieldState();
}

class _CommittedDimensionFieldState extends State<_CommittedDimensionField> {
  late final TextEditingController controller;
  late final FocusNode focusNode;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '${widget.value}');
    focusNode = FocusNode()..addListener(_commitAfterEditing);
  }

  @override
  void didUpdateWidget(covariant _CommittedDimensionField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!focusNode.hasFocus && controller.text != '${widget.value}') {
      controller.text = '${widget.value}';
    }
  }

  void _commitAfterEditing() {
    if (focusNode.hasFocus) return;
    final parsed = int.tryParse(controller.text);
    if (parsed == null) {
      controller.text = '${widget.value}';
      return;
    }
    final next = widget.normalize(parsed);
    controller.text = '$next';
    if (next != widget.value) widget.onCommit(next);
  }

  @override
  void dispose() {
    focusNode
      ..removeListener(_commitAfterEditing)
      ..dispose();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: widget.width,
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: widget.label,
            border: const OutlineInputBorder(),
          ),
          onSubmitted: (_) => focusNode.unfocus(),
          onTapOutside: (_) => focusNode.unfocus(),
        ),
      );
}

class _NumberField extends StatelessWidget {
  final double width;
  final String label;
  final int value;
  final ValueChanged<int> onChanged;
  final VoidCallback notify;
  const _NumberField({
    required this.width,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.notify,
  });

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: TextFormField(
          key: ValueKey('$label-$value'),
          initialValue: '$value',
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          onChanged: (input) {
            final parsed = int.tryParse(input);
            if (parsed != null) {
              onChanged(parsed);
              notify();
            }
          },
        ),
      );
}

class _DecimalField extends StatelessWidget {
  final double width;
  final String label;
  final double value;
  final ValueChanged<double> onChanged;
  final VoidCallback notify;
  const _DecimalField({
    required this.width,
    required this.label,
    required this.value,
    required this.onChanged,
    required this.notify,
  });

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        child: TextFormField(
          key: ValueKey('$label-$value'),
          initialValue: '$value',
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          onChanged: (input) {
            final parsed = double.tryParse(input);
            if (parsed != null) {
              onChanged(parsed);
              notify();
            }
          },
        ),
      );
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String text;
  final Widget? action;
  const _EmptyState({required this.icon, required this.text, this.action});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  size: 44, color: Theme.of(context).colorScheme.outline),
              const SizedBox(height: 12),
              Text(text, textAlign: TextAlign.center),
              if (action != null) ...[const SizedBox(height: 12), action!],
            ],
          ),
        ),
      );
}

String Function(String) _text(BuildContext context) {
  final language = context.watch<AppState>().settings.language;
  return (key) => mobileUiTextFor(language, key);
}

Future<void> _run(BuildContext context, Future<void> Function() action) async {
  try {
    await action();
  } catch (error) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error.toString().replaceFirst('Exception: ', ''))),
    );
  }
}

Future<void> _confirmAndRun(
  BuildContext context,
  ComicController controller,
  Future<void> Function() action,
  Future<int> Function() loadQuote,
) async {
  final t = _text(context);
  final quote = await loadQuote();
  if (!context.mounted) return;
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(t('comic.confirmGenerate')),
      content: Text('${t('comic.quote')}: $quote Anlas'),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: Text(t('common.cancel')),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: Text(t('comic.confirm')),
        ),
      ],
    ),
  );
  if (confirmed == true && context.mounted) await _run(context, action);
}

Future<void> _preview(BuildContext context, String path) async {
  await showDialog<void>(
    context: context,
    barrierColor: Colors.black87,
    builder: (context) => Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: Stack(
        children: [
          Positioned.fill(
            child: InteractiveViewer(
              minScale: 0.5,
              maxScale: 6,
              child: Center(child: Image.file(File(path), fit: BoxFit.contain)),
            ),
          ),
          Positioned(
            top: 12,
            right: 12,
            child: SafeArea(
              child: IconButton.filled(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
