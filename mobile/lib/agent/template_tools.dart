import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../state/app_state.dart';
import '../models/nai_models.dart';
import '../prompts/prompt_templates.dart';

class AgentTemplateTools {
  static final _writes = Expando<Future<void>>('template settings writes');
  static const tools = {
    'studio_prompt_template',
    'studio_save_prompt_template'
  };
  final AppState app;
  AgentTemplateTools(this.app);
  Future<Map<String, dynamic>> _selection(
      AppSettings s, Map<String, dynamic> args) async {
    final extraKind = args['kind'];
    if (extraKind == 'optimize' || extraKind == 'assistant') {
      if (args.containsKey('mode') || args.containsKey('templateVersion')) {
        throw StateError('优化/助手模板不使用模式或版本。');
      }
      final key = extraKind == 'optimize'
          ? 'promptOptimizeTemplate' : 'promptAssistantTemplate';
      final custom = (extraKind == 'optimize'
          ? s.promptOptimizeTemplate : s.promptAssistantTemplate).trim();
      final defaults = await PromptTemplateLibrary.load();
      final builtin = defaults.promptEditDefaults[
          extraKind == 'optimize' ? 'optimize' : 'custom'] ?? '';
      return {
        'kind': extraKind,
        'body': custom.isNotEmpty ? custom : builtin,
        'source': custom.isNotEmpty ? 'custom' : 'builtin',
        'revision': sha256.convert(utf8.encode(jsonEncode([key, custom]))).toString(),
      };
    }
    final kind = args['kind'] ?? 'convert',
        mode = args['mode'] ?? s.agentPromptTemplateMode;
    if (!['convert', 'reverse'].contains(kind) ||
        !['mixed', 'tags', 'natural'].contains(mode)) {
      throw StateError('请选择模板用途与混合、标签或自然语言模式');
    }
    final version = args['templateVersion'] ??
        (kind == 'convert'
            ? s.convertPromptTemplateVersion
            : s.reversePromptTemplateVersion);
    if (!['v5', 'v4.5'].contains(version)) throw StateError('模板版本需要 v5 或 v4.5');
    final key =
            '${kind == 'convert' ? 'convert' : 'reverse'}PromptTemplates${version == 'v4.5' ? 'V45' : ''}',
        raw = s.toJson(),
        saved = Map<String, dynamic>.from(raw[key] ?? {});
    final defaults = await PromptTemplateLibrary.load();
    final modeValue = ReversePromptMode.values.byName(mode);
    final body = defaults.resolve(kind as String, modeValue,
        saved.map((key, value) => MapEntry(key, value.toString())),
        templateVersion: version as String);
    final custom = (saved[mode] ?? '').toString().trim();
    return {
      'kind': kind,
      'mode': mode,
      'templateVersion': version,
      'key': key,
      'body': body,
      'source': custom.isNotEmpty && body == custom
          ? 'custom' : (saved['mixed'] ?? '').toString().trim().isNotEmpty
              ? 'derived' : 'builtin',
      'revision': sha256
          .convert(utf8.encode(jsonEncode([
            key,
            saved,
            s.agentPromptTemplateMode,
            s.convertPromptTemplateVersion,
            s.reversePromptTemplateVersion
          ])))
          .toString()
    };
  }

  Future<Map<String, dynamic>> execute(
      String tool, Map<String, dynamic> args) async {
    final previous = _writes[app] ?? Future<void>.value();
    final work = previous.then((_) => _execute(tool, args));
    _writes[app] =
        work.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return work;
  }

  Future<Map<String, dynamic>> _execute(
      String tool, Map<String, dynamic> args) async {
    if (!tools.contains(tool)) throw StateError('模板操作无效');
    final allowed = [
      'kind',
      'mode',
      'templateVersion',
      if (tool == 'studio_save_prompt_template') ...[
        'expectedRevision',
        'body',
        'restoreDefault'
      ]
    ];
    if (args.keys.any((k) => !allowed.contains(k))) throw StateError('未知模板参数');
    final settings = await app.storage.getSettings(),
        selected = await _selection(settings, args);
    if (tool == 'studio_save_prompt_template') {
      if (args['expectedRevision'] != selected['revision']) {
        throw StateError('软件模板已变化，请重新读取后再保存');
      }
      final body = args['body'];
      if (body != null &&
          (body is! String ||
              body.length > 60000 ||
              (body.trim().isEmpty && args['restoreDefault'] != true))) {
        throw StateError('模板应为不超过 60000 字的文本；恢复默认请使用恢复按钮');
      }
      if (selected['kind'] == 'optimize' || selected['kind'] == 'assistant') {
        if (body != null || args['restoreDefault'] == true) {
          final current = await app.storage.getSettings();
          if ((await _selection(current, args))['revision'] !=
              selected['revision']) {
            throw StateError('保存前模板已变化');
          }
          final key = selected['kind'] == 'optimize'
              ? 'promptOptimizeTemplate' : 'promptAssistantTemplate';
          final value = args['restoreDefault'] == true
              ? '' : (body as String).trim();
          final raw = current.toJson()..[key] = value;
          final next = AppSettings.fromJson(raw);
          // Persist first. A failed save must not change the live editor.
          await app.storage.setSettings(next);
          final live = app.settings.toJson()..[key] = value;
          app.settings = AppSettings.fromJson(live);
          app.markChanged();
        }
        final after = await _selection(await app.storage.getSettings(), args);
        if (body is String && body.trim().isNotEmpty && after['body'] != body.trim()) {
          throw StateError('模板保存后回读不符');
        }
        return after;
      }
      final raw = (await app.storage.getSettings()).toJson();
      if ((await _selection(AppSettings.fromJson(raw), args))['revision'] !=
          selected['revision']) throw StateError('保存前模板已变化');
      final key = selected['key'] as String,
          mode = selected['mode'] as String,
          versionKey = selected['kind'] == 'convert'
              ? 'convertPromptTemplateVersion'
              : 'reversePromptTemplateVersion';
      if (body != null) {
        raw[key] = {...Map<String, dynamic>.from(raw[key] ?? {}), mode: body};
      }
      raw['agentPromptTemplateMode'] = mode;
      raw[versionKey] = selected['templateVersion'];
      await app.storage.setSettings(AppSettings.fromJson(raw));
      final after = await app.storage.getSettings();
      final result = await _selection(after, args);
      if (result['mode'] != mode ||
          result['templateVersion'] != selected['templateVersion'] ||
          (body is String &&
              body.trim().isNotEmpty &&
              result['body'] != body.trim())) throw StateError('模板保存后回读不符');
      final live = app.settings.toJson();
      for (final k in [key, 'agentPromptTemplateMode', versionKey]) {
        live[k] = raw[k];
      }
      app.settings = AppSettings.fromJson(live);
      app.markChanged();
      return result;
    }
    return selected;
  }
}
