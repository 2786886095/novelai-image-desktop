import { useCallback, useEffect, useMemo, useState } from "react";
import { AppPortal, Button, NumberInput } from "./components/ui";
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
  },
  "zh-TW": {
    title: "參考圖快捷預設", subtitle: "在本機儲存氛圍轉移與精準參考圖片及參數，可隨時重用或跨裝置匯入匯出。", back: "返回工具", add: "新增預設", name: "預設名稱", group: "分組", noGroup: "未分組", kind: "預設類型", vibe: "氛圍轉移", precise: "精準參考", image: "選擇圖片", save: "儲存到本機", use: "套用到生成", remove: "刪除", import: "匯入 .nairp", exportAll: "匯出全部", exportGroup: "匯出分組", exportOne: "匯出", all: "全部", empty: "尚未儲存參考圖預設", info: "資訊提取量", strength: "參考強度", fidelity: "保真度", type: "參考類型", character: "角色", style: "風格", both: "角色與風格", chooseRequired: "請選擇圖片並填寫預設名稱。", saved: "預設已儲存到本機。", applied: "預設已加入生成頁。", imported: "預設匯入完成。", exported: "預設已匯出。", quickSave: "存入預設", open: "開啟預設庫", cancel: "取消",
  },
  "en-US": {
    title: "Reference presets", subtitle: "Keep Vibe Transfer and Precise Reference images and settings locally, then reuse or move them between devices.", back: "Back to Tools", add: "New preset", name: "Preset name", group: "Group", noGroup: "Ungrouped", kind: "Preset type", vibe: "Vibe Transfer", precise: "Precise Reference", image: "Choose image", save: "Save locally", use: "Apply to Generate", remove: "Delete", import: "Import .nairp", exportAll: "Export all", exportGroup: "Export group", exportOne: "Export", all: "All", empty: "No reference presets saved yet", info: "Information extracted", strength: "Reference strength", fidelity: "Fidelity", type: "Reference type", character: "Character", style: "Style", both: "Character & style", chooseRequired: "Choose an image and enter a preset name.", saved: "Preset saved locally.", applied: "Preset added to Generate.", imported: "Preset import complete.", exported: "Preset exported.", quickSave: "Save preset", open: "Open preset library", cancel: "Cancel",
  },
  "ja-JP": {
    title: "参照画像プリセット", subtitle: "Vibe Transfer と Precise Reference の画像・設定を端末内に保存し、再利用や端末間移行ができます。", back: "ツールへ戻る", add: "新規プリセット", name: "プリセット名", group: "グループ", noGroup: "未分類", kind: "種類", vibe: "Vibe Transfer", precise: "Precise Reference", image: "画像を選択", save: "端末に保存", use: "生成に適用", remove: "削除", import: ".nairp を読込", exportAll: "すべて書出し", exportGroup: "グループを書出し", exportOne: "書出し", all: "すべて", empty: "保存済みプリセットはありません", info: "情報抽出量", strength: "参照強度", fidelity: "忠実度", type: "参照タイプ", character: "キャラクター", style: "スタイル", both: "キャラクターとスタイル", chooseRequired: "画像とプリセット名を指定してください。", saved: "端末に保存しました。", applied: "生成画面に追加しました。", imported: "読込が完了しました。", exported: "書出しが完了しました。", quickSave: "プリセット保存", open: "プリセットを開く", cancel: "キャンセル",
  },
  "ko-KR": {
    title: "참조 이미지 프리셋", subtitle: "Vibe Transfer와 Precise Reference 이미지 및 설정을 기기에 저장하고 재사용하거나 다른 기기로 옮길 수 있습니다.", back: "도구로 돌아가기", add: "새 프리셋", name: "프리셋 이름", group: "그룹", noGroup: "미분류", kind: "프리셋 종류", vibe: "Vibe Transfer", precise: "Precise Reference", image: "이미지 선택", save: "기기에 저장", use: "생성에 적용", remove: "삭제", import: ".nairp 가져오기", exportAll: "전체 내보내기", exportGroup: "그룹 내보내기", exportOne: "내보내기", all: "전체", empty: "저장된 참조 프리셋이 없습니다", info: "정보 추출량", strength: "참조 강도", fidelity: "충실도", type: "참조 유형", character: "캐릭터", style: "스타일", both: "캐릭터와 스타일", chooseRequired: "이미지를 선택하고 프리셋 이름을 입력하세요.", saved: "기기에 저장했습니다.", applied: "생성 화면에 추가했습니다.", imported: "가져오기가 완료되었습니다.", exported: "내보내기가 완료되었습니다.", quickSave: "프리셋 저장", open: "프리셋 열기", cancel: "취소",
  },
} as const;

function useText() {
  const language = useAppStore((state) => state.settings?.language) as AppLanguage | undefined;
  return TEXT[language && language in TEXT ? language : "zh-CN"];
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
  const setToast = useAppStore((state) => state.setToast);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
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
            <label className="field"><span>{text.group}</span><input value={group} onChange={(event) => setGroup(event.target.value)} /></label>
          </div>
          <footer><Button onClick={onClose}>{text.cancel}</Button><Button variant="primary" disabled={busy} onClick={() => void save()}>{text.save}</Button></footer>
        </section>
      </div>
    </AppPortal>
  );
}

export default function ReferencePresetManager({ onBack, modal = false, onApplied }: { onBack?: () => void; modal?: boolean; onApplied?: () => void }) {
  const text = useText();
  const setToast = useAppStore((state) => state.setToast);
  const addVibeImage = useAppStore((state) => state.addVibeImage);
  const addPreciseReference = useAppStore((state) => state.addPreciseReference);
  const [library, setLibrary] = useState(EMPTY_LIBRARY);
  const [groupFilter, setGroupFilter] = useState("__all__");
  const [kindFilter, setKindFilter] = useState<ReferencePresetKind | "all">("all");
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [kind, setKind] = useState<ReferencePresetKind>("vibe");
  const [source, setSource] = useState<Awaited<ReturnType<typeof fileToSource>> | null>(null);
  const [infoExtracted, setInfoExtracted] = useState(0.7);
  const [strength, setStrength] = useState(0.6);
  const [fidelity, setFidelity] = useState(1);
  const [informationExtracted, setInformationExtracted] = useState(1);
  const [preciseType, setPreciseType] = useState<PreciseReferenceType>("character");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setLibrary(await window.naiDesktop.listReferencePresets()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  const presets = useMemo(() => library.presets
    .filter((preset) => groupFilter === "__all__" || preset.group === groupFilter)
    .filter((preset) => kindFilter === "all" || preset.kind === kindFilter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [library, groupFilter, kindFilter]);

  const save = async () => {
    if (!source || !name.trim()) return setToast(text.chooseRequired);
    setBusy(true);
    const result = await window.naiDesktop.saveReferencePreset({
      name, group, kind, base64: source.base64, extension: source.extension,
      infoExtracted, strength, preciseType, fidelity, informationExtracted,
      width: source.width, height: source.height,
    });
    setBusy(false);
    if (!result.ok) return setToast(result.message || text.chooseRequired);
    setLibrary(result.library || EMPTY_LIBRARY);
    setName(""); setSource(null);
    setToast(text.saved);
  };

  const apply = async (preset: ReferencePreset) => {
    const result = await window.naiDesktop.readReferencePreset(preset.id);
    if (!result.ok || !result.base64 || !result.preset) return setToast(result.message || text.chooseRequired);
    const saved = result.preset;
    const previewUrl = saved.fileUrl;
    if (saved.kind === "vibe") {
      addVibeImage({ id: crypto.randomUUID(), previewUrl, base64: result.base64, infoExtracted: saved.infoExtracted, strength: saved.strength });
    } else {
      addPreciseReference({ id: crypto.randomUUID(), previewUrl, base64: result.base64, type: saved.preciseType, strength: saved.strength, fidelity: saved.fidelity, informationExtracted: saved.informationExtracted, srcWidth: saved.width, srcHeight: saved.height });
    }
    setToast(text.applied);
    onApplied?.();
  };

  const runOperation = async (operation: () => Promise<{ ok: boolean; message?: string; library?: ReferencePresetLibrary }>, success: string) => {
    setBusy(true);
    const result = await operation();
    setBusy(false);
    if (result.library) setLibrary(result.library);
    else if (result.ok) await refresh();
    setToast(result.ok ? success : result.message || success);
  };

  const content = (
    <main className={`reference-preset-manager ${modal ? "is-modal" : ""}`}>
      <section className="reference-preset-hero">
        <div><h2>{text.title}</h2><p>{text.subtitle}</p></div>
        <div className="reference-preset-actions">
          {onBack && <Button onClick={onBack}>{text.back}</Button>}
          <Button onClick={() => void runOperation(() => window.naiDesktop.importReferencePresets(), text.imported)}>{text.import}</Button>
          <Button onClick={() => void runOperation(() => window.naiDesktop.exportReferencePresets(), text.exported)}>{text.exportAll}</Button>
        </div>
      </section>
      <section className="reference-preset-create panel-card">
        <div className="reference-preset-create-image">
          {source ? <img src={source.previewUrl} alt="" /> : <span>{text.image}</span>}
          <label className="btn btn-secondary">{text.image}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void fileToSource(file).then(setSource).catch(() => setToast(text.chooseRequired)); event.target.value = ""; }} /></label>
        </div>
        <div className="reference-preset-create-fields">
          <label className="field"><span>{text.name}</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field"><span>{text.group}</span><input list="reference-preset-groups" value={group} onChange={(event) => setGroup(event.target.value)} /><datalist id="reference-preset-groups">{library.groups.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label className="field"><span>{text.kind}</span><select value={kind} onChange={(event) => { const next = event.target.value as ReferencePresetKind; setKind(next); setStrength(next === "precise" ? 1 : 0.6); }}><option value="vibe">{text.vibe}</option><option value="precise">{text.precise}</option></select></label>
          {kind === "precise" && <label className="field"><span>{text.type}</span><select value={preciseType} onChange={(event) => setPreciseType(event.target.value as PreciseReferenceType)}><option value="character">{text.character}</option><option value="style">{text.style}</option><option value="character&style">{text.both}</option></select></label>}
          <NumberInput label={kind === "vibe" ? text.info : text.strength} value={kind === "vibe" ? infoExtracted : strength} min={0} max={1} step={0.01} onChange={kind === "vibe" ? setInfoExtracted : setStrength} />
          <NumberInput label={kind === "vibe" ? text.strength : text.fidelity} value={kind === "vibe" ? strength : fidelity} min={0} max={1} step={0.01} onChange={kind === "vibe" ? setStrength : setFidelity} />
          {kind === "precise" && <NumberInput label={text.info} value={informationExtracted} min={0} max={1} step={0.01} onChange={setInformationExtracted} />}
          <Button variant="primary" disabled={busy} onClick={() => void save()}>{text.save}</Button>
        </div>
      </section>
      <section className="reference-preset-toolbar">
        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="__all__">{text.all}</option><option value="">{text.noGroup}</option>{library.groups.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}><option value="all">{text.all}</option><option value="vibe">{text.vibe}</option><option value="precise">{text.precise}</option></select>
        {groupFilter !== "__all__" && <Button onClick={() => void runOperation(() => window.naiDesktop.exportReferencePresets({ group: groupFilter }), text.exported)}>{text.exportGroup}</Button>}
      </section>
      {presets.length === 0 ? <section className="reference-preset-empty">{text.empty}</section> : <section className="reference-preset-grid">{presets.map((preset) => <article className="reference-preset-card" key={preset.id}>
        <div className="reference-preset-image-frame"><img src={preset.fileUrl} alt={preset.name} /></div>
        <div className="reference-preset-card-body"><h3>{preset.name}</h3><p>{preset.group || text.noGroup}</p><small>{preset.kind === "vibe" ? `${text.vibe} · ${preset.infoExtracted.toFixed(2)} / ${preset.strength.toFixed(2)}` : `${text.precise} · ${preset.preciseType} · ${preset.strength.toFixed(2)} / ${preset.fidelity.toFixed(2)}`}</small></div>
        <div className="reference-preset-card-actions"><Button variant="primary" onClick={() => void apply(preset)}>{text.use}</Button><Button onClick={() => void runOperation(() => window.naiDesktop.exportReferencePresets({ presetId: preset.id }), text.exported)}>{text.exportOne}</Button><Button onClick={() => void runOperation(() => window.naiDesktop.deleteReferencePreset(preset.id), text.remove)}>{text.remove}</Button></div>
      </article>)}</section>}
    </main>
  );
  return modal ? <AppPortal><div className="modal-backdrop reference-preset-manager-backdrop"><div className="reference-preset-manager-modal">{content}</div></div></AppPortal> : content;
}
