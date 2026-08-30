import 'dart:convert';

import 'package:flutter/services.dart';

import '../models/nai_models.dart';

class PromptTemplateLibrary {
  final Map<String, String> reverse;
  final Map<String, String> reverseV45;
  final Map<String, String> convert;
  final Map<String, String> scopedReverse;
  final Map<String, String> scopedReverseV45;
  final Map<String, String> comic;
  final String comicLegacy;

  const PromptTemplateLibrary({
    this.reverse = const {},
    this.reverseV45 = const {},
    this.convert = const {},
    this.scopedReverse = const {},
    this.scopedReverseV45 = const {},
    this.comic = const {},
    this.comicLegacy = '',
  });

  factory PromptTemplateLibrary.fromJson(Map<String, dynamic> json) {
    Map<String, String> readMap(String key) => (json[key] as Map? ?? const {})
        .map((key, value) => MapEntry(key.toString(), value.toString()));
    return PromptTemplateLibrary(
      reverse: readMap('reverse'),
      reverseV45: readMap('reverseV45'),
      convert: readMap('convert'),
      scopedReverse: readMap('scopedReverse'),
      scopedReverseV45: readMap('scopedReverseV45'),
      comic: readMap('comic'),
      comicLegacy: json['comicLegacy']?.toString() ?? '',
    );
  }

  static Future<PromptTemplateLibrary> load() async {
    final raw = await rootBundle.loadString('assets/prompt_templates.json');
    return PromptTemplateLibrary.fromJson(
        jsonDecode(raw) as Map<String, dynamic>);
  }

  String get(String kind, ReversePromptMode mode) {
    final key = mode.value;
    return switch (kind) {
      'reverse' => reverse[key] ?? '',
      'scopedReverse' => scopedReverse[key] ?? reverse[key] ?? '',
      'convert' => convert[key] ?? '',
      'comic' => comic[key] ?? comicLegacy,
      _ => '',
    };
  }

  String getReverse(
    ReversePromptMode mode, {
    required bool scoped,
    required String templateVersion,
  }) {
    final key = mode.value;
    if (templateVersion == 'v4.5') {
      return scoped
          ? scopedReverseV45[key] ?? reverseV45[key] ?? ''
          : reverseV45[key] ?? scopedReverseV45[key] ?? '';
    }
    return scoped
        ? scopedReverse[key] ?? reverse[key] ?? ''
        : reverse[key] ?? scopedReverse[key] ?? '';
  }
}
