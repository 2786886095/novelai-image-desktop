import 'dart:convert';

import 'package:flutter/services.dart';

import '../models/nai_models.dart';

class PromptTemplateLibrary {
  final Map<String, String> reverse;
  final Map<String, String> convert;
  final Map<String, String> scopedReverse;
  final Map<String, String> comic;
  final String comicLegacy;

  const PromptTemplateLibrary({
    this.reverse = const {},
    this.convert = const {},
    this.scopedReverse = const {},
    this.comic = const {},
    this.comicLegacy = '',
  });

  factory PromptTemplateLibrary.fromJson(Map<String, dynamic> json) {
    Map<String, String> readMap(String key) => (json[key] as Map? ?? const {})
        .map((key, value) => MapEntry(key.toString(), value.toString()));
    return PromptTemplateLibrary(
      reverse: readMap('reverse'),
      convert: readMap('convert'),
      scopedReverse: readMap('scopedReverse'),
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
}
