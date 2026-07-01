import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../batch/batch_redraw_controller.dart';
import '../batch/batch_redraw_models.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';

class BatchRedrawScreen extends StatelessWidget {
  final VoidCallback? onBack;
  final BatchRedrawController? controller;
  const BatchRedrawScreen({super.key, this.onBack, this.controller});

  @override
  Widget build(BuildContext context) {
    final value = controller;
    if (value != null) {
      return ChangeNotifierProvider.value(
        value: value,
        child: _BatchBody(onBack: onBack),
      );
    }
    return ChangeNotifierProvider(
      create: (_) => BatchRedrawController(context.read<AppState>())..load(),
      child: _BatchBody(onBack: onBack),
    );
  }
}

class _BatchBody extends StatelessWidget {
  final VoidCallback? onBack;
  const _BatchBody({this.onBack});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    if (!controller.loaded) {
      return Scaffold(body: Center(child: Text(t('batch.loading'))));
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
        title: Text(t('batch.title')),
      ),
      body: Column(
        children: [
          _BatchStepBar(controller: controller),
          Expanded(
            child: switch (controller.step) {
              BatchRedrawStep.import => const _ImportStep(),
              BatchRedrawStep.params => const _ParamsStep(),
              BatchRedrawStep.prompts => const _PromptsStep(),
              BatchRedrawStep.generate => const _BatchGenerateStep(),
            },
          ),
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: SafeArea(
              top: false,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Row(
                  children: [
                    if (controller.busy || controller.queueRunning)
                      const Padding(
                        padding: EdgeInsets.only(right: 8),
                        child: SizedBox.square(
                          dimension: 15,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    Expanded(
                      child: Text(controller.displayStatus,
                          maxLines: 2, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BatchStepBar extends StatelessWidget {
  final BatchRedrawController controller;
  const _BatchStepBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    final language = context.watch<AppState>().settings.language;
    final labels = [
      mobileUiTextFor(language, 'batch.step.import'),
      mobileUiTextFor(language, 'batch.step.params'),
      mobileUiTextFor(language, 'batch.step.prompts'),
      mobileUiTextFor(language, 'batch.step.generate'),
    ];
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      elevation: 0,
      child: SafeArea(
        top: false,
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final compact = constraints.maxWidth < 560;
              final chips = [
                for (var index = 0; index < labels.length; index++)
                  _BatchStepChip(
                    index: index,
                    label: labels[index],
                    selected: controller.step.index == index,
                    compact: compact,
                    onPressed: () =>
                        controller.setStep(BatchRedrawStep.values[index]),
                  ),
              ];
              if (!compact) {
                return Row(
                  children: [
                    for (var index = 0; index < chips.length; index++) ...[
                      if (index > 0) const SizedBox(width: 8),
                      Expanded(child: chips[index]),
                    ],
                  ],
                );
              }
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (var index = 0; index < chips.length; index++) ...[
                      if (index > 0) const SizedBox(width: 8),
                      SizedBox(width: 112, child: chips[index]),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class _BatchStepChip extends StatelessWidget {
  final int index;
  final String label;
  final bool selected;
  final bool compact;
  final VoidCallback onPressed;

  const _BatchStepChip({
    required this.index,
    required this.label,
    required this.selected,
    required this.compact,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Material(
      color:
          selected ? colors.primaryContainer : colors.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onPressed,
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: compact ? 10 : 14,
            vertical: 10,
          ),
          child: Row(
            mainAxisAlignment:
                compact ? MainAxisAlignment.start : MainAxisAlignment.center,
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: selected ? colors.primary : colors.surface,
                foregroundColor:
                    selected ? colors.onPrimary : colors.onSurfaceVariant,
                child: Text('${index + 1}',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: selected
                        ? colors.onPrimaryContainer
                        : colors.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ImportStep extends StatelessWidget {
  const _ImportStep();

  Future<void> _pick(BuildContext context) async {
    final files = await ImagePicker().pickMultiImage(imageQuality: 100);
    if (files.isEmpty || !context.mounted) return;
    final error = await context
        .read<BatchRedrawController>()
        .addImages(files.map((file) => file.path).toList());
    if (error != null && context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final project = controller.project;
    return StudioContent(
      maxWidth: 980,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: controller.reset,
                icon: const Icon(Icons.note_add_outlined),
                label: Text(t('batch.newProject')),
              ),
              OutlinedButton.icon(
                onPressed: controller.exportJson,
                icon: const Icon(Icons.save_alt),
                label: Text(t('batch.saveJson')),
              ),
              OutlinedButton.icon(
                onPressed: controller.importJson,
                icon: const Icon(Icons.file_open_outlined),
                label: Text(t('batch.importJson')),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: ValueKey('$language:${project.groupName}'),
            initialValue: controller.displayGroupName,
            decoration: InputDecoration(
              labelText: t('batch.projectName'),
              border: const OutlineInputBorder(),
            ),
            onChanged: (value) {
              project.groupName = value;
              controller.changed();
            },
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () => _pick(context),
            icon: const Icon(Icons.collections_outlined),
            label: Text(t('batch.importImages')),
          ),
          const SizedBox(height: 12),
          for (final item in project.items)
            Card(
              child: ListTile(
                leading: SizedBox.square(
                  dimension: 58,
                  child: _BatchImage(item: item, output: false),
                ),
                title: Text(item.name,
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('${item.width}x${item.height}'),
                trailing: IconButton(
                  tooltip: t('common.remove'),
                  onPressed: () {
                    project.items.remove(item);
                    controller.changed(t('batch.removedImage'));
                  },
                  icon: const Icon(Icons.close),
                ),
              ),
            ),
          if (project.items.isNotEmpty)
            FilledButton.tonal(
              onPressed: () => controller.setStep(BatchRedrawStep.params),
              child: Text(mobileUiFormatFor(language, 'batch.nextParams',
                  {'count': project.items.length})),
            ),
        ],
      ),
    );
  }
}

class _ParamsStep extends StatelessWidget {
  const _ParamsStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final project = controller.project;
    final params = project.globalParams;
    return StudioContent(
      maxWidth: 880,
      child: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: controller.syncCurrentParams,
              icon: const Icon(Icons.sync),
              label: Text(t('batch.syncParams')),
            ),
          ),
          _BatchParamsEditor(
            title: t('batch.globalParams'),
            params: params,
            initiallyExpanded: true,
            onChanged: controller.changed,
          ),
          const SizedBox(height: 8),
          _BatchSlider(
            label: t('batch.globalStrength'),
            value: project.globalStrength,
            min: 0.05,
            max: 1,
            divisions: 95,
            onChanged: (value) {
              project.globalStrength = value;
              controller.changed();
            },
          ),
          TextFormField(
            initialValue: project.globalStyle,
            minLines: 2,
            maxLines: 5,
            decoration: InputDecoration(
              labelText: t('batch.globalStyle'),
              border: const OutlineInputBorder(),
            ),
            onChanged: (value) {
              project.globalStyle = value;
              controller.changed();
            },
          ),
          const SizedBox(height: 10),
          TextFormField(
            initialValue: project.globalNegative,
            minLines: 2,
            maxLines: 5,
            decoration: InputDecoration(
              labelText: t('batch.globalNegative'),
              border: const OutlineInputBorder(),
            ),
            onChanged: (value) {
              project.globalNegative = value;
              controller.changed();
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('batch.reuseMainReferences')),
            subtitle:
                Text(mobileUiFormatFor(language, 'generate.referenceSubtitle', {
              'vibe': controller.app.extras.vibeImages.length,
              'precise': controller.app.extras.preciseReferences.length
            })),
            value: project.reuseMainReferences,
            onChanged: (value) {
              project.reuseMainReferences = value;
              controller.changed();
            },
          ),
          if (!project.reuseMainReferences) ...[
            OutlinedButton.icon(
              onPressed: controller.copyMainReferences,
              icon: const Icon(Icons.content_copy_outlined),
              label: Text(t('batch.copyMainReferences')),
            ),
            const SizedBox(height: 8),
            const _BatchReferenceEditor(),
          ],
          FilledButton.tonal(
            onPressed: project.items.isEmpty
                ? null
                : () => controller.setStep(BatchRedrawStep.prompts),
            child: Text(t('batch.nextPrompts')),
          ),
        ],
      ),
    );
  }
}

class _BatchReferenceEditor extends StatelessWidget {
  const _BatchReferenceEditor();

  Future<void> _pick(
    BuildContext context, {
    required bool precise,
  }) async {
    final image = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (image == null || !context.mounted) return;
    final error = await context
        .read<BatchRedrawController>()
        .addReference(image.path, precise: precise);
    if (error != null && context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final project = controller.project;
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: EdgeInsets.zero,
      title: Text(t('batch.projectReferences')),
      subtitle: Text(
        mobileUiFormatFor(language, 'generate.referenceSubtitle', {
          'vibe': project.vibeImages.length,
          'precise': project.preciseReferences.length
        }),
      ),
      children: [
        for (var index = 0; index < project.vibeImages.length; index++)
          _BatchVibeRow(index: index),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () => _pick(context, precise: false),
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: Text(t('generate.addVibe')),
          ),
        ),
        const Divider(height: 24),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(t('batch.preciseOnlyV45')),
        ),
        for (var index = 0; index < project.preciseReferences.length; index++)
          _BatchPreciseRow(index: index),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () => _pick(context, precise: true),
            icon: const Icon(Icons.person_search_outlined),
            label: Text(t('generate.addPrecise')),
          ),
        ),
      ],
    );
  }
}

class _BatchReferencePreview extends StatelessWidget {
  final String base64;
  const _BatchReferencePreview({required this.base64});

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: SizedBox.square(
          dimension: 64,
          child: Image.memory(
            base64Decode(base64),
            fit: BoxFit.cover,
            cacheWidth: 160,
            filterQuality: FilterQuality.low,
          ),
        ),
      );
}

class _BatchVibeRow extends StatelessWidget {
  final int index;
  const _BatchVibeRow({required this.index});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final item = controller.project.vibeImages[index];
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _BatchReferencePreview(base64: item.base64),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              children: [
                _BatchSlider(
                  label: t('generate.infoExtracted'),
                  value: item.infoExtracted,
                  min: 0,
                  max: 1,
                  divisions: 20,
                  onChanged: (value) => controller.updateVibeReference(
                    index,
                    infoExtracted: value,
                  ),
                ),
                _BatchSlider(
                  label: t('generate.referenceStrength'),
                  value: item.strength,
                  min: 0,
                  max: 1,
                  divisions: 20,
                  onChanged: (value) => controller.updateVibeReference(
                    index,
                    strength: value,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: t('common.remove'),
            onPressed: () => controller.removeVibeReference(index),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}

class _BatchPreciseRow extends StatelessWidget {
  final int index;
  const _BatchPreciseRow({required this.index});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final item = controller.project.preciseReferences[index];
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _BatchReferencePreview(base64: item.base64),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  value: item.type,
                  isExpanded: true,
                  decoration:
                      InputDecoration(labelText: t('generate.referenceType')),
                  items: [
                    DropdownMenuItem(
                        value: 'character',
                        child: Text(t('generate.refType.character'))),
                    DropdownMenuItem(
                        value: 'style',
                        child: Text(t('generate.refType.style'))),
                    DropdownMenuItem(
                      value: 'character&style',
                      child: Text(t('generate.refType.both')),
                    ),
                  ],
                  onChanged: (value) => value == null
                      ? null
                      : controller.updatePreciseReference(index, type: value),
                ),
                _BatchSlider(
                  label: t('generate.referenceStrength'),
                  value: item.strength,
                  min: 0,
                  max: 1,
                  divisions: 20,
                  onChanged: (value) => controller.updatePreciseReference(
                    index,
                    strength: value,
                  ),
                ),
                _BatchSlider(
                  label: t('generate.fidelityLabel'),
                  value: item.fidelity,
                  min: 0,
                  max: 1,
                  divisions: 20,
                  onChanged: (value) => controller.updatePreciseReference(
                    index,
                    fidelity: value,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: t('common.remove'),
            onPressed: () => controller.removePreciseReference(index),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}

class _PromptsStep extends StatelessWidget {
  const _PromptsStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final project = controller.project;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
      children: [
        DropdownButtonFormField<ReversePromptMode>(
          value: project.aiMode,
          decoration: InputDecoration(
            labelText: t('batch.aiMode'),
            border: const OutlineInputBorder(),
          ),
          items: ReversePromptMode.values
              .map((mode) => DropdownMenuItem(
                  value: mode, child: Text(t('promptMode.${mode.value}'))))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            project.aiMode = value;
            controller.changed();
          },
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: FilledButton.tonalIcon(
                onPressed:
                    controller.busy ? null : controller.reverseMissingPrompts,
                icon: const Icon(Icons.visibility_outlined),
                label: Text(t('batch.reverseMissing')),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: controller.applyBulkPrompts,
                child: Text(t('batch.applyBulk')),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextFormField(
          initialValue: project.promptBulk,
          minLines: 3,
          maxLines: 8,
          decoration: InputDecoration(
            labelText: t('batch.bulkPrompts'),
            border: const OutlineInputBorder(),
          ),
          onChanged: (value) {
            project.promptBulk = value;
            controller.changed();
          },
        ),
        const SizedBox(height: 10),
        for (final item in project.items) _BatchPromptCard(item: item),
        FilledButton.tonal(
          onPressed: project.items.isEmpty
              ? null
              : () => controller.setStep(BatchRedrawStep.generate),
          child: Text(t('batch.nextGenerate')),
        ),
      ],
    );
  }
}

class _BatchPromptCard extends StatelessWidget {
  final BatchRedrawItem item;
  const _BatchPromptCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final project = controller.project;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Row(
              children: [
                SizedBox.square(
                  dimension: 64,
                  child: _BatchImage(item: item, output: false),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(item.name,
                      maxLines: 2, overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextFormField(
              initialValue: item.prompt,
              minLines: 3,
              maxLines: 7,
              decoration: InputDecoration(
                labelText: t('batch.itemPrompt'),
                border: const OutlineInputBorder(),
              ),
              onChanged: (value) {
                item.prompt = value;
                controller.changed();
              },
            ),
            _BatchSlider(
              label: t('batch.itemStrength'),
              value: item.strength ?? project.globalStrength,
              min: 0.05,
              max: 1,
              divisions: 95,
              onChanged: (value) {
                item.strength = value;
                controller.changed();
              },
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(t('batch.itemParams')),
              value: item.overrideParams,
              onChanged: (value) {
                item.overrideParams = value;
                if (value) item.params = project.globalParams.copy();
                controller.changed();
              },
            ),
            if (item.overrideParams)
              _BatchParamsEditor(
                title: t('batch.itemParamsTitle'),
                params: item.params,
                onChanged: controller.changed,
              ),
          ],
        ),
      ),
    );
  }
}

class _BatchGenerateStep extends StatelessWidget {
  const _BatchGenerateStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<BatchRedrawController>();
    final project = controller.project;
    final selected = controller.selected;
    final pending =
        project.items.where((item) => item.outputPath.isEmpty).toList();
    final quoteTargets = selected.isNotEmpty ? selected : pending;
    final width = MediaQuery.sizeOf(context).width;
    final columns = width >= 1180
        ? 5
        : width >= 840
            ? 4
            : width >= 560
                ? 3
                : 2;
    final done = project.items
        .where((item) => item.status == BatchItemStatus.done)
        .length;
    final failed = project.items
        .where((item) => item.status == BatchItemStatus.failed)
        .length;
    final generating = project.items
        .where((item) => item.status == BatchItemStatus.generating)
        .length;
    final ready =
        project.items.where((item) => item.prompt.trim().isNotEmpty).length;
    final progress = controller.queueTotal == 0
        ? null
        : controller.queueDone / controller.queueTotal;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
      children: [
        _BatchGenerateConsole(
          quote: controller.quote(quoteTargets),
          balance: controller.app.account.anlasBalance,
          total: project.items.length,
          ready: ready,
          done: done,
          failed: failed,
          generating: generating,
          queueRunning: controller.queueRunning,
          queuePaused: controller.queuePaused,
          queueDone: controller.queueDone,
          queueTotal: controller.queueTotal,
          progress: progress,
          pendingCount: pending.length,
          selectedCount: selected.length,
          onStartPending: controller.queueRunning || pending.isEmpty
              ? null
              : () => controller.startQueue(pending),
          onRetrySelected: controller.queueRunning || selected.isEmpty
              ? null
              : () => controller.startQueue(selected),
          onExportZip: project.items.any((item) => item.outputPath.isNotEmpty)
              ? () async {
                  final messenger = ScaffoldMessenger.of(context);
                  try {
                    await controller.exportZip();
                    messenger.showSnackBar(
                        SnackBar(content: Text(controller.status)));
                  } catch (error) {
                    messenger
                        .showSnackBar(SnackBar(content: Text('$error')));
                  }
                }
              : null,
          onTogglePause: controller.togglePause,
          onCancel: controller.cancelQueue,
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 0.72,
          ),
          itemCount: project.items.length,
          itemBuilder: (context, index) {
            final item = project.items[index];
            return _BatchResultTile(
              item: item,
              index: index,
              onTap: () {
                item.selected = !item.selected;
                controller.changed();
              },
              onSelected: (value) {
                item.selected = value ?? false;
                controller.changed();
              },
            );
          },
        ),
      ],
    );
  }
}

class _BatchGenerateConsole extends StatelessWidget {
  final int quote;
  final int? balance;
  final int total;
  final int ready;
  final int done;
  final int failed;
  final int generating;
  final bool queueRunning;
  final bool queuePaused;
  final int queueDone;
  final int queueTotal;
  final double? progress;
  final int pendingCount;
  final int selectedCount;
  final VoidCallback? onStartPending;
  final VoidCallback? onRetrySelected;
  final VoidCallback? onExportZip;
  final VoidCallback onTogglePause;
  final VoidCallback onCancel;

  const _BatchGenerateConsole({
    required this.quote,
    required this.balance,
    required this.total,
    required this.ready,
    required this.done,
    required this.failed,
    required this.generating,
    required this.queueRunning,
    required this.queuePaused,
    required this.queueDone,
    required this.queueTotal,
    required this.progress,
    required this.pendingCount,
    required this.selectedCount,
    required this.onStartPending,
    required this.onRetrySelected,
    required this.onExportZip,
    required this.onTogglePause,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Card(
      elevation: 0,
      color: colors.surfaceContainerLow,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: BorderSide(color: colors.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t('batch.results'),
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 3),
                      Text(
                          mobileUiFormatFor(language, 'batch.quoteBalance', {
                            'quote': quote,
                            'balance': balance ?? t('common.unknown')
                          }),
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                Text(
                  '$done/$total',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: colors.primary,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            LinearProgressIndicator(value: progress),
            const SizedBox(height: 10),
            Wrap(
              spacing: 7,
              runSpacing: 7,
              children: [
                _BatchStatChip(label: t('batch.ready'), value: ready),
                _BatchStatChip(label: t('batch.done'), value: done),
                _BatchStatChip(label: t('batch.generating'), value: generating),
                _BatchStatChip(label: t('batch.failed'), value: failed),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.icon(
                  onPressed: onStartPending,
                  icon: const Icon(Icons.playlist_play),
                  label: Text(mobileUiFormatFor(language,
                      'batch.generatePending', {'count': pendingCount})),
                ),
                FilledButton.tonalIcon(
                  onPressed: onRetrySelected,
                  icon: const Icon(Icons.refresh),
                  label: Text(mobileUiFormatFor(language, 'batch.retrySelected',
                      {'count': selectedCount})),
                ),
                OutlinedButton.icon(
                  onPressed: onExportZip,
                  icon: const Icon(Icons.archive_outlined),
                  label: Text(t('batch.exportZip')),
                ),
              ],
            ),
            if (queueRunning) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      mobileUiFormatFor(language, 'batch.queue',
                          {'done': queueDone, 'total': queueTotal}),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton.filledTonal(
                    tooltip: queuePaused
                        ? t('batch.resumeQueue')
                        : t('batch.pauseQueue'),
                    onPressed: onTogglePause,
                    icon: Icon(queuePaused ? Icons.play_arrow : Icons.pause),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filled(
                    tooltip: t('batch.stopQueue'),
                    onPressed: onCancel,
                    icon: const Icon(Icons.stop),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _BatchStatChip extends StatelessWidget {
  final String label;
  final int value;
  const _BatchStatChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Chip(
      visualDensity: VisualDensity.compact,
      side: BorderSide(color: colors.outlineVariant),
      backgroundColor: colors.surface,
      label: Text('$label $value'),
    );
  }
}

class _BatchResultTile extends StatelessWidget {
  final BatchRedrawItem item;
  final int index;
  final VoidCallback onTap;
  final ValueChanged<bool?> onSelected;

  const _BatchResultTile({
    required this.item,
    required this.index,
    required this.onTap,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final statusColor = switch (item.status) {
      BatchItemStatus.done => Colors.green,
      BatchItemStatus.failed => colors.error,
      BatchItemStatus.generating => colors.primary,
      BatchItemStatus.pending => colors.outline,
    };
    final statusLabel = switch (item.status) {
      BatchItemStatus.done => t('batch.statusDone'),
      BatchItemStatus.failed => t('batch.failed'),
      BatchItemStatus.generating => t('batch.generating'),
      BatchItemStatus.pending => item.prompt.trim().isEmpty
          ? t('batch.statusPendingPrompt')
          : t('batch.statusPending'),
    };
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      elevation: item.selected ? 2 : 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: item.selected ? colors.primary : colors.outlineVariant,
          width: item.selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        child: Column(
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(
                    color: colors.surfaceContainerHighest,
                    child: Padding(
                      padding: const EdgeInsets.all(6),
                      child: _BatchImage(item: item, output: true),
                    ),
                  ),
                  Positioned(
                    top: 6,
                    left: 6,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.surface.withOpacity(0.88),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Checkbox(
                        visualDensity: VisualDensity.compact,
                        value: item.selected,
                        onChanged: onSelected,
                      ),
                    ),
                  ),
                  Positioned(
                    right: 8,
                    bottom: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.92),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        statusLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 7, 8, 8),
              child: Row(
                children: [
                  Text('#${index + 1}',
                      style: TextStyle(
                          color: colors.primary, fontWeight: FontWeight.w800)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      item.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BatchImage extends StatelessWidget {
  final BatchRedrawItem item;
  final bool output;
  const _BatchImage({required this.item, required this.output});

  @override
  Widget build(BuildContext context) {
    final path = output ? item.outputPath : item.sourcePath;
    if (path.isNotEmpty && File(path).existsSync()) {
      return Image.file(
        File(path),
        fit: BoxFit.contain,
        cacheWidth: 480,
        filterQuality: FilterQuality.low,
      );
    }
    if (!output || item.outputPath.isEmpty) {
      return Image.memory(
        base64Decode(item.base64),
        fit: BoxFit.contain,
        cacheWidth: 480,
        filterQuality: FilterQuality.low,
      );
    }
    return const ColoredBox(
      color: Colors.black12,
      child: Icon(Icons.broken_image_outlined),
    );
  }
}

class _BatchSlider extends StatelessWidget {
  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final ValueChanged<double> onChanged;
  const _BatchSlider({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(label), Text(value.toStringAsFixed(2))],
          ),
          Slider(
            value: value.clamp(min, max),
            min: min,
            max: max,
            divisions: divisions,
            onChanged: onChanged,
          ),
        ],
      );
}

class _BatchParamsEditor extends StatelessWidget {
  final String title;
  final GenerateParams params;
  final VoidCallback onChanged;
  final bool initiallyExpanded;

  const _BatchParamsEditor({
    required this.title,
    required this.params,
    required this.onChanged,
    this.initiallyExpanded = false,
  });

  @override
  Widget build(BuildContext context) {
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: EdgeInsets.zero,
      initiallyExpanded: initiallyExpanded,
      title: Text(title),
      children: [
        DropdownButtonFormField<String>(
          value: params.model,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: t('batch.model'),
            border: const OutlineInputBorder(),
          ),
          items: naiModels
              .map((model) => DropdownMenuItem(
                    value: model.value,
                    child: Text(
                      localizedNaiOptionLabel(
                          language, model.value, model.label),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            params.model = value;
            onChanged();
          },
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 7,
          runSpacing: 7,
          children: sizePresets
              .map((size) => ChoiceChip(
                    label: Text(localizedSizePresetLabel(
                        language, size.width, size.height, size.label)),
                    selected: params.width == size.width &&
                        params.height == size.height,
                    onSelected: (_) {
                      params
                        ..width = size.width
                        ..height = size.height;
                      onChanged();
                    },
                  ))
              .toList(),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _BatchNumberField(
                label: t('batch.width'),
                value: params.width,
                onChanged: (value) {
                  params.width = _snapBatchDimension(value);
                  onChanged();
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _BatchNumberField(
                label: t('batch.height'),
                value: params.height,
                onChanged: (value) {
                  params.height = _snapBatchDimension(value);
                  onChanged();
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          value: params.sampler,
          isExpanded: true,
          decoration: InputDecoration(
            labelText: t('batch.sampler'),
            border: const OutlineInputBorder(),
          ),
          items: naiSamplers
              .map((sampler) => DropdownMenuItem(
                    value: sampler.value,
                    child: Text(localizedNaiOptionLabel(
                        language, sampler.value, sampler.label)),
                  ))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            params.sampler = value;
            onChanged();
          },
        ),
        _BatchSlider(
          label: 'Steps',
          value: params.steps.toDouble(),
          min: 1,
          max: 50,
          divisions: 49,
          onChanged: (value) {
            params.steps = value.round();
            onChanged();
          },
        ),
        _BatchSlider(
          label: 'CFG',
          value: params.cfgScale,
          min: 1,
          max: 10,
          divisions: 45,
          onChanged: (value) {
            params.cfgScale = value;
            onChanged();
          },
        ),
        _BatchSlider(
          label: 'CFG Rescale',
          value: params.cfgRescale,
          min: 0,
          max: 1,
          divisions: 100,
          onChanged: (value) {
            params.cfgRescale = value;
            onChanged();
          },
        ),
        DropdownButtonFormField<String>(
          value: params.noiseSchedule,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Noise Schedule',
            border: OutlineInputBorder(),
          ),
          items: naiNoiseSchedules
              .map((option) => DropdownMenuItem(
                    value: option.value,
                    child: Text(localizedNaiOptionLabel(
                        language, option.value, option.label)),
                  ))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            params.noiseSchedule = value;
            onChanged();
          },
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<int>(
          value: params.ucPreset,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'UC Preset',
            border: OutlineInputBorder(),
          ),
          items: ucPresets
              .map((option) => DropdownMenuItem(
                    value: int.parse(option.value),
                    child: Text(localizedNaiOptionLabel(
                        language, option.value, option.label)),
                  ))
              .toList(),
          onChanged: (value) {
            if (value == null) return;
            params.ucPreset = value;
            onChanged();
          },
        ),
        const SizedBox(height: 8),
        _BatchNumberField(
          label: t('batch.seed'),
          value: params.seedMode == 'random' ? 0 : params.seed,
          onChanged: (value) {
            params
              ..seed = value.clamp(0, 2147483647)
              ..seedMode = value > 0 ? 'fixed' : 'random';
            onChanged();
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Quality Toggle'),
          value: params.qualityToggle,
          onChanged: (value) {
            params.qualityToggle = value;
            onChanged();
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Variety+'),
          value: params.variety,
          onChanged: (value) {
            params.variety = value;
            onChanged();
          },
        ),
        if (!params.isV4Plus) ...[
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('SMEA'),
            value: params.smea,
            onChanged: (value) {
              params.smea = value;
              if (!value) params.smeaDyn = false;
              onChanged();
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('SMEA Dyn'),
            value: params.smeaDyn,
            onChanged: params.smea
                ? (value) {
                    params.smeaDyn = value;
                    onChanged();
                  }
                : null,
          ),
        ],
      ],
    );
  }
}

class _BatchNumberField extends StatelessWidget {
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  const _BatchNumberField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => TextFormField(
        initialValue: '$value',
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
        onChanged: (raw) {
          final next = int.tryParse(raw);
          if (next != null) onChanged(next);
        },
      );
}

int _snapBatchDimension(int value) {
  final bounded = value.clamp(64, 1600);
  return ((bounded / 64).round() * 64).clamp(64, 1600);
}
