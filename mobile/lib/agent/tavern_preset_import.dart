import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'tavern_models.dart';

class TavernPresetImportResult {
  final TavernSamplerPreset preset;
  final List<String> warnings;
  final int importedPromptCount;

  const TavernPresetImportResult({
    required this.preset,
    required this.warnings,
    required this.importedPromptCount,
  });
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

double _number(Object? value, double fallback, double min, double max) {
  final parsed = value is num ? value.toDouble() : double.tryParse('$value');
  return (parsed ?? fallback).clamp(min, max).toDouble();
}

String _fileName(String value) =>
    value.replaceFirst(RegExp(r'\.[^.]+$'), '').trim();

bool _hasExecutablePayload(String value) => RegExp(
      r'<script\b|<<\s*taskjs\s*>>|javascript\s*:|scheduledTasks|\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(',
      caseSensitive: false,
    ).hasMatch(value);

List<Map<String, dynamic>> _orderedRows(Map<String, dynamic> root) {
  final prompts =
      (root['prompts'] as List? ?? const []).map(_map).toList(growable: false);
  final orders = (root['prompt_order'] as List? ?? const []).map(_map);
  final candidates = orders
      .where(
          (item) => item['order'] is List && (item['order'] as List).isNotEmpty)
      .toList()
    ..sort((left, right) {
      int enabled(Map<String, dynamic> item) => (item['order'] as List)
          .map(_map)
          .where((row) => row['enabled'] == true)
          .length;
      return enabled(right).compareTo(enabled(left));
    });
  final selected = candidates.firstOrNull;
  if (selected == null) {
    return prompts.where((item) => item['enabled'] != false).toList();
  }
  final byId = <String, Map<String, dynamic>>{
    for (final item in prompts) '${item['identifier'] ?? ''}': item,
  };
  return (selected['order'] as List)
      .map(_map)
      .where((item) => item['enabled'] == true)
      .map((item) => byId['${item['identifier'] ?? ''}'])
      .whereType<Map<String, dynamic>>()
      .toList();
}

TavernPresetImportResult importTavernSamplerPresetJson(
  String source, {
  String fileName = 'preset.json',
}) {
  final root = _map(jsonDecode(source));
  final systemBlocks = <String>[];
  final warnings = <String>[];
  var jailbreak = '';
  var ignoredExecutable = 0;
  var ignoredPrefill = 0;
  for (final row in _orderedRows(root)) {
    final role = '${row['role'] ?? 'system'}'.toLowerCase();
    final identifier = '${row['identifier'] ?? ''}'.toLowerCase();
    final content = '${row['content'] ?? ''}'.trim();
    if (content.isEmpty || row['marker'] == true) continue;
    if (role == 'assistant') {
      ignoredPrefill++;
      continue;
    }
    if (role != 'system' && role != 'user') continue;
    if (_hasExecutablePayload(content)) {
      ignoredExecutable++;
      continue;
    }
    if (identifier == 'jailbreak') {
      jailbreak = content;
    } else {
      systemBlocks.add(content);
    }
  }
  if (ignoredExecutable > 0) {
    warnings.add('已忽略 $ignoredExecutable 个可执行脚本或任务块。');
  }
  if (ignoredPrefill > 0) {
    warnings.add('已忽略 $ignoredPrefill 个 assistant 预填充块。');
  }
  if (systemBlocks.isEmpty) warnings.add('未找到启用的 system 提示块。');
  final fallback = TavernSamplerPreset(name: _fileName(fileName));
  final maxOutput = root['openai_max_tokens'] ??
      root['max_tokens'] ??
      root['maxOutputTokens'];
  final stopValue =
      root['stop'] ?? root['stop_sequences'] ?? root['stopping_strings'];
  final stop = (stopValue is List
          ? stopValue
          : stopValue is String
              ? [stopValue]
              : const [])
      .whereType<String>()
      .where((item) => item.trim().isNotEmpty)
      .take(32)
      .map((item) => item.length > 2000 ? item.substring(0, 2000) : item)
      .toList();
  final system = systemBlocks.join('\n\n');
  final timestamp = tavernNow();
  final bytes = utf8.encode(source);
  return TavernPresetImportResult(
    preset: TavernSamplerPreset(
      id: tavernId('sampler'),
      name: '${root['name'] ?? root['preset_name'] ?? _fileName(fileName)}'
          .trim(),
      systemPrompt: system.isEmpty
          ? fallback.systemPrompt
          : (system.length > 200000 ? system.substring(0, 200000) : system),
      jailbreakPrompt: jailbreak.isEmpty
          ? fallback.jailbreakPrompt
          : (jailbreak.length > 100000
              ? jailbreak.substring(0, 100000)
              : jailbreak),
      temperature: _number(root['temperature'], fallback.temperature, 0, 2),
      topP: _number(root['top_p'] ?? root['topP'], fallback.topP, 0, 1),
      frequencyPenalty: _number(
          root['frequency_penalty'] ?? root['frequencyPenalty'], 0, -2, 2),
      presencePenalty: _number(
          root['presence_penalty'] ?? root['presencePenalty'], 0, -2, 2),
      maxOutputTokens: maxOutput == null
          ? null
          : _number(maxOutput, 4096, 128, 131072).round(),
      stop: stop,
      source: 'sillytavern-json',
      sourceName: fileName,
      sourceHash: sha256.convert(bytes).toString().toUpperCase(),
      createdAt: timestamp,
      updatedAt: timestamp,
    ),
    warnings: warnings,
    importedPromptCount: systemBlocks.length + (jailbreak.isEmpty ? 0 : 1),
  );
}
