import {PreviewImageViewer} from './components/PreviewImageViewer';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { animateStudioEntry, motionReduced } from "./motion-system";
import { AppPortal, Button, NumberInput, SelectMenu } from "./components/ui";
import { confirmAction } from "./components/confirm";
import { Icon } from "./components/icons";
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
const LOCAL_PAGE_SIZE_KEY = "langbai.reference-presets.page-size.v1";
const LOCAL_PAGE_SIZE_OPTIONS = [12, 24, 48, 60] as const;

const MANAGER_NAV_TEXT = {
  "zh-CN": { online: "在线下载", local: "本机预设", cardsPerRow: "每排显示", itemsPerPage: "每页 {count} 个预设", choosePage: "选择页数", previous: "上一页", next: "下一页", page: "第 {page} / {pages} 页 · {start}–{end} / {total}", deleteGroup: "删除分组", deleteGroupTitle: "删除这个分组？", deleteGroupHint: "分组内的预设图片不会被删除，将统一移到“未分组”。", deleteGroupDone: "分组已删除，原有预设已移到未分组。" },
} as const;

function formatManagerText(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((output, [key, value]) => output.replaceAll(`{${key}}`, String(value)), template);
}

function LocalPresetPageNumberInput({ page, pageCount, label, onChange }: { page: number; pageCount: number; label: string; onChange: (page: number) => void }) {
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);
  const commit = () => {
    const parsed = Math.floor(Number(draft));
    const next = Number.isFinite(parsed) ? Math.max(1, Math.min(pageCount, parsed)) : page;
    setDraft(String(next));
    onChange(next);
  };
  return <span className="gallery-page-number-input"><input type="number" min={1} max={pageCount} value={draft} aria-label={label} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commit(); }} /><button type="button" className="btn secondary" onClick={commit}>{label}</button></span>;
}

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
    applyFailed: "预设读取或应用失败；未应用的预设可重试。",
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
          <header><h2>{text.quickSave}</h2><button aria-label={text.cancel} onClick={onClose}><Icon name="close" /></button></header>
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
  const [section, setSection] = useState<"online" | "local">(() => {
    if (modal) return "local";
    return new URLSearchParams(window.location.search).get("uiPresetSection") === "local" ? "local" : "online";
  });
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem(LOCAL_GRID_COLUMNS_KEY));
    return [2, 3, 4, 5].includes(stored) ? stored : 3;
  });
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(() => {
    const stored = Number(globalThis.localStorage?.getItem(LOCAL_PAGE_SIZE_KEY));
    return LOCAL_PAGE_SIZE_OPTIONS.includes(stored as (typeof LOCAL_PAGE_SIZE_OPTIONS)[number]) ? stored : 12;
  });
  const sectionRef = useRef<HTMLDivElement>(null);
  const navText = MANAGER_NAV_TEXT[language && language in MANAGER_NAV_TEXT ? language : "zh-CN"];

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("uiPresetCreate") === "1") {
      setShowCreate(true);
    }
  }, []);

  const refresh = useCallback(async () => setLibrary(await window.naiDesktop.listReferencePresets()), []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onImported = () => void refresh();
    window.addEventListener("langbai:reference-presets-changed", onImported);
    return () => window.removeEventListener("langbai:reference-presets-changed", onImported);
  }, [refresh]);
  useEffect(() => { globalThis.localStorage?.setItem(LOCAL_GRID_COLUMNS_KEY, String(gridColumns)); }, [gridColumns]);
  useEffect(() => { globalThis.localStorage?.setItem(LOCAL_PAGE_SIZE_KEY, String(localPageSize)); }, [localPageSize]);
  useLayoutEffect(() => {
    if (!sectionRef.current || document.hidden || motionReduced()) return;
    return animateStudioEntry(sectionRef.current, 150);
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
  const localPageCount = Math.max(1, Math.ceil(presets.length / localPageSize));
  const localPagePresets = presets.slice((localPage - 1) * localPageSize, localPage * localPageSize);
  useEffect(() => setLocalPage(1), [groupFilter, kindFilter, localPageSize, query]);
  useEffect(() => setLocalPage((current) => Math.min(current, localPageCount)), [localPageCount]);

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
    try {
      const result = await window.naiDesktop.readReferencePreset(preset.id);
      if (!result.ok || !result.base64 || !result.preset) return setToast(result.message || text.chooseRequired);
      const saved = result.preset;
      const previewUrl = saved.fileUrl;
      if (onApplyPreset) {
        await onApplyPreset(saved, { base64: result.base64, previewUrl });
      } else if (saved.kind === "vibe") {
        if (!addVibeImage({ id: crypto.randomUUID(), previewUrl, base64: result.base64, infoExtracted: saved.infoExtracted, strength: saved.strength })) return false;
      } else {
        addPreciseReference({ id: crypto.randomUUID(), previewUrl, base64: result.base64, type: saved.preciseType, strength: saved.strength, fidelity: saved.fidelity, informationExtracted: 1, srcWidth: saved.width, srcHeight: saved.height });
      }
      return true;
    } catch {
      // IPC/consumer failures must not leave the picker busy or expose raw errors.
      setToast(text.applyFailed);
      return false;
    }
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
    let rejected = false;
    try {
      for (const preset of library.presets.filter((item) => selectedIds.has(item.id))) {
        if (await applyOne(preset)) appliedCount += 1;
        else rejected = true;
      }
    } finally {
      setBusy(false);
    }
    // Keep the rejection visible and the picker open after a partial application.
    if (appliedCount > 0 && !rejected) {
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
    if (!(await confirmAction(text.confirmDelete))) return;
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
      <header className="reference-preset-section-heading"><div><h3>{text.createTitle}</h3><p>{text.createHint}</p></div><button className="reference-preset-close" type="button" onClick={() => setShowCreate(false)} aria-label={text.cancel}><Icon name="close" /></button></header>
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
        {kind === "precise" && <div className="field reference-preset-field-wide"><span>{text.typeLabel}</span><SelectMenu value={preciseType} ariaLabel={text.typeLabel} options={[{ value: "character", label: text.character }, { value: "style", label: text.style }, { value: "character&style", label: text.both }]} onChange={(next) => setPreciseType(next as PreciseReferenceType)} /><small>{text.typeHelp}</small></div>}
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
        {modal && <div className="reference-preset-actions reference-preset-picker-actions"><Button variant="primary" onClick={() => setShowCreate(true)}>{text.createPreset}</Button><Button onClick={() => void runOperation(() => window.naiDesktop.importReferencePresets(), text.imported)}>{text.import}</Button></div>}
        {modal && onBack && <button className="reference-preset-close reference-preset-manager-close" type="button" onClick={onBack} aria-label={text.cancel}><Icon name="close" /></button>}
      </section>

      {!modal && <nav className="reference-ui-tabs reference-preset-primary-tabs" aria-label={text.title}>
        <button type="button" className={`reference-ui-tab ${section === "online" ? "is-active" : ""}`} aria-current={section === "online" ? "page" : undefined} onClick={() => setSection("online")}>{navText.online}</button>
        <button type="button" className={`reference-ui-tab ${section === "local" ? "is-active" : ""}`} aria-current={section === "local" ? "page" : undefined} onClick={() => setSection("local")}>{navText.local}<span className="reference-preset-tab-count">{library.presets.length}</span></button>
      </nav>}

      <div ref={sectionRef} className="reference-preset-section-content">
      {(modal || section === "local") && <section className="reference-preset-library panel-card">
        <header className="reference-preset-section-heading reference-preset-library-heading"><div><h3>{text.library}</h3><p>{text.currentGroup} · {groupFilter === "__all__" ? text.all : groupFilter ? catalogGroupName(groupFilter, language) : text.noGroup}</p></div>{!modal && groupFilter !== "__all__" && <Button onClick={() => void runOperation(() => window.naiDesktop.exportReferencePresets({ group: groupFilter }), text.exported)}>{text.exportGroup}</Button>}</header>
        <div className="reference-preset-search-row">
          <label className="field reference-preset-search-field">
            <span>{text.search}</span>
            <input type="search" value={query} placeholder={text.search} aria-label={text.search} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="field">
            <span>{text.currentGroup}</span>
            <SelectMenu value={groupFilter} ariaLabel={text.currentGroup} options={[{ value: "__all__", label: text.all }, { value: "", label: text.noGroup }, ...library.groups.map((item) => ({ value: item, label: catalogGroupName(item, language) }))]} onChange={selectGroup} />
          </div>
          <div className="field reference-preset-column-control">
            <span>{navText.cardsPerRow}</span>
            <SelectMenu value={String(gridColumns)} ariaLabel={navText.cardsPerRow} options={[2, 3, 4, 5].map((item) => ({ value: String(item), label: String(item) }))} onChange={(next) => setGridColumns(Number(next))} />
          </div>
          <div className="field reference-preset-page-size-control">
            <span>{navText.itemsPerPage.replace("{count}", "")}</span>
            <SelectMenu value={String(localPageSize)} ariaLabel={navText.itemsPerPage.replace("{count}", String(localPageSize))} options={LOCAL_PAGE_SIZE_OPTIONS.map((item) => ({ value: String(item), label: navText.itemsPerPage.replace("{count}", String(item)) }))} onChange={(next) => setLocalPageSize(Number(next))} />
          </div>
        </div>
        {!modal && <div className="reference-preset-group-toolbar"><label className="field reference-preset-new-group"><span>{text.groupName}</span><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createGroup(); }} /></label><Button disabled={busy || !newGroupName.trim()} onClick={() => void createGroup()}>{text.createGroup}</Button></div>}
        {!modal && groupFilter !== "__all__" && groupFilter !== "" && <div className="reference-preset-group-danger"><Button disabled={busy} onClick={() => setDeleteGroupTarget(groupFilter)}>{navText.deleteGroup}</Button><span>{navText.deleteGroupHint}</span></div>}
        {allowedKinds.length > 1 && <div className="reference-preset-kind-tabs reference-preset-filter-tabs" role="group" aria-label={text.kind}><button className={kindFilter === "all" ? "active" : ""} onClick={() => setKindFilter("all")}>{text.all}</button>{allowedKinds.includes("vibe") && <button className={kindFilter === "vibe" ? "active" : ""} onClick={() => setKindFilter("vibe")}>{text.vibe}</button>}{allowedKinds.includes("precise") && <button className={kindFilter === "precise" ? "active" : ""} onClick={() => setKindFilter("precise")}>{text.precise}</button>}</div>}
        {presets.length === 0 ? <section className="reference-preset-empty"><strong>{text.empty}</strong><span>{text.createHint}</span></section> : <><section className="reference-preset-grid" style={{ "--reference-preset-columns": gridColumns } as CSSProperties}>{localPagePresets.map((preset) => {
          const selected = selectedIds.has(preset.id);
          return <article className={`reference-preset-card ${selected ? "is-selected" : ""}`} key={preset.id} onClick={modal ? () => toggleSelected(preset.id) : undefined} onDoubleClick={(event) => { event.stopPropagation(); setPreviewPreset(preset); }} onKeyDown={modal ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleSelected(preset.id); } } : undefined} tabIndex={modal ? 0 : undefined} aria-selected={modal ? selected : undefined}>
            <div className="reference-preset-image-frame" title={text.preview}><img src={preset.fileUrl} alt={localizedPresetName(preset)} loading="lazy" /><span>{preset.kind === "vibe" ? text.vibe : text.precise}</span>{modal && <input type="checkbox" checked={selected} readOnly tabIndex={-1} aria-label={`${localizedPresetName(preset)} ${text.selected}`} />}</div>
            <div className="reference-preset-card-body"><h3>{localizedPresetName(preset)}</h3><p>{preset.group ? localizedPresetGroup(preset) : text.noGroup}</p><small>{preset.kind === "vibe" ? `${text.infoLabel} ${preset.infoExtracted.toFixed(2)} · ${text.strengthLabel} ${preset.strength.toFixed(2)}` : `${text.typeLabel} ${preset.preciseType} · ${text.preciseStrengthLabel} ${preset.strength.toFixed(2)} · ${text.fidelityLabel} ${preset.fidelity.toFixed(2)}`}</small>{!modal && <div className="reference-preset-card-move" onClick={(event) => event.stopPropagation()}><span>{text.moveGroup}</span><SelectMenu value={preset.group} disabled={busy} ariaLabel={text.moveGroup} options={[{ value: "", label: text.noGroup }, ...library.groups.map((item) => ({ value: item, label: catalogGroupName(item, language) }))]} onChange={(next) => void moveToGroup(preset.id, next)} /></div>}</div>
            {!modal && <div className="reference-preset-card-actions"><Button variant="primary" onClick={() => void apply(preset)}>{text.use}</Button><Button onClick={() => void removePreset(preset)}>{text.remove}</Button></div>}
          </article>;
        })}</section><nav className="aitag-pagination reference-preset-pagination" aria-label={navText.choosePage}><button type="button" className="btn secondary" disabled={localPage <= 1} onClick={() => setLocalPage((current) => Math.max(1, current - 1))}>{navText.previous}</button><LocalPresetPageNumberInput page={localPage} pageCount={localPageCount} label={navText.choosePage} onChange={setLocalPage} /><b aria-live="polite">{formatManagerText(navText.page, { page: localPage, pages: localPageCount, start: presets.length ? (localPage - 1) * localPageSize + 1 : 0, end: Math.min(localPage * localPageSize, presets.length), total: presets.length })}</b><button type="button" className="btn secondary" disabled={localPage >= localPageCount} onClick={() => setLocalPage((current) => Math.min(localPageCount, current + 1))}>{navText.next}</button></nav></>}
      </section>}
      {!modal && section === "online" && <ReferenceCatalogPanel library={library} onDownloaded={() => void refresh()} />}
      </div>
      {modal && <footer className="reference-preset-picker-footer"><span>{text.selected} <strong>{selectedIds.size}</strong></span><Button disabled={selectedIds.size === 0 || busy} onClick={() => setSelectedIds(new Set())}>{text.clearSelection}</Button><Button variant="primary" disabled={selectedIds.size === 0 || busy} onClick={() => void applySelected()}>{text.applySelected}</Button></footer>}
    </main>
  );

  return <>{modal ? <AppPortal><div className="modal-backdrop reference-preset-manager-backdrop"><div className="reference-preset-manager-modal">{content}</div></div></AppPortal> : content}{showCreate && <AppPortal><div className="modal-backdrop reference-preset-create-backdrop"><div className="reference-preset-create-modal">{createPanel}</div></div></AppPortal>}{previewPreset && <AppPortal><div className="modal-backdrop reference-preset-preview-backdrop" onClick={() => setPreviewPreset(null)}><div className="reference-preset-preview" onClick={(event) => event.stopPropagation()}><button className="reference-preset-close" type="button" onClick={() => setPreviewPreset(null)} aria-label={text.cancel}><Icon name="close" /></button><PreviewImageViewer onBackgroundClick={()=>setPreviewPreset(null)} images={presets.map(item=>({src:item.fileUrl,alt:localizedPresetName(item)}))} index={Math.max(0,presets.findIndex(item=>item.id===previewPreset.id))} onIndex={index=>setPreviewPreset(presets[index])}/><strong>{localizedPresetName(previewPreset)}</strong></div></div></AppPortal>}{deleteGroupTarget && <AppPortal><div className="reference-ui-mask reference-preset-confirm-mask" onClick={() => setDeleteGroupTarget(null)}><section className="reference-ui-dialog reference-preset-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reference-delete-group-title" onClick={(event) => event.stopPropagation()}><div className="reference-ui-dialog-head"><strong id="reference-delete-group-title" className="reference-ui-dialog-title">{navText.deleteGroupTitle}</strong></div><div className="reference-ui-dialog-body"><b>{catalogGroupName(deleteGroupTarget, language)}</b><p>{navText.deleteGroupHint}</p></div><div className="reference-ui-dialog-actions"><button type="button" className="reference-ui-dialog-button reference-ui-dialog-button-default" onClick={() => setDeleteGroupTarget(null)}>{text.cancel}</button><button type="button" className="reference-ui-dialog-button reference-ui-dialog-button-primary" disabled={busy} onClick={() => void deleteGroup()}>{navText.deleteGroup}</button></div></section></div></AppPortal>}</>;
}
