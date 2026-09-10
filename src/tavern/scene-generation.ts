import {maxNAICharacterPrompts,supportsNAICharacterPrompts} from '../types';
import {compileSceneBindings,type SceneBindings} from './scene-bindings';
export function compileSceneForModel(scene:SceneBindings,model:string) {
 const compiled=compileSceneBindings(scene);
 if(!supportsNAICharacterPrompts(model)||compiled.characterPrompts.length>maxNAICharacterPrompts(model)) throw Error('SCENE_MODEL_CAPACITY');
 return compiled;
}
