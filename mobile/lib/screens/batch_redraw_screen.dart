import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../batch/batch_redraw_controller.dart';
import '../batch/batch_redraw_models.dart';
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
    if (!controller.loaded) {
      return const Scaffold(body: Center(child: Text('正在加载批量项目...')));
    }
    return Scaffold(
      appBar: AppBar(
        leading: onBack == null
            ? null
            : IconButton(
                tooltip: '返回工具',
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back),
              ),
        title: const Text('批量图生图'),
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
                      child: Text(controller.status,
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
    const labels = ['导入', '参数', '提示词', '生成'];
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Row(
        children: [
          for (var index = 0; index < labels.length; index++) ...[
            if (index > 0) const SizedBox(width: 6),
            Expanded(
              child: FilledButton.tonal(
                style: FilledButton.styleFrom(
                  backgroundColor: controller.step.index == index
                      ? Theme.of(context).colorScheme.primaryContainer
                      : null,
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                ),
                onPressed: () =>
                    controller.setStep(BatchRedrawStep.values[index]),
                child: Text('${index + 1} ${labels[index]}',
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
            ),
          ],
        ],
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
    final project = controller.project;
    return StudioContent(
      maxWidth: 980,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: controller.reset,
                icon: const Icon(Icons.note_add_outlined),
                label: const Text('新建项目'),
              ),
              OutlinedButton.icon(
                onPressed: controller.exportJson,
                icon: const Icon(Icons.save_alt),
                label: const Text('另存 JSON'),
              ),
              OutlinedButton.icon(
                onPressed: controller.importJson,
                icon: const Icon(Icons.file_open_outlined),
                label: const Text('导入 JSON'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: project.groupName,
            decoration: const InputDecoration(
              labelText: '历史分组 / 项目名称',
              border: OutlineInputBorder(),
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
            label: const Text('批量导入图片'),
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
                  tooltip: '移除',
                  onPressed: () {
                    project.items.remove(item);
                    controller.changed('已移除图片');
                  },
                  icon: const Icon(Icons.close),
                ),
              ),
            ),
          if (project.items.isNotEmpty)
            FilledButton.tonal(
              onPressed: () => controller.setStep(BatchRedrawStep.params),
              child: Text('下一步 · 设置参数（${project.items.length} 张）'),
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
    final project = controller.project;
    final params = project.globalParams;
    return StudioContent(
      maxWidth: 880,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: controller.syncCurrentParams,
              icon: const Icon(Icons.sync),
              label: const Text('同步生图页参数'),
            ),
          ),
          _BatchParamsEditor(
            title: '全局生图参数',
            params: params,
            initiallyExpanded: true,
            onChanged: controller.changed,
          ),
          const SizedBox(height: 8),
          _BatchSlider(
            label: '全局变化强度',
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
            decoration: const InputDecoration(
              labelText: '全局风格提示词',
              border: OutlineInputBorder(),
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
            decoration: const InputDecoration(
              labelText: '全局负面提示词',
              border: OutlineInputBorder(),
            ),
            onChanged: (value) {
              project.globalNegative = value;
              controller.changed();
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('复用生图页当前参考图'),
            subtitle: Text(
                'Vibe ${controller.app.extras.vibeImages.length} · 精准参考 ${controller.app.extras.preciseReferences.length}'),
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
              label: const Text('复制生图页当前参考图到项目'),
            ),
            const SizedBox(height: 8),
            const _BatchReferenceEditor(),
          ],
          FilledButton.tonal(
            onPressed: project.items.isEmpty
                ? null
                : () => controller.setStep(BatchRedrawStep.prompts),
            child: const Text('下一步 · 编辑提示词'),
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
    final project = controller.project;
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: EdgeInsets.zero,
      title: const Text('项目参考图'),
      subtitle: Text(
        'Vibe ${project.vibeImages.length} · 精准参考 ${project.preciseReferences.length}',
      ),
      children: [
        for (var index = 0; index < project.vibeImages.length; index++)
          _BatchVibeRow(index: index),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () => _pick(context, precise: false),
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: const Text('添加 Vibe 参考图'),
          ),
        ),
        const Divider(height: 24),
        const Align(
          alignment: Alignment.centerLeft,
          child: Text('精准参考仅支持 V4.5，且图片必须匹配官方尺寸。'),
        ),
        for (var index = 0; index < project.preciseReferences.length; index++)
          _BatchPreciseRow(index: index),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () => _pick(context, precise: true),
            icon: const Icon(Icons.person_search_outlined),
            label: const Text('添加精准参考图'),
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
                  label: '信息提取',
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
                  label: '参考强度',
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
            tooltip: '移除',
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
                  decoration: const InputDecoration(labelText: '参考类型'),
                  items: const [
                    DropdownMenuItem(value: 'character', child: Text('角色')),
                    DropdownMenuItem(value: 'style', child: Text('风格')),
                    DropdownMenuItem(
                      value: 'character&style',
                      child: Text('角色和风格'),
                    ),
                  ],
                  onChanged: (value) => value == null
                      ? null
                      : controller.updatePreciseReference(index, type: value),
                ),
                _BatchSlider(
                  label: '参考强度',
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
                  label: '保真度',
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
            tooltip: '移除',
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
    final project = controller.project;
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
      children: [
        DropdownButtonFormField<ReversePromptMode>(
          value: project.aiMode,
          decoration: const InputDecoration(
            labelText: 'AI 反推模式',
            border: OutlineInputBorder(),
          ),
          items: ReversePromptMode.values
              .map((mode) =>
                  DropdownMenuItem(value: mode, child: Text(mode.label)))
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
                label: const Text('反推缺失提示词'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton(
                onPressed: controller.applyBulkPrompts,
                child: const Text('应用批量文本'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextFormField(
          initialValue: project.promptBulk,
          minLines: 3,
          maxLines: 8,
          decoration: const InputDecoration(
            labelText: '批量提示词（每行对应一张，可用 文件名|提示词）',
            border: OutlineInputBorder(),
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
          child: const Text('下一步 · 队列生成'),
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
              decoration: const InputDecoration(
                labelText: '本图提示词',
                border: OutlineInputBorder(),
              ),
              onChanged: (value) {
                item.prompt = value;
                controller.changed();
              },
            ),
            _BatchSlider(
              label: '本图强度',
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
              title: const Text('本图独立参数'),
              value: item.overrideParams,
              onChanged: (value) {
                item.overrideParams = value;
                if (value) item.params = project.globalParams.copy();
                controller.changed();
              },
            ),
            if (item.overrideParams)
              _BatchParamsEditor(
                title: '本图生图参数',
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
        ? 6
        : width >= 800
            ? 4
            : width >= 520
                ? 3
                : 2;
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('生成前预计扣费：${controller.quote(quoteTargets)} Anlas'),
                Text('余额：${controller.app.account.anlasBalance ?? '未知'} Anlas'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: controller.queueRunning || pending.isEmpty
                          ? null
                          : () => controller.startQueue(pending),
                      icon: const Icon(Icons.playlist_play),
                      label: Text('生成未生成（${pending.length}）'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: controller.queueRunning || selected.isEmpty
                          ? null
                          : () => controller.startQueue(selected),
                      icon: const Icon(Icons.refresh),
                      label: Text('重试选中（${selected.length}）'),
                    ),
                    OutlinedButton.icon(
                      onPressed: controller.exportZip,
                      icon: const Icon(Icons.archive_outlined),
                      label: const Text('导出 ZIP'),
                    ),
                  ],
                ),
                if (controller.queueRunning) ...[
                  const SizedBox(height: 8),
                  LinearProgressIndicator(
                    value: controller.queueTotal == 0
                        ? null
                        : controller.queueDone / controller.queueTotal,
                  ),
                  Row(
                    children: [
                      Expanded(
                          child: Text(
                              '${controller.queueDone}/${controller.queueTotal}')),
                      IconButton.filledTonal(
                        onPressed: controller.togglePause,
                        icon: Icon(controller.queuePaused
                            ? Icons.play_arrow
                            : Icons.pause),
                      ),
                      const SizedBox(width: 6),
                      IconButton.filled(
                        onPressed: controller.cancelQueue,
                        icon: const Icon(Icons.stop),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 0.68,
          ),
          itemCount: project.items.length,
          itemBuilder: (context, index) {
            final item = project.items[index];
            return Card(
              clipBehavior: Clip.antiAlias,
              margin: EdgeInsets.zero,
              child: InkWell(
                onTap: () {
                  item.selected = !item.selected;
                  controller.changed();
                },
                child: Column(
                  children: [
                    Expanded(
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          _BatchImage(item: item, output: true),
                          Positioned(
                            top: 3,
                            left: 3,
                            child: Checkbox(
                              value: item.selected,
                              onChanged: (value) {
                                item.selected = value ?? false;
                                controller.changed();
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(6),
                      child: Text('${index + 1} · ${item.status.name}',
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
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
        fit: BoxFit.cover,
        cacheWidth: 480,
        filterQuality: FilterQuality.low,
      );
    }
    if (!output || item.outputPath.isEmpty) {
      return Image.memory(
        base64Decode(item.base64),
        fit: BoxFit.cover,
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
  Widget build(BuildContext context) => ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        initiallyExpanded: initiallyExpanded,
        title: Text(title),
        children: [
          DropdownButtonFormField<String>(
            value: params.model,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: '模型',
              border: OutlineInputBorder(),
            ),
            items: naiModels
                .map((model) => DropdownMenuItem(
                      value: model.value,
                      child: Text(
                        model.label,
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
                      label: Text(size.label),
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
                  label: '宽度',
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
                  label: '高度',
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
            decoration: const InputDecoration(
              labelText: '采样器',
              border: OutlineInputBorder(),
            ),
            items: naiSamplers
                .map((sampler) => DropdownMenuItem(
                      value: sampler.value,
                      child: Text(sampler.label),
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
                      child: Text(option.label),
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
                      child: Text(option.label),
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
            label: 'Seed（0 = 随机）',
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
