import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { confirmAction } from "./components/confirm";
import { useVirtualizer } from "@tanstack/react-virtual";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  AddIcon,
  AttachmentIcon,
  BoltIcon,
  BookIcon,
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ConfirmIcon,
  ContextIcon,
  CopyIcon,
  DeleteIcon,
  DiceIcon,
  EditIcon,
  FavoriteIcon,
  FolderOpenIcon,
  ImageIcon,
  ImportIcon,
  LeftPanelCloseIcon,
  LeftPanelOpenIcon,
  LockIcon,
  MagicIcon,
  MenuIcon,
  MessageIcon,
  PaletteIcon,
  PersonIcon,
  ProtectedIcon,
  ReasoningIcon,
  RefreshIcon,
  ReverseImageIcon,
  RightPanelCloseIcon,
  RightPanelOpenIcon,
  SearchIcon,
  SaveIcon,
  SendIcon,
  SettingsIcon,
  SparklesIcon,
  StopIcon,
  SoftwareImageIcon,
  TagSearchIcon,
  TuneIcon,
  UsersIcon,
} from "./tavern/MaterialIcons";
import type {
  AgentConversation,
  AgentAttachment,
  AgentDiscoveredModel,
  AgentEvent,
  AgentMessage,
  AgentWorkspaceData,
  TavernCharacter,
  TavernImageProposal,
  TavernLorebook,
  TavernPersona,
  AgentReasoningEffort,
} from "./agent/types";
import {
  AGENT_PROVIDER_PRESETS,
  findAgentProviderPreset,
  inferAgentProviderPreset,
  resolveAgentModelLimits,
} from "./agent/provider-catalog";
import {
  DEFAULT_TAVERN_NEGATIVE_PROMPT,
  SOFTWARE_IMAGE_CHARACTER_ID,
  SOFTWARE_IMAGE_LOREBOOK_ID,
  SOFTWARE_IMAGE_PERSONA_ID,
} from "./tavern/builtins";
import {
  createTavernCharacter,
  createTavernPersona,
  normalizeTavernLorebook,
  tavernId,
  tavernNow,
} from "./tavern/compat";
import { defaultImagePromptForMessage, visibleMessageContent } from "./tavern/prompt";
import { tavernUiText, type TavernUiKey } from "./tavern/ui-i18n";
import { normalizeAppLanguage } from "./i18n";
import { useAppStore } from "./store";
import { NAI_MODELS, NAI_SAMPLERS, type AppSettings, type GenerateParams, type StylePromptPreset } from "./types";

import { SelectMenuCompat } from "./components/ui";
type LibraryTab = "characters" | "chats";
type InspectorTab = "character" | "world" | "persona" | "model" | "image";
type MobilePanel = "left" | "right" | null;
type ComposerMenu = "reasoning" | "mode" | null;

const FALLBACK_AVATAR = "AI";

function isBuiltInCharacter(character?: Pick<TavernCharacter, "id"> | null) {
  return character?.id === SOFTWARE_IMAGE_CHARACTER_ID;
}

function isBuiltInLorebook(lorebook?: Pick<TavernLorebook, "id"> | null) {
  return lorebook?.id === SOFTWARE_IMAGE_LOREBOOK_ID;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function cloneWorkspace(value: AgentWorkspaceData) {
  return cloneValue(value);
}

function initials(value: string) {
  return value.trim().slice(0, 2) || FALLBACK_AVATAR;
}

function Avatar({ src, name, size = "normal", software = false }: { src?: string; name: string; size?: "small" | "normal" | "large"; software?: boolean }) {
  return (
    <span className={`tavern-avatar is-${size} ${software && !src ? "is-software" : ""}`} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : software ? <SoftwareImageIcon /> : <span>{initials(name)}</span>}
    </span>
  );
}

function CharacterLibraryItem({ character, active, onSelect, language }: {
  character: TavernCharacter;
  active: boolean;
  onSelect: () => void;
  language: unknown;
}) {
  const builtIn = isBuiltInCharacter(character);
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  return (
    <button type="button" className={`tavern-library-card ${active ? "is-active" : ""}`} onClick={onSelect}>
      <Avatar src={character.avatarDataUrl} name={character.name} software={builtIn} />
      <span>
        <strong>{character.name}</strong>
        <small>{character.personality || character.description || tx("characterUnset")}</small>
        {builtIn ? <em className="tavern-protected-badge"><LockIcon />{tx("builtInProtected")}</em> : null}
      </span>
      {character.favorite ? <FavoriteIcon className="tavern-favorite-icon" aria-label={tx("favorited")} /> : null}
    </button>
  );
}

function IconButton({ label, children, onClick, className = "", disabled = false }: {
  label: string;
  children: ReactNode;
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`tavern-icon-button ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className={`tavern-toggle ${checked ? "is-on" : ""}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)} disabled={disabled}>
      <span />
      <b>{label}</b>
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="tavern-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function markdown(value: string) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
      {value}
    </ReactMarkdown>
  );
}

function copyFor(language: ReturnType<typeof normalizeAppLanguage>) {
  if (language === "zh-TW") return {
    title: "酒館 AI 生圖", subtitle: "對話式提示詞整理與 NovelAI 生圖", characters: "角色", chats: "對話",
    newChat: "新對話", import: "匯入", search: "搜尋角色或對話", settings: "情境工作室", world: "世界書", persona: "使用者設定",
    model: "模型", image: "生圖", send: "傳送", composer: "以你的身份說些什麼……", confirm: "確認生圖", auto: "全自動生圖", working: "正在整理回覆與生圖方案",
  };
  if (language === "ja-JP") return {
    title: "Tavern AI 画像生成", subtitle: "会話でプロンプトを整えて NovelAI 画像生成", characters: "キャラクター", chats: "チャット",
    newChat: "新規チャット", import: "インポート", search: "キャラクターやチャットを検索", settings: "コンテキスト", world: "ワールド情報", persona: "ペルソナ",
    model: "モデル", image: "画像生成", send: "送信", composer: "あなたとして話す……", confirm: "確認して生成", auto: "自動生成", working: "返答と画像プランを整理しています",
  };
  if (language === "ko-KR") return {
    title: "Tavern AI 이미지", subtitle: "대화형 프롬프트 정리와 NovelAI 이미지 생성", characters: "캐릭터", chats: "채팅",
    newChat: "새 채팅", import: "가져오기", search: "캐릭터 또는 채팅 검색", settings: "컨텍스트", world: "월드북", persona: "페르소나",
    model: "모델", image: "이미지", send: "전송", composer: "페르소나로 말하기……", confirm: "확인 후 생성", auto: "자동 생성", working: "답변과 이미지 계획을 정리하는 중",
  };
  if (language === "en-US") return {
    title: "Tavern AI Image", subtitle: "Conversational prompting and NovelAI image generation", characters: "Characters", chats: "Chats",
    newChat: "New chat", import: "Import", search: "Search characters or chats", settings: "Context studio", world: "Lorebooks", persona: "Persona",
    model: "Model", image: "Image", send: "Send", composer: "Speak as your persona…", confirm: "Confirm images", auto: "Auto images", working: "Preparing the reply and image plan",
  };
  return {
    title: "酒馆AI生图", subtitle: "对话式提示词整理与 NovelAI 生图", characters: "角色", chats: "对话",
    newChat: "新对话", import: "导入", search: "搜索角色或对话", settings: "情境工作室", world: "世界书", persona: "用户设定",
    model: "模型", image: "生图", send: "发送", composer: "以你的身份说点什么……", confirm: "确认后生图", auto: "全自动生图", working: "正在整理回复与生图方案",
  };
}

function NumericField({ value, min, max, step = 1, onCommit, label, readOnly = false }: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  label: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="number"
      aria-label={label}
      value={draft}
      min={min}
      max={max}
      step={step}
      readOnly={readOnly}
      onChange={(event) => {
        if (!readOnly) setDraft(event.target.value);
      }}
      onBlur={readOnly ? undefined : commit}
      onKeyDown={(event) => {
        if (readOnly) return;
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function workbenchCopy(language: ReturnType<typeof normalizeAppLanguage>) {
  const zh = {
    commands: "生图快捷命令",
    commandHint: "输入 / 可随时调用，不会打断当前画面描述",
    commandEmpty: "没有匹配的生图命令",
    draw: "创建生图方案",
    drawDesc: "把当前想法整理为可确认的 NovelAI 生图方案",
    drawTemplate: "请把下面的画面想法整理为 NovelAI V5 提示词，并创建可确认的生图方案：",
    prompt: "整理提示词",
    promptDesc: "优化正面提示词并检查 Tag 冲突",
    promptTemplate: "请整理下面的内容，只输出结构清晰的 NovelAI V5 正面提示词并检查冲突：",
    reference: "添加参考图",
    referenceDesc: "把图片作为视觉上下文交给当前模型",
    parameters: "生图参数",
    parametersDesc: "打开尺寸、步数、CFG 与采样器设置",
    modelSettings: "对话模型",
    modelDesc: "切换负责理解画面和组织提示词的模型",
    confirmMode: "确认后生图",
    confirmDesc: "先检查提示词与参数，再决定是否执行",
    autoMode: "全自动生图",
    autoDesc: "方案完成后直接调用 NovelAI 生成",
    newChat: "新建生图对话",
    newChatDesc: "保留角色设定并开始新的画面任务",
    reasoning: "推理强度",
    reasoningAuto: "自动",
    reasoningLow: "快速",
    reasoningMedium: "标准",
    reasoningHigh: "深入",
    reasoningAutoDesc: "由模型决定规划深度",
    reasoningLowDesc: "快速整理，适合明确的单一画面",
    reasoningMediumDesc: "平衡检查构图、风格与参数",
    reasoningHighDesc: "全面检查约束、Tag 冲突与失败风险",
    ready: "生图工作台就绪",
    context: "上下文",
    steps: "步",
    images: "张",
    balance: "Anlas",
    stale: "缓存",
    openCommands: "打开生图快捷命令",
  };
  const translations: Partial<Record<ReturnType<typeof normalizeAppLanguage>, Partial<typeof zh>>> = {
    "zh-TW": {
      commands: "生圖快捷命令", commandHint: "輸入 / 可隨時呼叫，不會打斷目前畫面描述", commandEmpty: "沒有符合的生圖命令",
      draw: "建立生圖方案", drawDesc: "將目前想法整理為可確認的 NovelAI 生圖方案", drawTemplate: "請將下列畫面想法整理為 NovelAI V5 提示詞，並建立可確認的生圖方案：",
      prompt: "整理提示詞", promptDesc: "最佳化正面提示詞並檢查 Tag 衝突", promptTemplate: "請整理下列內容，只輸出結構清楚的 NovelAI V5 正面提示詞並檢查衝突：",
      reference: "加入參考圖", referenceDesc: "將圖片作為視覺上下文交給目前模型", parameters: "生圖參數", parametersDesc: "開啟尺寸、步數、CFG 與採樣器設定",
      modelSettings: "對話模型", modelDesc: "切換負責理解畫面和組織提示詞的模型", confirmMode: "確認後生圖", confirmDesc: "先檢查提示詞與參數，再決定是否執行",
      autoMode: "全自動生圖", autoDesc: "方案完成後直接呼叫 NovelAI 生成", newChat: "新增生圖對話", newChatDesc: "保留角色設定並開始新的畫面任務",
      reasoning: "推理強度", reasoningAuto: "自動", reasoningLow: "快速", reasoningMedium: "標準", reasoningHigh: "深入", reasoningAutoDesc: "由模型決定規劃深度",
      reasoningLowDesc: "快速整理，適合明確的單一畫面", reasoningMediumDesc: "平衡檢查構圖、風格與參數", reasoningHighDesc: "全面檢查限制、Tag 衝突與失敗風險",
      ready: "生圖工作台就緒", context: "上下文", steps: "步", images: "張", stale: "快取", openCommands: "開啟生圖快捷命令",
    },
    "en-US": {
      commands: "Image commands", commandHint: "Type / anytime without interrupting your scene description", commandEmpty: "No matching image command",
      draw: "Create image plan", drawDesc: "Turn the current idea into a confirmable NovelAI plan", drawTemplate: "Turn the following scene idea into a NovelAI V5 prompt and create a confirmable image plan:",
      prompt: "Refine prompt", promptDesc: "Improve the positive prompt and check Tag conflicts", promptTemplate: "Refine the following into a structured NovelAI V5 positive prompt only, then check conflicts:",
      reference: "Add reference image", referenceDesc: "Send an image to the current vision-capable model", parameters: "Image parameters", parametersDesc: "Open size, steps, CFG, and sampler settings",
      modelSettings: "Chat model", modelDesc: "Choose the model that understands scenes and prepares prompts", confirmMode: "Confirm before image", confirmDesc: "Review prompts and parameters before generation",
      autoMode: "Full-auto image", autoDesc: "Generate with NovelAI as soon as the plan is ready", newChat: "New image chat", newChatDesc: "Keep the character setup and start a new image task",
      reasoning: "Planning effort", reasoningAuto: "Auto", reasoningLow: "Fast", reasoningMedium: "Standard", reasoningHigh: "Deep", reasoningAutoDesc: "Let the model choose the planning depth",
      reasoningLowDesc: "Fast pass for a clear single scene", reasoningMediumDesc: "Balanced composition, style, and parameter checks", reasoningHighDesc: "Thorough constraint, tag-conflict, and failure-risk checks",
      ready: "Image workbench ready", context: "Context", steps: "steps", images: "images", stale: "cached", openCommands: "Open image commands",
    },
    "ja-JP": {
      commands: "画像コマンド", commandHint: "/ を入力して画像ワークフローを呼び出せます", commandEmpty: "一致する画像コマンドはありません",
      draw: "画像プランを作成", drawDesc: "現在のアイデアを確認可能な NovelAI プランに整理", drawTemplate: "次の画面案を NovelAI V5 プロンプトに整理し、確認可能な画像生成プランを作成してください：",
      prompt: "プロンプト整理", promptDesc: "正面プロンプトを改善し Tag の競合を確認", promptTemplate: "次の内容を構造化した NovelAI V5 正面プロンプトだけに整理し、競合を確認してください：",
      reference: "参照画像を追加", referenceDesc: "画像を視覚コンテキストとしてモデルへ送信", parameters: "画像パラメータ", parametersDesc: "サイズ、Steps、CFG、Sampler を設定",
      modelSettings: "会話モデル", modelDesc: "画面理解とプロンプト整理を担当するモデル", confirmMode: "確認して生成", confirmDesc: "プロンプトと設定を確認してから生成",
      autoMode: "全自動生成", autoDesc: "プラン完成後すぐ NovelAI で生成", newChat: "新しい画像チャット", newChatDesc: "角色設定を保って新しい画像タスクを開始",
      reasoning: "推論強度", reasoningAuto: "自動", reasoningLow: "高速", reasoningMedium: "標準", reasoningHigh: "詳細", reasoningAutoDesc: "モデルに計画深度を任せる",
      reasoningLowDesc: "明確な単一シーン向けの高速整理", reasoningMediumDesc: "構図・スタイル・設定をバランス確認", reasoningHighDesc: "制約、Tag 競合、失敗リスクを詳細確認",
      ready: "画像ワークベンチ準備完了", context: "コンテキスト", steps: "Steps", images: "枚", stale: "キャッシュ", openCommands: "画像コマンドを開く",
    },
    "ko-KR": {
      commands: "이미지 명령", commandHint: "/ 를 입력해 언제든 이미지 워크플로를 호출하세요", commandEmpty: "일치하는 이미지 명령이 없습니다",
      draw: "이미지 계획 만들기", drawDesc: "현재 아이디어를 확인 가능한 NovelAI 계획으로 정리", drawTemplate: "다음 장면 아이디어를 NovelAI V5 프롬프트로 정리하고 확인 가능한 이미지 계획을 만들어 주세요:",
      prompt: "프롬프트 정리", promptDesc: "긍정 프롬프트를 개선하고 Tag 충돌 확인", promptTemplate: "다음 내용을 구조화된 NovelAI V5 긍정 프롬프트로만 정리하고 충돌을 확인해 주세요:",
      reference: "참고 이미지 추가", referenceDesc: "이미지를 현재 모델의 시각 컨텍스트로 전송", parameters: "이미지 매개변수", parametersDesc: "크기, Steps, CFG, Sampler 설정 열기",
      modelSettings: "대화 모델", modelDesc: "장면 이해와 프롬프트 구성을 담당할 모델 선택", confirmMode: "확인 후 생성", confirmDesc: "프롬프트와 설정을 확인한 뒤 생성",
      autoMode: "완전 자동 생성", autoDesc: "계획이 준비되면 NovelAI로 바로 생성", newChat: "새 이미지 대화", newChatDesc: "캐릭터 설정을 유지하고 새 이미지 작업 시작",
      reasoning: "추론 강도", reasoningAuto: "자동", reasoningLow: "빠름", reasoningMedium: "표준", reasoningHigh: "심층", reasoningAutoDesc: "모델이 계획 깊이를 선택",
      reasoningLowDesc: "명확한 단일 장면용 빠른 정리", reasoningMediumDesc: "구도·스타일·매개변수를 균형 있게 확인", reasoningHighDesc: "제약, Tag 충돌, 실패 위험을 자세히 확인",
      ready: "이미지 워크벤치 준비 완료", context: "컨텍스트", steps: "Steps", images: "장", stale: "캐시", openCommands: "이미지 명령 열기",
    },
  };
  return { ...zh, ...(translations[language] ?? {}) };
}

function timeLabel(value: string, language: string) {
  try {
    return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function proposalStatus(value: TavernImageProposal["status"], language: unknown) {
  const labels = {
    pending: ["等待确认", "等待確認", "Awaiting confirmation", "確認待ち", "확인 대기"],
    running: ["正在生成", "正在生成", "Generating", "生成中", "생성 중"],
    completed: ["已完成", "已完成", "Completed", "完了", "완료"],
    cancelled: ["已取消", "已取消", "Cancelled", "キャンセル済み", "취소됨"],
    error: ["生成失败", "生成失敗", "Generation failed", "生成に失敗", "생성 실패"],
  } as const;
  const index = ({ "zh-CN": 0, "zh-TW": 1, "en-US": 2, "ja-JP": 3, "ko-KR": 4 } as const)[normalizeAppLanguage(language)];
  return labels[value][index];
}

export default function AgentPage() {
  const settings = useAppStore((state) => state.settings);
  const params = useAppStore((state) => state.params);
  const account = useAppStore((state) => state.account);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const language = normalizeAppLanguage(settings?.language);
  const copy = useMemo(() => copyFor(language), [language]);
  const workbench = useMemo(() => workbenchCopy(language), [language]);
  const tx = useCallback((key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values), [language]);
  const [workspace, setWorkspace] = useState<AgentWorkspaceData | null>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("characters");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("image");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [composerHeight, setComposerHeight] = useState(() => {
    const stored = Number(window.localStorage.getItem("tavern-composer-height-v2"));
    return Number.isFinite(stored) && stored >= 48 && stored <= 320 ? stored : 54;
  });
  const [composerMenu, setComposerMenu] = useState<ComposerMenu>(null);
  const [composerPopover, setComposerPopover] = useState({ left: 8, width: 360, pointer: 48, bottom: 48 });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [stylePresetDialog, setStylePresetDialog] = useState<{ prompt: string; name: string } | null>(null);
  const [characterDraft, setCharacterDraft] = useState<TavernCharacter | null>(null);
  const [selectedLorebookId, setSelectedLorebookId] = useState<string>();
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>();
  const [providerDraft, setProviderDraft] = useState<Partial<AppSettings>>({});
  const [discoveredModels, setDiscoveredModels] = useState<AgentDiscoveredModel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const saveRevision = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerShellRef = useRef<HTMLDivElement>(null);
  const composerResizeRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void window.naiDesktop.getAgentWorkspace().then((value) => {
      if (alive) setWorkspace(value);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    const unsubscribe = window.naiDesktop.onAgentEvent((event: AgentEvent) => {
      if (!alive) return;
      if (event.kind === "workspace") setWorkspace(event.workspace);
      if (event.kind === "message-delta") {
        setWorkspace((current) => {
          if (!current) return current;
          const next = cloneWorkspace(current);
          const conversation = next.conversations.find((item) => item.id === event.conversationId);
          const message = conversation?.messages.find((item) => item.id === event.messageId);
          if (message) message.content += event.delta;
          return next;
        });
      }
      if (event.kind === "error") setError(event.message);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    setProviderDraft({
      agentApiProtocol: settings.agentApiProtocol,
      agentApiBaseUrl: settings.agentApiBaseUrl,
      agentApiKey: settings.agentApiKey,
      agentApiModel: settings.agentApiModel,
      agentProviderName: settings.agentProviderName,
      agentContextWindow: settings.agentContextWindow,
      agentMaxOutputTokens: settings.agentMaxOutputTokens,
      agentVisionEnabled: settings.agentVisionEnabled,
    });
  }, [settings]);

  const conversation = useMemo(() => workspace?.conversations.find((item) => item.id === workspace.selectedConversationId)
    ?? workspace?.conversations[0], [workspace]);
  const activeCharacter = useMemo(() => workspace?.characters.find((item) => item.id === conversation?.activeCharacterId)
    ?? workspace?.characters.find((item) => item.id === workspace.selectedCharacterId)
    ?? workspace?.characters[0], [conversation, workspace]);
  const activePersona = useMemo(() => workspace?.personas.find((item) => item.id === conversation?.personaId)
    ?? workspace?.personas.find((item) => item.id === workspace.selectedPersonaId)
    ?? workspace?.personas[0], [conversation, workspace]);
  const imageRuntime = useMemo(() => ({
    model: activeCharacter?.visual.model || params.model,
    width: activeCharacter?.visual.width ?? params.width,
    height: activeCharacter?.visual.height ?? params.height,
    steps: activeCharacter?.visual.steps ?? params.steps,
    scale: activeCharacter?.visual.scale ?? params.cfgScale,
    sampler: activeCharacter?.visual.sampler || params.sampler,
    count: activeCharacter?.visual.count ?? 1,
  }), [activeCharacter, params]);
  const imageModelLabel = useMemo(() => NAI_MODELS.find((item) => item.value === imageRuntime.model)?.label
    ?? imageRuntime.model, [imageRuntime.model]);
  const reasoningEffort: AgentReasoningEffort = conversation?.reasoningEffort ?? "auto";
  const reasoningLabels: Record<AgentReasoningEffort, string> = {
    auto: workbench.reasoningAuto,
    low: workbench.reasoningLow,
    medium: workbench.reasoningMedium,
    high: workbench.reasoningHigh,
  };
  useEffect(() => {
    if (activeCharacter) setCharacterDraft(cloneValue(activeCharacter));
  }, [activeCharacter?.id, activeCharacter?.updatedAt]);
  useEffect(() => setSelectedPersonaId(activePersona?.id), [activePersona?.id]);
  useEffect(() => {
    if (isBuiltInCharacter(activeCharacter) && (inspectorTab === "character" || inspectorTab === "world" || inspectorTab === "persona")) {
      setInspectorTab("image");
    }
  }, [activeCharacter?.id, inspectorTab]);

  useEffect(() => {
    if (!composerMenu) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!composerShellRef.current?.contains(target) && !target.closest?.(".tavern-composer-popover")) setComposerMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [composerMenu]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    window.localStorage.setItem("tavern-composer-height-v2", String(composerHeight));
  }, [composerHeight]);

  const persist = useCallback(async (next: AgentWorkspaceData, success?: string) => {
    const revision = ++saveRevision.current;
    next.updatedAt = tavernNow();
    setWorkspace(next);
    try {
      const result = await window.naiDesktop.saveTavernWorkspace(next);
      if (revision === saveRevision.current) setWorkspace(result.workspace);
      if (success) setNotice(success);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const updateWorkspace = useCallback((mutator: (next: AgentWorkspaceData) => void, success?: string) => {
    if (!workspace) return;
    const next = cloneWorkspace(workspace);
    mutator(next);
    void persist(next, success);
  }, [persist, workspace]);

  const selectConversation = async (id: string) => {
    const result = await window.naiDesktop.selectAgentConversation(id);
    setWorkspace(result.workspace);
    setLibraryTab("chats");
    setMobilePanel(null);
  };

  const selectCharacter = (id: string) => {
    updateWorkspace((next) => {
      next.selectedCharacterId = id;
      const chat = next.conversations.find((item) => item.id === next.selectedConversationId);
      if (chat) {
        chat.activeCharacterId = id;
        if (!chat.characterIds.includes(id)) chat.characterIds.push(id);
      }
    });
    setInspectorTab(id === SOFTWARE_IMAGE_CHARACTER_ID ? "image" : "character");
    if (id !== SOFTWARE_IMAGE_CHARACTER_ID) setRightCollapsed(false);
    setMobilePanel(null);
  };

  const createChat = async () => {
    const result = await window.naiDesktop.createAgentConversation(activeCharacter ? tx("chatWith", { name: activeCharacter.name }) : undefined);
    setWorkspace(result.workspace);
    setLibraryTab("chats");
    setMobilePanel(null);
  };

  const createCharacter = () => {
    updateWorkspace((next) => {
      const character = createTavernCharacter(`${tx("newCharacter")} ${next.characters.length + 1}`);
      next.characters.push(character);
      next.selectedCharacterId = character.id;
      const chat = next.conversations.find((item) => item.id === next.selectedConversationId);
      if (chat) {
        chat.activeCharacterId = character.id;
        if (!chat.characterIds.includes(character.id)) chat.characterIds.push(character.id);
      }
    });
    setInspectorTab("character");
    setRightCollapsed(false);
  };

  const importCards = async () => {
    const result = await window.naiDesktop.importTavernCards();
    setWorkspace(result.workspace);
    if (!result.cancelled) (result.ok ? setNotice : setError)(result.message);
  };

  const saveCharacter = () => {
    if (!characterDraft) return;
    if (isBuiltInCharacter(characterDraft)) {
      setNotice(tx("builtInProtected"));
      return;
    }
    updateWorkspace((next) => {
      const index = next.characters.findIndex((item) => item.id === characterDraft.id);
      if (index >= 0) next.characters[index] = { ...characterDraft, name: characterDraft.name.trim() || tx("newCharacter"), updatedAt: tavernNow() };
    }, tx("saveCard"));
  };

  const deleteCharacter = async () => {
    if (!workspace || !activeCharacter || workspace.characters.length <= 1) return;
    if (isBuiltInCharacter(activeCharacter)) {
      setNotice(tx("builtInProtected"));
      return;
    }
    if (!(await confirmAction(`${tx("delete")} “${activeCharacter.name}”?`))) return;
    updateWorkspace((next) => {
      next.characters = next.characters.filter((item) => item.id !== activeCharacter.id);
      const fallback = next.characters[0]?.id;
      next.selectedCharacterId = fallback;
      for (const chat of next.conversations) {
        chat.characterIds = chat.characterIds.filter((id) => id !== activeCharacter.id);
        if (!chat.characterIds.length && fallback) chat.characterIds = [fallback];
        if (chat.activeCharacterId === activeCharacter.id) chat.activeCharacterId = chat.characterIds[0];
      }
    });
  };

  const deleteConversation = async (chat: AgentConversation) => {
    if (!(await confirmAction(`${tx("delete")} “${chat.title}”?`))) return;
    try {
      let result = await window.naiDesktop.deleteAgentConversation(chat.id);
      if (!result.workspace.conversations.length) {
        result = await window.naiDesktop.createAgentConversation(copy.newChat);
      }
      setWorkspace(result.workspace);
      setLibraryTab("chats");
      setNotice(tx("delete"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const saveArtistStringPreset = async (prompt: string) => {
    const value = prompt.trim();
    if (!value) return setError(tx("stylePrompt"));
    const suggested = value.split(",").slice(0, 2).join(", ").slice(0, 40) || tx("stylePrompt");
    setStylePresetDialog({ prompt: value, name: suggested });
  };

  const confirmStylePreset = async () => {
    const request = stylePresetDialog;
    const name = request?.name.trim();
    if (!request || !name) return;
    const existing = settings?.stylePromptPresets ?? [];
    const preset: StylePromptPreset = {
      id: tavernId("style"),
      name,
      prompt: request.prompt,
      group: copy.title,
      createdAt: tavernNow(),
    };
    setStylePresetDialog(null);
    await window.naiDesktop.setSetting("stylePromptPresets", [...existing, preset]);
    await refreshSettings();
    setNotice(tx("addToList"));
  };

  const duplicateCharacter = () => {
    if (!activeCharacter) return;
    updateWorkspace((next) => {
      const copied = cloneValue(activeCharacter);
      const timestamp = tavernNow();
      copied.id = tavernId("character");
      copied.name = `${activeCharacter.name} (${tx("copy")})`;
      copied.favorite = false;
      copied.createdAt = timestamp;
      copied.updatedAt = timestamp;
      copied.extensions = { ...copied.extensions };
      delete copied.extensions.langbai_builtin;
      next.characters.push(copied);
      next.selectedCharacterId = copied.id;
      const chat = next.conversations.find((item) => item.id === next.selectedConversationId);
      if (chat) {
        chat.activeCharacterId = copied.id;
        if (!chat.characterIds.includes(copied.id)) chat.characterIds.push(copied.id);
      }
    }, tx("duplicateMine"));
  };

  const chooseVisual = async (kind: "avatar" | "background") => {
    if (!characterDraft) return;
    if (isBuiltInCharacter(characterDraft)) {
      setNotice(tx("builtInProtected"));
      return;
    }
    const result = await window.naiDesktop.importTavernVisualAsset(kind);
    if (!result.ok) return setError(result.message ?? tx("attach"));
    if (result.cancelled || !result.dataUrl) return;
    setCharacterDraft((current) => current ? {
      ...current,
      ...(kind === "avatar" ? { avatarDataUrl: result.dataUrl } : { backgroundDataUrl: result.dataUrl }),
    } : current);
  };

  const createCharacterLorebook = () => {
    if (!characterDraft || isBuiltInCharacter(characterDraft)) return;
    const book = normalizeTavernLorebook({ name: `${characterDraft.name || tx("newCharacter")} · ${tx("lorebooks")}`, entries: [] });
    updateWorkspace((next) => {
      next.lorebooks.push(book);
      const character = next.characters.find((item) => item.id === characterDraft.id);
      if (character) {
        character.lorebookId = book.id;
        character.updatedAt = tavernNow();
      }
      const chat = next.conversations.find((item) => item.id === next.selectedConversationId);
      if (chat && !chat.lorebookIds.includes(book.id)) chat.lorebookIds.push(book.id);
    }, tx("newLorebook"));
    setCharacterDraft({ ...characterDraft, lorebookId: book.id });
    setSelectedLorebookId(book.id);
    setInspectorTab("world");
  };

  const updateConversation = (mutator: (chat: AgentConversation) => void) => updateWorkspace((next) => {
    const chat = next.conversations.find((item) => item.id === next.selectedConversationId);
    if (chat) {
      mutator(chat);
      chat.updatedAt = tavernNow();
    }
  });

  const updateCharacterVisual = (patch: Partial<TavernCharacter["visual"]>) => {
    if (!activeCharacter) return;
    updateWorkspace((next) => {
      const character = next.characters.find((item) => item.id === activeCharacter.id);
      if (!character) return;
      character.visual = { ...character.visual, ...patch };
      character.updatedAt = tavernNow();
    });
  };

  const openInspector = (tab: InspectorTab) => {
    setInspectorTab(tab);
    setRightCollapsed(false);
    if (window.innerWidth <= 960) setMobilePanel("right");
  };

  const setGenerationMode = (mode: "confirm" | "auto") => {
    updateConversation((chat) => { chat.generationMode = mode; });
    setComposerMenu(null);
  };

  const setReasoningEffort = (effort: AgentReasoningEffort) => {
    updateConversation((chat) => { chat.reasoningEffort = effort; });
    setComposerMenu(null);
  };

  const toggleComposerPopover = (
    menu: Exclude<ComposerMenu, null>,
    target: HTMLButtonElement,
    preferredWidth: number,
  ) => {
    if (composerMenu === menu) {
      setComposerMenu(null);
      return;
    }
    const trigger = target.getBoundingClientRect();
    const shell = composerShellRef.current?.getBoundingClientRect();
    const gutter = 8;
    const availableWidth = Math.max(180, Math.min(shell?.width ?? window.innerWidth, window.innerWidth) - gutter * 2);
    const width = Math.min(preferredWidth, availableWidth);
    const maxLeft = Math.max(gutter, window.innerWidth - width - gutter);
    const left = Math.max(gutter, Math.min(trigger.left, maxLeft));
    const pointer = Math.max(20, Math.min(trigger.left + trigger.width / 2 - left, width - 20));
    // Viewport coordinates keep the menu attached to the clicked chip and out
    // of scroll/overflow layers created by the transcript and resizable input.
    const bottom = Math.max(gutter, window.innerHeight - trigger.top + gutter);
    setComposerPopover({ left, width, pointer, bottom });
    setComposerMenu(menu);
  };

  const clampComposerHeight = (value: number) => Math.round(Math.min(
    Math.max(48, value),
    Math.min(320, window.innerHeight * 0.46),
  ));

  const startComposerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    composerResizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: composerHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resizeComposer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = composerResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setComposerHeight(clampComposerHeight(resize.startHeight + resize.startY - event.clientY));
  };

  const finishComposerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (composerResizeRef.current?.pointerId !== event.pointerId) return;
    composerResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.localStorage.setItem("tavern-composer-height-v2", String(composerHeight));
  };

  const resizeComposerByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Home") return;
    event.preventDefault();
    const next = event.key === "Home" ? 54 : clampComposerHeight(composerHeight + (event.key === "ArrowUp" ? 24 : -24));
    setComposerHeight(next);
    window.localStorage.setItem("tavern-composer-height-v2", String(next));
  };

  const send = async () => {
    if (!conversation || conversation.status === "running") return;
    const text = composer;
    if (!text.trim() && !conversation.draftAttachments.length) return;
    setComposer("");
    setError("");
    try {
      const result = await window.naiDesktop.sendAgentMessage({ conversationId: conversation.id, text, characterId: activeCharacter?.id });
      if (result.ok) return;
      setComposer(text);
      setError(result.message ?? copy.send);
    } catch (error) {
      setComposer(text);
      setError(error instanceof Error ? error.message : copy.send);
    }
  };

  const regenerate = async (message: AgentMessage) => {
    if (!conversation) return;
    setError("");
    try {
      const result = await window.naiDesktop.sendAgentMessage({
        conversationId: conversation.id,
        text: "",
        characterId: message.characterId ?? activeCharacter?.id,
        regenerateMessageId: message.id,
      });
      if (!result.ok) setError(result.message ?? tx("regenerateReply"));
    } catch (error) {
      setError(error instanceof Error ? error.message : tx("regenerateReply"));
    }
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const useStarter = (value: string) => {
    setComposer(value);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(value.length, value.length);
    });
  };

  const attach = async () => {
    if (!conversation) return;
    const result = await window.naiDesktop.importAgentFiles(conversation.id);
    if (!result.ok) setError(result.message ?? tx("attach"));
    else setWorkspace(await window.naiDesktop.getAgentWorkspace());
  };

  const updateMessage = (messageId: string, mutator: (message: AgentMessage) => void) => updateConversation((chat) => {
    const message = chat.messages.find((item) => item.id === messageId);
    if (message) mutator(message);
  });

  const deleteMessage = async (message: AgentMessage) => {
    if (!(await confirmAction(`${tx("deleteMessage")}?`))) return;
    updateConversation((chat) => {
      chat.messages = chat.messages.filter((item) => item.id !== message.id);
    });
    setNotice(tx("deleteMessage"));
  };

  const generateProposal = async (message: AgentMessage, proposal: TavernImageProposal) => {
    if (!conversation) return;
    const result = await window.naiDesktop.generateTavernImage({ conversationId: conversation.id, messageId: message.id, proposal });
    if (!result.ok) setError(result.message ?? proposalStatus("error", language));
  };

  const saveProvider = async () => {
    const entries: Array<[keyof AppSettings, AppSettings[keyof AppSettings]]> = [
      ["agentApiProtocol", providerDraft.agentApiProtocol ?? "openai-compatible"],
      ["agentApiBaseUrl", String(providerDraft.agentApiBaseUrl ?? "")],
      ["agentApiKey", String(providerDraft.agentApiKey ?? "")],
      ["agentApiModel", String(providerDraft.agentApiModel ?? "")],
      ["agentProviderName", String(providerDraft.agentProviderName ?? tx("modelName"))],
      ["agentContextWindow", Number(providerDraft.agentContextWindow ?? 128000)],
      ["agentMaxOutputTokens", Number(providerDraft.agentMaxOutputTokens ?? 8192)],
      ["agentVisionEnabled", providerDraft.agentVisionEnabled !== false],
    ];
    try {
      for (const [key, value] of entries) await window.naiDesktop.setSetting(key, value as never);
      await refreshSettings();
      await window.naiDesktop.restartAgentRuntime();
      setNotice(tx("saveConnect"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const discoverModels = async () => {
    setDiscovering(true);
    try {
      const result = await window.naiDesktop.discoverAgentModels({
        protocol: providerDraft.agentApiProtocol ?? "openai-compatible",
        baseUrl: String(providerDraft.agentApiBaseUrl ?? ""),
        apiKey: String(providerDraft.agentApiKey ?? ""),
        currentModel: String(providerDraft.agentApiModel ?? ""),
      });
      setDiscoveredModels(result.models);
      (result.ok ? setNotice : setError)(result.message);
    } catch (reason) {
      setDiscoveredModels([]);
      setError(reason instanceof Error ? reason.message : tx("autoDetect"));
    } finally {
      setDiscovering(false);
    }
  };

  const filteredCharacters = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return workspace?.characters.filter((item) => !query || `${item.name} ${item.tags.join(" ")} ${item.description}`.toLocaleLowerCase().includes(query)) ?? [];
  }, [search, workspace]);
  const filteredChats = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return workspace?.conversations.filter((item) => !query || item.title.toLocaleLowerCase().includes(query)) ?? [];
  }, [search, workspace]);

  if (!workspace) {
    return <div className="tavern-loading"><SparklesIcon /><span>{tx("openTavern")}</span></div>;
  }

  const background = conversation?.backgroundDataUrl ?? activeCharacter?.backgroundDataUrl;

  return (
    <section className={`tavern-page ${leftCollapsed ? "is-left-collapsed" : ""} ${rightCollapsed ? "is-right-collapsed" : ""}`}>
      <aside className={`tavern-library ${mobilePanel === "left" ? "is-mobile-open" : ""}`}>
        <header className="tavern-brand">
          <span className="tavern-brand-mark"><SparklesIcon /></span>
          {!leftCollapsed ? <div><strong>{copy.title}</strong><small>{copy.subtitle}</small></div> : null}
          <IconButton label={leftCollapsed ? tx("expand") : tx("collapse")} className="tavern-desktop-only" onClick={() => setLeftCollapsed((value) => !value)}>
            {leftCollapsed ? <LeftPanelOpenIcon /> : <LeftPanelCloseIcon />}
          </IconButton>
          <IconButton label={tx("close")} className="tavern-mobile-only" onClick={() => setMobilePanel(null)}><CloseIcon /></IconButton>
        </header>
        {leftCollapsed ? (
          <div className="tavern-collapsed-actions">
            <IconButton label={copy.characters} onClick={() => { setLeftCollapsed(false); setLibraryTab("characters"); }}><UsersIcon /></IconButton>
            <IconButton label={copy.chats} onClick={() => { setLeftCollapsed(false); setLibraryTab("chats"); }}><MessageIcon /></IconButton>
            <IconButton label={copy.newChat} onClick={() => void createChat()}><AddIcon /></IconButton>
          </div>
        ) : (
          <>
            <div className="tavern-library-tabs">
              <button className={libraryTab === "characters" ? "is-active" : ""} onClick={() => setLibraryTab("characters")}><UsersIcon />{copy.characters}<b>{workspace.characters.length}</b></button>
              <button className={libraryTab === "chats" ? "is-active" : ""} onClick={() => setLibraryTab("chats")}><MessageIcon />{copy.chats}<b>{workspace.conversations.length}</b></button>
            </div>
            <div className="tavern-library-tools">
              <label className="tavern-search"><SearchIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} /></label>
              <div>
                <button type="button" onClick={libraryTab === "characters" ? createCharacter : () => void createChat()}><AddIcon />{libraryTab === "characters" ? tx("newCharacter") : copy.newChat}</button>
                <button type="button" onClick={() => void importCards()}><ImportIcon />{copy.import}</button>
              </div>
            </div>
            <div className="tavern-library-list">
              {libraryTab === "characters" ? (
                <>
                  {!filteredCharacters.length ? <div className="tavern-library-empty"><SearchIcon /><span>{tx("noCharacters")}</span><small>{tx("noCharactersHint")}</small></div> : null}
                  {filteredCharacters.some((character) => isBuiltInCharacter(character)) ? <div className="tavern-library-group"><SparklesIcon /><span>{tx("builtInCharacters")}</span><small>{tx("pinned")}</small></div> : null}
                  {filteredCharacters.filter((character) => isBuiltInCharacter(character)).map((character) => (
                    <CharacterLibraryItem key={character.id} character={character} active={activeCharacter?.id === character.id} onSelect={() => selectCharacter(character.id)} language={language} />
                  ))}
                  {filteredCharacters.some((character) => !isBuiltInCharacter(character)) ? <div className="tavern-library-group"><PersonIcon /><span>{tx("myCharacters")}</span><small>{filteredCharacters.filter((character) => !isBuiltInCharacter(character)).length}</small></div> : null}
                  {filteredCharacters.filter((character) => !isBuiltInCharacter(character)).map((character) => (
                    <CharacterLibraryItem key={character.id} character={character} active={activeCharacter?.id === character.id} onSelect={() => selectCharacter(character.id)} language={language} />
                  ))}
                </>
              ) : filteredChats.length ? filteredChats.map((chat) => {
                const character = workspace.characters.find((item) => item.id === chat.activeCharacterId);
                const last = [...chat.messages].reverse().find((item) => item.content.trim());
                return (
                  <div key={chat.id} className={`tavern-library-chat ${conversation?.id === chat.id ? "is-active" : ""}`}>
                    <button type="button" className="tavern-library-card" onClick={() => void selectConversation(chat.id)}>
                      <Avatar src={character?.avatarDataUrl} name={character?.name ?? "Chat"} software={isBuiltInCharacter(character)} />
                      <span><strong>{chat.title}</strong><small>{last?.content || character?.firstMessage || tx("newStory")}</small></span>
                      {chat.status === "running" ? <i className="is-typing">•••</i> : null}
                    </button>
                    <IconButton label={tx("deleteChatLabel", { name: chat.title })} className="tavern-library-delete" onClick={(event) => { event.stopPropagation(); void deleteConversation(chat); }}><DeleteIcon /></IconButton>
                  </div>
                );
              }) : <div className="tavern-library-empty"><MessageIcon /><span>{tx("noChats")}</span><small>{tx("noChatsHint")}</small></div>}
            </div>
          </>
        )}
      </aside>

      <main className="tavern-chat" style={background ? { "--tavern-background": `url(${JSON.stringify(background).slice(1, -1)})` } as React.CSSProperties : undefined}>
        <header className={`tavern-chat-header is-minimal ${conversation && conversation.characterIds.length > 1 ? "has-group" : ""}`}>
          <IconButton label={tx("charactersAndChats")} className="tavern-mobile-only" onClick={() => setMobilePanel("left")}><MenuIcon /></IconButton>
          <div className="tavern-chat-identity">
            <Avatar src={activeCharacter?.avatarDataUrl} name={activeCharacter?.name ?? copy.title} software={isBuiltInCharacter(activeCharacter)} size="small" />
            <span>
              <strong>{conversation?.title || activeCharacter?.name || copy.title}</strong>
              <small>{activeCharacter?.name ?? copy.title}<i aria-hidden="true">·</i>{conversation?.generationMode === "auto" ? copy.auto : copy.confirm}</small>
            </span>
          </div>
          {conversation && conversation.characterIds.length > 1 ? (
            <label className="tavern-speaker-select">
              <span>{tx("currentSpeaker")}</span>
              <SelectMenuCompat value={conversation.activeCharacterId} onChange={(event) => updateConversation((chat) => { chat.activeCharacterId = event.target.value; })}>
                {conversation.characterIds.map((id) => workspace.characters.find((item) => item.id === id)).filter(Boolean).map((character) => <option key={character!.id} value={character!.id}>{character!.name}</option>)}
              </SelectMenuCompat>
            </label>
          ) : null}
          <IconButton label={copy.settings} onClick={() => setMobilePanel("right")} className="tavern-mobile-only"><TuneIcon /></IconButton>
        </header>

        <MessageStream
          conversation={conversation}
          workspace={workspace}
          activeCharacter={activeCharacter}
          activePersona={activePersona}
          language={language}
          onStarter={useStarter}
          onUpdateMessage={updateMessage}
          onDeleteMessage={deleteMessage}
          onGenerate={generateProposal}
          onRegenerate={(message) => void regenerate(message)}
        />

        <footer className="tavern-composer-wrap">
          {error ? <div className="tavern-banner is-error"><span>{error}</span><button onClick={() => setError("")}><CloseIcon /></button></div> : null}
          {notice ? <div className="tavern-banner is-success"><CheckIcon /><span>{notice}</span><button onClick={() => setNotice("")}><CloseIcon /></button></div> : null}
          {conversation?.status === "running" ? (
            <div className="tavern-run-strip" role="status" aria-live="polite">
              <span className="tavern-run-strip-dot" />
              <strong>{activeCharacter?.name ?? copy.title}</strong>
              <span>{copy.working}</span>
              <em>{conversation.generationMode === "auto" ? copy.auto : copy.confirm}</em>
            </div>
          ) : null}
          {conversation?.draftAttachments.length ? (
            <div className="tavern-draft-attachments">
              {conversation.draftAttachments.map((item) => (
                <span key={item.id}>{item.fileUrl && item.kind === "image" ? <img src={item.fileUrl} alt="" /> : <AttachmentIcon />}<b>{item.name}</b><button onClick={async () => setWorkspace((await window.naiDesktop.deleteAgentAttachment(conversation.id, item.id)).workspace)}><CloseIcon /></button></span>
              ))}
            </div>
          ) : null}
          <div className="tavern-composer-shell" ref={composerShellRef}>
            <button
              type="button"
              className="tavern-composer-resize"
              aria-label={tx("composerResize")}
              title={tx("composerResizeHint")}
              onPointerDown={startComposerResize}
              onPointerMove={resizeComposer}
              onPointerUp={finishComposerResize}
              onPointerCancel={finishComposerResize}
              onKeyDown={resizeComposerByKeyboard}
            >
              <span />
            </button>
            {composerMenu === "mode" ? createPortal((
              <div
                className="tavern-composer-popover is-mode"
                role="menu"
                 style={{
                   left: composerPopover.left,
                   width: composerPopover.width,
                   bottom: composerPopover.bottom,
                   "--tavern-popover-pointer": `${composerPopover.pointer}px`,
                } as CSSProperties}
              >
                <header><strong>NovelAI {copy.image}</strong><small>{workbench.confirmDesc}</small></header>
                <button type="button" className={conversation?.generationMode !== "auto" ? "is-active" : ""} onClick={() => setGenerationMode("confirm")}>
                  <ConfirmIcon /><span><strong>{workbench.confirmMode}</strong><small>{workbench.confirmDesc}</small></span>{conversation?.generationMode !== "auto" ? <CheckIcon /> : null}
                </button>
                <button type="button" className={conversation?.generationMode === "auto" ? "is-active" : ""} onClick={() => setGenerationMode("auto")}>
                  <BoltIcon /><span><strong>{workbench.autoMode}</strong><small>{workbench.autoDesc}</small></span>{conversation?.generationMode === "auto" ? <CheckIcon /> : null}
                </button>
              </div>
            ), document.body) : null}
            {composerMenu === "reasoning" ? createPortal((
              <div
                className="tavern-composer-popover is-reasoning"
                role="menu"
                 style={{
                   left: composerPopover.left,
                   width: composerPopover.width,
                   bottom: composerPopover.bottom,
                   "--tavern-popover-pointer": `${composerPopover.pointer}px`,
                } as CSSProperties}
              >
                <header><strong>{workbench.reasoning}</strong></header>
                {([
                  ["auto", workbench.reasoningAuto],
                  ["low", workbench.reasoningLow],
                  ["medium", workbench.reasoningMedium],
                  ["high", workbench.reasoningHigh],
                ] as Array<[AgentReasoningEffort, string]>).map(([id, label]) => (
                  <button type="button" key={id} className={reasoningEffort === id ? "is-active" : ""} onClick={() => setReasoningEffort(id)}>
                    <span><strong>{label}</strong></span>{reasoningEffort === id ? <CheckIcon /> : null}
                  </button>
                ))}
              </div>
            ), document.body) : null}

            <div className="tavern-composer-editor">
              <textarea
                ref={composerRef}
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder={copy.composer}
                rows={1}
                style={{ height: composerHeight, minHeight: composerHeight, maxHeight: composerHeight }}
                disabled={!conversation}
              />
            </div>
            <div className="tavern-composer-toolbar">
              <div className="tavern-composer-tools">
                <IconButton label={tx("attach")} onClick={() => void attach()} disabled={!conversation}><AttachmentIcon /></IconButton>
                <button type="button" className={`tavern-tool-chip ${composerMenu === "mode" ? "is-active" : ""}`} onClick={(event) => toggleComposerPopover("mode", event.currentTarget, 340)} disabled={!conversation}>
                  {conversation?.generationMode === "auto" ? <BoltIcon /> : <ConfirmIcon />}<b>{conversation?.generationMode === "auto" ? workbench.autoMode : workbench.confirmMode}</b><ChevronDownIcon />
                </button>
                <button type="button" className={`tavern-tool-chip ${composerMenu === "reasoning" ? "is-active" : ""}`} onClick={(event) => toggleComposerPopover("reasoning", event.currentTarget, 236)} disabled={!conversation}>
                  <ReasoningIcon /><b>{workbench.reasoning} · {reasoningLabels[reasoningEffort]}</b><ChevronDownIcon />
                </button>
              </div>
              {conversation?.status === "running" ? (
                <IconButton label={tx("stop")} className="is-primary tavern-composer-submit" onClick={() => void window.naiDesktop.abortAgentMessage(conversation.id)}><StopIcon /></IconButton>
              ) : (
                <IconButton label={copy.send} className="is-primary tavern-composer-submit" disabled={!conversation || (!composer.trim() && !conversation.draftAttachments.length)} onClick={() => void send()}><SendIcon /></IconButton>
              )}
            </div>
          </div>
          <div className="tavern-image-status" aria-label={tx("imageStatus")}>
            <span className={conversation?.status === "running" ? "is-running" : "is-ready"}><i />{conversation?.status === "running" ? copy.working : workbench.ready}</span>
            <button type="button" onClick={() => openInspector("image")} title={workbench.parametersDesc}><ImageIcon />{imageModelLabel}</button>
            <button type="button" onClick={() => openInspector("image")}><strong>{imageRuntime.width}×{imageRuntime.height}</strong></button>
            <button type="button" onClick={() => openInspector("image")}><strong>{imageRuntime.steps}</strong> {workbench.steps}</button>
            <button type="button" onClick={() => openInspector("image")}>CFG <strong>{imageRuntime.scale}</strong></button>
            <span><strong>{imageRuntime.count}</strong> {workbench.images}</span>
            <span><ContextIcon />{workbench.context} <strong>{Math.round(conversation?.context.percent ?? 0)}%</strong></span>
            {account.anlasBalance !== undefined ? <span className="is-balance">{workbench.balance} <strong>{account.anlasBalance}</strong>{account.stale ? <small>{workbench.stale}</small> : null}</span> : null}
          </div>
        </footer>
      </main>

      <aside className={`tavern-inspector ${mobilePanel === "right" ? "is-mobile-open" : ""}`}>
        <header className="tavern-inspector-header">
          {!rightCollapsed ? <div><strong>{copy.settings}</strong><small>{copy.model} · {copy.image}</small></div> : null}
          <IconButton label={rightCollapsed ? tx("expand") : tx("collapse")} className="tavern-desktop-only" onClick={() => setRightCollapsed((value) => !value)}>
            {rightCollapsed ? <RightPanelOpenIcon /> : <RightPanelCloseIcon />}
          </IconButton>
          <IconButton label={tx("close")} className="tavern-mobile-only" onClick={() => setMobilePanel(null)}><CloseIcon /></IconButton>
        </header>
        {rightCollapsed ? (
          <nav className="tavern-inspector-collapsed">
            <IconButton label={copy.model} onClick={() => { setRightCollapsed(false); setInspectorTab("model"); }}><BotIcon /></IconButton>
            <IconButton label={copy.image} onClick={() => { setRightCollapsed(false); setInspectorTab("image"); }}><ImageIcon /></IconButton>
          </nav>
        ) : (
          <>
            <nav className="tavern-inspector-tabs">
              {((isBuiltInCharacter(activeCharacter) ? [
                ["model", copy.model, <BotIcon key="i" />],
                ["image", copy.image, <ImageIcon key="i" />],
              ] : [
                ["character", tx("characterInfo"), <PersonIcon key="i" />],
                ["world", tx("lorebooks"), <BookIcon key="i" />],
                ["model", copy.model, <BotIcon key="i" />],
                ["image", copy.image, <ImageIcon key="i" />],
              ]) as Array<[InspectorTab, string, ReactNode]>).map(([id, label, icon]) => (
                <button type="button" key={id} className={inspectorTab === id ? "is-active" : ""} onClick={() => setInspectorTab(id)}>{icon}<span>{label}</span></button>
              ))}
            </nav>
            <div className="tavern-inspector-content">
              {inspectorTab === "character" ? (
                <CharacterPanel
                  draft={characterDraft}
                  workspace={workspace}
                  conversation={conversation}
                  onChange={setCharacterDraft}
                  onSave={saveCharacter}
                  onDelete={deleteCharacter}
                  onDuplicate={duplicateCharacter}
                  onChooseVisual={chooseVisual}
                  onCreateLorebook={createCharacterLorebook}
                  onOpenLorebook={(id) => { setSelectedLorebookId(id); setInspectorTab("world"); }}
                  onAiHelp={() => useStarter(`${tx("aiImprove")}\n\n${tx("characterName")}: ${characterDraft?.name ?? ""}\n${tx("characterDescription")}: ${characterDraft?.description ?? ""}\n${tx("personality")}: ${characterDraft?.personality ?? ""}\n${tx("scenario")}: ${characterDraft?.scenario ?? ""}`)}
                  onExport={(format) => activeCharacter && void window.naiDesktop.exportTavernCard({ characterId: activeCharacter.id, format }).then((result) => (result.ok ? setNotice : setError)(result.message))}
                  onToggleGroup={(id, checked) => updateConversation((chat) => {
                    chat.characterIds = checked ? [...new Set([...chat.characterIds, id])] : chat.characterIds.filter((item) => item !== id);
                    if (!chat.characterIds.length && activeCharacter) chat.characterIds = [activeCharacter.id];
                    if (!chat.characterIds.includes(chat.activeCharacterId ?? "")) chat.activeCharacterId = chat.characterIds[0];
                  })}
                  language={language}
                />
              ) : null}
              {inspectorTab === "world" ? (
                <LorebookPanel workspace={workspace} conversation={conversation} selectedId={selectedLorebookId} setSelectedId={setSelectedLorebookId} updateWorkspace={updateWorkspace} onNotice={setNotice} language={language} />
              ) : null}
              {inspectorTab === "persona" ? (
                <PersonaPanel workspace={workspace} conversation={conversation} selectedId={selectedPersonaId} setSelectedId={setSelectedPersonaId} updateWorkspace={updateWorkspace} language={language} />
              ) : null}
              {inspectorTab === "model" ? (
                <ModelPanel
                  draft={providerDraft}
                  setDraft={setProviderDraft}
                  models={discoveredModels}
                  discovering={discovering}
                  onDiscover={discoverModels}
                  onSave={saveProvider}
                  language={language}
                />
              ) : null}
              {inspectorTab === "image" ? (
                <ImagePanel
                  workspace={workspace}
                  conversation={conversation}
                  character={activeCharacter}
                  defaults={params}
                  stylePresets={settings?.stylePromptPresets ?? []}
                  onSaveStylePreset={saveArtistStringPreset}
                  onRefreshSettings={refreshSettings}
                  updateVisual={updateCharacterVisual}
                  updateConversation={updateConversation}
                  updateMessage={updateMessage}
                  language={language}
                />
              ) : null}
            </div>
          </>
        )}
      </aside>
      {mobilePanel ? <button className="tavern-scrim tavern-mobile-only" aria-label={tx("closeSidebar")} onClick={() => setMobilePanel(null)} /> : null}
      {stylePresetDialog ? createPortal((
        <div className="modal-backdrop tavern-input-dialog-backdrop" onMouseDown={() => setStylePresetDialog(null)}>
          <section className="modal input-modal tavern-input-dialog" role="dialog" aria-modal="true" aria-labelledby="tavern-style-preset-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2 id="tavern-style-preset-title">{tx("saveStyleTitle")}</h2>
              <button type="button" aria-label={tx("close")} onClick={() => setStylePresetDialog(null)}><CloseIcon /></button>
            </header>
            <div className="input-modal-body">
              <label className="field">
                <span>{tx("styleName")}</span>
                <input
                  autoFocus
                  value={stylePresetDialog.name}
                  onChange={(event) => setStylePresetDialog((current) => current ? { ...current, name: event.target.value } : current)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void confirmStylePreset();
                    else if (event.key === "Escape") setStylePresetDialog(null);
                  }}
                />
              </label>
            </div>
            <footer className="input-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setStylePresetDialog(null)}>{tx("cancel")}</button>
              <button type="button" className="btn btn-primary" disabled={!stylePresetDialog.name.trim()} onClick={() => void confirmStylePreset()}>{tx("save")}</button>
            </footer>
          </section>
        </div>
      ), document.body) : null}
    </section>
  );
}

function MessageStream({ conversation, workspace, activeCharacter, activePersona, language, onStarter, onUpdateMessage, onDeleteMessage, onGenerate, onRegenerate }: {
  conversation?: AgentConversation;
  workspace: AgentWorkspaceData;
  activeCharacter?: TavernCharacter;
  activePersona?: TavernPersona;
  language: string;
  onStarter: (value: string) => void;
  onUpdateMessage: (id: string, mutator: (message: AgentMessage) => void) => void;
  onDeleteMessage: (message: AgentMessage) => void;
  onGenerate: (message: AgentMessage, proposal: TavernImageProposal) => Promise<void>;
  onRegenerate: (message: AgentMessage) => void;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  const workbench = workbenchCopy(normalizeAppLanguage(language));
  const scrollRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const lastMessageIdRef = useRef<string | undefined>(undefined);
  const seenConversationIdRef = useRef<string | undefined>(undefined);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const messages = conversation?.messages ?? [];
  // Keep ordinary conversations in normal document flow. Image proposals and
  // generated media can change height after decode; virtualizing short chats
  // made the next message overlap the previous image until a re-measure.
  const useVirtualRows = messages.length > 40;
  if (conversation?.id !== seenConversationIdRef.current) {
    seenConversationIdRef.current = conversation?.id;
    // Existing history should be stable when opening/switching a chat. Only
    // messages that arrive afterward receive the short entrance animation.
    seenMessageIdsRef.current = new Set(messages.map((message) => message.id));
  }
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => messages[index]?.attachments.length ? 250 : 150,
    overscan: 6,
    getItemKey: (index) => messages[index]?.id ?? index,
  });
  const lastMessage = messages[messages.length - 1];
  const lastLayoutSignature = lastMessage
    ? [
        lastMessage.id,
        lastMessage.status,
        Math.floor(lastMessage.content.length / 64),
        lastMessage.attachments.length,
        lastMessage.swipes?.length ?? 0,
        lastMessage.imageProposal?.status ?? "",
        lastMessage.imageProposal?.positivePrompt.length ?? 0,
        lastMessage.imageProposal?.error?.length ?? 0,
      ].join(":")
    : "empty";
  const settleLatest = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || !messages.length) return;
    if (useVirtualRows) virtualizer.measure();
    requestAnimationFrame(() => {
      const currentScroller = scrollRef.current;
      if (!currentScroller || !followLatestRef.current) return;
      const lastRow = currentScroller.querySelector<HTMLElement>(`[data-index="${messages.length - 1}"]`);
      if (currentScroller.scrollHeight <= currentScroller.clientHeight + 4) {
        currentScroller.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      if (lastRow && lastRow.getBoundingClientRect().height >= currentScroller.clientHeight - 18) {
        const viewportRect = currentScroller.getBoundingClientRect();
        const rowRect = lastRow.getBoundingClientRect();
        currentScroller.scrollTo({ top: currentScroller.scrollTop + rowRect.top - viewportRect.top, behavior: "auto" });
        return;
      }
      currentScroller.scrollTo({ top: currentScroller.scrollHeight - currentScroller.clientHeight, behavior: "auto" });
    });
  }, [messages.length, useVirtualRows, virtualizer]);
  const remeasure = useCallback(() => {
    requestAnimationFrame(settleLatest);
  }, [settleLatest]);
  useEffect(() => {
    if (!messages.length) scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [conversation?.id, messages.length]);
  useEffect(() => {
    if (lastMessage?.id !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessage?.id;
      followLatestRef.current = true;
    }
    const frame = requestAnimationFrame(settleLatest);
    const settleTimer = lastMessage?.status === "streaming" ? 0 : window.setTimeout(() => {
      settleLatest();
    }, 90);
    return () => {
      cancelAnimationFrame(frame);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [lastLayoutSignature, lastMessage?.id, settleLatest]);

  if (!conversation || !activeCharacter) {
    return <div className="tavern-empty"><SparklesIcon /><h2>{tx("chooseCharacter")}</h2><p>{tx("chooseCharacterHint")}</p></div>;
  }
  if (!messages.length) {
    const starters: Array<{ icon: ReactNode; title: string; description: string; prompt: string }> = [
      { icon: <ImageIcon />, title: workbench.draw, description: workbench.drawDesc, prompt: workbench.drawTemplate },
      { icon: <ReverseImageIcon />, title: workbench.reference, description: workbench.referenceDesc, prompt: workbench.referenceDesc },
      { icon: <TagSearchIcon />, title: workbench.prompt, description: workbench.promptDesc, prompt: workbench.promptTemplate },
      { icon: <PaletteIcon />, title: workbench.modelSettings, description: workbench.modelDesc, prompt: workbench.modelDesc },
      { icon: <DiceIcon />, title: workbench.autoMode, description: workbench.autoDesc, prompt: workbench.autoDesc },
    ];
    return (
      <div className="tavern-message-scroll" ref={scrollRef}>
        <div className="tavern-opening is-focused">
          <section className="tavern-creation-console">
            <header>
              <span><SparklesIcon /></span>
              <div><strong>{tx("whatToDraw")}</strong><small>{tx("chooseStart")}</small></div>
              <em>{conversation.generationMode === "auto" ? tx("autoShort") : tx("confirmShort")}</em>
            </header>
            <div className="tavern-starter-grid">
              {starters.map((starter) => (
                <button type="button" key={starter.title} onClick={() => onStarter(starter.prompt)}>
                  <span>{starter.icon}</span>
                  <div><strong>{starter.title}</strong><small>{starter.description}</small></div>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }
  return (
    <div
      className="tavern-message-scroll"
      ref={scrollRef}
      role="log"
      aria-live="polite"
      onScroll={(event) => {
        const target = event.currentTarget;
        followLatestRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 140;
      }}
    >
      <div className={`tavern-virtual-list ${useVirtualRows ? "" : "is-static"}`} style={useVirtualRows ? { height: virtualizer.getTotalSize() } : undefined}>
        {(useVirtualRows
          ? virtualizer.getVirtualItems().map((row) => ({ index: row.index, start: row.start }))
          : messages.map((_message, index) => ({ index, start: 0 }))).map((row) => {
          const message = messages[row.index];
          const character = message.role === "assistant"
            ? workspace.characters.find((item) => item.id === message.characterId) ?? activeCharacter
            : undefined;
          const animate = !seenMessageIdsRef.current.has(message.id);
          if (animate) seenMessageIdsRef.current.add(message.id);
          return (
            <div key={message.id} ref={useVirtualRows ? virtualizer.measureElement : undefined} data-index={row.index} className="tavern-virtual-row" style={useVirtualRows ? { transform: `translateY(${row.start}px)` } : undefined}>
              <MessageBubble
                conversationId={conversation.id}
                message={message}
                speaker={character}
                persona={activePersona}
                language={language}
                onUpdate={(mutator) => onUpdateMessage(message.id, mutator)}
                onDelete={() => onDeleteMessage(message)}
                onGenerate={(proposal) => onGenerate(message, proposal)}
                onRegenerate={() => onRegenerate(message)}
                onLayoutChange={remeasure}
                animate={animate}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageBubble({ conversationId, message, speaker, persona, language, onUpdate, onDelete, onGenerate, onRegenerate, onLayoutChange, animate }: {
  conversationId: string;
  message: AgentMessage;
  speaker?: TavernCharacter;
  persona?: TavernPersona;
  language: string;
  onUpdate: (mutator: (message: AgentMessage) => void) => void;
  onDelete: () => void;
  onGenerate: (proposal: TavernImageProposal) => Promise<void>;
  onRegenerate: () => void;
  onLayoutChange: () => void;
  animate: boolean;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  const isUser = message.role === "user";
  const name = isUser ? (persona?.id === SOFTWARE_IMAGE_PERSONA_ID ? tx("personaTitle") : persona?.name ?? tx("personaTitle")) : speaker?.name ?? "Character";
  const avatar = isUser ? persona?.avatarDataUrl : speaker?.avatarDataUrl;
  const content = visibleMessageContent(message);
  const [proposalDraft, setProposalDraft] = useState(message.imageProposal);
  const [previewImage, setPreviewImage] = useState<AgentAttachment | null>(null);
  useEffect(() => setProposalDraft(message.imageProposal), [message.imageProposal]);
  const swipes = message.swipes ?? [];
  const swipeIndex = Math.max(0, Math.min(swipes.length - 1, message.swipeIndex ?? swipes.length - 1));
  return (
    <article className={`tavern-message ${isUser ? "is-user" : "is-character"} ${message.status === "streaming" ? "is-streaming" : ""} ${animate ? "is-entering" : ""}`}>
      <Avatar src={avatar} name={name} software={!isUser && isBuiltInCharacter(speaker)} />
      <div className="tavern-message-body">
        <header><strong>{name}</strong><time>{timeLabel(message.createdAt, language)}</time>{message.status === "streaming" ? <span className="tavern-typing"><i /><i /><i /></span> : null}</header>
        <div className="tavern-message-content">
          {content ? markdown(content) : message.status === "streaming" ? <span className="tavern-thinking">{tx("thinking")}</span> : null}
          {message.status === "streaming" && content ? <span className="tavern-stream-caret" /> : null}
        </div>
        {message.error ? <div className="tavern-message-error">{message.error}</div> : null}
        {message.attachments.length ? (
          <div className={`tavern-message-images ${message.attachments.length === 1 ? "is-single" : message.attachments.length === 2 ? "is-pair" : "is-many"}`}>
            {message.attachments.map((item) => item.fileUrl ? (
              <figure key={item.id} className="tavern-message-image">
                <button
                  type="button"
                  className="tavern-message-image-preview"
                  title={tx("imagePreviewHint")}
                  draggable
                  onDragStart={(event) => {
                    event.preventDefault();
                    window.naiDesktop.startImageDrag(item.filePath);
                  }}
                  onDoubleClick={() => setPreviewImage(item)}
                >
                  <img src={item.fileUrl} alt={item.name} loading="lazy" onLoad={onLayoutChange} />
                </button>
                <figcaption className="tavern-message-image-actions">
                  <button type="button" title={tx("openLocation")} aria-label={tx("openLocation")} onClick={() => void window.naiDesktop.openInExplorer(item.filePath)}><FolderOpenIcon /></button>
                  <button type="button" title={tx("saveAs")} aria-label={tx("saveAs")} onClick={() => void window.naiDesktop.exportAgentAttachment(conversationId, message.id, item.id)}><SaveIcon /></button>
                </figcaption>
              </figure>
            ) : null)}
          </div>
        ) : null}
        {proposalDraft && proposalDraft.status !== "completed" && proposalDraft.status !== "cancelled" ? (
          <ImageProposalCard
            proposal={proposalDraft}
            setProposal={setProposalDraft}
            onGenerate={() => {
              onUpdate((item) => { item.imageProposal = proposalDraft; });
              void onGenerate(proposalDraft);
            }}
            onCancel={() => onUpdate((item) => { if (item.imageProposal) item.imageProposal.status = "cancelled"; })}
            onLayoutChange={onLayoutChange}
            language={language}
          />
        ) : null}
        <footer className="tavern-message-actions">
          {swipes.length > 1 ? (
            <span className="tavern-swipes">
              <IconButton label={tx("previousReply")} disabled={swipeIndex <= 0} onClick={() => onUpdate((item) => { item.swipeIndex = Math.max(0, swipeIndex - 1); })}><ChevronLeftIcon /></IconButton>
              <b>{swipeIndex + 1} / {swipes.length}</b>
              <IconButton label={tx("nextReply")} disabled={swipeIndex >= swipes.length - 1} onClick={() => onUpdate((item) => { item.swipeIndex = Math.min(swipes.length - 1, swipeIndex + 1); })}><ChevronRightIcon /></IconButton>
            </span>
          ) : null}
          <IconButton label={tx("copy")} onClick={() => void navigator.clipboard.writeText(content)}><CopyIcon /></IconButton>
          {!isUser && message.status !== "streaming" ? <IconButton label={tx("regenerateReply")} onClick={onRegenerate}><RefreshIcon /></IconButton> : null}
          {message.status !== "streaming" ? <IconButton label={tx("deleteMessage")} className="tavern-message-delete" onClick={onDelete}><DeleteIcon /></IconButton> : null}
        </footer>
      </div>
      {previewImage?.fileUrl ? createPortal((
        <div className="tavern-image-lightbox" role="dialog" aria-modal="true" aria-label={tx("previewLabel", { name: previewImage.name })} onClick={() => setPreviewImage(null)}>
          <section onClick={(event) => event.stopPropagation()}>
            <IconButton label={tx("closePreview")} className="tavern-image-lightbox-close" onClick={() => setPreviewImage(null)}><CloseIcon /></IconButton>
            <div className="tavern-image-lightbox-stage"><img src={previewImage.fileUrl} alt={previewImage.name} /></div>
            <footer>
              <button type="button" title={tx("openLocation")} aria-label={tx("openLocation")} onClick={() => void window.naiDesktop.openInExplorer(previewImage.filePath)}><FolderOpenIcon /></button>
              <button type="button" title={tx("saveAs")} aria-label={tx("saveAs")} onClick={() => void window.naiDesktop.exportAgentAttachment(conversationId, message.id, previewImage.id)}><SaveIcon /></button>
            </footer>
          </section>
        </div>
      ), document.body) : null}
    </article>
  );
}

function ImageProposalCard({ proposal, setProposal, onGenerate, onCancel, onLayoutChange, language }: {
  proposal: TavernImageProposal;
  setProposal: (value: TavernImageProposal) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onLayoutChange: () => void;
  language: unknown;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  const busy = proposal.status === "running";
  return (
    <section className={`tavern-image-proposal is-${proposal.status}`}>
      <header><span><MagicIcon /></span><strong>{tx("proposal")}</strong><small>{proposalStatus(proposal.status, language)}</small></header>
      <textarea
        className="tavern-proposal-prompt"
        aria-label={tx("positivePrompt")}
        value={proposal.positivePrompt}
        onChange={(event) => setProposal({ ...proposal, positivePrompt: event.target.value })}
        rows={3}
        disabled={busy}
      />
      <div className="tavern-proposal-toolbar">
        <details onToggle={onLayoutChange}>
          <summary>{tx("sizeAndParams")} <ChevronDownIcon /></summary>
          <div className="tavern-parameter-grid">
            <Field label={tx("widthShort")}><NumericField label={tx("widthShort")} value={proposal.width ?? 1024} min={64} max={49152} onCommit={(value) => setProposal({ ...proposal, width: Math.round(value) })} /></Field>
            <Field label={tx("heightShort")}><NumericField label={tx("heightShort")} value={proposal.height ?? 1024} min={64} max={49152} onCommit={(value) => setProposal({ ...proposal, height: Math.round(value) })} /></Field>
            <Field label={tx("steps")}><NumericField label={tx("steps")} value={proposal.steps ?? 28} min={1} max={50} onCommit={(value) => setProposal({ ...proposal, steps: Math.round(value) })} /></Field>
            <Field label="CFG"><NumericField label="CFG" value={proposal.scale ?? 5} min={0} max={10} step={0.1} onCommit={(value) => setProposal({ ...proposal, scale: value })} /></Field>
            <Field label={tx("imageCount")}><NumericField label={tx("imageCount")} value={proposal.count} min={1} max={8} onCommit={(value) => setProposal({ ...proposal, count: Math.round(value) })} /></Field>
          </div>
        </details>
        {proposal.status === "pending" || proposal.status === "error" ? (
          <footer><button type="button" className="is-ghost" onClick={onCancel}><CloseIcon />{tx("cancel")}</button><button type="button" className="is-primary" onClick={onGenerate} disabled={!proposal.positivePrompt.trim()}><ImageIcon />{tx("confirmGenerate")}</button></footer>
        ) : null}
      </div>
      {proposal.error ? <p className="tavern-message-error">{proposal.error}</p> : null}
      {busy ? <div className="tavern-image-progress"><span /></div> : null}
    </section>
  );
}

function CharacterPanel({ draft, workspace, conversation, onChange, onSave, onDelete, onDuplicate, onChooseVisual, onCreateLorebook, onOpenLorebook, onAiHelp, onExport, onToggleGroup, language }: {
  draft: TavernCharacter | null;
  workspace: AgentWorkspaceData;
  conversation?: AgentConversation;
  onChange: (value: TavernCharacter) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onChooseVisual: (kind: "avatar" | "background") => Promise<void>;
  onCreateLorebook: () => void;
  onOpenLorebook: (id: string) => void;
  onAiHelp: () => void;
  onExport: (format: "png" | "json" | "charx") => void;
  onToggleGroup: (id: string, checked: boolean) => void;
  language: unknown;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  if (!draft) return <div className="tavern-panel-empty">{tx("selectCharacter")}</div>;
  const builtIn = isBuiltInCharacter(draft);
  if (builtIn) {
    return (
      <div className="tavern-panel-stack is-protected-character">
        <div className="tavern-character-hero">
          <div className="tavern-character-avatar-static"><Avatar src={draft.avatarDataUrl} name={draft.name} size="large" /></div>
          <div><strong>{draft.name}</strong><small>CHARACTER CARD · {draft.specVersion}</small></div>
          <span className="tavern-protected-badge is-strong"><LockIcon />{tx("builtIn")}</span>
        </div>

        <section className="tavern-panel-section">
          <header><div><strong>{tx("characterInfo")}</strong><small>{tx("readOnlyMaintained")}</small></div><LockIcon /></header>
          <div className="tavern-readonly-field"><span>{tx("characterName")}</span><strong>{draft.name}</strong><LockIcon /></div>
          <div className="tavern-readonly-field is-multiline"><span>{tx("characterDescription")}</span><p>{draft.description}</p><LockIcon /></div>
        </section>

        <section className="tavern-template-card">
          <header><span><MagicIcon /></span><div><strong>{tx("builtInTemplate")}</strong><small>{tx("templateProtocol")}</small></div><span className="tavern-status-chip"><ConfirmIcon />{tx("enabled")}</span></header>
          <div className="tavern-template-capabilities">
            <span>{tx("intentOrganization")}</span><span>Danbooru Tag</span><span>{tx("compositionLight")}</span><span>{tx("parameterConfirmation")}</span>
          </div>
          <p>{tx("templateProtectedHint")}</p>
        </section>

        <section className="tavern-panel-section">
          <header><div><strong>{tx("currentRuntime")}</strong><small>{tx("editModelImage")}</small></div><SettingsIcon /></header>
          <div className="tavern-runtime-grid">
            <span><small>{tx("imageMode")}</small><strong>{conversation?.generationMode === "auto" ? tx("autoShort") : tx("confirmGenerate")}</strong></span>
            <span><small>{tx("defaultSize")}</small><strong>{draft.visual.width ?? 1024} × {draft.visual.height ?? 1024}</strong></span>
            <span><small>{tx("steps")}</small><strong>{draft.visual.steps ?? 28}</strong></span>
            <span><small>CFG</small><strong>{draft.visual.scale ?? 5}</strong></span>
          </div>
        </section>

        <section className="tavern-group-picker">
          <header><strong>{tx("groupMembers")}</strong><small>{tx("groupMembersHint")}</small></header>
          {workspace.characters.map((character) => <label key={character.id}><input type="checkbox" checked={conversation?.characterIds.includes(character.id) ?? false} onChange={(event) => onToggleGroup(character.id, event.target.checked)} /><Avatar src={character.avatarDataUrl} name={character.name} size="small" /><span>{character.name}</span></label>)}
        </section>
        <div className="tavern-export-row"><span>{tx("compatibleExport")}</span><button onClick={() => onExport("png")}>PNG</button><button onClick={() => onExport("json")}>JSON</button><button onClick={() => onExport("charx")}>CHARX</button></div>
        <div className="tavern-sticky-actions"><button className="is-primary" onClick={onDuplicate}><CopyIcon />{tx("duplicateMine")}</button></div>
      </div>
    );
  }
  return (
    <div className="tavern-panel-stack">
      <div className="tavern-character-hero" style={draft.backgroundDataUrl ? { backgroundImage: `url(${draft.backgroundDataUrl})` } : undefined}>
        <button type="button" onClick={() => void onChooseVisual("avatar")}><Avatar src={draft.avatarDataUrl} name={draft.name} size="large" /><span><EditIcon />{tx("avatar")}</span></button>
        <div><strong>{draft.name}</strong><small>{draft.spec} · {draft.specVersion}</small></div>
        <IconButton label={tx("chooseBackground")} onClick={() => void onChooseVisual("background")}><ImageIcon /></IconButton>
      </div>
      <button type="button" className="tavern-ai-draft-button" onClick={onAiHelp}><MagicIcon /><span><strong>{tx("aiImprove")}</strong><small>{tx("aiImproveHint")}</small></span><ChevronRightIcon /></button>
      <Field label={tx("characterName")}><input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field>
      <Field label={tx("nickname")}><input value={draft.nickname} onChange={(event) => onChange({ ...draft, nickname: event.target.value })} placeholder={tx("optional")} /></Field>
      <Field label={tx("characterDescription")}><textarea rows={5} value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} /></Field>
      <Field label={tx("personality")}><textarea rows={4} value={draft.personality} onChange={(event) => onChange({ ...draft, personality: event.target.value })} /></Field>
      <Field label={tx("scenario")}><textarea rows={4} value={draft.scenario} onChange={(event) => onChange({ ...draft, scenario: event.target.value })} /></Field>
      <section className="tavern-character-lorebook-link">
        <header><div><strong>{tx("characterLorebook")}</strong><small>{tx("lorebookHint")}</small></div><BookIcon /></header>
        <div>
          <SelectMenuCompat value={draft.lorebookId ?? ""} onChange={(event) => onChange({ ...draft, lorebookId: event.target.value || undefined })}>
            <option value="">{tx("noLorebook")}</option>
            {workspace.lorebooks.filter((book) => !isBuiltInLorebook(book)).map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
          </SelectMenuCompat>
          {draft.lorebookId ? <button type="button" onClick={() => onOpenLorebook(draft.lorebookId!)}><EditIcon />{tx("edit")}</button> : <button type="button" onClick={onCreateLorebook}><AddIcon />{tx("create")}</button>}
        </div>
      </section>
      <Field label={tx("greeting")}><textarea rows={4} value={draft.firstMessage} onChange={(event) => onChange({ ...draft, firstMessage: event.target.value })} /></Field>
      <Field label={tx("exampleDialogue")}><textarea rows={5} value={draft.exampleMessages} onChange={(event) => onChange({ ...draft, exampleMessages: event.target.value })} placeholder="<START>\n{{user}}: ...\n{{char}}: ..." /></Field>
      <details className="tavern-panel-details">
        <summary>{tx("advancedFields")} <ChevronDownIcon /></summary>
        <Field label={tx("systemPrompt")}><textarea rows={4} value={draft.systemPrompt} onChange={(event) => onChange({ ...draft, systemPrompt: event.target.value })} /></Field>
        <Field label={tx("postHistory")}><textarea rows={4} value={draft.postHistoryInstructions} onChange={(event) => onChange({ ...draft, postHistoryInstructions: event.target.value })} /></Field>
        <Field label={tx("alternateGreetings")}><textarea rows={4} value={draft.alternateGreetings.join("\n")} onChange={(event) => onChange({ ...draft, alternateGreetings: event.target.value.split("\n").filter(Boolean) })} /></Field>
        <Field label={tx("tagsComma")}><input value={draft.tags.join(", ")} onChange={(event) => onChange({ ...draft, tags: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></Field>
      </details>
      <section className="tavern-group-picker">
        <header><strong>{tx("groupMembers")}</strong><small>{tx("groupSelectHint")}</small></header>
        {workspace.characters.map((character) => <label key={character.id}><input type="checkbox" checked={conversation?.characterIds.includes(character.id) ?? false} onChange={(event) => onToggleGroup(character.id, event.target.checked)} /><Avatar src={character.avatarDataUrl} name={character.name} size="small" /><span>{character.name}</span></label>)}
      </section>
      <div className="tavern-export-row"><span>{tx("export")}</span><button onClick={() => onExport("png")}>PNG</button><button onClick={() => onExport("json")}>JSON</button><button onClick={() => onExport("charx")}>CHARX</button></div>
      <div className="tavern-sticky-actions"><button className="is-danger" onClick={onDelete} disabled={workspace.characters.length <= 1}><DeleteIcon />{tx("delete")}</button><button onClick={onDuplicate}><CopyIcon />{tx("copy")}</button><button className="is-primary" onClick={onSave}><CheckIcon />{tx("saveCard")}</button></div>
    </div>
  );
}

function LorebookPanel({ workspace, conversation, selectedId, setSelectedId, updateWorkspace, onNotice, language }: {
  workspace: AgentWorkspaceData;
  conversation?: AgentConversation;
  selectedId?: string;
  setSelectedId: (id?: string) => void;
  updateWorkspace: (mutator: (next: AgentWorkspaceData) => void, success?: string) => void;
  onNotice: (message: string) => void;
  language: unknown;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  const [query, setQuery] = useState("");
  const selected = workspace.lorebooks.find((item) => item.id === selectedId) ?? workspace.lorebooks[0];
  const selectedBuiltIn = isBuiltInLorebook(selected);
  const filtered = workspace.lorebooks.filter((book) => {
    const keyword = query.trim().toLocaleLowerCase();
    return !keyword || `${book.name} ${book.description}`.toLocaleLowerCase().includes(keyword);
  });
  const totalEntries = workspace.lorebooks.reduce((sum, book) => sum + book.entries.length, 0);
  const enabledEntries = workspace.lorebooks.reduce((sum, book) => sum + book.entries.filter((entry) => entry.enabled).length, 0);
  const create = () => updateWorkspace((next) => {
    const book = normalizeTavernLorebook({ name: `${tx("lorebooks")} ${next.lorebooks.length + 1}`, entries: [] });
    next.lorebooks.push(book);
    setSelectedId(book.id);
  }, tx("newLorebook"));
  const update = (mutator: (book: TavernLorebook) => void, allowBuiltIn = false) => updateWorkspace((next) => {
    const book = next.lorebooks.find((item) => item.id === selected?.id);
    if (book && isBuiltInLorebook(book) && !allowBuiltIn) return;
    if (book) { mutator(book); book.updatedAt = tavernNow(); }
  });
  const removeSelected = async () => {
    if (!selected) return;
    if (selectedBuiltIn) {
      onNotice(tx("protectedLoreHint"));
      return;
    }
    if (!(await confirmAction(`${tx("deleteLorebook")}: ${selected.name}?`))) return;
    updateWorkspace((next) => {
      next.lorebooks = next.lorebooks.filter((book) => book.id !== selected.id);
      for (const chat of next.conversations) chat.lorebookIds = chat.lorebookIds.filter((id) => id !== selected.id);
      for (const character of next.characters) if (character.lorebookId === selected.id) character.lorebookId = undefined;
      for (const persona of next.personas) if (persona.lorebookId === selected.id) persona.lorebookId = undefined;
      setSelectedId(next.lorebooks[0]?.id);
    }, `${tx("delete")}: ${selected.name}`);
  };
  return (
    <div className="tavern-panel-stack">
      <div className="tavern-section-title"><div><strong>{tx("worldTitle")}</strong><small>{tx("activeCount", { active: conversation?.lorebookIds.length ?? 0, total: workspace.lorebooks.length })}</small></div><IconButton label={tx("newLorebook")} onClick={create}><AddIcon /></IconButton></div>
      <div className="tavern-worldbook-metrics">
        <span><BookIcon /><small>{tx("lorebooks")}</small><strong>{workspace.lorebooks.length}</strong></span>
        <span><CheckIcon /><small>{tx("currentlyEnabled")}</small><strong>{conversation?.lorebookIds.length ?? 0}</strong></span>
        <span><TuneIcon /><small>{tx("availableEntries")}</small><strong>{enabledEntries}/{totalEntries}</strong></span>
      </div>
      <label className="tavern-search tavern-world-search"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("searchLorebooks")} /></label>
      <div className="tavern-select-list">
        {filtered.map((book) => {
          const builtIn = isBuiltInLorebook(book);
          const enabled = conversation?.lorebookIds.includes(book.id) ?? false;
          return (
            <div key={book.id} className={`tavern-worldbook-item ${selected?.id === book.id ? "is-active" : ""}`}>
              <button type="button" className="tavern-worldbook-main" onClick={() => setSelectedId(book.id)}>
                <span className="tavern-worldbook-icon"><BookIcon /></span>
                <span className="tavern-worldbook-copy"><strong>{book.name}</strong><small>{book.description || tx("description")}</small><em>{tx("entriesCount", { count: book.entries.length, tokens: book.tokenBudget })}</em></span>
                {builtIn ? <em className="tavern-protected-badge"><LockIcon />{tx("builtIn")}</em> : null}
              </button>
              <label className="tavern-compact-switch" title={enabled ? tx("disableInChat") : tx("enableInChat")}>
                <input type="checkbox" checked={enabled} onChange={(event) => updateWorkspace((next) => { const chat = next.conversations.find((item) => item.id === next.selectedConversationId); if (chat) chat.lorebookIds = event.target.checked ? [...new Set([...chat.lorebookIds, book.id])] : chat.lorebookIds.filter((id) => id !== book.id); })} />
                <span />
              </label>
              <IconButton label={`${tx("deleteLorebook")}: ${book.name}`} disabled={builtIn} className="is-danger" onClick={async () => { setSelectedId(book.id); if (!builtIn && await confirmAction(`${tx("deleteLorebook")}: ${book.name}?`)) updateWorkspace((next) => { next.lorebooks = next.lorebooks.filter((item) => item.id !== book.id); for (const chat of next.conversations) chat.lorebookIds = chat.lorebookIds.filter((id) => id !== book.id); for (const character of next.characters) if (character.lorebookId === book.id) character.lorebookId = undefined; for (const persona of next.personas) if (persona.lorebookId === book.id) persona.lorebookId = undefined; setSelectedId(next.lorebooks[0]?.id); }, `${tx("delete")}: ${book.name}`); }}><DeleteIcon /></IconButton>
            </div>
          );
        })}
      </div>
      {!selected ? <div className="tavern-panel-empty"><BookIcon /><p>{tx("emptyLorebooks")}</p><button onClick={create}><AddIcon />{tx("newLorebook")}</button></div> : (
        <section key={selected.id} className={`tavern-worldbook-editor ${selectedBuiltIn ? "is-protected" : ""}`}>
          <header className="tavern-worldbook-editor-head"><div><strong>{selected.name}</strong><small>{selectedBuiltIn ? tx("builtInProtected") : tx("edit")}</small></div>{selectedBuiltIn ? <span className="tavern-protected-badge is-strong"><LockIcon />{tx("protected")}</span> : <button className="tavern-danger-button" onClick={removeSelected}><DeleteIcon />{tx("deleteLorebook")}</button>}</header>
          {selectedBuiltIn ? <section className="tavern-protected-notice is-compact"><ProtectedIcon /><div><strong>{tx("protectedContent")}</strong><p>{tx("protectedLoreHint")}</p></div></section> : null}
          <Field label={tx("name")}><input defaultValue={selected.name} readOnly={selectedBuiltIn} onBlur={selectedBuiltIn ? undefined : (event) => update((book) => { book.name = event.target.value.trim() || tx("lorebooks"); })} /></Field>
          <Field label={tx("description")}><textarea rows={2} defaultValue={selected.description} readOnly={selectedBuiltIn} onBlur={selectedBuiltIn ? undefined : (event) => update((book) => { book.description = event.target.value; })} /></Field>
          <div className="tavern-parameter-grid"><Field label={tx("scanDepth")}><NumericField label={tx("scanDepth")} value={selected.scanDepth} min={1} max={128} readOnly={selectedBuiltIn} onCommit={(value) => update((book) => { book.scanDepth = Math.round(value); })} /></Field><Field label={tx("tokenBudget")}><NumericField label={tx("tokenBudget")} value={selected.tokenBudget} min={128} max={262144} readOnly={selectedBuiltIn} onCommit={(value) => update((book) => { book.tokenBudget = Math.round(value); })} /></Field></div>
          <Toggle checked={selected.recursiveScanning} label={tx("recursiveScan")} disabled={selectedBuiltIn} onChange={(value) => update((book) => { book.recursiveScanning = value; })} />
          <div className="tavern-section-title"><strong>{tx("entries")}</strong><button disabled={selectedBuiltIn} onClick={() => update((book) => { book.entries.push({ id: tavernId("lore"), keys: [], secondaryKeys: [], content: "", enabled: true, constant: false, selective: false, caseSensitive: false, insertionOrder: 100 + book.entries.length, priority: 100, position: "after-character", extensions: {} }); })}><AddIcon />{tx("addEntry")}</button></div>
          <div className="tavern-lore-entries">{selected.entries.map((entry) => <details key={entry.id}><summary><span className={entry.enabled ? "is-enabled" : ""} /><strong>{entry.comment || entry.keys.join(", ") || tx("unnamedEntry")}</strong><small>{entry.constant ? tx("alwaysOn") : entry.keys.join(" · ") || tx("noKeywords")}</small>{selectedBuiltIn ? <LockIcon /> : <ChevronDownIcon />}</summary><div><Field label={tx("title")}><input defaultValue={entry.comment} readOnly={selectedBuiltIn} onBlur={selectedBuiltIn ? undefined : (event) => update((book) => { const item = book.entries.find((value) => value.id === entry.id); if (item) item.comment = event.target.value; })} /></Field><Field label={tx("keywordsComma")}><input defaultValue={entry.keys.join(", ")} readOnly={selectedBuiltIn} onBlur={selectedBuiltIn ? undefined : (event) => update((book) => { const item = book.entries.find((value) => value.id === entry.id); if (item) item.keys = event.target.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean); })} /></Field><Field label={tx("content")}><textarea rows={5} defaultValue={entry.content} readOnly={selectedBuiltIn} onBlur={selectedBuiltIn ? undefined : (event) => update((book) => { const item = book.entries.find((value) => value.id === entry.id); if (item) item.content = event.target.value; })} /></Field><div className="tavern-inline-toggles"><Toggle checked={entry.enabled} label={tx("enabled")} onChange={(value) => update((book) => { const item = book.entries.find((entryValue) => entryValue.id === entry.id); if (item) item.enabled = value; }, selectedBuiltIn)} /><Toggle checked={entry.constant} label={tx("alwaysOn")} disabled={selectedBuiltIn} onChange={(value) => update((book) => { const item = book.entries.find((entryValue) => entryValue.id === entry.id); if (item) item.constant = value; })} /><button className="is-danger" disabled={selectedBuiltIn} title={selectedBuiltIn ? tx("protected") : tx("delete")} onClick={async () => { if (!selectedBuiltIn && await confirmAction(`${tx("delete")}: ${entry.comment || tx("unnamedEntry")}?`)) update((book) => { book.entries = book.entries.filter((value) => value.id !== entry.id); }); }}><DeleteIcon /></button></div></div></details>)}</div>
        </section>
      )}
    </div>
  );
}

function PersonaPanel({ workspace, conversation, selectedId, setSelectedId, updateWorkspace, language }: {
  workspace: AgentWorkspaceData;
  conversation?: AgentConversation;
  selectedId?: string;
  setSelectedId: (id?: string) => void;
  updateWorkspace: (mutator: (next: AgentWorkspaceData) => void, success?: string) => void;
  language: unknown;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  const selected = workspace.personas.find((item) => item.id === selectedId) ?? workspace.personas[0];
  const choose = (id: string) => {
    setSelectedId(id);
    updateWorkspace((next) => {
      next.selectedPersonaId = id;
      const chat = next.conversations.find((item) => item.id === next.selectedConversationId);
      if (chat) chat.personaId = id;
    });
  };
  const create = () => updateWorkspace((next) => {
    const persona = createTavernPersona(`${tx("personaTitle")} ${next.personas.length + 1}`);
    next.personas.push(persona);
    next.selectedPersonaId = persona.id;
    const chat = next.conversations.find((item) => item.id === next.selectedConversationId);
    if (chat) chat.personaId = persona.id;
    setSelectedId(persona.id);
  });
  const update = (mutator: (persona: TavernPersona) => void) => updateWorkspace((next) => {
    const persona = next.personas.find((item) => item.id === selected?.id);
    if (persona) { mutator(persona); persona.updatedAt = tavernNow(); }
  });
  return (
    <div className="tavern-panel-stack">
      <div className="tavern-section-title"><div><strong>{tx("personaTitle")}</strong><small>{tx("personaHint")}</small></div><IconButton label={tx("create")} onClick={create}><AddIcon /></IconButton></div>
      <div className="tavern-persona-grid">{workspace.personas.map((persona) => <button key={persona.id} className={conversation?.personaId === persona.id ? "is-active" : ""} onClick={() => choose(persona.id)}><Avatar src={persona.avatarDataUrl} name={persona.name} /><strong>{persona.name}</strong>{conversation?.personaId === persona.id ? <CheckIcon /> : null}</button>)}</div>
      {selected ? <><Field label={tx("name")}><input defaultValue={selected.name} onBlur={(event) => update((item) => { item.name = event.target.value.trim() || tx("personaTitle"); })} /></Field><Field label={tx("personaDescription")}><textarea rows={8} defaultValue={selected.description} onBlur={(event) => update((item) => { item.description = event.target.value; })} placeholder={tx("personaPlaceholder")} /></Field><Field label={tx("linkedLorebook")}><SelectMenuCompat value={selected.lorebookId ?? ""} onChange={(event) => update((item) => { item.lorebookId = event.target.value || undefined; })}><option value="">{tx("notLinked")}</option>{workspace.lorebooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</SelectMenuCompat></Field></> : null}
    </div>
  );
}

function ModelPanel({ draft, setDraft, models, discovering, onDiscover, onSave, language }: {
  draft: Partial<AppSettings>;
  setDraft: (value: Partial<AppSettings>) => void;
  models: AgentDiscoveredModel[];
  discovering: boolean;
  onDiscover: () => Promise<void>;
  onSave: () => Promise<void>;
  language: unknown;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const presetId = inferAgentProviderPreset(draft.agentApiProtocol ?? "openai-compatible", String(draft.agentApiBaseUrl ?? ""));
  const selectPreset = (id: string) => {
    const preset = findAgentProviderPreset(id);
    if (!preset) return;
    setDraft({ ...draft, agentApiProtocol: preset.protocol, agentApiBaseUrl: preset.baseUrl, agentApiModel: preset.model, agentProviderName: preset.providerName, agentContextWindow: preset.contextWindow, agentMaxOutputTokens: preset.maxOutputTokens, agentVisionEnabled: preset.vision });
  };
  const discoverAndOpen = async () => {
    await onDiscover();
    setModelPickerOpen(true);
  };
  const selectModel = (model: AgentDiscoveredModel) => {
    const limits = resolveAgentModelLimits(model, findAgentProviderPreset(presetId));
    setDraft({
      ...draft,
      agentApiModel: model.id,
      agentContextWindow: limits.contextWindow,
      agentMaxOutputTokens: limits.maxOutputTokens,
    });
    setModelPickerOpen(false);
  };
  useEffect(() => {
    if (!modelPickerOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node)) setModelPickerOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setModelPickerOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelPickerOpen]);
  return (
    <div className="tavern-panel-stack">
      <div className="tavern-section-title"><div><strong>{tx("directModel")}</strong><small>{tx("directModelHint")}</small></div><BotIcon /></div>
      <Field label={tx("servicePreset")}><SelectMenuCompat value={presetId} onChange={(event) => selectPreset(event.target.value)}>{AGENT_PROVIDER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</SelectMenuCompat></Field>
      <Field label={tx("apiProtocol")}><SelectMenuCompat value={draft.agentApiProtocol ?? "openai-compatible"} onChange={(event) => setDraft({ ...draft, agentApiProtocol: event.target.value as AppSettings["agentApiProtocol"] })}><option value="openai-compatible">OpenAI Chat Completions</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic-messages">Anthropic Messages</option><option value="google-gemini">Google Gemini</option></SelectMenuCompat></Field>
      <Field label={tx("apiAddress")}><input value={String(draft.agentApiBaseUrl ?? "")} onChange={(event) => setDraft({ ...draft, agentApiBaseUrl: event.target.value })} placeholder="https://api.deepseek.com" /></Field>
      <Field label="API Key"><input type="password" value={String(draft.agentApiKey ?? "")} onChange={(event) => setDraft({ ...draft, agentApiKey: event.target.value })} autoComplete="off" /></Field>
      <Field label={tx("modelName")}>
        <div className="tavern-model-picker" ref={modelPickerRef}>
          <div className="tavern-input-action">
            <div className="tavern-model-combobox">
              <input
                value={String(draft.agentApiModel ?? "")}
                onChange={(event) => setDraft({ ...draft, agentApiModel: event.target.value })}
                onFocus={() => models.length && setModelPickerOpen(true)}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={modelPickerOpen && models.length > 0}
                aria-controls="tavern-model-options"
              />
              {models.length ? (
                <button
                  type="button"
                  className={modelPickerOpen ? "is-open" : ""}
                  aria-label={modelPickerOpen ? tx("collapseModels") : tx("expandModels")}
                  aria-expanded={modelPickerOpen}
                  onClick={() => setModelPickerOpen((open) => !open)}
                ><ChevronDownIcon /></button>
              ) : null}
            </div>
            <button type="button" onClick={() => void discoverAndOpen()} disabled={discovering}>
              {discovering ? <span className="tavern-spinner" /> : <RefreshIcon />}{discovering ? tx("detecting") : tx("autoDetect")}
            </button>
          </div>
          {modelPickerOpen && models.length ? (
            <div className="tavern-model-results" id="tavern-model-options" role="listbox" aria-label={tx("detectedModels")}>
              <header><strong>{tx("chooseModel")}</strong><small>{tx("detectedCount", { count: Math.min(models.length, 24) })}</small></header>
              <div>
                {models.slice(0, 24).map((model) => {
                  const selected = model.id === draft.agentApiModel;
                  const limits = resolveAgentModelLimits(model, findAgentProviderPreset(presetId));
                  return (
                    <button key={model.id} type="button" role="option" aria-selected={selected} className={selected ? "is-selected" : ""} onClick={() => selectModel(model)}>
                      <span><strong>{model.displayName}</strong><small>{tx("modelLimits", { context: limits.contextWindow.toLocaleString(), output: limits.maxOutputTokens.toLocaleString(), vision: model.vision ? tx("visionSuffix") : "" })}</small></span>
                      {selected ? <CheckIcon /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </Field>
      <div className="tavern-parameter-grid"><Field label={tx("contextLength")}><NumericField label={tx("contextLength")} value={Number(draft.agentContextWindow ?? 128000)} min={1024} max={4_194_304} onCommit={(value) => setDraft({ ...draft, agentContextWindow: Math.round(value) })} /></Field><Field label={tx("maxOutput")}><NumericField label={tx("maxOutput")} value={Number(draft.agentMaxOutputTokens ?? 8192)} min={256} max={262_144} onCommit={(value) => setDraft({ ...draft, agentMaxOutputTokens: Math.round(value) })} /></Field></div>
      <Toggle checked={draft.agentVisionEnabled !== false} label={tx("allowImages")} onChange={(value) => setDraft({ ...draft, agentVisionEnabled: value })} />
      <p className="tavern-info-card"><SettingsIcon />{tx("compressionHint")}</p>
      <div className="tavern-sticky-actions"><button className="is-primary" onClick={() => void onSave()}><CheckIcon />{tx("saveConnect")}</button></div>
    </div>
  );
}

function ImagePanel({ workspace, conversation, character, defaults, stylePresets, onSaveStylePreset, onRefreshSettings, updateVisual, updateConversation, updateMessage, language }: {
  workspace: AgentWorkspaceData;
  conversation?: AgentConversation;
  character?: TavernCharacter;
  defaults: Pick<GenerateParams, "model" | "width" | "height" | "steps" | "cfgScale" | "sampler">;
  stylePresets: StylePromptPreset[];
  onSaveStylePreset: (prompt: string) => Promise<void>;
  onRefreshSettings: () => Promise<void>;
  updateVisual: (patch: Partial<TavernCharacter["visual"]>) => void;
  updateConversation: (mutator: (chat: AgentConversation) => void) => void;
  updateMessage: (id: string, mutator: (message: AgentMessage) => void) => void;
  language: unknown;
}) {
  const tx = (key: TavernUiKey, values?: Record<string, string | number>) => tavernUiText(language, key, values);
  const [userPromptDraft, setUserPromptDraft] = useState({
    negative: character?.visual.negativePrompt.trim() || DEFAULT_TAVERN_NEGATIVE_PROMPT,
    style: character?.visual.stylePrompt ?? "",
  });
  const [styleSearch, setStyleSearch] = useState("");
  const [stylePresetMenuOpen, setStylePresetMenuOpen] = useState(false);
  const [selectedStylePresetGroup, setSelectedStylePresetGroup] = useState("all");
  const [hoveredStylePresetId, setHoveredStylePresetId] = useState("");
  const stylePresetPickerRef = useRef<HTMLDivElement>(null);
  const stylePresetMenuRef = useRef<HTMLDivElement>(null);
  const attemptedStylePreviewRecoveryRef = useRef("");
  const [stylePresetMenuPosition, setStylePresetMenuPosition] = useState({ left: 0, top: 0, width: 330 });
  useEffect(() => {
    setUserPromptDraft({
      negative: character?.visual.negativePrompt.trim() || DEFAULT_TAVERN_NEGATIVE_PROMPT,
      style: character?.visual.stylePrompt ?? "",
    });
  }, [character?.id]);
  useEffect(() => {
    if (!character) return;
    const timer = window.setTimeout(() => {
      const negativePrompt = userPromptDraft.negative.trim() || DEFAULT_TAVERN_NEGATIVE_PROMPT;
      const stylePrompt = userPromptDraft.style;
      if (negativePrompt === character.visual.negativePrompt && stylePrompt === character.visual.stylePrompt) return;
      updateVisual({ negativePrompt, stylePrompt });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [character?.id, character?.visual.negativePrompt, character?.visual.stylePrompt, userPromptDraft.negative, userPromptDraft.style]);
  const lastAssistant = [...(conversation?.messages ?? [])].reverse().find((item) => item.role === "assistant" && item.status === "complete");
  const runtime = {
    model: character?.visual.model || defaults.model,
    width: character?.visual.width ?? defaults.width,
    height: character?.visual.height ?? defaults.height,
    steps: character?.visual.steps ?? defaults.steps,
    scale: character?.visual.scale ?? defaults.cfgScale,
    sampler: character?.visual.sampler || defaults.sampler,
    count: character?.visual.count ?? 1,
    negativePrompt: character?.visual.negativePrompt.trim() || DEFAULT_TAVERN_NEGATIVE_PROMPT,
    stylePrompt: character?.visual.stylePrompt ?? "",
  };
  const sizePresets = [
    { label: tx("square"), width: 1024, height: 1024 },
    { label: tx("landscape"), width: 1216, height: 832 },
    { label: tx("portrait"), width: 832, height: 1216 },
    { label: tx("tallPortrait"), width: 1024, height: 1536 },
    { label: tx("wideLandscape"), width: 1536, height: 1024 },
    { label: tx("largeSquare"), width: 1472, height: 1472 },
    { label: tx("wallpaperPortrait"), width: 1088, height: 1920 },
    { label: tx("wallpaperLandscape"), width: 1920, height: 1088 },
    { label: tx("smallPortrait"), width: 512, height: 768 },
    { label: tx("smallLandscape"), width: 768, height: 512 },
    { label: tx("smallSquare"), width: 640, height: 640 },
  ];
  const sizeGroups = [
    { label: tx("commonFormats"), items: sizePresets.slice(0, 3) },
    { label: tx("hdFormats"), items: sizePresets.slice(3, 6) },
    { label: tx("wallpaperFormats"), items: sizePresets.slice(6, 8) },
    { label: tx("lightweightFormats"), items: sizePresets.slice(8) },
  ];
  const groupedStylePresets = useMemo(() => {
    const query = styleSearch.trim().toLocaleLowerCase();
    const filtered = query
      ? stylePresets.filter((preset) => `${preset.group} ${preset.name} ${preset.prompt}`.toLocaleLowerCase().includes(query))
      : stylePresets;
    const groups = new Map<string, StylePromptPreset[]>();
    for (const preset of filtered) {
      const group = preset.group?.trim() || tx("ungrouped");
      groups.set(group, [...(groups.get(group) ?? []), preset]);
    }
    return [...groups.entries()].map(([group, items]) => ({ group, items }));
  }, [stylePresets, styleSearch]);
  const selectedStylePreset = stylePresets.find((preset) => preset.prompt === userPromptDraft.style);
  const hoveredStylePreset = stylePresets.find((preset) => preset.id === hoveredStylePresetId);
  const stylePreviewRecoverySignature = stylePresets
    .map((preset) => `${preset.id}:${(preset.previewImages ?? []).map((image) => image.id).join(",")}`)
    .join("|");
  useEffect(() => {
    if (!stylePresets.length || attemptedStylePreviewRecoveryRef.current === stylePreviewRecoverySignature) return;
    attemptedStylePreviewRecoveryRef.current = stylePreviewRecoverySignature;
    let cancelled = false;
    void Promise.all(stylePresets.map((preset) => window.naiDesktop.reconcileStylePromptPresetImages(preset.id, preset.previewImages ?? [])))
      .then(async (restoredByPreset) => {
        if (cancelled) return;
        let changed = false;
        const restoredPresets = stylePresets.map((preset, index) => {
          const current = preset.previewImages ?? [];
          const restored = restoredByPreset[index] ?? [];
          if (current.map((image) => image.id).join("|") === restored.map((image) => image.id).join("|")) return preset;
          changed = true;
          return { ...preset, previewImages: restored };
        });
        if (!changed) return;
        await window.naiDesktop.setSetting("stylePromptPresets", restoredPresets);
        if (!cancelled) await onRefreshSettings();
      });
    return () => { cancelled = true; };
  }, [stylePreviewRecoverySignature]);
  const updateStylePresetImages = async (presetId: string, images: StylePromptPreset["previewImages"]) => {
    await window.naiDesktop.setSetting(
      "stylePromptPresets",
      stylePresets.map((preset) => preset.id === presetId ? { ...preset, previewImages: (images ?? []).slice(0, 3) } : preset),
    );
    await onRefreshSettings();
  };
  const importSelectedStylePreview = async () => {
    if (!selectedStylePreset) return;
    const current = await window.naiDesktop.reconcileStylePromptPresetImages(selectedStylePreset.id, selectedStylePreset.previewImages ?? []);
    const available = 3 - current.length;
    if (available <= 0) return;
    const imported = await window.naiDesktop.importStylePromptPresetImages(selectedStylePreset.id, available, `${selectedStylePreset.name} · ${tx("referenceImage")}`);
    if (imported.length) await updateStylePresetImages(selectedStylePreset.id, [...current, ...imported]);
  };
  useEffect(() => {
    if (!stylePresetMenuOpen) return;
    const close = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!stylePresetPickerRef.current?.contains(target) && !stylePresetMenuRef.current?.contains(target)) {
        setStylePresetMenuOpen(false);
        setHoveredStylePresetId("");
      }
    };
    const closeOnResize = () => {
      setStylePresetMenuOpen(false);
      setHoveredStylePresetId("");
    };
    const closeOnScroll = (event: Event) => {
      if (stylePresetMenuRef.current?.contains(event.target as Node)) return;
      closeOnResize();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [stylePresetMenuOpen]);
  const toggleStylePresetMenu = () => {
    if (stylePresetMenuOpen) {
      setStylePresetMenuOpen(false);
      setHoveredStylePresetId("");
      return;
    }
    const rect = stylePresetPickerRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(360, Math.max(300, rect.width));
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const availableBelow = window.innerHeight - rect.bottom - 12;
      const top = availableBelow >= 300 ? rect.bottom + 6 : Math.max(12, rect.top - 366);
      setStylePresetMenuPosition({ left, top, width });
    }
    setSelectedStylePresetGroup(selectedStylePreset?.group || groupedStylePresets[0]?.group || "all");
    setStylePresetMenuOpen(true);
  };
  const createProposal = () => {
    if (!lastAssistant || !character) return;
    updateMessage(lastAssistant.id, (message) => {
      message.imageProposal = {
        id: tavernId("image"), status: "pending",
        positivePrompt: defaultImagePromptForMessage(message, character),
        negativePrompt: userPromptDraft.negative.trim() || DEFAULT_TAVERN_NEGATIVE_PROMPT,
        stylePrompt: userPromptDraft.style,
        model: runtime.model,
        width: runtime.width, height: runtime.height,
        steps: runtime.steps, scale: runtime.scale,
        sampler: runtime.sampler,
        count: runtime.count, createdAt: tavernNow(),
      };
    });
  };
  return (
    <div className="tavern-panel-stack">
      <div className="tavern-section-title"><div><strong>{tx("imageSettingsTitle")}</strong><small>{tx("imageSettingsHint")}</small></div><ImageIcon /></div>
      {conversation ? <div className="tavern-mode-cards"><button className={conversation.generationMode === "confirm" ? "is-active" : ""} onClick={() => updateConversation((chat) => { chat.generationMode = "confirm"; })}><CheckIcon /><strong>{tx("userConfirmMode")}</strong><span>{tx("userConfirmHint")}</span></button><button className={conversation.generationMode === "auto" ? "is-active" : ""} onClick={() => updateConversation((chat) => { chat.generationMode = "auto"; })}><MagicIcon /><strong>{tx("autoMode")}</strong><span>{tx("autoModeHint")}</span></button></div> : null}
      {character ? (
        <section className="tavern-image-parameter-card">
          <header>
            <div><strong>{tx("sessionParams")}</strong><small>{tx("sessionParamsHint")}</small></div>
            <button type="button" onClick={() => updateVisual({
              model: defaults.model,
              width: defaults.width,
              height: defaults.height,
              steps: defaults.steps,
              scale: defaults.cfgScale,
              sampler: defaults.sampler,
              count: 1,
            })}><RefreshIcon />{tx("syncDefaults")}</button>
          </header>
          <Field label={tx("naiModel")}>
            <SelectMenuCompat value={runtime.model} onChange={(event) => updateVisual({ model: event.target.value })}>
              {NAI_MODELS.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
            </SelectMenuCompat>
          </Field>
          <section className="tavern-user-prompt-settings">
            <header><div><strong>{tx("userPromptSettings")}</strong><small>{tx("userPromptHint")}</small></div></header>
            <Field label={tx("stylePrompt")}>
              <textarea
                rows={3}
                value={userPromptDraft.style}
                onChange={(event) => setUserPromptDraft((current) => ({ ...current, style: event.target.value }))}
                placeholder={`e.g. artist:name, 0.8::artist:another::, cinematic lighting`}
              />
            </Field>
            <div className="style-preset-row tavern-shared-style-picker">
              <div className="style-preset-picker" ref={stylePresetPickerRef}>
                <button type="button" className="style-preset-trigger" aria-haspopup="listbox" aria-expanded={stylePresetMenuOpen} onClick={toggleStylePresetMenu}>
                  <span>{selectedStylePreset?.name ?? tx("chooseStyle")}</span>
                  <ChevronDownIcon />
                </button>
              </div>
              <div className="style-preset-actions">
                <button type="button" className="btn secondary" onClick={() => void importSelectedStylePreview()} disabled={!selectedStylePreset || (selectedStylePreset.previewImages ?? []).length >= 3}><ImageIcon />{tx("referenceImage")} {selectedStylePreset ? `${(selectedStylePreset.previewImages ?? []).length}/3` : ""}</button>
                <button type="button" className="btn secondary" onClick={() => void onSaveStylePreset(userPromptDraft.style)} disabled={!userPromptDraft.style.trim()}><AddIcon />{tx("addToList")}</button>
              </div>
            </div>
            {stylePresetMenuOpen ? createPortal((
              <div
                ref={stylePresetMenuRef}
                className="style-preset-menu tavern-shared-style-menu"
                role="listbox"
                style={{ left: stylePresetMenuPosition.left, top: stylePresetMenuPosition.top, width: stylePresetMenuPosition.width }}
              >
                <label className="tavern-style-menu-search"><SearchIcon /><input value={styleSearch} onChange={(event) => setStyleSearch(event.target.value)} placeholder={tx("searchStyles")} /></label>
                <div className="style-preset-menu-list">
                  {groupedStylePresets.length ? groupedStylePresets.map(({ group, items }) => {
                    const expanded = Boolean(styleSearch.trim()) || selectedStylePresetGroup === group;
                    return (
                      <section className={`style-folder ${expanded ? "expanded" : ""}`} key={group}>
                        <header>
                          <button type="button" onClick={() => setSelectedStylePresetGroup(expanded ? "all" : group)} aria-expanded={expanded}>
                            <FolderOpenIcon /><span>{group}</span><small>{items.length}</small><ChevronRightIcon />
                          </button>
                        </header>
                        {expanded ? <div className="style-folder-children">
                          {items.map((preset) => (
                            <div className={`style-preset-menu-item tavern-style-preset-menu-item ${userPromptDraft.style === preset.prompt ? "active" : ""}`} key={preset.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={userPromptDraft.style === preset.prompt}
                                onMouseEnter={() => setHoveredStylePresetId(preset.id)}
                                onMouseLeave={() => setHoveredStylePresetId("")}
                                onFocus={() => setHoveredStylePresetId(preset.id)}
                                onBlur={() => setHoveredStylePresetId("")}
                                onClick={() => {
                                  setUserPromptDraft((current) => ({ ...current, style: preset.prompt }));
                                  updateVisual({ stylePrompt: preset.prompt });
                                  setStylePresetMenuOpen(false);
                                  setHoveredStylePresetId("");
                                }}
                              >
                                <span>{preset.name}</span>
                                {(preset.previewImages ?? []).length ? <small><ImageIcon />{(preset.previewImages ?? []).length}/3</small> : <small>{tx("noReference")}</small>}
                              </button>
                            </div>
                          ))}
                        </div> : null}
                      </section>
                    );
                  }) : <p>{tx("noStyles")}</p>}
                </div>
                {hoveredStylePreset && (hoveredStylePreset.previewImages ?? []).length ? (
                  <aside className="style-preset-hover-preview">
                    <strong>{hoveredStylePreset.name}</strong>
                    <div>{(hoveredStylePreset.previewImages ?? []).slice(0, 3).map((image) => <img key={image.id} src={image.fileUrl} alt={`${hoveredStylePreset.name} · ${image.name}`} />)}</div>
                  </aside>
                ) : null}
              </div>
            ), document.body) : null}
            <Field label={tx("negativePrompt")}>
              <textarea
              rows={5}
              value={userPromptDraft.negative}
              onChange={(event) => setUserPromptDraft((current) => ({ ...current, negative: event.target.value }))}
            />
            </Field>
            <button type="button" className="tavern-reset-negative" onClick={() => {
              setUserPromptDraft((current) => ({ ...current, negative: DEFAULT_TAVERN_NEGATIVE_PROMPT }));
              updateVisual({ negativePrompt: DEFAULT_TAVERN_NEGATIVE_PROMPT });
            }}><RefreshIcon />{tx("restoreNegative")}</button>
          </section>
          <div className="tavern-size-groups" aria-label={tx("commonSizes")}>
            {sizeGroups.map((group) => <section key={group.label}>
              <header><strong>{group.label}</strong></header>
              <div className="tavern-size-presets">
                {group.items.map((preset) => (
                  <button
                    type="button"
                    key={preset.label}
                    className={runtime.width === preset.width && runtime.height === preset.height ? "is-active" : ""}
                    onClick={() => updateVisual({ width: preset.width, height: preset.height })}
                  >
                    <strong>{preset.label}</strong><span>{preset.width}×{preset.height}</span>
                  </button>
                ))}
              </div>
            </section>)}
          </div>
          <div className="tavern-image-parameter-grid">
            <Field label={tx("width")}><NumericField label={tx("imageWidth")} value={runtime.width} min={64} max={4096} step={64} onCommit={(width) => updateVisual({ width })} /></Field>
            <Field label={tx("height")}><NumericField label={tx("imageHeight")} value={runtime.height} min={64} max={4096} step={64} onCommit={(height) => updateVisual({ height })} /></Field>
            <Field label={tx("steps")}><NumericField label={tx("steps")} value={runtime.steps} min={1} max={50} onCommit={(steps) => updateVisual({ steps })} /></Field>
            <Field label="CFG Scale"><NumericField label="CFG Scale" value={runtime.scale} min={0} max={10} step={0.1} onCommit={(scale) => updateVisual({ scale })} /></Field>
            <Field label={tx("imageCount")}><NumericField label={tx("imageCount")} value={runtime.count} min={1} max={8} onCommit={(count) => updateVisual({ count })} /></Field>
          </div>
          <Field label={tx("sampler")}>
            <SelectMenuCompat value={runtime.sampler} onChange={(event) => updateVisual({ sampler: event.target.value })}>
              {NAI_SAMPLERS.map((sampler) => <option key={sampler.value} value={sampler.value}>{sampler.label}</option>)}
            </SelectMenuCompat>
          </Field>
          <p className="tavern-parameter-chat-hint"><MessageIcon /><span>{tx("chatAdjustHint")}</span></p>
        </section>
      ) : null}
      <button className="tavern-wide-action" onClick={createProposal} disabled={!lastAssistant || !character}><MagicIcon />{tx("createFromLatest")}</button>
      <section className="tavern-info-card"><SparklesIcon /><span><strong>{tx("extensionTitle")}</strong><br />{tx("extensionHint")}</span></section>
      <div className="tavern-image-summary"><strong>{tx("currentChat")}</strong><span>{tx("proposalsCount", { count: conversation?.messages.filter((item) => item.imageProposal).length ?? 0 })}</span><span>{tx("imagesCount", { count: conversation?.messages.reduce((sum, item) => sum + item.attachments.filter((attachment) => attachment.kind === "image").length, 0) ?? 0 })}</span><span>{tx("charactersCount", { count: workspace.characters.length })}</span></div>
    </div>
  );
}
