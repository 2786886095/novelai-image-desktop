import { applyScenePatch, type SceneBindings, type SceneOperation } from './scene-bindings';

/** Delete only the selected entity. Other people's belongings stay, with obsolete links removed. */
export function sceneEntityRemoval(scene: SceneBindings, id: string) {
  const entity = scene.entities.find(e => e.id === id);
  if (!entity) throw Error('SCENE_STALE');
  if (entity.kind === 'character' && scene.entities.filter(e => e.kind === 'character').length === 1) throw Error('SCENE_LAST_CHARACTER');
  const affected = scene.entities.filter(e => e.ownerId === id || e.wearerId === id);
  const facts = scene.facts.filter(f => f.entityId === id);
  const relations = scene.relations.filter(r => r.actorId === id || r.targetId === id);
  const parentLocked = (entityId: string | undefined) => scene.entities.some(e => e.id === entityId && e.locked);
  if (entity.locked || parentLocked(entity.ownerId) || parentLocked(entity.wearerId)
    || affected.some(e => e.locked || parentLocked(e.ownerId) || parentLocked(e.wearerId))
    || facts.some(f => f.locked) || relations.some(r => r.locked || parentLocked(r.actorId) || parentLocked(r.targetId))) throw Error('SCENE_LOCKED');
  const operations: SceneOperation[] = [
    { collection: 'entities', id, before: entity, after: null },
    ...affected.map(e => {
      const after = { ...e };
      if (after.ownerId === id) delete after.ownerId;
      if (after.wearerId === id) delete after.wearerId;
      return { collection: 'entities' as const, id: e.id, before: e, after };
    }),
    ...facts.map(f => ({ collection: 'facts' as const, id: f.id, before: f, after: null })),
    ...relations.map(r => ({ collection: 'relations' as const, id: r.id, before: r, after: null })),
  ];
  return { patch: { revision: scene.revision, operations }, affected, facts, relations,
    next: applyScenePatch(scene, { revision: scene.revision, operations }, true) };
}
