import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../comic/comic_controller.dart';
import '../comic/comic_models.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';

class ComicScreen extends StatelessWidget {
  final ComicController? controller;
  final VoidCallback? onBack;
  const ComicScreen({super.key, this.controller, this.onBack});

  @override
  Widget build(BuildContext context) {
    final value = controller;
    if (value != null) {
      return ChangeNotifierProvider.value(
        value: value,
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
    if (!controller.loaded) {
      return const Scaffold(body: Center(child: Text('正在加载漫画项目...')));
    }
    final project = controller.project;
    return Scaffold(
      appBar: AppBar(
        leading: onBack == null
            ? null
            : IconButton(
                tooltip: '返回工具',
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back),
              ),
        title: Text(project.title.trim().isEmpty ? '漫画生成器' : project.title),
      ),
      body: Column(
        children: [
          _StepBar(controller: controller),
          Expanded(
            child: switch (controller.step) {
              ComicStep.story => const _StoryStep(),
              ComicStep.global => const _GlobalStep(),
              ComicStep.panels => const _PanelsStep(),
              ComicStep.generate => const _GenerateStep(),
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
                      child: Text(
                        controller.status,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
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

class _StepBar extends StatelessWidget {
  final ComicController controller;
  const _StepBar({required this.controller});

  @override
  Widget build(BuildContext context) {
    const labels = ['故事', '全局设定', '分镜', '生成'];
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
      child: Row(
        children: [
          for (var index = 0; index < ComicStep.values.length; index++) ...[
            if (index > 0) const SizedBox(width: 6),
            Expanded(
              child: Material(
                color: controller.step.index == index
                    ? Theme.of(context).colorScheme.primaryContainer
                    : Theme.of(context).colorScheme.surfaceContainer,
                borderRadius: BorderRadius.circular(8),
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () => controller.setStep(ComicStep.values[index]),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${index + 1}',
                            style:
                                const TextStyle(fontWeight: FontWeight.bold)),
                        Text(labels[index],
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StoryStep extends StatelessWidget {
  const _StoryStep();

  Future<void> _pickReference(BuildContext context) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked == null || !context.mounted) return;
    final error =
        await context.read<ComicController>().addReference(picked.path);
    if (error != null && context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
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
                onPressed: controller.createNewProject,
                icon: const Icon(Icons.note_add_outlined),
                label: const Text('新建项目'),
              ),
              OutlinedButton.icon(
                onPressed:
                    project.panels.isEmpty ? null : controller.clearPanels,
                icon: const Icon(Icons.playlist_remove),
                label: const Text('清空分镜'),
              ),
              OutlinedButton.icon(
                onPressed: controller.exportProjectJson,
                icon: const Icon(Icons.save_alt),
                label: const Text('另存项目 JSON'),
              ),
              OutlinedButton.icon(
                onPressed: controller.importProjectJson,
                icon: const Icon(Icons.file_open_outlined),
                label: const Text('导入项目 JSON'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: ValueKey('comic-title-${project.id}'),
            initialValue: project.title,
            decoration: const InputDecoration(
              labelText: '漫画项目名称',
              border: OutlineInputBorder(),
            ),
            onChanged: (value) {
              project.title = value;
              controller.changed();
            },
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<ReversePromptMode>(
                  value: project.mode,
                  decoration: const InputDecoration(
                    labelText: '提示词模式',
                    border: OutlineInputBorder(),
                  ),
                  items: ReversePromptMode.values
                      .map((mode) => DropdownMenuItem(
                            value: mode,
                            child: Text(mode.label),
                          ))
                      .toList(),
                  onChanged: (value) {
                    if (value == null) return;
                    project.mode = value;
                    controller.changed();
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextFormField(
                  key: ValueKey('panel-count-${project.id}'),
                  initialValue: project.desiredPanelCount == 0
                      ? ''
                      : '${project.desiredPanelCount}',
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: '分镜数量（空 = 自动）',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (value) {
                    project.desiredPanelCount =
                        (int.tryParse(value) ?? 0).clamp(0, 500);
                    controller.changed();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: ValueKey('comic-script-${project.id}'),
            initialValue: project.rawScript,
            minLines: 10,
            maxLines: 20,
            decoration: const InputDecoration(
              labelText: '故事 / 剧情 / 已有分镜',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
            onChanged: (value) {
              project.rawScript = value;
              controller.changed();
            },
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Expanded(
                child: Text('参考图',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ),
              OutlinedButton.icon(
                onPressed: () => _pickReference(context),
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: const Text('导入'),
              ),
            ],
          ),
          for (final reference in project.references)
            _ComicReferenceCard(reference: reference),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: controller.busy || project.rawScript.trim().isEmpty
                ? null
                : controller.analyzeStory,
            icon: const Icon(Icons.auto_fix_high),
            label: const Text('AI 拆分分镜'),
          ),
        ],
      ),
    );
  }
}

class _ComicReferenceCard extends StatelessWidget {
  final ComicReference reference;
  const _ComicReferenceCard({required this.reference});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    return Card(
      margin: const EdgeInsets.only(top: 10),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: SizedBox.square(
                    dimension: 76,
                    child: reference.sourcePath.isNotEmpty &&
                            File(reference.sourcePath).existsSync()
                        ? Image.file(
                            File(reference.sourcePath),
                            fit: BoxFit.cover,
                            cacheWidth: 180,
                            filterQuality: FilterQuality.low,
                          )
                        : Image.memory(
                            base64Decode(reference.base64),
                            fit: BoxFit.cover,
                            cacheWidth: 180,
                            filterQuality: FilterQuality.low,
                          ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(reference.name,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 6),
                      DropdownButtonFormField<String>(
                        value: reference.kind,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: '用途',
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(
                              value: 'character', child: Text('角色精准参考')),
                          DropdownMenuItem(
                              value: 'scene', child: Text('场景精准参考')),
                          DropdownMenuItem(
                              value: 'object', child: Text('物品精准参考')),
                          DropdownMenuItem(
                              value: 'precise', child: Text('角色和风格精准参考')),
                          DropdownMenuItem(
                              value: 'vibe', child: Text('Vibe 氛围迁移')),
                        ],
                        onChanged: (value) {
                          if (value == null) return;
                          reference.kind = value;
                          controller.changed();
                        },
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: '移除',
                  onPressed: () => controller.removeReference(reference.id),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: reference.scope,
              decoration: const InputDecoration(
                labelText: '反推范围',
                border: OutlineInputBorder(),
              ),
              items: ReversePromptScope.values
                  .map((scope) => DropdownMenuItem(
                        value: scope.value,
                        child: Text(scope.label),
                      ))
                  .toList(),
              onChanged: (value) {
                if (value == null) return;
                reference.scope = value;
                controller.changed();
              },
            ),
            const SizedBox(height: 8),
            TextFormField(
              initialValue: reference.subjectHint,
              decoration: const InputDecoration(
                labelText: '对应说明 / 主体提示',
                hintText: '例如：这是主角变身后的角色',
                border: OutlineInputBorder(),
              ),
              onChanged: (value) {
                reference.subjectHint = value;
                controller.changed();
              },
            ),
            const SizedBox(height: 8),
            TextFormField(
              initialValue: reference.reversePrompt,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: '反推结果',
                border: OutlineInputBorder(),
              ),
              onChanged: (value) {
                reference.reversePrompt = value;
                controller.changed();
              },
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('参与最终生图'),
              subtitle: Text('${reference.width}x${reference.height}'),
              value: reference.useForGeneration,
              onChanged: (value) {
                reference.useForGeneration = value;
                controller.changed();
              },
            ),
            FilledButton.tonalIcon(
              onPressed: controller.busy
                  ? null
                  : () => controller.reverseReference(reference),
              icon: const Icon(Icons.visibility_outlined),
              label: const Text('AI 反推这张参考图'),
            ),
          ],
        ),
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
    return StudioContent(
      maxWidth: 980,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: OutlinedButton.icon(
              onPressed: controller.syncCurrentParams,
              icon: const Icon(Icons.sync),
              label: const Text('同步当前生图参数'),
            ),
          ),
          _ProjectTextField(
            label: '全局故事设定',
            value: project.globalPrompt,
            minLines: 6,
            onChanged: (value) => project.globalPrompt = value,
          ),
          _ProjectTextField(
            label: '全局角色 / 场景 / 物品设定',
            value: project.globalCharacterSetting,
            minLines: 8,
            onChanged: (value) => project.globalCharacterSetting = value,
          ),
          _ProjectTextField(
            label: '全局风格提示词',
            value: project.globalStylePrompt,
            minLines: 3,
            onChanged: (value) => project.globalStylePrompt = value,
          ),
          _ProjectTextField(
            label: '全局负面提示词',
            value: project.globalNegativePrompt,
            minLines: 3,
            onChanged: (value) => project.globalNegativePrompt = value,
          ),
          _ComicParamsEditor(
            title: '全局生图参数',
            params: project.globalParams,
            onChanged: controller.changed,
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: project.panels.isEmpty
                ? null
                : () => controller.setStep(ComicStep.panels),
            icon: const Icon(Icons.view_sidebar_outlined),
            label: Text('进入分镜编辑（${project.panels.length} 格）'),
          ),
        ],
      ),
    );
  }
}

class _ProjectTextField extends StatelessWidget {
  final String label;
  final String value;
  final int minLines;
  final ValueChanged<String> onChanged;
  const _ProjectTextField({
    required this.label,
    required this.value,
    required this.minLines,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          initialValue: value,
          minLines: minLines,
          maxLines: minLines + 6,
          decoration: InputDecoration(
            labelText: label,
            alignLabelWithHint: true,
            border: const OutlineInputBorder(),
          ),
          onChanged: (value) {
            onChanged(value);
            context.read<ComicController>().changed();
          },
        ),
      );
}

class _PanelsStep extends StatelessWidget {
  const _PanelsStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final panels = controller.project.panels;
    if (panels.isEmpty) {
      return const Center(child: Text('还没有分镜，请先在第 1 步拆分故事'));
    }
    final phone = MediaQuery.sizeOf(context).width < StudioBreakpoints.tablet;
    return Column(
      children: [
        _PanelActions(controller: controller),
        if (phone) _HorizontalPanelPicker(controller: controller),
        Expanded(
          child: phone
              ? _PanelEditor(panel: controller.activePanel ?? panels.first)
              : Row(
                  children: [
                    SizedBox(
                      width: 220,
                      child: _VerticalPanelPicker(controller: controller),
                    ),
                    const VerticalDivider(width: 1),
                    Expanded(
                      child: _PanelEditor(
                          panel: controller.activePanel ?? panels.first),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _PanelActions extends StatelessWidget {
  final ComicController controller;
  const _PanelActions({required this.controller});

  @override
  Widget build(BuildContext context) {
    final targets = controller.selectedPanels.isEmpty
        ? controller.project.panels
        : controller.selectedPanels;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      child: Row(
        children: [
          FilledButton.tonal(
            onPressed: controller.busy
                ? null
                : () => controller.convertPanels(targets),
            child: Text(controller.selectedPanels.isEmpty ? '转换全部' : '转换选中'),
          ),
          const SizedBox(width: 6),
          OutlinedButton(
            onPressed: controller.busy ? null : controller.checkConsistency,
            child: const Text('AI 一致性检测'),
          ),
          const SizedBox(width: 6),
          OutlinedButton(
            onPressed: () {
              final index = controller.project.panels.length + 1;
              final panel = ComicPanel(
                id: DateTime.now().microsecondsSinceEpoch.toString(),
                index: index,
                params: controller.project.globalParams.copy(),
              );
              controller.project.panels.add(panel);
              controller.activePanelId = panel.id;
              controller.changed('已新增分镜 #$index');
            },
            child: const Text('新增分镜'),
          ),
          const SizedBox(width: 6),
          OutlinedButton(
            onPressed: () {
              controller.selectedPanelIds =
                  controller.project.panels.map((panel) => panel.id).toSet();
              controller.changed();
            },
            child: const Text('全选'),
          ),
          const SizedBox(width: 6),
          TextButton(
            onPressed: () {
              controller.selectedPanelIds.clear();
              controller.changed();
            },
            child: const Text('清空选择'),
          ),
        ],
      ),
    );
  }
}

class _HorizontalPanelPicker extends StatelessWidget {
  final ComicController controller;
  const _HorizontalPanelPicker({required this.controller});

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 52,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          itemCount: controller.project.panels.length,
          separatorBuilder: (_, __) => const SizedBox(width: 6),
          itemBuilder: (context, index) {
            final panel = controller.project.panels[index];
            return ChoiceChip(
              selected: controller.activePanelId == panel.id,
              label: Text('#${panel.index} · ${panel.status.label}'),
              onSelected: (_) {
                controller.activePanelId = panel.id;
                controller.changed();
              },
            );
          },
        ),
      );
}

class _VerticalPanelPicker extends StatelessWidget {
  final ComicController controller;
  const _VerticalPanelPicker({required this.controller});

  @override
  Widget build(BuildContext context) => ListView.builder(
        padding: const EdgeInsets.all(8),
        itemCount: controller.project.panels.length,
        itemBuilder: (context, index) {
          final panel = controller.project.panels[index];
          return ListTile(
            selected: controller.activePanelId == panel.id,
            leading: Checkbox(
              value: controller.selectedPanelIds.contains(panel.id),
              onChanged: (checked) {
                checked == true
                    ? controller.selectedPanelIds.add(panel.id)
                    : controller.selectedPanelIds.remove(panel.id);
                controller.changed();
              },
            ),
            title: Text('#${panel.index}'),
            subtitle: Text(panel.status.label),
            onTap: () {
              controller.activePanelId = panel.id;
              controller.changed();
            },
          );
        },
      );
}

class _PanelEditor extends StatelessWidget {
  final ComicPanel panel;
  const _PanelEditor({required this.panel});

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    return ListView(
      key: ValueKey('panel-editor-${panel.id}'),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 120),
      children: [
        Row(
          children: [
            Checkbox(
              value: controller.selectedPanelIds.contains(panel.id),
              onChanged: (checked) {
                checked == true
                    ? controller.selectedPanelIds.add(panel.id)
                    : controller.selectedPanelIds.remove(panel.id);
                controller.changed();
              },
            ),
            Expanded(
              child: Text('分镜 #${panel.index}',
                  style: Theme.of(context).textTheme.titleMedium),
            ),
            Chip(label: Text(panel.status.label)),
            IconButton(
              tooltip: '删除分镜',
              onPressed: () {
                controller.project.panels
                    .removeWhere((item) => item.id == panel.id);
                for (var index = 0;
                    index < controller.project.panels.length;
                    index++) {
                  controller.project.panels[index].index = index + 1;
                }
                controller.activePanelId = controller.project.panels.isEmpty
                    ? ''
                    : controller.project.panels.first.id;
                controller.changed('已删除分镜');
              },
              icon: const Icon(Icons.delete_outline),
            ),
          ],
        ),
        if (panel.outputPath.isNotEmpty &&
            File(panel.outputPath).existsSync()) ...[
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 360),
            child: Image.file(File(panel.outputPath), fit: BoxFit.contain),
          ),
          const SizedBox(height: 10),
        ],
        TextFormField(
          initialValue: panel.cnPrompt,
          minLines: 5,
          maxLines: 10,
          decoration: const InputDecoration(
            labelText: '中文分镜描述',
            alignLabelWithHint: true,
            border: OutlineInputBorder(),
          ),
          onChanged: (value) {
            panel.cnPrompt = value;
            controller.changed();
          },
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: controller.busy
                    ? null
                    : () => controller.translatePanel(panel, toEnglish: true),
                icon: const Icon(Icons.translate),
                label: const Text('直译为英文'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: controller.busy || panel.enPrompt.trim().isEmpty
                    ? null
                    : () => controller.translatePanel(panel, toEnglish: false),
                icon: const Icon(Icons.translate),
                label: const Text('回译为中文'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextFormField(
          initialValue: panel.enPrompt,
          minLines: 5,
          maxLines: 10,
          decoration: const InputDecoration(
            labelText: '英文生图提示词',
            alignLabelWithHint: true,
            border: OutlineInputBorder(),
          ),
          onChanged: (value) {
            panel
              ..enPrompt = value
              ..status = value.trim().isEmpty
                  ? ComicPanelStatus.draft
                  : ComicPanelStatus.converted;
            controller.changed();
          },
        ),
        const SizedBox(height: 10),
        TextFormField(
          initialValue: panel.localNegativePrompt,
          minLines: 2,
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: '本分镜负面提示词',
            border: OutlineInputBorder(),
          ),
          onChanged: (value) {
            panel.localNegativePrompt = value;
            controller.changed();
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('覆盖全局负面词'),
          subtitle: const Text('关闭时追加到全局负面提示词'),
          value: panel.overrideNegative,
          onChanged: (value) {
            panel.overrideNegative = value;
            controller.changed();
          },
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('本分镜独立生图参数'),
          value: panel.overrideParams,
          onChanged: (value) {
            panel.overrideParams = value;
            if (value) panel.params = controller.project.globalParams.copy();
            controller.changed();
          },
        ),
        if (panel.overrideParams)
          _ComicParamsEditor(
            title: '本分镜生图参数',
            params: panel.params,
            onChanged: controller.changed,
          ),
        if (panel.error.isNotEmpty)
          Text(panel.error,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: controller.busy
                    ? null
                    : () => controller.convertPanels([panel]),
                child: const Text('转换本张'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                onPressed: controller.busy || controller.queueRunning
                    ? null
                    : () => controller.startQueue([panel]),
                child: Text(panel.outputPath.isEmpty ? '生成本张' : '重试本张'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ComicParamsEditor extends StatelessWidget {
  final String title;
  final GenerateParams params;
  final VoidCallback onChanged;

  const _ComicParamsEditor({
    required this.title,
    required this.params,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
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
                        child: Text(model.label,
                            maxLines: 1, overflow: TextOverflow.ellipsis),
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
              spacing: 6,
              runSpacing: 6,
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
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _ComicNumberField(
                  label: '宽度',
                  value: params.width,
                  onChanged: (value) {
                    params.width = _snapComicDimension(value);
                    onChanged();
                  },
                ),
                _ComicNumberField(
                  label: '高度',
                  value: params.height,
                  onChanged: (value) {
                    params.height = _snapComicDimension(value);
                    onChanged();
                  },
                ),
                _ComicNumberField(
                  label: 'Seed（0=随机）',
                  value: params.seedMode == 'random' ? 0 : params.seed,
                  onChanged: (value) {
                    params
                      ..seed = value.clamp(0, 2147483647)
                      ..seedMode = value > 0 ? 'fixed' : 'random';
                    onChanged();
                  },
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
            _ComicSlider(
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
            _ComicSlider(
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
            _ComicSlider(
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
        ),
      ),
    );
  }
}

int _snapComicDimension(int value) {
  final bounded = value.clamp(64, 1600);
  return ((bounded / 64).round() * 64).clamp(64, 1600);
}

class _ComicNumberField extends StatefulWidget {
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  const _ComicNumberField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  State<_ComicNumberField> createState() => _ComicNumberFieldState();
}

class _ComicNumberFieldState extends State<_ComicNumberField> {
  late final TextEditingController controller;
  late final FocusNode focusNode;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '${widget.value}');
    focusNode = FocusNode()..addListener(_syncAfterEditing);
  }

  @override
  void didUpdateWidget(covariant _ComicNumberField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!focusNode.hasFocus && controller.text != '${widget.value}') {
      controller.text = '${widget.value}';
    }
  }

  void _syncAfterEditing() {
    if (!focusNode.hasFocus && controller.text != '${widget.value}') {
      controller.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    focusNode
      ..removeListener(_syncAfterEditing)
      ..dispose();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 180,
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(
            labelText: widget.label,
            border: const OutlineInputBorder(),
          ),
          onChanged: (raw) {
            final parsed = int.tryParse(raw);
            if (parsed != null) widget.onChanged(parsed);
          },
        ),
      );
}

class _ComicSlider extends StatelessWidget {
  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final ValueChanged<double> onChanged;
  const _ComicSlider({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Row(
        children: [
          SizedBox(width: 50, child: Text(label)),
          Expanded(
            child: Slider(
              value: value.clamp(min, max),
              min: min,
              max: max,
              divisions: divisions,
              label: value.toStringAsFixed(_digits),
              onChanged: onChanged,
            ),
          ),
          SizedBox(
            width: 38,
            child: Text(value.toStringAsFixed(_digits)),
          ),
        ],
      );

  int get _digits => label == 'Steps'
      ? 0
      : label.contains('Rescale')
          ? 2
          : 1;
}

class _GenerateStep extends StatelessWidget {
  const _GenerateStep();

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ComicController>();
    final project = controller.project;
    final selected = controller.selectedPanels;
    final ungenerated =
        project.panels.where((panel) => panel.outputPath.isEmpty).toList();
    // Panels that were never converted to an English prompt and aren't generated
    // yet. Generating them falls back to the Chinese prompt (see generateOne).
    final unconverted = project.panels
        .where((panel) =>
            panel.outputPath.isEmpty && panel.enPrompt.trim().isEmpty)
        .toList();
    final quoteTargets = selected.isNotEmpty ? selected : ungenerated;
    final width = MediaQuery.sizeOf(context).width;
    final columns = width >= 1180
        ? 6
        : width >= 800
            ? 4
            : width >= 520
                ? 3
                : 2;
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 120),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('生成前预计扣费：${controller.quotePanels(quoteTargets)} Anlas'),
                Text(
                    '当前余额：${controller.app.account.anlasBalance ?? '未知'} Anlas'),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('生成全部后自动导出 ZIP'),
                  value: project.autoExportZip,
                  onChanged: (value) {
                    project.autoExportZip = value;
                    controller.changed();
                  },
                ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    FilledButton.icon(
                      onPressed: controller.queueRunning || ungenerated.isEmpty
                          ? null
                          : () => controller.startQueue(ungenerated),
                      icon: const Icon(Icons.playlist_play),
                      label: Text('生成未生成（${ungenerated.length}）'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: controller.queueRunning || unconverted.isEmpty
                          ? null
                          : () => controller.startQueue(unconverted),
                      icon: const Icon(Icons.auto_fix_high),
                      label: Text('生成未转换分镜（${unconverted.length}）'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: controller.queueRunning || selected.isEmpty
                          ? null
                          : () => controller.startQueue(selected),
                      icon: const Icon(Icons.refresh),
                      label: Text('重试选中（${selected.length}）'),
                    ),
                    OutlinedButton.icon(
                      onPressed: controller.exportComicZip,
                      icon: const Icon(Icons.archive_outlined),
                      label: const Text('导出漫画 ZIP'),
                    ),
                  ],
                ),
                if (controller.queueRunning) ...[
                  const SizedBox(height: 10),
                  LinearProgressIndicator(
                    value: controller.queueTotal == 0
                        ? null
                        : controller.queueDone / controller.queueTotal,
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '生成中 ${controller.queueDone}/${controller.queueTotal}',
                        ),
                      ),
                      IconButton.filledTonal(
                        tooltip: controller.queuePaused ? '继续' : '暂停',
                        onPressed: controller.toggleQueuePause,
                        icon: Icon(controller.queuePaused
                            ? Icons.play_arrow
                            : Icons.pause),
                      ),
                      const SizedBox(width: 6),
                      IconButton.filled(
                        tooltip: '取消',
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
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 0.62,
          ),
          itemCount: project.panels.length,
          itemBuilder: (context, index) {
            final panel = project.panels[index];
            final checked = controller.selectedPanelIds.contains(panel.id);
            return Card(
              clipBehavior: Clip.antiAlias,
              margin: EdgeInsets.zero,
              child: InkWell(
                onTap: () {
                  checked
                      ? controller.selectedPanelIds.remove(panel.id)
                      : controller.selectedPanelIds.add(panel.id);
                  controller.changed();
                },
                child: Column(
                  children: [
                    Expanded(
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (panel.outputPath.isNotEmpty &&
                              File(panel.outputPath).existsSync())
                            Image.file(
                              File(panel.outputPath),
                              fit: BoxFit.cover,
                              cacheWidth: 420,
                              filterQuality: FilterQuality.low,
                            )
                          else
                            const ColoredBox(
                              color: Colors.black12,
                              child: Icon(Icons.image_outlined),
                            ),
                          Positioned(
                            top: 4,
                            left: 4,
                            child: Checkbox(
                              value: checked,
                              onChanged: (_) {
                                checked
                                    ? controller.selectedPanelIds
                                        .remove(panel.id)
                                    : controller.selectedPanelIds.add(panel.id);
                                controller.changed();
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(6),
                      child: Column(
                        children: [
                          Text('#${panel.index} · ${panel.status.label}',
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          if (panel.actualAnlas != null)
                            Text('实扣 ${panel.actualAnlas} Anlas',
                                style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
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
