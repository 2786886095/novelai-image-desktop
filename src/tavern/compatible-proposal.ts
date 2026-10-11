import type { TavernImageProposal } from '../agent/types';
import { compileSceneBindings, readSceneBindings } from './scene-bindings';

/** Project the app-owned scene into text, not provider-specific character fields.
 * Keep the saved proposal unchanged so retries/continuations never append twice. */
export function compatibleProposalPrompt(proposal: Pick<TavernImageProposal, 'positivePrompt'|'scene'|'stylePrompt'|'negativePrompt'>): string {
  let prompt = proposal.positivePrompt;
  if (proposal.scene) {
    const scene = readSceneBindings(proposal.scene);
    if (!scene) throw Error('SCENE_INVALID');
    const compiled = compileSceneBindings(scene);
    const people = scene.entities.filter(e => e.kind === 'character');
    prompt = [compiled.positivePrompt,
      ...compiled.characterPrompts.map((part, i) => `Character ${i+1}: ${part.prompt}${part.useCoords ? ` Position: x=${part.x}, y=${part.y} (normalized image coordinates).` : ''}`),
      ...scene.entities.filter(e => e.ownerId && e.wearerId).map(e => `Ownership: ${e.prompt} belongs to character ${people.findIndex(p => p.id === e.ownerId)+1}.`),
    ].filter(Boolean).join('\n');
  }
  if (!prompt.trim()) throw Error('正面提示词不能为空。');
  return [prompt, proposal.stylePrompt?.trim() ? `Visual style: ${proposal.stylePrompt}` : '',
    proposal.negativePrompt?.trim() ? `Avoid: ${proposal.negativePrompt}` : ''].filter(Boolean).join('\n');
}

export function compatibleProposalHint(language: unknown): string {
  switch(language) {
    case 'zh-TW': return '使用設定中的圖片服務、模型與尺寸；角色風格和負面要求作為文字指令，不傳送 NovelAI 專屬參數。';
    case 'ja': return '設定の画像サービス・モデル・サイズを使用します。キャラクターの画風と除外要件はテキスト指示として送り、NovelAI 専用パラメーターは送りません。';
    case 'ko': return '설정의 이미지 서비스·모델·크기를 사용합니다. 캐릭터 화풍과 제외 조건은 텍스트 지시로 보내며 NovelAI 전용 매개변수는 보내지 않습니다.';
    case 'en': return 'Uses the image service, model and size saved in Settings. Character style and exclusions are text instructions; NovelAI-only parameters are not sent.';
    default: return '使用设置中的图片服务、模型和尺寸；角色风格和负面要求作为文本指令，不发送 NovelAI 专属参数。';
  }
}

export function compatibleProposalContext(model: unknown, size: unknown): string {
  return `Selected image service: OpenAI Images compatible text-to-image. Model: ${JSON.stringify(model)}, size: ${JSON.stringify(size)}. These override the native image defaults above. For a first image, positivePrompt is accepted; a structured scene is optional. For an established scene or prompt, retain its exact patch contract. Only prompt and count are supplied by this proposal; do not propose native model, size, steps, CFG or sampler overrides. Character style and exclusions are appended as text by the application.`;
}
