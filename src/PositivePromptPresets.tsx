import "./prompt-preset-layout.css";
import {normalizeCharacterCaptions, characterPresetText} from "./character-presets";
import {desktopUiText} from "./i18n";
import {maxNAICharacterPrompts, type CharCaptionItem} from "./types";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import clsx from "clsx";
import { PreviewImageViewer } from "./components/PreviewImageViewer";
import { AppPortal, Button } from "./components/ui";
import { confirmAction } from "./components/confirm";
import { Icon } from "./components/icons";
import { droppedImagePaths, hasDraggedFiles } from "./drag-drop";
import {
  defaultPositivePromptPresetName,
  POSITIVE_PROMPT_PRESET_IMAGE_LIMIT,
  positivePromptPresetStorageId,
  resolvePositivePresetApplication,
  samePositivePromptPreset,
  uniquePositivePromptPresetName,
  type PositivePresetApplyMode,
} from "./positive-prompt-presets";
import { useAppStore } from "./store";
import {
  collectPromptTags,
  formatPromptTagInput,
  isStalePromptTagFilter,
  matchesPromptLibraryEntry,
  promptTagField,
  promptTagText,
  UNTAGGED_PROMPT_FILTER,
} from "./prompt-library-tags";
import { PromptTagFilter, PromptTagInput, PromptTagList } from "./components/PromptTagControls";
import type {
  AppLanguage,
  PositivePromptPreset,
  StylePromptPreviewImage,
} from "./types";

type PresetText = {
  trigger: string;
  title: string;
  subtitle: string;
  saveCurrent: string;
  createBlank: string;
  search: string;
  empty: string;
  emptyHint: string;
  unnamed: string;
  prompt: string;
  name: string;
  nameHint: string;
  promptHint: string;
  edit: string;
  remove: string;
  save: string;
  cancel: string;
  close: string;
  apply: string;
  append: string;
  appendCharacters: string;
  images: string;
  imageCount: string;
  imageHint: string;
  imageEmpty: string;
  addImages: string;
  dropImages: string;
  imageLimit: string;
  removeImage: string;
  viewLarge: string;
  saveBeforeImages: string;
  promptRequired: string;
  duplicate: string;
  saved: string;
  deleted: string;
  deleteConfirm: string;
  applyNotice: string;
  appendNotice: string;
  appendCharactersNotice: string;
};

const TEXT: Record<AppLanguage, PresetText> = {
  "zh-CN": {
    trigger: "正面预设",
    title: "正面提示词预设",
    subtitle: "选择预设后可替换或追加到当前正面提示词。",
    saveCurrent: "保存当前",
    createBlank: "手动新建",
    search: "搜索名称或提示词",
    empty: "还没有正面提示词预设",
    emptyHint: "可保存当前正面提示词，也可手动输入后保存。",
    unnamed: "未命名预设",
    prompt: "正面提示词",
    name: "预设名称",
    nameHint: "留空时自动使用提示词开头命名",
    promptHint: "只保存正面提示词内容",
    edit: "编辑",
    remove: "删除",
    save: "保存",
    cancel: "取消",
    close: "关闭",
    apply: "替换当前正面提示词",
    append: "追加到当前提示词",
    appendCharacters: "追加这些角色",
    images: "参考查看图",
    imageCount: "{count}/3 张",
    imageHint: "预设预览图，仅供查看。",
    imageEmpty: "尚未添加参考图",
    addImages: "添加图片",
    dropImages: "也可将图片拖到这里",
    imageLimit: "每个预设最多保存 3 张参考图。",
    removeImage: "移除图片",
    viewLarge: "查看大图",
    saveBeforeImages: "先保存预设，之后即可加入最多 3 张参考图。",
    promptRequired: "请填写正面提示词。",
    duplicate: "相同的预设已存在，未重复保存。",
    saved: "正面提示词预设已保存。",
    deleted: "正面提示词预设已删除。",
    deleteConfirm: "确定删除“{name}”吗？参考图也会一并移除。",
    applyNotice: "已替换当前正面提示词。",
    appendNotice: "已追加到当前正面提示词末尾。",
    appendCharactersNotice: "已在现有角色后追加预设角色。",
  },
};

function formatText(value: string, replacements: Record<string, string | number>) {
  return value.replace(/\{([^}]+)\}/g, (_, key: string) => String(replacements[key] ?? ""));
}

function randomId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `positive-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function imageSignature(images: readonly StylePromptPreviewImage[]) {
  return images.map((image) => `${image.id}:${image.filePath}`).join("|");
}

export function PositivePromptPresetControl({
  compact = false,
  value,
  onApply,
  variant = "toolbar",
  character, onApplyCharacters,
}: {
  value: string;
  onApply: (prompt: string) => void;
  /** `bar`: labelled library + save-current buttons that stay visible under the prompt editor. */
  variant?: "toolbar" | "field" | "bar";
  compact?: boolean;
  character?: CharCaptionItem;
  onApplyCharacters?: (captions: CharCaptionItem[]) => void;
}) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const settings = useAppStore((state) => state.settings);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const setToast = useAppStore((state) => state.setToast);
  const text = TEXT[language];
  const tagText = promptTagText(language);
  const presets = settings?.positivePromptPresets ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftCaptions,setDraftCaptions] = useState<CharCaptionItem[]>([]);
  const [draftTags, setDraftTags] = useState("");
  const roleLabel=(index:number)=>desktopUiText(language,"character.label").replace("{index}",String(index+1));
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [activeImageId, setActiveImageId] = useState("");
  const [lightbox, setLightbox] = useState<StylePromptPreviewImage | null>(null);
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<string, number>>({});
  const [hoverPreview, setHoverPreview] = useState<{
    presetId: string;
    left: number;
    top: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = presets.find((preset) => preset.id === selectedId) ?? null;
  const filtered = useMemo(() => presets.filter((preset) => matchesPromptLibraryEntry(
    preset,
    [preset.name, preset.prompt, ...(preset.captions ?? []).map((caption) => caption.prompt)],
    query,
    tagFilter,
  )), [presets, query, tagFilter]);
  const tagSuggestions = useMemo(() => collectPromptTags(presets).map((item) => item.tag), [presets]);
  const selectedImages = selected?.previewImages ?? [];
  const previewImages = lightbox && !selectedImages.some(image => image.id === lightbox.id)
    ? [...selectedImages, lightbox] : selectedImages;
  const activeImage = selectedImages.find((image) => image.id === activeImageId)
    ?? selectedImages[0]
    ?? null;
  const activeImageRatio = activeImage ? imageAspectRatios[activeImage.id] : undefined;
  const activeImageShape = activeImageRatio == null
    ? "loading"
    : activeImageRatio < 0.86
      ? "portrait"
      : activeImageRatio > 1.34
        ? "landscape"
        : "square";
  const hoveredPreset = hoverPreview
    ? presets.find((preset) => preset.id === hoverPreview.presetId) ?? null
    : null;
  const hoveredPresetImages = hoveredPreset?.previewImages ?? [];

  const persist = useCallback(async (next: PositivePromptPreset[]) => {
    await window.naiDesktop.setSetting("positivePromptPresets", next);
    await refreshSettings();
  }, [refreshSettings]);

  useEffect(() => {
    if (!open || editingId !== null) return;
    if (!selectedId || !filtered.some((preset) => preset.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? "");
    }
  }, [editingId, filtered, open, selectedId]);

  useEffect(() => {
    setActiveImageId(selectedImages[0]?.id ?? "");
  }, [selected?.id]);

  useEffect(() => {
    if (!open || !selected || editingId !== null) return;
    let cancelled = false;
    const known = selected.previewImages ?? [];
    void window.naiDesktop.reconcileStylePromptPresetImages(
      positivePromptPresetStorageId(selected.id),
      known,
    ).then(async (restored) => {
      if (cancelled || imageSignature(restored) === imageSignature(known)) return;
      await persist(presets.map((preset) =>
        preset.id === selected.id ? { ...preset, previewImages: restored } : preset));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [editingId, open, persist, presets, selected]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (lightbox) setLightbox(null);
      else if (editingId !== null) setEditingId(null);
      else setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editingId, lightbox, open]);

  function startCreate(useCurrent: boolean) {
    // The bar's 保存当前 opens the editor directly, without the chips that reset a
    // filter whose tag was removed while the library was closed.
    const staleTag = isStalePromptTagFilter(presets, tagFilter);
    if (staleTag) setTagFilter("");
    setEditingId("");
    setDraftCaptions(useCurrent && character ? normalizeCharacterCaptions([{...character,prompt:value}]).map(({id:_,...c})=>c) : []);
    setDraftPrompt(useCurrent ? value : "");
    setDraftTags(!staleTag && tagFilter && tagFilter !== UNTAGGED_PROMPT_FILTER ? tagFilter : "");
    setDraftName(useCurrent && value.trim()
      ? defaultPositivePromptPresetName(value, presets.length + 1)
      : "");
    setStatus("");
  }

  function startEdit(preset: PositivePromptPreset) {
    setEditingId(preset.id);
    setDraftName(preset.name);
    setDraftPrompt(preset.prompt);
    setDraftCaptions((preset.captions ?? []).map(c=>({...c})));
    setDraftTags(formatPromptTagInput(preset.tags));
    setStatus("");
  }

  async function saveDraft() {
    const prompt = draftCaptions.length ? draftCaptions.map(c=>c.prompt).join("\n") : draftPrompt;
    if (!prompt.trim() && !draftCaptions.length) {
      setStatus(text.promptRequired);
      return;
    }
    setBusy(true);
    try {
      const requestedName = draftName.trim()
        || defaultPositivePromptPresetName(prompt, presets.length + 1);
      const duplicate = presets.find((preset) =>
        preset.id !== editingId
        && samePositivePromptPreset(preset, { name: requestedName, prompt, captions: draftCaptions }));
      if (duplicate) {
        setSelectedId(duplicate.id);
        setEditingId(null);
        setStatus(text.duplicate);
        return;
      }
      const name = uniquePositivePromptPresetName(
        presets,
        requestedName,
        editingId || "",
      ).value;
      let next: PositivePromptPreset[];
      let id = editingId || randomId();
      const tags = promptTagField(draftTags);
      if (editingId) {
        next = presets.map((preset) => {
          if (preset.id !== editingId) return preset;
          const { tags: _previous, ...rest } = preset;
          return { ...rest, name, prompt, captions: draftCaptions, ...tags };
        });
      } else {
        next = [{
          id,
          name,
          prompt,
          captions: draftCaptions,
          ...tags,
          createdAt: new Date().toISOString(),
          previewImages: [],
        }, ...presets];
      }
      await persist(next);
      setSelectedId(id);
      setEditingId(null);
      setStatus(text.saved);
      setToast(text.saved);
    } finally {
      setBusy(false);
    }
  }

  async function deletePreset(preset: PositivePromptPreset) {
    if (!(await confirmAction(formatText(text.deleteConfirm, { name: preset.name })))) return;
    setBusy(true);
    try {
      await window.naiDesktop.deleteStylePromptPresetImages(
        positivePromptPresetStorageId(preset.id),
      );
      const next = presets.filter((item) => item.id !== preset.id);
      await persist(next);
      setSelectedId(next[0]?.id ?? "");
      setEditingId(null);
      setStatus(text.deleted);
      setToast(text.deleted);
    } finally {
      setBusy(false);
    }
  }

  async function updateImages(
    preset: PositivePromptPreset,
    images: StylePromptPreviewImage[],
  ) {
    await persist(presets.map((item) => item.id === preset.id
      ? { ...item, previewImages: images.slice(0, POSITIVE_PROMPT_PRESET_IMAGE_LIMIT) }
      : item));
  }

  async function importImages(
    preset: PositivePromptPreset,
    sourcePaths?: string[],
  ) {
    setBusy(true);
    try {
      const storageId = positivePromptPresetStorageId(preset.id);
      const current = await window.naiDesktop.reconcileStylePromptPresetImages(
        storageId,
        preset.previewImages ?? [],
      );
      const available = POSITIVE_PROMPT_PRESET_IMAGE_LIMIT - current.length;
      if (available <= 0) {
        setStatus(text.imageLimit);
        return;
      }
      const imported = sourcePaths
        ? await window.naiDesktop.importStylePromptPresetImagePaths(sourcePaths, storageId, available)
        : await window.naiDesktop.importStylePromptPresetImages(storageId, available, text.images);
      if (!imported.length) return;
      await updateImages(preset, [...current, ...imported]);
      setActiveImageId(imported[0].id);
      setStatus(formatText(text.imageCount, { count: current.length + imported.length }));
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(
    preset: PositivePromptPreset,
    image: StylePromptPreviewImage,
  ) {
    setBusy(true);
    try {
      await window.naiDesktop.deleteStylePromptPresetImage(
        positivePromptPresetStorageId(preset.id),
        image.id,
      );
      const next = (preset.previewImages ?? []).filter((item) => item.id !== image.id);
      await updateImages(preset, next);
      setActiveImageId(next[0]?.id ?? "");
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>, preset: PositivePromptPreset) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(false);
    const paths = droppedImagePaths(
      event.dataTransfer,
      POSITIVE_PROMPT_PRESET_IMAGE_LIMIT - (preset.previewImages?.length ?? 0),
    );
    if (paths.length) void importImages(preset, paths);
  }

  /** One saved character appended inside a character row extends that row's prompts. */
  const appendsToCharacterRow = (preset: PositivePromptPreset) => Boolean(character && preset.captions?.length === 1);

  function applyPreset(preset: PositivePromptPreset, mode: PositivePresetApplyMode = "replace") {
    const state = useAppStore.getState();
    const application = resolvePositivePresetApplication(preset, mode, {
      value,
      character,
      currentCaptions: state.charCaptions,
      maxCharacters: maxNAICharacterPrompts(state.activeTab === "inpaint" ? state.inpaintModel : state.params.model),
    });
    if (application.kind === "over-capacity") {
      setStatus(characterPresetText(language).capacity);return;
    }
    if (application.kind === "prompt") {
      onApply(application.prompt);
      setToast(application.appended ? text.appendNotice : text.applyNotice);
    } else {
      if (onApplyCharacters) onApplyCharacters(application.captions);
      else if (application.row) onApply(application.captions[0].prompt);
      else state.setCharCaptions(normalizeCharacterCaptions(application.captions));
      setToast(application.row ? text.appendNotice : application.appended ? text.appendCharactersNotice : characterPresetText(language).apply);
    }
    setOpen(false);
  }

  function openLibrary() {
    setOpen(true);
    setEditingId(null);
    setHoverPreview(null);
    setStatus("");
  }

  function rememberImageAspect(imageId: string, image: HTMLImageElement) {
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    const ratio = Math.round(Math.min(3.2, Math.max(0.45,
      image.naturalWidth / image.naturalHeight)) * 1000) / 1000;
    setImageAspectRatios((current) => current[imageId] === ratio
      ? current
      : { ...current, [imageId]: ratio });
  }

  function showListHoverPreview(preset: PositivePromptPreset, anchor: HTMLElement) {
    if (!(preset.previewImages ?? []).length) {
      setHoverPreview(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(360, Math.max(280, window.innerWidth - 24));
    const rightSide = rect.right + 10;
    const left = rightSide + width <= window.innerWidth - 12
      ? rightSide
      : Math.max(12, rect.left - width - 10);
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - 380));
    setHoverPreview({ presetId: preset.id, left, top });
  }

  const imagePanel = selected ? (
    <section
      className={clsx("positive-preset-images", dragging && "dragging")}
      onDragEnter={(event) => {
        if (!hasDraggedFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!hasDraggedFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      data-image-paste="drop" data-image-paste-multiple="true" tabIndex={0} onDrop={(event) => handleDrop(event, selected)}
    >
      <header>
        <div><strong>{text.images}</strong><small>{formatText(text.imageCount, { count: selectedImages.length })}</small></div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || selectedImages.length >= POSITIVE_PROMPT_PRESET_IMAGE_LIMIT}
          onClick={() => void importImages(selected)}
        ><Icon name="plus" />{text.addImages}</Button>
      </header>
      {activeImage ? (
        <button
          type="button"
          className={clsx("positive-preset-large-preview", `is-${activeImageShape}`)}
          onClick={() => setLightbox(activeImage)}
          title={text.viewLarge}
        >
          <img
            src={activeImage.fileUrl}
            alt={`${selected.name} · ${activeImage.name}`}
            onLoad={(event) => rememberImageAspect(activeImage.id, event.currentTarget)}
          />
          <span><Icon name="maximize" />{text.viewLarge}</span>
        </button>
      ) : (
        <button
          type="button"
          className="positive-preset-image-empty"
          disabled={busy}
          onClick={() => void importImages(selected)}
        >
          <Icon name="images" />
          <strong>{text.imageEmpty}</strong>
          <span>{text.dropImages}</span>
        </button>
      )}
      {selectedImages.length > 0 && <div className="positive-preset-thumbnails">
        {selectedImages.map((image) => (
          <article key={image.id} className={clsx(image.id === activeImage?.id && "active")}>
            <button
              type="button"
              onMouseEnter={() => setActiveImageId(image.id)}
              onFocus={() => setActiveImageId(image.id)}
              onClick={() => setLightbox(image)}
              title={text.viewLarge}
            ><img src={image.fileUrl} alt={image.name} loading="lazy" /></button>
            <button
              type="button"
              className="remove"
              aria-label={`${text.removeImage}: ${image.name}`}
              title={text.removeImage}
              disabled={busy}
              onClick={() => void removeImage(selected, image)}
            ><Icon name="trash" /></button>
          </article>
        ))}
      </div>}
      <p>{text.imageHint}</p>
    </section>
  ) : null;

  return <>
    {variant === "bar" ? <>
      <button type="button" className="prompt-tool-btn positive-preset-bar-trigger" title={text.title} aria-haspopup="dialog" onClick={openLibrary}>
        <Icon name="template" /><span>{text.trigger}</span>
      </button>
      <button type="button" className="prompt-tool-btn positive-preset-save-current" title={text.saveCurrent} aria-haspopup="dialog" disabled={!value.trim()} onClick={() => { openLibrary(); startCreate(true); }}>
        <Icon name="pin" /><span>{text.saveCurrent}</span>
      </button>
    </> : <button
      type="button"
      className={`${compact ? "compact-icon-button " : ""}${variant === "toolbar" ? "prompt-tool-btn" : "btn btn-secondary positive-preset-field-trigger"}`}
      title={text.trigger} aria-label={text.trigger} data-tooltip={text.trigger}
      aria-haspopup="dialog"
      onClick={openLibrary}
    ><Icon name="template" />{!compact&&<span>{text.trigger}</span>}</button>}
    {open && <AppPortal>
      <div className="modal-backdrop positive-preset-backdrop" onMouseDown={() => setOpen(false)}>
        <section
          className={clsx("positive-preset-modal", editingId === null && tagSuggestions.length > 0 && "has-tags")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="positive-preset-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="positive-preset-modal-header">
            <div>
              <span><Icon name="template" /></span>
              <div><h2 id="positive-preset-title">{text.title}</h2><p>{selected?.captions?.length ? `${desktopUiText(language,"character.title")} · ${selected.captions.length}` : text.subtitle}</p></div>
            </div>
            <button type="button" aria-label={text.close} onClick={() => setOpen(false)}><Icon name="close" /></button>
          </header>

          {editingId !== null ? <div className="positive-preset-editor">
            <div className="positive-preset-editor-fields">
              <label><span>{text.name}</span><input value={draftName} placeholder={text.nameHint} onChange={(event) => setDraftName(event.target.value)} /></label>
              {draftCaptions.length ? draftCaptions.map((caption,index)=><fieldset key={index}><legend>{roleLabel(index)}</legend><label><span>{text.prompt}</span><textarea value={caption.prompt} onChange={e=>setDraftCaptions(old=>old.map((c,i)=>i===index?{...c,prompt:e.target.value}:c))}/></label><label><span>{desktopUiText(language,"character.negative")}</span><textarea value={caption.negativePrompt ?? ''} onChange={e=>setDraftCaptions(old=>old.map((c,i)=>i===index?{...c,negativePrompt:e.target.value}:c))}/></label></fieldset>) : <label><span>{text.prompt}</span><textarea value={draftPrompt} placeholder={text.promptHint} onChange={(event) => setDraftPrompt(event.target.value)} /></label>}
              <PromptTagInput value={draftTags} onChange={setDraftTags} suggestions={tagSuggestions} language={language} disabled={busy} />
            </div>
            {editingId && selected?.id === editingId ? imagePanel : <div className="positive-preset-save-first"><Icon name="images" /><span>{text.saveBeforeImages}</span></div>}
            {status && <p className="positive-preset-status" role="status">{status}</p>}
            <footer>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>{text.cancel}</Button>
              <Button type="button" variant="primary" disabled={busy || (!draftPrompt.trim() && !draftCaptions.length)} onClick={() => void saveDraft()}><Icon name="check" />{text.save}</Button>
            </footer>
          </div> : <>
            <div className="positive-preset-toolbar">
              <label title={tagText.searchHint}><Icon name="search" /><input value={query} aria-label={text.search} placeholder={tagSuggestions.length ? tagText.searchHint : text.search} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label={text.remove} onClick={() => setQuery("")}><Icon name="clear" /></button>}</label>
              <div>
                <Button type="button" variant="secondary" onClick={() => startCreate(false)}><Icon name="plus" />{text.createBlank}</Button>
                <Button type="button" variant="primary" disabled={!value.trim()} onClick={() => startCreate(true)}><Icon name="pin" />{text.saveCurrent}</Button>
              </div>
            </div>
            <PromptTagFilter className="positive-preset-tags" items={presets} value={tagFilter} onChange={setTagFilter} language={language} />
            <div className="positive-preset-browser">
              <nav
                className="positive-preset-list"
                aria-label={text.title}
                onScroll={() => setHoverPreview(null)}
              >
                {filtered.length === 0 ? <div className="positive-preset-list-empty"><Icon name="template" /><strong>{text.empty}</strong><span>{text.emptyHint}</span></div> : filtered.map((preset) => {
                  const firstImage = preset.previewImages?.[0];
                  return <button
                    type="button"
                     className={clsx(preset.id === selected?.id && "active")}
                     key={preset.id}
                     onMouseEnter={(event) => showListHoverPreview(preset, event.currentTarget)}
                     onMouseLeave={() => setHoverPreview(null)}
                     onFocus={(event) => showListHoverPreview(preset, event.currentTarget)}
                     onBlur={() => setHoverPreview(null)}
                     onClick={() => {
                       setHoverPreview(null);
                       setSelectedId(preset.id);
                       setStatus("");
                     }}
                  >
                    <span className="positive-preset-list-image">{firstImage ? <img src={firstImage.fileUrl} alt="" loading="lazy" /> : <Icon name="template" />}</span>
                    <span className="positive-preset-list-copy"><strong>{preset.name || text.unnamed}</strong><small>{preset.prompt}</small><PromptTagList tags={preset.tags} /></span>
                    <span className="positive-preset-list-count"><Icon name="images" />{preset.previewImages?.length ?? 0}</span>
                  </button>;
                })}
              </nav>
              <article className="positive-preset-detail">
                {selected ? <>
                  <header>
                    <div><h3>{selected.name}</h3><small>{new Date(selected.createdAt).toLocaleDateString(language)}</small><PromptTagList tags={selected.tags} /></div>
                    <div>
                      <Button type="button" variant="secondary" disabled={busy} onClick={() => startEdit(selected)}><Icon name="draw" />{text.edit}</Button>
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => void deletePreset(selected)}><Icon name="trash" />{text.remove}</Button>
                    </div>
                  </header>
                  <section className="positive-preset-prompt-preview"><strong>{text.prompt}</strong><p>{selected.captions?.length ? selected.captions.map((c,i)=>`${roleLabel(i)}: ${c.prompt}`).join("\n") : selected.prompt}</p></section>
                  {imagePanel}
                  {status && <p className="positive-preset-status" role="status">{status}</p>}
                  <footer><Button type="button" variant="secondary" onClick={() => applyPreset(selected, "append")}><Icon name="plus" />{selected.captions?.length && !appendsToCharacterRow(selected) ? text.appendCharacters : text.append}</Button><Button type="button" variant="primary" onClick={() => applyPreset(selected)}><Icon name="swap" />{selected.captions?.length ? `${characterPresetText(language).apply} · ${selected.captions.length}` : text.apply}</Button></footer>
                </> : <div className="positive-preset-detail-empty"><Icon name="template" /><strong>{text.empty}</strong><span>{text.emptyHint}</span></div>}
              </article>
            </div>
          </>}
         </section>
       </div>
       {hoveredPreset && hoverPreview && hoveredPresetImages.length > 0 && (
         <aside
           className="positive-preset-list-hover-preview"
           aria-hidden="true"
           style={{ left: hoverPreview.left, top: hoverPreview.top }}
         >
           <header>
             <strong>{hoveredPreset.name || text.unnamed}</strong>
             <small>{formatText(text.imageCount, { count: hoveredPresetImages.length })}</small>
           </header>
           <div>
             {hoveredPresetImages.map((image) => (
               <img
                 key={image.id}
                 src={image.fileUrl}
                 alt=""
                 onLoad={(event) => rememberImageAspect(image.id, event.currentTarget)}
               />
             ))}
           </div>
         </aside>
       )}
       {lightbox && <div className="positive-preset-lightbox" role="dialog" aria-modal="true" aria-label={text.viewLarge} onMouseDown={() => setLightbox(null)}>
        <button type="button" aria-label={text.close} onClick={() => setLightbox(null)}><Icon name="close" /></button>
        <PreviewImageViewer images={previewImages.map(image => ({src: image.fileUrl, alt: image.name}))} index={Math.max(0,previewImages.findIndex(image => image.id === lightbox.id))} onIndex={index => setLightbox(previewImages[index])} onBackgroundClick={() => setLightbox(null)} />
        <span>{lightbox.name}</span>
      </div>}
    </AppPortal>}
  </>;
}
