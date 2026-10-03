import 'dart:convert';

import 'package:flutter/services.dart';

import '../models/nai_models.dart';

class PromptTemplateLibrary {
  final Map<String, String> reverse;
  final Map<String, String> reverseV45;
  final Map<String, String> convert;
  final Map<String, String> convertV45;
  final Map<String, String> scopedReverse;
  final Map<String, String> scopedReverseV45;
  final Map<String, String> comic;
  final String comicLegacy;
  final Map<String, List<String>> legacyPure;
  final Map<String, String> modeSuffix;
  final Map<String, String> promptEditDefaults;

  const PromptTemplateLibrary({
    this.reverse = const {},
    this.reverseV45 = const {},
    this.convert = const {},
    this.convertV45 = const {},
    this.scopedReverse = const {},
    this.scopedReverseV45 = const {},
    this.comic = const {},
    this.comicLegacy = '',
    this.legacyPure = const {},
    this.modeSuffix = const {},
    this.promptEditDefaults = const {},
  });

  factory PromptTemplateLibrary.fromJson(Map<String, dynamic> json) {
    Map<String, String> readMap(String key) => (json[key] as Map? ?? const {})
        .map((key, value) => MapEntry(key.toString(), value.toString()));
    return PromptTemplateLibrary(
      reverse: readMap('reverse'),
      reverseV45: readMap('reverseV45'),
      convert: readMap('convert'),
      convertV45: readMap('convertV45'),
      scopedReverse: readMap('scopedReverse'),
      scopedReverseV45: readMap('scopedReverseV45'),
      comic: readMap('comic'),
      comicLegacy: json['comicLegacy']?.toString() ?? '',
      legacyPure: (json['legacyPure'] as Map? ?? const {}).map((k,v)=>MapEntry(k.toString(),(v as List).cast<String>())),
      modeSuffix: readMap('modeSuffix'),
      promptEditDefaults: readMap('promptEditDefaults'),
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
      'convertV45' => convertV45[key] ?? '',
      'comic' => comic[key] ?? comicLegacy,
      _ => '',
    };
  }

  String derive(String mixed,ReversePromptMode mode) {
    if(mode==ReversePromptMode.mixed)return mixed;
    // Match desktop format-only derivation; retain facts sharing a ratio line.
    final ratio=RegExp(r'(?:Danbooru\s*(?:\/\s*NovelAI\s*)?Tag|NovelAI\s*Tag|Tag|自然语言)\s*(?:保持|占|比例)?\s*(?:约)?\s*\d+(?:\s*[–—-]\s*\d+)?\s*[%％]|(?:约\s*)?\d+(?:\s*[–—-]\s*\d+)?\s*[%％]\s*(?:(?:英文|简短|简洁)\s*)*(?:Danbooru\s*(?:\/\s*NovelAI\s*)?Tag|NovelAI\s*Tag|Tag|自然语言)',caseSensitive:false);
    final filtered=mixed.split('\n').map((line){
      final stripped=line.replaceAll(ratio,'').replaceAll(RegExp(r'「[\s+＋]*」的混合提示词'),(mode==ReversePromptMode.tags?'纯 Tag':'纯自然语言')+'提示词');
      if(RegExp(r'^[\s+＋，,；;。.\[\]x]*$',caseSensitive:false).hasMatch(stripped)||RegExp(r'^\s*prompt\s+使用[\s+＋，,；;。.]*$',caseSensitive:false).hasMatch(stripped))return '';
      return stripped.replaceFirstMapped(RegExp(r'^(\s*(?:\[[ x]\]\s*)?)[，,；;]+\s*',caseSensitive:false),(m)=>m.group(1)!);
    }).join('\n').trimRight();
    final safeguards='\n同一层级互斥项必须排除；base 全局取景与角色局部朝向、回头或注视不视为互斥。人数上限遵循所选模型和原模板，不因派生模式放宽。'+(RegExp(r'NovelAI (?:Diffusion )?V5').hasMatch(mixed)?'V5 Full 最多 22 个角色段，base 人数与角色段一致。':'');
    // modeSuffix is serialized by the desktop derivation and includes its empty-source common guards.
    final suffix=modeSuffix[mode.value]??'';
    const emptyGuards='\n同一层级互斥项必须排除；base 全局取景与角色局部朝向、回头或注视不视为互斥。人数上限遵循所选模型和原模板，不因派生模式放宽。';
    return filtered+safeguards+(suffix.startsWith(emptyGuards)?suffix.substring(emptyGuards.length):suffix);
  }

  String resolve(String kind,ReversePromptMode mode,Map<String,String> overrides,{required String templateVersion,bool scoped=false,String fallback=''}) {
    final saved=overrides[mode.value]?.trim()??'';
    String norm(String text)=>text.trim().replaceAll('\r\n','\n');
    final shipped=(legacyPure['$kind.${mode.value}']??[]).any((old)=>norm(old)==norm(saved));
    if(saved.isNotEmpty&&(mode==ReversePromptMode.mixed||!shipped))return saved;
    if(saved.isEmpty&&fallback.trim().isNotEmpty)return fallback;
    final mixed=overrides['mixed']?.trim();
    final base=(mixed?.isNotEmpty??false)?mixed!:kind=='reverse'?getReverse(ReversePromptMode.mixed,scoped:scoped,templateVersion:templateVersion):get(templateVersion=='v4.5'?'convertV45':'convert',ReversePromptMode.mixed);
    return derive(base,mode);
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
