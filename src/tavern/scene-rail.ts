import type { AgentConversation, AgentMessage } from '../agent/types';
import type { SceneBindings } from './scene-bindings';

export function sceneRailSource(conversation: AgentConversation | undefined, characterId?: string, selectedId?: string) {
  const candidates = (conversation?.messages ?? []).filter(m => m.imageProposal && (!characterId || !m.characterId || m.characterId === characterId));
  const latest = [...candidates].reverse().find(m => m.imageProposal!.status !== 'cancelled'
    && (!conversation?.imageStateResetAt || m.imageProposal!.createdAt > conversation.imageStateResetAt));
  const selected = selectedId ? candidates.find(m => m.id === selectedId) : undefined;
  const message = selected ?? latest;
  const historical = !!message && message.id !== latest?.id;
  const busy = conversation?.status === 'running' || candidates.some(m => m.imageProposal?.status === 'running')
    || message?.status === 'streaming' || message?.imageProposal?.continuity?.repairStatus === 'repairing';
  return {message, latest, historical, busy, canEdit: !!message && !historical && !busy
    && message.imageProposal?.status === 'pending' && !message.imageProposal.continuity?.reviewRequired};
}

/** Display grouping only. No facts, owners, order, locks or machine prompts are rewritten. */
export function sceneCards(scene: SceneBindings) {
  const characters = scene.entities.filter(e => e.kind === 'character');
  const card = (id: string, name: string, entityIds: Set<string>) => ({id, name,
    lines: [...scene.entities.filter(e => entityIds.has(e.id)).map(e => e.prompt),
      ...scene.facts.filter(f => entityIds.has(f.entityId)).map(f => f.prompt),
      ...scene.relations.filter(r => entityIds.has(r.actorId)).map(r => `${r.action} → ${scene.entities.find(e => e.id === r.targetId)?.name ?? r.targetId}`)]});
  // Wearing wins when an item has a different owner; show it once, under its wearer.
  const assigned = new Set(characters.map(e => e.id));
  const result = characters.map(person => {
    const ids = new Set([person.id, ...scene.entities.filter(e => (e.wearerId || e.ownerId) === person.id).map(e => e.id)]);
    ids.forEach(id => assigned.add(id)); return card(person.id, person.name, ids);
  });
  result.push(card('scene', '', new Set(['scene', ...scene.entities.filter(e => !assigned.has(e.id)).map(e => e.id)])));
  return result;
}

/** Capture the editable content, including flat prompts that have no scene revision. */
export function sceneEditSnapshot(message: AgentMessage | undefined) {
  return JSON.stringify([message?.id, message?.imageProposal?.id,
    message?.imageProposal?.positivePrompt, message?.imageProposal?.scene]);
}

export function sceneEditRequest(message: AgentMessage, targetId: string, instruction: string, language: unknown = 'zh-CN') {
  const scene = message.imageProposal?.scene;
  if (!message.imageProposal || !instruction.trim()) throw Error('SCENE_STALE');
  // A text-only plan is editable too; do not invent entities or discard its prompt.
  if (!scene && (targetId !== 'picture' || !message.imageProposal.positivePrompt.trim())) throw Error('SCENE_STALE');
  const characters = scene?.entities.filter(e => e.kind === 'character') ?? [];
  const index = characters.findIndex(e => e.id === targetId), target = characters[index];
  if (scene && targetId !== 'scene' && !target) throw Error('SCENE_STALE');
  // Names plus their current character order disambiguate without exposing internal binding IDs.
  const scope = target ? `#${index+1}「${target.name}」` : scene ? sceneRailText(language).scene : sceneFlatText(language).scope;
  const request = instruction.trim();
  switch(language){
    case 'zh-TW': return `請修改${target?'角色':''}${scope}：${request}。生成新方案，保留其他角色、未提及內容與已鎖定項。`;
    case 'en-US': return `Update ${target?'character ':''}${scope}: ${request}. Create a new image plan; preserve other characters, unmentioned details and locked items.`;
    case 'ja-JP': return `${target?'キャラクター':''}${scope}を変更：${request}。新しい画像プランを作成し、他のキャラクター、指定のない内容、ロック項目は保持してください。`;
    case 'ko-KR': return `${target?'캐릭터 ':''}${scope} 수정: ${request}. 새 이미지 계획을 만들고 다른 캐릭터, 언급하지 않은 내용과 잠금 항목은 유지하세요.`;
    default: return `请修改${target?'角色':''}${scope}：${request}。生成新方案，保留其他角色、未提及内容与已锁定项。`;
  }
}

const flatLabels = {
 'zh-CN':{scope:'当前画面',hint:'直接说出想怎么改，不用先拆分角色或设置归属。',failed:'修改未提交，输入已保留，请重试。'},
 'zh-TW':{scope:'目前畫面',hint:'直接說出想怎麼改，不用先拆分角色或設定歸屬。',failed:'修改未送出，輸入已保留，請重試。'},
 'en-US':{scope:'the current image',hint:'Describe your change directly. No character setup or bindings needed.',failed:'Change not submitted. Your text is preserved; please retry.'},
 'ja-JP':{scope:'現在の画像',hint:'変更内容を直接入力してください。キャラクターの分割や関連付けは不要です。',failed:'送信できませんでした。入力は保持されています。再試行してください。'},
 'ko-KR':{scope:'현재 이미지',hint:'변경 내용을 바로 입력하세요. 캐릭터 분리나 연결 설정은 필요 없습니다.',failed:'수정 요청이 전송되지 않았습니다. 입력은 보존됩니다. 다시 시도하세요.'},
};
export const sceneFlatText = (language: unknown) => flatLabels[String(language) as keyof typeof flatLabels] ?? flatLabels['zh-CN'];

const zh = {tab:'场景', title:'画面编辑', hint:'选一个角色或场景，说出想怎么改即可。', edit:'修改', details:'查看当前描述', scene:'场景与背景', advanced:'高级编辑 · Tag、锁定与归属', placeholder:'例如：外套换成蓝色，表情改为微笑', submit:'应用修改', submitting:'正在处理…', latest:'返回最新方案', history:'历史方案 · 只读', empty:'先在对话中描述画面，方案生成后会显示在这里。', legacy:'这是旧版文字方案，保留原提示词，不自动拆分。可继续在对话中修改。', locked:'当前正在生成或等待方案确认，请先完成当前操作。', review:'修改会按当前模式生成新方案；不会覆盖已生成图片。', stale:'方案已更新，请重新选择修改对象。你的修改文字仍保留。', readonly:'此处仅查看。要修改已生成画面，请使用上方“修改”，原图与历史会保留。', open:'编辑画面', summary:'角色与场景已集中到右侧，不用逐项设置归属。', snapshot:'查看场景', cancel:'取消', saved:'高级编辑保存失败，请重试。'};
const en = {tab:'Scene',title:'Scene editor',hint:'Choose a character or the scene, then describe your change.',edit:'Edit',details:'Current description',scene:'Scene & background',advanced:'Advanced · tags, locks & bindings',placeholder:'For example: a blue coat and a smile',submit:'Apply change',submitting:'Processing…',latest:'Latest plan',history:'Historical plan · read only',empty:'Describe an image in chat first. Its plan will appear here.',legacy:'This is a legacy text plan. Its prompts are preserved without automatic splitting. Continue editing in chat.',locked:'A task is running or the plan needs review. Finish it first.',review:'Uses the current generation mode. Existing images are not overwritten.',stale:'The plan changed. Select the target again; your text is preserved.',readonly:'Read only. Use Edit above to revise a generated image without changing its history.',open:'Edit scene',summary:'Characters and scene are in the right panel. No manual bindings required.',snapshot:'View scene',cancel:'Cancel',saved:'Advanced changes could not be saved. Try again.'};
const labels: Record<string, typeof zh> = {'zh-CN':zh,'en-US':en,
 'zh-TW':{...zh,tab:'場景',title:'畫面編輯',hint:'選擇角色或場景，說出想怎麼改即可。',edit:'修改',details:'查看目前描述',scene:'場景與背景',advanced:'進階編輯 · Tag、鎖定與歸屬',placeholder:'例如：外套換成藍色，表情改為微笑',submit:'套用修改',submitting:'正在處理…',latest:'返回最新方案',history:'歷史方案 · 唯讀',empty:'先在對話中描述畫面，方案生成後會顯示在這裡。',legacy:'這是舊版文字方案，保留原提示詞，不自動拆分。可繼續在對話中修改。',locked:'目前正在生成或等待方案確認，請先完成目前操作。',review:'修改會按目前模式生成新方案，不會覆蓋已生成圖片。',stale:'方案已更新，請重新選擇修改對象。修改文字仍保留。',readonly:'此處僅查看。請使用上方「修改」，原圖與歷史會保留。',open:'編輯畫面',summary:'角色與場景已集中到右側，不用逐項設定歸屬。',snapshot:'查看場景',cancel:'取消',saved:'進階修改儲存失敗，請重試。'},
 'ja-JP':{...en,tab:'シーン',title:'シーン編集',hint:'キャラクターや背景を選び、変更内容を入力してください。',edit:'変更',details:'現在の内容',scene:'シーンと背景',advanced:'詳細編集 · タグ・ロック・関連付け',placeholder:'例：青いコートと笑顔に変更',submit:'変更を適用',submitting:'処理中…',latest:'最新のプラン',history:'過去のプラン · 読み取り専用',empty:'まず会話で画像を説明してください。プランがここに表示されます。',legacy:'以前のテキスト形式のプランです。自動分割せず保持します。会話から編集できます。',locked:'処理中またはプランの確認待ちです。',review:'現在の生成モードを使います。既存の画像は上書きしません。',stale:'プランが更新されました。対象を再選択してください。入力は保持されています。',readonly:'閲覧専用です。上の変更ボタンから編集すると、元の画像と履歴は保持されます。',open:'シーン編集',summary:'キャラクターとシーンは右側に集約されています。',snapshot:'シーンを見る',cancel:'キャンセル',saved:'詳細編集を保存できませんでした。再試行してください。'},
 'ko-KR':{...en,tab:'장면',title:'장면 편집',hint:'캐릭터나 배경을 선택하고 변경 내용을 입력하세요.',edit:'수정',details:'현재 내용',scene:'장면 및 배경',advanced:'고급 편집 · 태그, 잠금, 연결',placeholder:'예: 파란 코트와 미소로 변경',submit:'수정 적용',submitting:'처리 중…',latest:'최신 계획',history:'이전 계획 · 읽기 전용',empty:'먼저 대화에서 이미지를 설명하면 계획이 여기에 표시됩니다.',legacy:'이전 텍스트 계획입니다. 자동 분리하지 않고 보존하며 대화에서 수정할 수 있습니다.',locked:'작업 중이거나 계획 확인이 필요합니다.',review:'현재 생성 모드를 사용합니다. 기존 이미지를 덮어쓰지 않습니다.',stale:'계획이 변경되었습니다. 대상을 다시 선택하세요. 입력 내용은 보존됩니다.',readonly:'읽기 전용입니다. 위의 수정 버튼을 사용하면 원본과 기록을 보존합니다.',open:'장면 편집',summary:'캐릭터와 장면을 오른쪽 패널에 모았습니다.',snapshot:'장면 보기',cancel:'취소',saved:'고급 변경 사항을 저장하지 못했습니다. 다시 시도하세요.'}};
export const sceneRailText = (language: unknown) => labels[String(language)] ?? zh;

export function sceneDraftCopy(source: AgentMessage, content: string, now = new Date().toISOString()): AgentMessage {
  const old = source.imageProposal;
  if (!old?.scene || old.status !== 'completed' || old.continuity?.reviewRequired) throw Error('SCENE_STALE');
  const imageProposal = {...structuredClone(old),id:crypto.randomUUID(),status:'pending' as const,createdAt:now,error:undefined,
    continuity:{baseImageId:old.id,previousPrompt:old.positivePrompt,reviewRequired:false,changes:[]}};
  return {id:crypto.randomUUID(),role:'assistant',characterId:source.characterId,content,status:'complete',createdAt:now,
    attachments:[],tools:[],imageProposal,swipes:[content],swipeIndex:0,imageProposalSwipes:[structuredClone(imageProposal)],swipeAttachments:[[]]};
}
export function sceneDraftLabel(language: unknown) {
  return ({'zh-CN':'创建可编辑副本','zh-TW':'建立可編輯副本','en-US':'Create editable copy','ja-JP':'編集用コピーを作成','ko-KR':'편집용 복사본 만들기'} as Record<string,string>)[String(language)] ?? 'Create editable copy';
}
