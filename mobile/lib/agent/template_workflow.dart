import '../services/data_backup_service.dart';
import '../state/app_state.dart';
import 'template_tools.dart';

/// Public chat operations use the same settings and editor as the shared panel.
/// The bridge/native controller obtains Agent approval before save/restore.
class AgentTemplateWorkflow {
  final AgentTemplateTools templates;
  final Future<String> Function() backup;
  final Future<String> Function() agentBackup;
  AgentTemplateWorkflow(AppState app, {Future<String> Function()? backup,
      Future<String> Function()? agentBackup, AgentTemplateTools? templates})
      : templates = templates ?? AgentTemplateTools(app),
        backup = backup ??
            (() async => (await DataBackupService(app.storage).createBackup(
                    {DataBackupCategory.configuration},
                    internal: true))
                .path),
        agentBackup = agentBackup ??
            (() async => (await DataBackupService(app.storage).createBackup(
                    {DataBackupCategory.agentWorkspace},
                    internal: true))
                .path);

  void validate(Map<String, dynamic> args) {
    final action = args['action'];
    if (!['read', 'select', 'save', 'restore'].contains(action)) {
      throw StateError('模板操作应为 read/select/save/restore');
    }
    final allowed = [
      'action',
      'kind',
      'mode',
      'templateVersion',
      if (action != 'read') 'expectedRevision',
      if (action == 'save') 'body'
    ];
    if (args.keys.any((k) => !allowed.contains(k))) throw StateError('未知模板参数');
    if (args['kind'] != null &&
        !['convert', 'reverse', 'optimize', 'assistant'].contains(args['kind'])) {
      throw StateError('模板用途应为 convert/reverse/optimize/assistant');
    }
    if (args['mode'] != null &&
        !['mixed', 'natural', 'tags'].contains(args['mode'])) {
      throw StateError('请选择混合、自然语言或标签模式');
    }
    if (args['templateVersion'] != null &&
        !['v5', 'v4.5'].contains(args['templateVersion'])) {
      throw StateError('模板版本应为 v5/v4.5');
    }
    if (action != 'read' &&
        (args['expectedRevision'] is! String ||
            (args['expectedRevision'] as String).isEmpty ||
            (args['expectedRevision'] as String).length > 128)) {
      throw StateError('请先读取模板 revision');
    }
    if (action == 'save' &&
        (args['body'] is! String ||
            (args['body'] as String).trim().isEmpty ||
            (args['body'] as String).length > 60000)) {
      throw StateError('请输入不超过 60000 字的模板；恢复默认请用 restore');
    }
  }

  Map<String, dynamic> _selector(Map<String, dynamic> args) => {
        for (final k in ['kind', 'mode', 'templateVersion'])
          if (args.containsKey(k)) k: args[k]
      };
  Future<Map<String, dynamic>> approvalSummary(
      Map<String, dynamic> args) async {
    validate(args);
    final before =
        await templates.execute('studio_prompt_template', _selector(args));
    if (before['revision'] != args['expectedRevision']) {
      throw StateError('软件模板已变化，请重新读取');
    }
    return {
      'action': args['action'],
      'kind': before['kind'],
      'mode': before['mode'],
      'templateVersion': before['templateVersion'],
      if (args['action'] == 'save') 'body': args['body']
    };
  }

  Future<Map<String, dynamic>> execute(Map<String, dynamic> args) async {
    validate(args);
    final before =
        await templates.execute('studio_prompt_template', _selector(args));
    if (args['action'] == 'read') return before;
    if (before['revision'] != args['expectedRevision']) {
      throw StateError('软件模板已变化，请重新读取');
    }
    String? backupPath;
    if (['save', 'restore'].contains(args['action'])) {
      backupPath = ['optimize', 'assistant'].contains(before['kind'])
          ? await agentBackup() : await backup();
      if (backupPath.isEmpty) throw StateError('修改前备份未完成');
    }
    final after = await templates.execute('studio_save_prompt_template', {
      ..._selector(args),
      'expectedRevision': args['expectedRevision'],
      if (args['action'] == 'save') 'body': args['body'],
      if (args['action'] == 'restore') ...{'body': '', 'restoreDefault': true}
    });
    return {
      ...after,
      'saved': true,
      if (backupPath != null) ...{
        'backupPath': backupPath,
        'restoreInstructions': ['optimize', 'assistant'].contains(before['kind'])
            ? '在 Agent 备份列表检查此文件，选择智能体工作区分类后确认恢复。'
            : '在 Agent 备份列表检查此文件，仅选择配置分类，再确认恢复。也可重新读取模板后保存旧内容。'
      }
    };
  }
}
