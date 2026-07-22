import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../comic/comic_controller.dart';
import '../comic/comic_models.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';

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
        children: controller.project.panels.map((panel) {
          final selected = controller.activePanelId == panel.id;
          return Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              selected: selected,
              selectedTileColor: Theme.of(context).colorScheme.primaryContainer,
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
              trailing: panel.candidates.isEmpty
                  ? null
                  : Badge(label: Text('${panel.candidates.length}')),
              onTap: () => controller.selectPanel(panel.id),
            ),
          );
        }).toList(),
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
                  onChanged();
                },
              ),
            ),
            _NumberField(
              width: width,
              label: t('comic.width'),
              value: params.width,
              onChanged: (value) => params.width = value.clamp(64, 4096),
              notify: onChanged,
            ),
            _NumberField(
              width: width,
              label: t('comic.height'),
              value: params.height,
              onChanged: (value) => params.height = value.clamp(64, 4096),
              notify: onChanged,
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
              onChanged: (value) => params.cfgScale = value.clamp(0, 20),
              notify: onChanged,
            ),
            _NumberField(
              width: width,
              label: t('comic.seed'),
              value: params.seed,
              onChanged: (value) => params.seed = value,
              notify: onChanged,
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
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: Theme.of(context).textTheme.titleMedium),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!,
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ],
                  ),
                ),
                if (action != null) action!,
              ],
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
