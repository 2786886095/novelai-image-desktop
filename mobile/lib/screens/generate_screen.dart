import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../state/app_state.dart';

class GenerateScreen extends StatelessWidget {
  const GenerateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('NovelAI 生成'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Text(
                state.account.hasToken
                    ? '${state.account.tierName ?? "已配置"} · ${state.account.anlasBalance ?? "—"}'
                    : '未配置',
                style: Theme.of(context).textTheme.labelMedium,
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: const [
          _ImagePreview(),
          SizedBox(height: 16),
          _PromptFields(),
          SizedBox(height: 8),
          _ParamControls(),
        ],
      ),
      bottomNavigationBar: const _RunBar(),
    );
  }
}

class _ImagePreview extends StatelessWidget {
  const _ImagePreview();

  @override
  Widget build(BuildContext context) {
    final current = context.select<AppState, HistoryItem?>((s) => s.current);
    final generating = context.select<AppState, bool>((s) => s.generating);
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (current != null && File(current.filePath).existsSync())
              Image.file(File(current.filePath), fit: BoxFit.contain)
            else
              const Center(child: Text('生成的图片会显示在这里')),
            if (generating)
              Container(
                color: Colors.black38,
                child: const Center(child: CircularProgressIndicator()),
              ),
          ],
        ),
      ),
    );
  }
}

class _PromptFields extends StatelessWidget {
  const _PromptFields();

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final params = context.watch<AppState>().params;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('正面提示词'),
        const SizedBox(height: 6),
        TextFormField(
          initialValue: params.positivePrompt,
          maxLines: 4,
          minLines: 2,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: '1girl, masterpiece, ...',
          ),
          onChanged: (v) => state.setParam((p) => p.positivePrompt = v),
        ),
        const SizedBox(height: 12),
        const Text('负面提示词'),
        const SizedBox(height: 6),
        TextFormField(
          initialValue: params.negativePrompt,
          maxLines: 3,
          minLines: 1,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'lowres, bad anatomy, ...',
          ),
          onChanged: (v) => state.setParam((p) => p.negativePrompt = v),
        ),
      ],
    );
  }
}

class _ParamControls extends StatelessWidget {
  const _ParamControls();

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final params = context.watch<AppState>().params;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          value: params.model,
          decoration: const InputDecoration(labelText: '模型', border: OutlineInputBorder()),
          isExpanded: true,
          items: naiModels
              .map((m) => DropdownMenuItem(value: m.value, child: Text(m.label, overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (v) => v != null ? state.setParam((p) => p.model = v) : null,
        ),
        const SizedBox(height: 12),
        const Text('尺寸'),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: sizePresets.map((s) {
            final selected = params.width == s.width && params.height == s.height;
            return ChoiceChip(
              label: Text(s.label),
              selected: selected,
              onSelected: (_) => state.setParam((p) {
                p.width = s.width;
                p.height = s.height;
              }),
            );
          }).toList(),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: params.sampler,
          decoration: const InputDecoration(labelText: '采样器', border: OutlineInputBorder()),
          isExpanded: true,
          items: naiSamplers
              .map((s) => DropdownMenuItem(value: s.value, child: Text(s.label, overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (v) => v != null ? state.setParam((p) => p.sampler = v) : null,
        ),
        const SizedBox(height: 16),
        _SliderRow(
          label: 'Steps（步数）',
          value: params.steps.toDouble(),
          min: 1,
          max: 50,
          divisions: 49,
          display: '${params.steps}',
          onChanged: (v) => state.setParam((p) => p.steps = v.round()),
        ),
        _SliderRow(
          label: 'CFG Scale（提示词相关度）',
          value: params.cfgScale,
          min: 0,
          max: 10,
          divisions: 40,
          display: params.cfgScale.toStringAsFixed(1),
          onChanged: (v) => state.setParam((p) => p.cfgScale = double.parse(v.toStringAsFixed(1))),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextFormField(
                key: ValueKey('seed-${params.seed}'),
                initialValue: params.seed == 0 ? '' : '${params.seed}',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Seed（0 = 随机）',
                  border: OutlineInputBorder(),
                ),
                onChanged: (v) => state.setParam((p) => p.seed = int.tryParse(v) ?? 0),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _BatchField(),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('质量标签（Quality Toggle）'),
          value: params.qualityToggle,
          onChanged: (v) => state.setParam((p) => p.qualityToggle = v),
        ),
      ],
    );
  }
}

class _BatchField extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final batch = context.select<AppState, int>((s) => s.batchCount);
    return TextFormField(
      key: ValueKey('batch-$batch'),
      initialValue: '$batch',
      keyboardType: TextInputType.number,
      decoration: const InputDecoration(
        labelText: '批量数量',
        border: OutlineInputBorder(),
      ),
      onChanged: (v) => state.setBatchCount(int.tryParse(v) ?? 1),
    );
  }
}

class _SliderRow extends StatelessWidget {
  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final String display;
  final ValueChanged<double> onChanged;

  const _SliderRow({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.display,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label),
            Text(display, style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          divisions: divisions,
          label: display,
          onChanged: onChanged,
        ),
      ],
    );
  }
}

class _RunBar extends StatelessWidget {
  const _RunBar();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(state.status, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 6),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: state.generating
                    ? state.cancel
                    : (state.account.hasToken ? state.generate : null),
                icon: Icon(state.generating ? Icons.stop : Icons.play_arrow),
                label: Text(
                  state.generating
                      ? '停止'
                      : (state.batchCount > 1 ? '批量生成 ${state.batchCount} 张' : '生成'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
