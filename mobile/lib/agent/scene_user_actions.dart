import 'scene_bindings.dart';

/// User-confirmed deletion: detach linked items; never erase another character.
Map<String, dynamic> sceneEntityRemoval(Map<String, dynamic> scene, String id) {
  final entities = (scene['entities'] as List).cast<Map>();
  final entity = entities.where((e) => e['id'] == id).firstOrNull;
  if (entity == null) throw StateError('SCENE_STALE');
  if (entity['kind'] == 'character' &&
      entities.where((e) => e['kind'] == 'character').length == 1) {
    throw StateError('SCENE_LAST_CHARACTER');
  }
  final affected =
      entities.where((e) => e['ownerId'] == id || e['wearerId'] == id).toList();
  final facts =
      (scene['facts'] as List).where((f) => f['entityId'] == id).toList();
  final relations = (scene['relations'] as List)
      .where((r) => r['actorId'] == id || r['targetId'] == id)
      .toList();
  bool parentLocked(dynamic id) =>
      entities.any((e) => e['id'] == id && e['locked'] == true);
  if ([entity, ...affected].any((e) =>
          e['locked'] == true ||
          parentLocked(e['ownerId']) ||
          parentLocked(e['wearerId'])) ||
      facts.any((f) => f['locked'] == true) ||
      relations.any((r) =>
          r['locked'] == true ||
          parentLocked(r['actorId']) ||
          parentLocked(r['targetId']))) {
    throw StateError('SCENE_LOCKED');
  }
  final patch = {
    'revision': scene['revision'],
    'operations': [
      {'collection': 'entities', 'id': id, 'before': entity, 'after': null},
      for (final e in affected)
        {
          'collection': 'entities',
          'id': e['id'],
          'before': e,
          'after': {
            for (final entry in e.entries)
              if (!(['ownerId', 'wearerId'].contains(entry.key) &&
                  entry.value == id))
                entry.key: entry.value,
          }
        },
      for (final f in facts)
        {'collection': 'facts', 'id': f['id'], 'before': f, 'after': null},
      for (final r in relations)
        {'collection': 'relations', 'id': r['id'], 'before': r, 'after': null},
    ]
  };
  return {
    'patch': patch,
    'next': applyScenePatch(scene, patch, byUser: true),
    'affected': affected,
    'facts': facts,
    'relations': relations
  };
}
