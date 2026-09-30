import 'package:novelai_mobile/agent/comic_generation_actions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';

void main() {
  test('baseline comic generation schema exposes mode and selected panels', () {
    final schema = agentToolSchemas()
        .firstWhere((x) => x['function']['name'] == 'langbai_software_action');
    final props = schema['function']['parameters']['properties'] as Map;
    expect(props.containsKey('mode'), true);
    expect(props.containsKey('panelIds'), true);
  });
  test('baseline comic stop schema exposes exact owned run ID', () {
    final schema = agentToolSchemas()
        .firstWhere((x) => x['function']['name'] == 'langbai_software_action');
    expect(
        (schema['function']['parameters']['properties'] as Map)
            .containsKey('runId'),
        true);
  });

  test(
      'host capability workflow exposes launch and does not retain obsolete unavailable text',
      () {
    final data = comicGenerationCapabilities({
      'actions': {'existing': {}},
      'workflows': [
        {'id': 'comic', 'steps': '尚未接通 Android 漫画生成任务'},
        {'id': 'other', 'steps': 'keep'}
      ]
    });
    expect(data['actions'].keys,
        containsAll(['existing', ...comicGenerationCatalog.keys]));
    final workflow = data['workflows'][0];
    expect(workflow['steps'], contains('comic.generation.start'));
    expect(workflow['steps'], isNot(contains('尚未接通')));
    expect(data['workflows'][1]['steps'], 'keep');
  });
}
