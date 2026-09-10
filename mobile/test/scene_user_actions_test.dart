import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/scene_bindings.dart';
import 'package:novelai_mobile/agent/scene_user_actions.dart';

Map<String, dynamic> base() => jsonDecode(
    File('../shared/tavern-scene-fixtures.json').readAsStringSync())['scene'];
void main() {
  test('remove garment is atomic; other character and garments unchanged', () {
    final scene = base(), before = canonicalSceneValue(base());
    final next = sceneEntityRemoval(scene, 'coat_a')['next'];
    expect(next['entities'].where((e) => e['id'] == 'coat_a'), isEmpty);
    expect(next['facts'].where((e) => e['entityId'] == 'coat_a'), isEmpty);
    expect(next['entities'].where((e) => e['kind'] == 'character'),
        scene['entities'].where((e) => e['kind'] == 'character'));
    expect(canonicalSceneValue(scene), before);
  });
  test('person removal detaches belongings and preserves another wearer', () {
    final scene = base();
    scene['entities'].firstWhere((e) => e['id'] == 'coat_a')['wearerId'] = 'b';
    final next = sceneEntityRemoval(scene, 'a')['next'];
    final coat = next['entities'].firstWhere((e) => e['id'] == 'coat_a');
    expect(coat['wearerId'], 'b');
    expect(coat.containsKey('ownerId'), false);
    expect(
        next['relations']
            .where((r) => r['actorId'] == 'a' || r['targetId'] == 'a'),
        isEmpty);
    expect(readSceneBindings(next), next);
    expect(() => sceneEntityRemoval(next, 'b'), throwsStateError);
  });
  test('fixed descendants and stale confirmation prevent partial deletion', () {
    final scene = base(), patch = sceneEntityRemoval(base(), 'a')['patch'];
    scene['revision'] = 1;
    expect(() => applyScenePatch(scene, patch, byUser: true), throwsStateError);
    scene['entities'].firstWhere((e) => e['id'] == 'coat_a')['locked'] = true;
    final before = canonicalSceneValue(scene);
    expect(() => sceneEntityRemoval(scene, 'a'), throwsStateError);
    expect(canonicalSceneValue(scene), before);
  });
  test(
      'large confirmed user cascades work but do not enlarge model operation limit',
      () {
    final scene = base();
    scene['facts'] = List.generate(
        80,
        (i) => {
              'id': 'f$i',
              'entityId': 'coat_a',
              'slot': 's$i',
              'prompt': 'red'
            });
    final plan = sceneEntityRemoval(scene, 'coat_a');
    expect(plan['next']['facts'], isEmpty);
    expect(() => applyScenePatch(scene, plan['patch']), throwsStateError);
  });
}
