import 'batch_actions.dart';
import 'comic_actions.dart';
import 'software_action_catalog.dart';
import 'resource_actions.dart';
import 'collection_actions.dart';

const ordinaryAgentMutations = <String>{
  'langbai_update_studio_config',
  'langbai_import_studio_data',
  'langbai_apply_prompt',
  'langbai_save_prompt_preset',
};
bool requiresAgentConfirmation(String tool, Map<String, dynamic> args) {
  if (tool == 'langbai_templates') {
    return !['read', 'select'].contains(args['action']);
  }
  if (tool == 'langbai_api') {
    return !['read', 'test', 'credential'].contains(args['action']);
  }
  if (tool == 'langbai_library') {
    return !['read', 'create'].contains(args['action']);
  }
  if (tool == 'langbai_tasks') {
    return !['list', 'pause', 'cancel'].contains(args['action']);
  }
  if (tool == 'langbai_backup') {
    return !['list', 'inspect', 'create'].contains(args['action']) ||
        (args['action'] == 'create' &&
            args['categories'] is List &&
            (args['categories'] as List).contains('apiCredentials'));
  }
  if (tool == 'langbai_software_action') {
    final spec = softwareActionCatalog[args['action']] ??
        resourceActionCatalog[args['action']] ??
        collectionActionCatalog[args['action']] ??
        comicActionCatalog[args['action']] ??
        batchActionCatalog[args['action']];
    return spec == null || spec['effect'] == 'confirm';
  }
  if (ordinaryAgentMutations.contains(tool)) return false;
  if (tool == 'langbai_save_style_preset') {
    return args['id'] != null && args['id'] != '';
  }
  if (tool == 'langbai_memory_upsert') {
    return (args['id'] ?? args['memoryId']) != null &&
        (args['id'] ?? args['memoryId']) != '';
  }
  return true;
}
