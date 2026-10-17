export interface DetectiveRunRequest {
  image: string;
  prompt: string;
  style: string;
  budget: number;
  parameters?: Partial<DetectiveParameters>;
}
/** Only the current owned run may be resumed. This is not paid-replay consent. */
export interface DetectiveResumeRequest {
  directory: string;
  manifestSha256: string;
  pendingRequestHash?: string;
}
export interface DetectiveRecovery {
  supported: boolean;
  manifestSha256?: string;
  pendingRequestHash?: string;
  requiresPaidReplayConfirmation?: boolean;
  message?: string;
}
export function detectiveRecoveryLabels(language?: string) {
  const rows = {
    'zh-CN': {resume:'继续当前任务', newRun:'新建自动迭代', paused:'迭代已暂停', title:'确认重发这一张？', warning:'该次结果不明，可能已扣费，重发这一张可能再次扣费；已完成图片不会重生成。', confirm:'仅重发这一张（可能再次扣费）', cancel:'取消'},
    'zh-TW': {resume:'繼續目前任務', newRun:'建立新自動迭代', paused:'迭代已暫停', title:'確認重送這一張？', warning:'該次結果不明，可能已扣費，重送這一張可能再次扣費；已完成圖片不會重新生成。', confirm:'僅重送這一張（可能再次扣費）', cancel:'取消'},
    'en-US': {resume:'Resume current run', newRun:'Start a new iteration', paused:'Iteration paused', title:'Resend this one request?', warning:'Its outcome is unknown and it may already have been billed. Resending this one image may incur another charge; completed images will not be regenerated.', confirm:'Resend this one (possible extra charge)', cancel:'Cancel'},
    'ja-JP': {resume:'現在の実行を再開', newRun:'新しい反復を開始', paused:'反復は一時停止中', title:'この1件を再送しますか？', warning:'結果は不明で、既に課金された可能性があります。この1枚の再送は再課金される場合があります。完成済み画像は再生成しません。', confirm:'この1件のみ再送（再課金の可能性）', cancel:'キャンセル'},
    'ko-KR': {resume:'현재 작업 재개', newRun:'새 반복 시작', paused:'반복 일시 중지', title:'이 요청 하나를 다시 보낼까요?', warning:'결과를 알 수 없으며 이미 과금되었을 수 있습니다. 이 한 장을 재전송하면 추가 과금될 수 있으며 완료된 이미지는 재생성하지 않습니다.', confirm:'이 한 건만 재전송 (추가 과금 가능)', cancel:'취소'},
  };
  return rows[language as keyof typeof rows] ?? rows['zh-CN'];
}
export interface DetectiveRuntimeValidation {
  state: 'unchecked' | 'checking' | 'passed' | 'failed';
  message?: string;
  checkedAt?: string;
  details?: {python:string;torch:string;cuda:string;gpu:string;architecture:string;selfScore:number};
}
export interface DetectiveSnapshot {
  selectedVariant?: 'full' | 'light';
  activeVariant?: 'full' | 'light';
  models?: Record<'full'|'light',{configured:boolean;validation:DetectiveRuntimeValidation;python?:string;assets?:string}>;
  runtimeValidation?: DetectiveRuntimeValidation;
  ready: boolean;
  running: boolean;
  stage: string;
  completed: number;
  budget: number;
  rounds: number;
  best?: number;
  message?: string;
  directory?: string;
  reference?: { filePath: string; fileUrl: string; name: string };
  fixedPrompt?: { content_tags: string; style_tags: string };
  recovery?: DetectiveRecovery;
  candidates: { image: string; prompt: string; score: number; phase: string }[];
}

/** Official search: two seeds per recipe, 16 candidates/round, 4x4 final validation. */
export function detectiveBudget(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 24 || value % 2)
    throw new Error("Artist Detective 图片预算须为至少 24 的偶数。");
  return value;
}
export function detectiveRounds(budget: number): number {
  return Math.ceil((detectiveBudget(budget) - 16) / 32);
}
export function detectiveRoundBudget(rounds: number): number {
  if (!Number.isSafeInteger(rounds) || rounds < 1 || !Number.isSafeInteger(rounds * 32 + 16))
    throw new Error("请输入有效的正整数轮数。");
  return rounds * 32 + 16;
}

export interface DetectiveParameters {
  model: "nai-diffusion-4-5-full";
  width: number; height: number; steps: number; scale: number;
  sampler: "k_euler_ancestral" | "k_euler" | "k_dpmpp_2m" | "k_dpmpp_sde";
  noiseSchedule: "karras" | "exponential" | "polyexponential" | "native";
  cfgRescale: number; searchSeed: number; proposalPoolMultiplier: number;
  negativePrompt: string; qualityPrompt: string;
}
export const DEFAULT_DETECTIVE_PARAMETERS: Readonly<DetectiveParameters> = Object.freeze({"model": "nai-diffusion-4-5-full", "width": 832, "height": 1216, "steps": 28, "scale": 5, "sampler": "k_euler_ancestral", "noiseSchedule": "karras", "cfgRescale": 0, "searchSeed": 246813579, "proposalPoolMultiplier": 8, "negativePrompt": "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page", "qualityPrompt": "location, very aesthetic, masterpiece, no text"});
/** IPC boundary: reject malformed values instead of silently changing paid requests. */
export function detectiveParameters(value: Partial<DetectiveParameters> = {}): DetectiveParameters {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("无效的迭代参数。");
  const p = { ...DEFAULT_DETECTIVE_PARAMETERS, ...value };
  const range = (v: number, min: number, max: number, integer = false) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isSafeInteger(v));
  if (p.model !== "nai-diffusion-4-5-full") throw new Error("画风实验室目前仅开放 NAI 4.5 Full。");
  if (![[832,1216],[1216,832],[1024,1024]].some(([w,h])=>p.width===w && p.height===h)) throw new Error("请选择支持的图片尺寸。");
  if (!range(p.steps,1,50,true) || !range(p.scale,1,10) || !range(p.cfgRescale,0,1) || !range(p.searchSeed,0,4294967295,true) || !range(p.proposalPoolMultiplier,1,32,true)) throw new Error("生成或搜索参数超出有效范围。");
  if (!["k_euler_ancestral","k_euler","k_dpmpp_2m","k_dpmpp_sde"].includes(p.sampler) || !["karras","exponential","polyexponential","native"].includes(p.noiseSchedule)) throw new Error("无效的采样器或噪声计划。");
  if ([p.negativePrompt,p.qualityPrompt].some(v=>typeof v !== "string" || v.length>8000)) throw new Error("提示词过长或格式无效。");
  return p;
}
export function resetDetectiveDraft<T extends {budget:number; parameters:DetectiveParameters}>(draft:T):T {
  return {...draft, budget:300, parameters:detectiveParameters()};
}
