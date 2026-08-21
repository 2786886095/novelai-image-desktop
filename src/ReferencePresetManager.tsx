import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { AppPortal, Button, NumberInput } from "./components/ui";
import ReferenceCatalogPanel from "./ReferenceCatalogPanel";
import { catalogCategoryName, catalogGroupName, catalogGameName } from "./referenceCatalog";
import { useAppStore } from "./store";
import type {
  AppLanguage,
  PreciseReferenceType,
  ReferencePreset,
  ReferencePresetKind,
  ReferencePresetLibrary,
  ReferencePresetSaveRequest,
} from "./types";

const EMPTY_LIBRARY: ReferencePresetLibrary = { groups: [], presets: [] };
const ALL_REFERENCE_KINDS: ReferencePresetKind[] = ["vibe", "precise"];
const LOCAL_GRID_COLUMNS_KEY = "langbai.reference-presets.columns.v1";

const MANAGER_NAV_TEXT = {
  "zh-CN": { online: "在线下载", local: "本机预设", cardsPerRow: "每排显示", deleteGroup: "删除分组", deleteGroupTitle: "删除这个分组？", deleteGroupHint: "分组内的预设图片不会被删除，将统一移到“未分组”。", deleteGroupDone: "分组已删除，原有预设已移到未分组。" },
  "zh-TW": { online: "線上下載", local: "本機預設", cardsPerRow: "每列顯示", deleteGroup: "刪除分組", deleteGroupTitle: "刪除這個分組？", deleteGroupHint: "分組內的預設圖片不會刪除，將統一移到「未分組」。", deleteGroupDone: "分組已刪除，原有預設已移到未分組。" },
  "en-US": { online: "Online downloads", local: "Local presets", cardsPerRow: "Cards per row", deleteGroup: "Delete group", deleteGroupTitle: "Delete this group?", deleteGroupHint: "Preset images will be kept and moved to Ungrouped.", deleteGroupDone: "Group deleted. Its presets were moved to Ungrouped." },
  "ja-JP": { online: "オンライン", local: "ローカル", cardsPerRow: "1行の件数", deleteGroup: "グループ削除", deleteGroupTitle: "このグループを削除しますか？", deleteGroupHint: "画像は削除されず、「未分類」へ移動します。", deleteGroupDone: "グループを削除し、プリセットを未分類へ移動しました。" },
  "ko-KR": { online: "온라인 다운로드", local: "로컬 프리셋", cardsPerRow: "행당 카드", deleteGroup: "그룹 삭제", deleteGroupTitle: "이 그룹을 삭제할까요?", deleteGroupHint: "프리셋 이미지는 삭제되지 않고 미분류로 이동합니다.", deleteGroupDone: "그룹을 삭제하고 프리셋을 미분류로 이동했습니다." },
} as const;

export interface ReferencePresetApplyPayload {
  base64: string;
  previewUrl: string;
}

export interface ReferencePresetManagerProps {
  onBack?: () => void;
  modal?: boolean;
  onApplied?: () => void;
  onApplyPreset?: (
    preset: ReferencePreset,
    payload: ReferencePresetApplyPayload,
  ) => void | Promise<void>;
  allowedKinds?: ReferencePresetKind[];
}

const TEXT = {
  "zh-CN": {
    title: "参考图快捷预设",
    subtitle: "本机保存氛围迁移与精准参考图片及参数，可随时复用或跨设备导入导出。",
    back: "返回工具",
    add: "新建预设",
    name: "预设名称",
    group: "分组",
    noGroup: "未分组",
    kind: "预设类型",
    vibe: "氛围迁移",
    precise: "精准参考",
    image: "选择图片",
    save: "保存到本机",
    use: "应用到生成",
    remove: "删除",
    import: "导入 .nairp",
    exportAll: "导出全部",
    exportGroup: "导出分组",
    exportOne: "导出",
    all: "全部",
    empty: "还没有保存的参考图预设",
    info: "信息提取量",
    strength: "参考强度",
    fidelity: "保真度",
    type: "参考类型",
    character: "角色",
    style: "风格",
    both: "角色与风格",
    chooseRequired: "请选择图片并填写预设名称。",
    saved: "预设已保存到本机。",
    applied: "预设已加入生成页。",
    imported: "预设导入完成。",
    exported: "预设已导出。",
    quickSave: "存入预设",
    open: "打开预设库",
    cancel: "取消",
    createTitle: "创建参考预设",
    createHint: "选择图片、参数和归属分组，保存后即可在生成页直接调用。",
    library: "本机预设库",
    groupName: "新分组名称",
    createGroup: "创建分组",
    currentGroup: "当前分组",
    saveCurrent: "保存并加入当前分组",
    moveGroup: "移动到分组",
    moved: "预设分组已更新。",
    groupCreated: "分组已创建，可直接加入预设。",
    imageHint: "点击选择一张氛围图或精准参考图",
    replaceImage: "更换图片",
    presetCount: "个预设",
    groupCount: "个分组",
    search: "搜索预设名称或分组",
    selected: "已选择",
    applySelected: "应用所选预设",
    clearSelection: "清空选择",
    preview: "双击预览大图",
    confirmDelete: "确认删除这个预设？删除后无法恢复。",
    createPreset: "创建参考预设",
  },
  "zh-TW": {
    title: "參考圖快捷預設", subtitle: "在本機儲存氛圍轉移與精準參考圖片及參數，可隨時重用或跨裝置匯入匯出。", back: "返回工具", add: "新增預設", name: "預設名稱", group: "分組", noGroup: "未分組", kind: "預設類型", vibe: "氛圍轉移", precise: "精準參考", image: "選擇圖片", save: "儲存到本機", use: "套用到生成", remove: "刪除", import: "匯入 .nairp", exportAll: "匯出全部", exportGroup: "匯出分組", exportOne: "匯出", all: "全部", empty: "尚未儲存參考圖預設", info: "資訊提取量", strength: "參考強度", fidelity: "保真度", type: "參考類型", character: "角色", style: "風格", both: "角色與風格", chooseRequired: "請選擇圖片並填寫預設名稱。", saved: "預設已儲存到本機。", applied: "預設已加入生成頁。", imported: "預設匯入完成。", exported: "預設已匯出。", quickSave: "存入預設", open: "開啟預設庫", cancel: "取消", createTitle: "建立參考預設", createHint: "選擇圖片、參數與分組，儲存後即可在生成頁直接使用。", library: "本機預設庫", groupName: "新分組名稱", createGroup: "建立分組", currentGroup: "目前分組", saveCurrent: "儲存並加入目前分組", moveGroup: "移動到分組", moved: "預設分組已更新。", groupCreated: "分組已建立，可直接加入預設。", imageHint: "點擊選擇氛圍圖或精準參考圖", replaceImage: "更換圖片", presetCount: "個預設", groupCount: "個分組", search: "搜尋預設名稱或分組", selected: "已選擇", applySelected: "套用所選預設", clearSelection: "清空選擇", preview: "雙擊預覽大圖", confirmDelete: "確認刪除這個預設？刪除後無法復原。", createPreset: "建立參考預設",
  },
  "en-US": {
    title: "Reference presets", subtitle: "Keep Vibe Transfer and Precise Reference images and settings locally, then reuse or move them between devices.", back: "Back to Tools", add: "New preset", name: "Preset name", group: "Group", noGroup: "Ungrouped", kind: "Preset type", vibe: "Vibe Transfer", precise: "Precise Reference", image: "Choose image", save: "Save locally", use: "Apply to Generate", remove: "Delete", import: "Import .nairp", exportAll: "Export all", exportGroup: "Export group", exportOne: "Export", all: "All", empty: "No reference presets saved yet", info: "Information extracted", strength: "Reference strength", fidelity: "Fidelity", type: "Reference type", character: "Character", style: "Style", both: "Character & style", chooseRequired: "Choose an image and enter a preset name.", saved: "Preset saved locally.", applied: "Preset added to Generate.", imported: "Preset import complete.", exported: "Preset exported.", quickSave: "Save preset", open: "Open preset library", cancel: "Cancel", createTitle: "Create reference preset", createHint: "Choose an image, settings, and group. Saved presets are ready in Generate.", library: "Local preset library", groupName: "New group name", createGroup: "Create group", currentGroup: "Current group", saveCurrent: "Save to current group", moveGroup: "Move to group", moved: "Preset group updated.", groupCreated: "Group created and ready for presets.", imageHint: "Choose a Vibe or Precise Reference image", replaceImage: "Replace image", presetCount: "presets", groupCount: "groups", search: "Search presets by name or group", selected: "selected", applySelected: "Apply selected presets", clearSelection: "Clear selection", preview: "Double-click to preview", confirmDelete: "Delete this preset? This cannot be undone.", createPreset: "Create reference preset",
  },
  "ja-JP": {
    title: "参照画像プリセット", subtitle: "Vibe Transfer と Precise Reference の画像・設定を端末内に保存し、再利用や端末間移行ができます。", back: "ツールへ戻る", add: "新規プリセット", name: "プリセット名", group: "グループ", noGroup: "未分類", kind: "種類", vibe: "Vibe Transfer", precise: "Precise Reference", image: "画像を選択", save: "端末に保存", use: "生成に適用", remove: "削除", import: ".nairp を読込", exportAll: "すべて書出し", exportGroup: "グループを書出し", exportOne: "書出し", all: "すべて", empty: "保存済みプリセットはありません", info: "情報抽出量", strength: "参照強度", fidelity: "忠実度", type: "参照タイプ", character: "キャラクター", style: "スタイル", both: "キャラクターとスタイル", chooseRequired: "画像とプリセット名を指定してください。", saved: "端末に保存しました。", applied: "生成画面に追加しました。", imported: "読込が完了しました。", exported: "書出しが完了しました。", quickSave: "プリセット保存", open: "プリセットを開く", cancel: "キャンセル", createTitle: "参照プリセットを作成", createHint: "画像・設定・グループを選ぶと、生成画面ですぐ再利用できます。", library: "ローカルプリセット", groupName: "新しいグループ名", createGroup: "グループ作成", currentGroup: "現在のグループ", saveCurrent: "現在のグループに保存", moveGroup: "グループを移動", moved: "グループを更新しました。", groupCreated: "グループを作成しました。", imageHint: "Vibe または Precise Reference 画像を選択", replaceImage: "画像を変更", presetCount: "件", groupCount: "グループ", search: "名前またはグループを検索", selected: "件選択", applySelected: "選択したプリセットを適用", clearSelection: "選択解除", preview: "ダブルクリックでプレビュー", confirmDelete: "このプリセットを削除しますか？元に戻せません。", createPreset: "参照プリセットを作成",
  },
  "ko-KR": {
    title: "참조 이미지 프리셋", subtitle: "Vibe Transfer와 Precise Reference 이미지 및 설정을 기기에 저장하고 재사용하거나 다른 기기로 옮길 수 있습니다.", back: "도구로 돌아가기", add: "새 프리셋", name: "프리셋 이름", group: "그룹", noGroup: "미분류", kind: "프리셋 종류", vibe: "Vibe Transfer", precise: "Precise Reference", image: "이미지 선택", save: "기기에 저장", use: "생성에 적용", remove: "삭제", import: ".nairp 가져오기", exportAll: "전체 내보내기", exportGroup: "그룹 내보내기", exportOne: "내보내기", all: "전체", empty: "저장된 참조 프리셋이 없습니다", info: "정보 추출량", strength: "참조 강도", fidelity: "충실도", type: "참조 유형", character: "캐릭터", style: "스타일", both: "캐릭터와 스타일", chooseRequired: "이미지를 선택하고 프리셋 이름을 입력하세요.", saved: "기기에 저장했습니다.", applied: "생성 화면에 추가했습니다.", imported: "가져오기가 완료되었습니다.", exported: "내보내기가 완료되었습니다.", quickSave: "프리셋 저장", open: "프리셋 열기", cancel: "취소", createTitle: "참조 프리셋 만들기", createHint: "이미지, 설정, 그룹을 선택하면 생성 화면에서 바로 사용할 수 있습니다.", library: "로컬 프리셋", groupName: "새 그룹 이름", createGroup: "그룹 만들기", currentGroup: "현재 그룹", saveCurrent: "현재 그룹에 저장", moveGroup: "그룹 이동", moved: "프리셋 그룹을 변경했습니다.", groupCreated: "그룹을 만들었습니다.", imageHint: "Vibe 또는 Precise Reference 이미지 선택", replaceImage: "이미지 변경", presetCount: "개 프리셋", groupCount: "개 그룹", search: "이름 또는 그룹 검색", selected: "개 선택", applySelected: "선택한 프리셋 적용", clearSelection: "선택 해제", preview: "더블 클릭하여 미리보기", confirmDelete: "이 프리셋을 삭제할까요? 삭제 후 복구할 수 없습니다.", createPreset: "참조 프리셋 만들기",
  },
} as const;

const REFERENCE_PRESET_HELP = {
  "zh-CN": {
    infoLabel: "信息提取量（Information Extracted）",
    strengthLabel: "参考强度（Reference Strength）",
    preciseStrengthLabel: "参考强度（Strength）",
    fidelityLabel: "保真度（Fidelity）",
    typeLabel: "参考类型（Reference Type）",
    infoHelp: "调低会先减少纹理和高频细节；调高会从参考图提取更多视觉信息。",
    vibeStrengthHelp: "越高越接近参考图的整体氛围与画风，越低越服从文字提示词。",
    preciseStrengthHelp: "控制精准参考对结果的影响程度；越高，参考特征越明显。",
    fidelityHelp: "控制对参考图细节的忠实程度；越高，越严格保留参考特征。",
    typeHelp: "选择参考角色、画风，或同时参考两者。",
  },
  "zh-TW": {
    infoLabel: "資訊提取量（Information Extracted）", strengthLabel: "參考強度（Reference Strength）", preciseStrengthLabel: "參考強度（Strength）", fidelityLabel: "保真度（Fidelity）", typeLabel: "參考類型（Reference Type）",
    infoHelp: "調低會先減少紋理和高頻細節；調高會從參考圖提取更多視覺資訊。", vibeStrengthHelp: "越高越接近參考圖的整體氛圍與畫風，越低越服從文字提示詞。", preciseStrengthHelp: "控制精準參考對結果的影響程度；越高，參考特徵越明顯。", fidelityHelp: "控制對參考圖細節的忠實程度；越高，越嚴格保留參考特徵。", typeHelp: "選擇參考角色、畫風，或同時參考兩者。",
  },
  "en-US": {
    infoLabel: "Information Extracted", strengthLabel: "Reference Strength", preciseStrengthLabel: "Strength", fidelityLabel: "Fidelity", typeLabel: "Reference Type",
    infoHelp: "Lower values discard texture and high-frequency details first; higher values extract more visual information.", vibeStrengthHelp: "Higher values follow the reference vibe and style more strongly; lower values give the text prompt more control.", preciseStrengthHelp: "Controls how strongly the precise reference influences the result; higher values make its features more prominent.", fidelityHelp: "Controls how faithfully reference details are retained; higher values preserve them more strictly.", typeHelp: "Choose whether to reference the character, the style, or both.",
  },
  "ja-JP": {
    infoLabel: "情報抽出量（Information Extracted）", strengthLabel: "参照強度（Reference Strength）", preciseStrengthLabel: "参照強度（Strength）", fidelityLabel: "忠実度（Fidelity）", typeLabel: "参照タイプ（Reference Type）",
    infoHelp: "値を下げるとテクスチャや高周波の細部から減り、上げると参照画像からより多くの視覚情報を抽出します。", vibeStrengthHelp: "高いほど参照画像の雰囲気と画風を強く反映し、低いほど文字プロンプトを優先します。", preciseStrengthHelp: "精密参照が結果へ与える影響を調整します。高いほど参照特徴が強く現れます。", fidelityHelp: "参照画像の細部をどれだけ忠実に保つか調整します。高いほど厳密に保持します。", typeHelp: "キャラクター、画風、またはその両方を参照するか選択します。",
  },
  "ko-KR": {
    infoLabel: "정보 추출량(Information Extracted)", strengthLabel: "참조 강도(Reference Strength)", preciseStrengthLabel: "참조 강도(Strength)", fidelityLabel: "충실도(Fidelity)", typeLabel: "참조 유형(Reference Type)",
    infoHelp: "값을 낮추면 텍스처와 고주파 세부 정보부터 줄고, 높이면 참고 이미지에서 더 많은 시각 정보를 추출합니다.", vibeStrengthHelp: "높을수록 참고 이미지의 분위기와 화풍을 강하게 따르고, 낮을수록 텍스트 프롬프트를 우선합니다.", preciseStrengthHelp: "정밀 참조가 결과에 미치는 영향을 조절합니다. 높을수록 참조 특징이 더 뚜렷합니다.", fidelityHelp: "참고 이미지의 세부 특징을 얼마나 충실히 유지할지 조절합니다. 높을수록 더 엄격히 보존합니다.", typeHelp: "캐릭터, 화풍 또는 둘 다 참조할지 선택합니다.",
  },
} as const;

function useText() {
  const language = useAppStore((state) => state.settings?.language) as AppLanguage | undefined;
  const selected = language && language in TEXT ? language : "zh-CN";
  return { ...TEXT[selected], ...REFERENCE_PRESET_HELP[selected] };
}

export function referencePresetTextFor(language: unknown) {
  return TEXT[typeof language === "string" && language in TEXT ? language as keyof typeof TEXT : "zh-CN"];
}

function fileToSource(file: File) {
  return new Promise<{ base64: string; previewUrl: string; width: number; height: number; extension: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const previewUrl = String(reader.result ?? "");
      const probe = new Image();
      probe.onerror = () => reject(new Error("Invalid image"));
      probe.onload = () => resolve({
        base64: previewUrl.split(",")[1] ?? "",
        previewUrl,
        width: probe.naturalWidth,
        height: probe.naturalHeight,
        extension: file.name.split(".").pop() || "png",
      });
      probe.src = previewUrl;
    };
    reader.readAsDataURL(file);
  });
}

export type QuickPresetSource = Omit<ReferencePresetSaveRequest, "name" | "group"> & { previewUrl: string };

export function ReferencePresetQuickSaveDialog({ source, onClose }: { source: QuickPresetSource; onClose: () => void }) {
  const text = useText();
  const language = useAppStore((state) => state.settings?.language) as AppLanguage | undefined;
  const setToast = useAppStore((state) => state.setToast);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.naiDesktop.listReferencePresets().then((library) => setGroups(library.groups));
  }, []);
  const save = async () => {
    if (!name.trim()) return setToast(text.chooseRequired);
    setBusy(true);
    const { previewUrl: _previewUrl, ...payload } = source;
    const result = await window.naiDesktop.saveReferencePreset({ ...payload, name, group });
    setBusy(false);
    setToast(result.ok ? text.saved : result.message || text.chooseRequired);
    if (result.ok) onClose();
  };
  return (
    <AppPortal>
      <div className="modal-backdrop reference-preset-dialog-backdrop">
        <section className="modal reference-preset-quick-dialog">
          <header><h2>{text.quickSave}</h2><button onClick={onClose}>×</button></header>
          <div className="reference-preset-quick-body">
            <img src={source.previewUrl} alt="" />
            <label className="field"><span>{text.name}</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="field"><span>{text.group}</span><input list="reference-preset-quick-groups" value={group} placeholder={text.createHint} onChange={(event) => setGroup(event.target.value)} /><datalist id="reference-preset-quick-groups">{groups.map((item) => <option key={item} value={item} label={catalogGroupName(item, language)} />)}</datalist></label>
          </div>
          <footer><Button onClick={onClose}>{text.cancel}</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>{text.save}</Button></footer>
        </section>
      </div>
    </AppPortal>
  );
}

export default function ReferencePresetManager({
  onBack,
  modal = false,
  onApplied,
  onApplyPreset,
  allowedKinds = ALL_REFERENCE_KINDS,
}: ReferencePresetManagerProps) {
  const text = useText();
  const language = useAppStore((state) => state.settings?.language) as AppLanguage | undefined;
  const setToast = useAppStore((state) => state.setToast);
  const addVibeImage = useAppStore((state) => state.addVibeImage);
  const addPreciseReference = useAppStore((state) => state.addPreciseReference);
  const [library, setLibrary] = useState(EMPTY_LIBRARY);
  const [groupFilter, setGroupFilter] = useState("__all__");
  const [kindFilter, setKindFilter] = useState<ReferencePresetKind | "all">(
    () => allowedKinds.length === 1 ? allowedKinds[0] : "all",
  );
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [kind, setKind] = useState<ReferencePresetKind>(() => allowedKinds[0] ?? "vibe");
  const [source, setSource] = useState<Awaited<ReturnType<typeof fileToSource>> | null>(null);
  const [infoExtracted, setInfoExtracted] = useState(1);
  const [strength, setStrength] = useState(1);
  const [fidelity, setFidelity] = useState(1);
  const [preciseType, setPreciseType] = useState<PreciseReferenceType>("character");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [previewPreset, setPreviewPreset] = useState<ReferencePreset | null>(null);
  const [section, setSection] = useState<"online" | "local">(() => modal ? "local" : "online");
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem(LOCAL_GRID_COLUMNS_KEY));
    return [2, 3, 4, 5].includes(stored) ? stored : 3;
  });
  const sectionRef = useRef<HTMLDivElement>(null);
  const navText = MANAGER_NAV_TEXT[language && language in MANAGER_NAV_TEXT ? language : "zh-CN"];

  const refresh = useCallback(async () => setLibrary(await window.naiDesktop.listReferencePresets()), []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { globalThis.localStorage?.setItem(LOCAL_GRID_COLUMNS_KEY, String(gridColumns)); }, [gridColumns]);
  useLayoutEffect(() => {
    if (!sectionRef.current || document.hidden || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = gsap.fromTo(sectionRef.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out", clearProps: "transform,opacity,visibility" });
    return () => { animation.kill(); };
  }, [section]);

  const localizedPresetName = (preset: ReferencePreset) =>
    preset.sourceNames?.[language ?? "zh-CN"] || preset.sourceNames?.["zh-CN"] || preset.name;
  const localizedPresetGroup = (preset: ReferencePreset) => {
    if (preset.sourceGameId && preset.sourceCategory) {
      return `${catalogGameName(preset.sourceGameId, language, preset.sourceGameNames)} · ${catalogCategoryName(preset.sourceCategory, language)}`;
    }
    return catalogGroupName(preset.group, language);
  };

  const presets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return library.presets
      .filter((preset) => allowedKinds.includes(preset.kind))
      .filter((preset) => groupFilter === "__all__" || preset.group === groupFilter)
      .filter((preset) => kindFilter === "all" || preset.kind === kindFilter)
      .filter((preset) => !normalizedQuery || [preset.name, preset.group, preset.sourceGameId, preset.sourceCategory, ...Object.values(preset.sourceNames ?? {}), ...Object.values(preset.sourceGameNames ?? {})].filter(Boolean).join("\n").toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [allowedKinds, library, groupFilter, kindFilter, query]);

  const save = async () => {
    if (!source || !name.trim()) return setToast(text.chooseRequired);
    setBusy(true);
    const result = await window.naiDesktop.saveReferencePreset({
      name, group, kind, base64: source.base64, extension: source.extension,
      infoExtracted, strength, preciseType, fidelity, informationExtracted: 1,
      width: source.width, height: source.height,
    });
    setBusy(false);
    if (!result.ok) return setToast(result.message || text.chooseRequired);
    setLibrary(result.library || EMPTY_LIBRARY);
    setName(""); setSource(null);
    setShowCreate(false);
    setToast(text.saved);
  };

  const applyOne = async (preset: ReferencePreset) => {
    const result = await window.naiDesktop.readReferencePreset(preset.id);
    if (!result.ok || !result.base64 || !result.preset) return setToast(result.message || text.chooseRequired);
    const saved = result.preset;
    const previewUrl = saved.fileUrl;
    if (onApplyPreset) {
      await onApplyPreset(saved, { base64: result.base64, previewUrl });
    } else if (saved.kind === "vibe") {
      addVibeImage({ id: crypto.randomUUID(), previewUrl, base64: result.base64, infoExtracted: saved.infoExtracted, strength: saved.strength });
    } else {
      addPreciseReference({ id: crypto.randomUUID(), previewUrl, base64: result.base64, type: saved.preciseType, strength: saved.strength, fidelity: saved.fidelity, informationExtracted: 1, srcWidth: saved.width, srcHeight: saved.height });
    }
    return true;
  };

  const apply = async (preset: ReferencePreset) => {
    if (await applyOne(preset)) {
      setToast(text.applied);
      onApplied?.();
    }
  };

  const applySelected = async () => {
    if (selectedIds.size === 0 || busy) return;
    setBusy(true);
    let appliedCount = 0;
    for (const preset of library.presets.filter((item) => selectedIds.has(item.id))) {
      if (await applyOne(preset)) appliedCount += 1;
    }
    setBusy(false);
    if (appliedCount > 0) {
      setToast(`${text.applied} ${appliedCount}`);
      onApplied?.();
    }
  };

  const toggleSelected = (presetId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(presetId)) next.delete(presetId);
      else next.add(presetId);
      return next;
    });
  };

  const removePreset = async (preset: ReferencePreset) => {
    if (!window.confirm(text.confirmDelete)) return;
    await runOperation(() => window.naiDesktop.deleteReferencePreset(preset.id), text.remove);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(preset.id);
      return next;
    });
  };

  const runOperation = async (operation: () => Promise<{ ok: boolean; message?: string; library?: ReferencePresetLibrary }>, success: string) => {
    setBusy(true);
    const result = await operation();
    setBusy(false);
    if (result.library) setLibrary(result.library);
    else if (result.ok) await refresh();
    setToast(result.ok ? success : result.message || success);
  };

  const createGroup = async () => {
    const nextGroup = newGroupName.trim();
    if (!nextGroup) return setToast(text.groupName);
    setBusy(true);
    const result = await window.naiDesktop.createReferencePresetGroup(nextGroup);
    setBusy(false);
    if (!result.ok) return setToast(result.message || text.groupName);
    setLibrary(result.library || EMPTY_LIBRARY);
    setGroupFilter(nextGroup);
    setGroup(nextGroup);
    setNewGroupName("");
    setToast(text.groupCreated);
  };

  const moveToGroup = async (presetId: string, nextGroup: string) => {
    setBusy(true);
    const result = await window.naiDesktop.moveReferencePresetToGroup(presetId, nextGroup);
    setBusy(false);
    if (result.library) setLibrary(result.library);
    setToast(result.ok ? text.moved : result.message || text.moved);
  };

  const deleteGroup = async () => {
    if (!deleteGroupTarget || busy) return;
    const target = deleteGroupTarget;
    setBusy(true);
    const result = await window.naiDesktop.deleteReferencePresetGroup(target);
    setBusy(false);
    if (!result.ok) return setToast(result.message || navText.deleteGroup);
    setLibrary(result.library || EMPTY_LIBRARY);
    setGroupFilter("__all__");
    if (group === target) setGroup("");
    setDeleteGroupTarget(null);
    setToast(navText.deleteGroupDone);
  };

  const selectGroup = (value: string) => {
    setGroupFilter(value);
    if (value !== "__all__") setGroup(value);
  };

  const createPanel = (
    <section className="reference-preset-create panel-card">
      <header className="reference-preset-section-heading"><div><h3>{text.createTitle}</h3><p>{text.createHint}</p></div><button className="reference-preset-close" type="button" onClick={() => setShowCreate(false)} aria-label={text.cancel}>×</button></header>
      <label className={`reference-preset-create-image ${source ? "has-image" : ""}`} style={source && source.width > 0 && source.height > 0 ? { aspectRatio: `${source.width} / ${source.height}` } : undefined}>
        {source ? <img src={source.previewUrl} alt={name || text.image} /> : <div><strong>{text.image}</strong><span>{text.imageHint}</span></div>}
        <span className="btn btn-secondary">{source ? text.replaceImage : text.image}</span>
        <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void fileToSource(file).then(setSource).catch(() => setToast(text.chooseRequired)); event.target.value = ""; }} />
      </label>
      {allowedKinds.length > 1 && <div className="reference-preset-kind-tabs" role="group" aria-label={text.kind}>
        {allowedKinds.includes("vibe") && <button className={kind === "vibe" ? "active" : ""} onClick={() => { setKind("vibe"); setStrength(1); }}>{text.vibe}</button>}
        {allowedKinds.includes("precise") && <button className={kind === "precise" ? "active" : ""} onClick={() => { setKind("precise"); setStrength(1); }}>{text.precise}</button>}
      </div>}
      <div className="reference-preset-create-fields">
        <label className="field reference-preset-field-wide"><span>{text.name}</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="field reference-preset-field-wide"><span>{text.group}</span><input list="reference-preset-create-groups" value={group} placeholder={text.noGroup} onChange={(event) => setGroup(event.target.value)} /><datalist id="reference-preset-create-groups">{library.groups.map((item) => <option key={item} value={item} />)}</datalist></label>
        {kind === "precise" && <label className="field reference-preset-field-wide"><span>{text.typeLabel}</span><select value={preciseType} onChange={(event) => setPreciseType(event.target.value as PreciseReferenceType)}><option value="character">{text.character}</option><option value="style">{text.style}</option><option value="character&style">{text.both}</option></select><small>{text.typeHelp}</small></label>}
        <div className="reference-preset-parameter"><NumberInput label={kind === "vibe" ? text.infoLabel : text.preciseStrengthLabel} value={kind === "vibe" ? infoExtracted : strength} min={0} max={1} step={0.01} onChange={kind === "vibe" ? setInfoExtracted : setStrength} /><small>{kind === "vibe" ? text.infoHelp : text.preciseStrengthHelp}</small></div>
        <div className="reference-preset-parameter"><NumberInput label={kind === "vibe" ? text.strengthLabel : text.fidelityLabel} value={kind === "vibe" ? strength : fidelity} min={0} max={1} step={0.01} onChange={kind === "vibe" ? setStrength : setFidelity} /><small>{kind === "vibe" ? text.vibeStrengthHelp : text.fidelityHelp}</small></div>
      </div>
      <Button className="reference-preset-save" variant="primary" disabled={busy} onClick={() => void save()}>{group ? text.saveCurrent : text.save}</Button>
    </section>
  );

  const content = (
    <main className={`reference-preset-manager ${modal ? "is-modal is-picker has-close" : ""}`}>
      <section className="reference-preset-hero">
        <div className="reference-preset-hero-copy"><h2>{text.title}</h2><p>{text.subtitle}</p></div>
        <div className="reference-preset-summary" aria-label={text.library}><span><strong>{library.presets.length}</strong>{text.presetCount}</span><span><strong>{library.groups.length}</strong>{text.groupCount}</span></div>
        {!modal && <div className="reference-preset-actions"><Button variant="primary" onClick={() => setShowCreate(true)}>{text.createPreset}</Button><Button onClick={() => void runOperation(() => window.naiDesktop.importReferencePresets(), text.imported)}>{text.import}</Button><Button onClick={() => void runOperation(() => window.naiDesktop.exportReferencePresets(), text.exported)}>{text.exportAll}</Button></div>}
        {modal && <Button onClick={() => void runOperation(() => window.naiDesktop.importReferencePresets(), text.imported)}>{text.import}</Button>}
        {modal && onBack && <button className="reference-preset-close reference-preset-manager-close" type="button" onClick={onBack} aria-label={text.cancel}>×</button>}
      </section>

      {!modal && <nav className="weui-navbar reference-preset-primary-tabs" aria-label={text.title}>
        <button type="button" className={`weui-navbar__item ${section === "online" ? "weui-bar__item_on" : ""}`} aria-current={section === "online" ? "page" : undefined} onClick={() => setSection("online")}>{navText.online}</button>
        <button type="button" className={`weui-navbar__item ${section === "local" ? "weui-bar__item_on" : ""}`} aria-current={section === "local" ? "page" : undefined} onClick={() => setSection("local")}>{navText.local}<span className="reference-preset-tab-count">{library.presets.length}</span></button>
      </nav>}

      <div ref={sectionRef} className="reference-preset-section-content">
      {(modal || section === "local") && <section className="reference-preset-library panel-card">
        <header className="reference-preset-section-heading reference-preset-library-heading"><div><h3>{text.library}</h3><p>{text.currentGroup} · {groupFilter === "__all__" ? text.all : groupFilter ? catalogGroupName(groupFilter, language) : text.noGroup}</p></div>{!modal && groupFilter !== "__all__" && <Button onClick={() => void runOperation(() => window.naiDesktop.exportReferencePresets({ group: groupFilter }), text.exported)}>{text.exportGroup}</Button>}</header>
        <div className="reference-preset-search-row"><input type="search" value={query} placeholder={text.search} aria-label={text.search} onChange={(event) => setQuery(event.target.value)} /><label className="field"><span>{text.currentGroup}</span><select value={groupFilter} onChange={(event) => selectGroup(event.target.value)}><option value="__all__">{text.all}</option><option value="">{text.noGroup}</option>{library.groups.map((item) => <option key={item} value={item}>{catalogGroupName(item, language)}</option>)}</select></label><label className="field reference-preset-column-control"><span>{navText.cardsPerRow}</span><select value={gridColumns} onChange={(event) => setGridColumns(Number(event.target.value))}>{[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
        {!modal && <div className="reference-preset-group-toolbar"><label className="field reference-preset-new-group"><span>{text.groupName}</span><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createGroup(); }} /></label><Button disabled={busy || !newGroupName.trim()} onClick={() => void createGroup()}>{text.createGroup}</Button></div>}
        {!modal && groupFilter !== "__all__" && groupFilter !== "" && <div className="reference-preset-group-danger"><Button disabled={busy} onClick={() => setDeleteGroupTarget(groupFilter)}>{navText.deleteGroup}</Button><span>{navText.deleteGroupHint}</span></div>}
        {allowedKinds.length > 1 && <div className="reference-preset-kind-tabs reference-preset-filter-tabs" role="group" aria-label={text.kind}><button className={kindFilter === "all" ? "active" : ""} onClick={() => setKindFilter("all")}>{text.all}</button>{allowedKinds.includes("vibe") && <button className={kindFilter === "vibe" ? "active" : ""} onClick={() => setKindFilter("vibe")}>{text.vibe}</button>}{allowedKinds.includes("precise") && <button className={kindFilter === "precise" ? "active" : ""} onClick={() => setKindFilter("precise")}>{text.precise}</button>}</div>}
        {presets.length === 0 ? <section className="reference-preset-empty"><strong>{text.empty}</strong><span>{text.createHint}</span></section> : <section className="reference-preset-grid" style={{ "--reference-preset-columns": gridColumns } as CSSProperties}>{presets.map((preset) => {
          const selected = selectedIds.has(preset.id);
          return <article className={`reference-preset-card ${selected ? "is-selected" : ""}`} key={preset.id} onClick={modal ? () => toggleSelected(preset.id) : undefined} onDoubleClick={(event) => { event.stopPropagation(); setPreviewPreset(preset); }} onKeyDown={modal ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleSelected(preset.id); } } : undefined} tabIndex={modal ? 0 : undefined} aria-selected={modal ? selected : undefined}>
            <div className="reference-preset-image-frame" title={text.preview}><img src={preset.fileUrl} alt={localizedPresetName(preset)} loading="lazy" /><span>{preset.kind === "vibe" ? text.vibe : text.precise}</span>{modal && <input type="checkbox" checked={selected} readOnly tabIndex={-1} aria-label={`${localizedPresetName(preset)} ${text.selected}`} />}</div>
            <div className="reference-preset-card-body"><h3>{localizedPresetName(preset)}</h3><p>{preset.group ? localizedPresetGroup(preset) : text.noGroup}</p><small>{preset.kind === "vibe" ? `${text.infoLabel} ${preset.infoExtracted.toFixed(2)} · ${text.strengthLabel} ${preset.strength.toFixed(2)}` : `${text.typeLabel} ${preset.preciseType} · ${text.preciseStrengthLabel} ${preset.strength.toFixed(2)} · ${text.fidelityLabel} ${preset.fidelity.toFixed(2)}`}</small>{!modal && <label className="reference-preset-card-move" onClick={(event) => event.stopPropagation()}><span>{text.moveGroup}</span><select value={preset.group} disabled={busy} onChange={(event) => void moveToGroup(preset.id, event.target.value)}><option value="">{text.noGroup}</option>{library.groups.map((item) => <option key={item} value={item}>{catalogGroupName(item, language)}</option>)}</select></label>}</div>
            {!modal && <div className="reference-preset-card-actions"><Button variant="primary" onClick={() => void apply(preset)}>{text.use}</Button><Button onClick={() => void removePreset(preset)}>{text.remove}</Button></div>}
          </article>;
        })}</section>}
      </section>}
      {!modal && section === "online" && <ReferenceCatalogPanel library={library} onDownloaded={() => void refresh()} />}
      </div>
      {modal && <footer className="reference-preset-picker-footer"><span>{text.selected} <strong>{selectedIds.size}</strong></span><Button disabled={selectedIds.size === 0 || busy} onClick={() => setSelectedIds(new Set())}>{text.clearSelection}</Button><Button variant="primary" disabled={selectedIds.size === 0 || busy} onClick={() => void applySelected()}>{text.applySelected}</Button></footer>}
    </main>
  );

  return <>{modal ? <AppPortal><div className="modal-backdrop reference-preset-manager-backdrop"><div className="reference-preset-manager-modal">{content}</div></div></AppPortal> : content}{showCreate && <AppPortal><div className="modal-backdrop reference-preset-create-backdrop"><div className="reference-preset-create-modal">{createPanel}</div></div></AppPortal>}{previewPreset && <AppPortal><div className="modal-backdrop reference-preset-preview-backdrop" onClick={() => setPreviewPreset(null)}><div className="reference-preset-preview" onClick={(event) => event.stopPropagation()}><button className="reference-preset-close" type="button" onClick={() => setPreviewPreset(null)} aria-label={text.cancel}>×</button><img src={previewPreset.fileUrl} alt={localizedPresetName(previewPreset)} /><strong>{localizedPresetName(previewPreset)}</strong></div></div></AppPortal>}{deleteGroupTarget && <AppPortal><div className="weui-mask reference-preset-confirm-mask" onClick={() => setDeleteGroupTarget(null)}><section className="weui-dialog reference-preset-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reference-delete-group-title" onClick={(event) => event.stopPropagation()}><div className="weui-dialog__hd"><strong id="reference-delete-group-title" className="weui-dialog__title">{navText.deleteGroupTitle}</strong></div><div className="weui-dialog__bd"><b>{catalogGroupName(deleteGroupTarget, language)}</b><p>{navText.deleteGroupHint}</p></div><div className="weui-dialog__ft"><button type="button" className="weui-dialog__btn weui-dialog__btn_default" onClick={() => setDeleteGroupTarget(null)}>{text.cancel}</button><button type="button" className="weui-dialog__btn weui-dialog__btn_primary" disabled={busy} onClick={() => void deleteGroup()}>{navText.deleteGroup}</button></div></section></div></AppPortal>}</>;
}
