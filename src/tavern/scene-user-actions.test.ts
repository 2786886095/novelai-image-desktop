import { describe, expect, it } from 'vitest';
import fixture from '../../shared/tavern-scene-fixtures.json';
import { readSceneBindings, applyScenePatch, canonicalSceneValue } from './scene-bindings';
import { sceneEntityRemoval } from './scene-user-actions';
import { sceneErrorMessage } from './scene-errors';

const base = () => readSceneBindings(fixture.scene)!;
describe('review fixes: deliberate scene edits', () => {
  it('removes clothing and its facts atomically without changing either character', () => {
    const scene = base(); const snapshot = canonicalSceneValue(scene);
    const {next, patch} = sceneEntityRemoval(scene, 'coat_a');
    expect(next.entities.some(e => e.id === 'coat_a')).toBe(false);
    expect(next.facts.some(f => f.entityId === 'coat_a')).toBe(false);
    expect(next.entities.filter(e => e.kind === 'character')).toEqual(scene.entities.filter(e => e.kind === 'character'));
    expect(next.revision).toBe(scene.revision + 1);
    expect(canonicalSceneValue(scene)).toBe(snapshot);
    expect(applyScenePatch(scene, patch, true)).toEqual(next);
  });
  it('keeps other people and objects when deleting a person, and detaches only their bindings', () => {
    const scene = base();
    scene.entities.find(e => e.id === 'coat_a')!.wearerId = 'b';
    const {next} = sceneEntityRemoval(scene, 'a');
    expect(readSceneBindings(next)).toEqual(next);
    expect(next.entities.find(e => e.id === 'coat_a')).toMatchObject({wearerId:'b'});
    expect(next.entities.find(e => e.id === 'coat_a')?.ownerId).toBeUndefined();
    expect(next.entities.find(e => e.id === 'b')).toEqual(scene.entities.find(e => e.id === 'b'));
    expect(next.relations.some(r => r.actorId === 'a' || r.targetId === 'a')).toBe(false);
    expect(next.facts.filter(f => f.entityId !== 'a')).toEqual(scene.facts.filter(f => f.entityId !== 'a'));
  });
  it('does not allow stale preview, last character deletion, or deletion of fixed descendants', () => {
    const scene = base(); const plan = sceneEntityRemoval(scene,'a');
    expect(() => applyScenePatch({...scene,revision:1}, plan.patch, true)).toThrow('SCENE_STALE');
    expect(() => sceneEntityRemoval(plan.next,'b')).toThrow('SCENE_LAST_CHARACTER');
    scene.entities.find(e => e.id === 'coat_a')!.locked = true;
    expect(() => sceneEntityRemoval(scene,'a')).toThrow('SCENE_LOCKED');
    expect(() => sceneEntityRemoval(scene,'coat_a')).toThrow('SCENE_LOCKED');
  });
  it('supports large user-confirmed cascades without expanding the AI operation limit', () => {
    const scene=base();
    scene.facts=Array.from({length:80},(_,i)=>({id:`f_${i}`,entityId:'coat_a',slot:`s${i}`,prompt:'red'}));
    const {next,patch}=sceneEntityRemoval(scene,'coat_a');
    expect(next.facts).toHaveLength(0);
    expect(()=>applyScenePatch(scene,patch)).toThrow('SCENE_STALE');
  });
  for (const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']) {
    it(`explains all scene codes in ${language} without leaking raw enums`, () => {
      for (const code of ['STALE','LOCKED','REBIND','OPERATION','INVALID','MODEL_CAPACITY','LAST_CHARACTER']) {
        const message=sceneErrorMessage(new Error(`prefix SCENE_${code}`),language);
        expect(message.length).toBeGreaterThan(12); expect(message).not.toContain('SCENE_');
      }
      expect(sceneErrorMessage('Connection timed out',language)).toBe('Connection timed out');
    });
  }
});
