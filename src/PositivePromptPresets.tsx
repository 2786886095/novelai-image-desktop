import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import clsx from "clsx";
import { AppPortal, Button } from "./components/ui";
import { Icon } from "./components/icons";
import { droppedImagePaths, hasDraggedFiles } from "./drag-drop";
import {
  defaultPositivePromptPresetName,
  POSITIVE_PROMPT_PRESET_IMAGE_LIMIT,
  positivePromptPresetStorageId,
  samePositivePromptPreset,
  uniquePositivePromptPresetName,
} from "./positive-prompt-presets";
import { useAppStore } from "./store";
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
};

const TEXT: Record<AppLanguage, PresetText> = {
  "zh-CN": {
    trigger: "正面预设",
    title: "正面提示词预设",
    subtitle: "选择后直接替换当前正面提示词；参考图只用于查看，不会参与生图。",
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
    images: "参考查看图",
    imageCount: "{count}/3 张",
    imageHint: "仅用于辨认和对照该提示词，不会自动加入任何生成参数。",
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
  },
  "zh-TW": {
    trigger: "正面預設", title: "正面提示詞預設", subtitle: "選擇後直接取代目前正面提示詞；參考圖只供查看，不會參與生成。",
    saveCurrent: "儲存目前內容", createBlank: "手動新增", search: "搜尋名稱或提示詞", empty: "尚無正面提示詞預設", emptyHint: "可儲存目前正面提示詞，也可手動輸入後儲存。", unnamed: "未命名預設", prompt: "正面提示詞", name: "預設名稱", nameHint: "留空時自動使用提示詞開頭命名", promptHint: "只儲存正面提示詞內容", edit: "編輯", remove: "刪除", save: "儲存", cancel: "取消", close: "關閉", apply: "取代目前正面提示詞", images: "參考查看圖", imageCount: "{count}/3 張", imageHint: "只用於辨認和對照，不會自動加入任何生成參數。", imageEmpty: "尚未加入參考圖", addImages: "加入圖片", dropImages: "也可將圖片拖到這裡", imageLimit: "每個預設最多儲存 3 張參考圖。", removeImage: "移除圖片", viewLarge: "查看大圖", saveBeforeImages: "先儲存預設，之後即可加入最多 3 張參考圖。", promptRequired: "請填寫正面提示詞。", duplicate: "相同預設已存在，未重複儲存。", saved: "正面提示詞預設已儲存。", deleted: "正面提示詞預設已刪除。", deleteConfirm: "確定刪除「{name}」嗎？參考圖也會一併移除。", applyNotice: "已取代目前正面提示詞。",
  },
  "en-US": {
    trigger: "Prompt presets", title: "Positive prompt presets", subtitle: "Applying a preset replaces the current positive prompt. Reference images are view-only and never enter generation.",
    saveCurrent: "Save current", createBlank: "Create manually", search: "Search names or prompts", empty: "No positive prompt presets yet", emptyHint: "Save the current positive prompt or enter one manually.", unnamed: "Untitled preset", prompt: "Positive prompt", name: "Preset name", nameHint: "Leave blank to name it from the beginning of the prompt", promptHint: "Only positive-prompt text is saved", edit: "Edit", remove: "Delete", save: "Save", cancel: "Cancel", close: "Close", apply: "Replace current positive prompt", images: "Reference images", imageCount: "{count}/3 images", imageHint: "For visual recognition only. Images are never added to generation parameters.", imageEmpty: "No reference images", addImages: "Add images", dropImages: "You can also drop images here", imageLimit: "Each preset supports up to 3 reference images.", removeImage: "Remove image", viewLarge: "View full image", saveBeforeImages: "Save the preset first, then add up to 3 reference images.", promptRequired: "Enter a positive prompt.", duplicate: "An identical preset already exists and was not duplicated.", saved: "Positive prompt preset saved.", deleted: "Positive prompt preset deleted.", deleteConfirm: "Delete “{name}” and its reference images?", applyNotice: "Current positive prompt replaced.",
  },
  "ja-JP": {
    trigger: "正面プリセット", title: "ポジティブプロンプトプリセット", subtitle: "適用すると現在のポジティブプロンプトを置換します。参照画像は閲覧専用で生成には使われません。",
    saveCurrent: "現在を保存", createBlank: "手動で新規作成", search: "名前またはプロンプトを検索", empty: "プリセットはまだありません", emptyHint: "現在の内容を保存するか、手動で入力して保存できます。", unnamed: "名称未設定", prompt: "ポジティブプロンプト", name: "プリセット名", nameHint: "空欄の場合はプロンプト冒頭から自動命名", promptHint: "ポジティブプロンプトのみ保存します", edit: "編集", remove: "削除", save: "保存", cancel: "キャンセル", close: "閉じる", apply: "現在の正面プロンプトを置換", images: "参照画像", imageCount: "{count}/3 枚", imageHint: "確認用のみ。生成パラメータには追加されません。", imageEmpty: "参照画像なし", addImages: "画像を追加", dropImages: "ここに画像をドロップできます", imageLimit: "各プリセットは最大3枚です。", removeImage: "画像を削除", viewLarge: "大きく表示", saveBeforeImages: "先にプリセットを保存すると、最大3枚の画像を追加できます。", promptRequired: "ポジティブプロンプトを入力してください。", duplicate: "同じプリセットが既にあるため重複保存しませんでした。", saved: "プリセットを保存しました。", deleted: "プリセットを削除しました。", deleteConfirm: "「{name}」と参照画像を削除しますか？", applyNotice: "現在のポジティブプロンプトを置換しました。",
  },
  "ko-KR": {
    trigger: "긍정 프리셋", title: "긍정 프롬프트 프리셋", subtitle: "적용하면 현재 긍정 프롬프트를 교체합니다. 참고 이미지는 보기 전용이며 생성에 사용되지 않습니다.",
    saveCurrent: "현재 내용 저장", createBlank: "직접 만들기", search: "이름 또는 프롬프트 검색", empty: "저장된 긍정 프롬프트가 없습니다", emptyHint: "현재 내용을 저장하거나 직접 입력해 저장할 수 있습니다.", unnamed: "이름 없는 프리셋", prompt: "긍정 프롬프트", name: "프리셋 이름", nameHint: "비워 두면 프롬프트 앞부분으로 자동 이름 지정", promptHint: "긍정 프롬프트만 저장합니다", edit: "편집", remove: "삭제", save: "저장", cancel: "취소", close: "닫기", apply: "현재 긍정 프롬프트 교체", images: "참고 이미지", imageCount: "{count}/3장", imageHint: "확인용이며 어떤 생성 매개변수에도 자동으로 추가되지 않습니다.", imageEmpty: "참고 이미지 없음", addImages: "이미지 추가", dropImages: "이미지를 여기에 놓을 수도 있습니다", imageLimit: "프리셋당 최대 3장까지 저장할 수 있습니다.", removeImage: "이미지 제거", viewLarge: "큰 이미지 보기", saveBeforeImages: "먼저 프리셋을 저장한 뒤 최대 3장의 참고 이미지를 추가하세요.", promptRequired: "긍정 프롬프트를 입력하세요.", duplicate: "동일한 프리셋이 이미 있어 중복 저장하지 않았습니다.", saved: "긍정 프롬프트 프리셋을 저장했습니다.", deleted: "긍정 프롬프트 프리셋을 삭제했습니다.", deleteConfirm: "‘{name}’과 참고 이미지를 삭제할까요?", applyNotice: "현재 긍정 프롬프트를 교체했습니다.",
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
  value,
  onApply,
  variant = "toolbar",
}: {
  value: string;
  onApply: (prompt: string) => void;
  variant?: "toolbar" | "field";
}) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const settings = useAppStore((state) => state.settings);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const setToast = useAppStore((state) => state.setToast);
  const text = TEXT[language];
  const presets = settings?.positivePromptPresets ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
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
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return presets;
    return presets.filter((preset) =>
      preset.name.toLocaleLowerCase().includes(needle)
      || preset.prompt.toLocaleLowerCase().includes(needle));
  }, [presets, query]);
  const selectedImages = selected?.previewImages ?? [];
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
    if (!open) return;
    if (!selectedId || !presets.some((preset) => preset.id === selectedId)) {
      setSelectedId(presets[0]?.id ?? "");
    }
  }, [open, presets, selectedId]);

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
    setEditingId("");
    setDraftPrompt(useCurrent ? value : "");
    setDraftName(useCurrent && value.trim()
      ? defaultPositivePromptPresetName(value, presets.length + 1)
      : "");
    setStatus("");
  }

  function startEdit(preset: PositivePromptPreset) {
    setEditingId(preset.id);
    setDraftName(preset.name);
    setDraftPrompt(preset.prompt);
    setStatus("");
  }

  async function saveDraft() {
    const prompt = draftPrompt;
    if (!prompt.trim()) {
      setStatus(text.promptRequired);
      return;
    }
    setBusy(true);
    try {
      const requestedName = draftName.trim()
        || defaultPositivePromptPresetName(prompt, presets.length + 1);
      const duplicate = presets.find((preset) =>
        preset.id !== editingId
        && samePositivePromptPreset(preset, { name: requestedName, prompt }));
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
      if (editingId) {
        next = presets.map((preset) => preset.id === editingId
          ? { ...preset, name, prompt }
          : preset);
      } else {
        next = [{
          id,
          name,
          prompt,
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
    if (!window.confirm(formatText(text.deleteConfirm, { name: preset.name }))) return;
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

  function applyPreset(preset: PositivePromptPreset) {
    onApply(preset.prompt);
    setToast(text.applyNotice);
    setOpen(false);
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
      onDrop={(event) => handleDrop(event, selected)}
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
    <button
      type="button"
      className={variant === "toolbar" ? "prompt-tool-btn" : "btn btn-secondary positive-preset-field-trigger"}
      aria-haspopup="dialog"
      onClick={() => {
        setOpen(true);
        setEditingId(null);
        setHoverPreview(null);
        setStatus("");
      }}
    ><Icon name="template" /><span>{text.trigger}</span></button>
    {open && <AppPortal>
      <div className="modal-backdrop positive-preset-backdrop" onMouseDown={() => setOpen(false)}>
        <section
          className="positive-preset-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="positive-preset-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="positive-preset-modal-header">
            <div>
              <span><Icon name="template" /></span>
              <div><h2 id="positive-preset-title">{text.title}</h2><p>{text.subtitle}</p></div>
            </div>
            <button type="button" aria-label={text.close} onClick={() => setOpen(false)}><Icon name="close" /></button>
          </header>

          {editingId !== null ? <div className="positive-preset-editor">
            <div className="positive-preset-editor-fields">
              <label><span>{text.name}</span><input value={draftName} placeholder={text.nameHint} onChange={(event) => setDraftName(event.target.value)} /></label>
              <label><span>{text.prompt}</span><textarea value={draftPrompt} placeholder={text.promptHint} onChange={(event) => setDraftPrompt(event.target.value)} /></label>
            </div>
            {editingId && selected?.id === editingId ? imagePanel : <div className="positive-preset-save-first"><Icon name="images" /><span>{text.saveBeforeImages}</span></div>}
            {status && <p className="positive-preset-status" role="status">{status}</p>}
            <footer>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>{text.cancel}</Button>
              <Button type="button" variant="primary" disabled={busy || !draftPrompt.trim()} onClick={() => void saveDraft()}><Icon name="check" />{text.save}</Button>
            </footer>
          </div> : <>
            <div className="positive-preset-toolbar">
              <label><Icon name="search" /><input value={query} placeholder={text.search} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label={text.remove} onClick={() => setQuery("")}><Icon name="clear" /></button>}</label>
              <div>
                <Button type="button" variant="secondary" onClick={() => startCreate(false)}><Icon name="plus" />{text.createBlank}</Button>
                <Button type="button" variant="primary" disabled={!value.trim()} onClick={() => startCreate(true)}><Icon name="pin" />{text.saveCurrent}</Button>
              </div>
            </div>
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
                    <span className="positive-preset-list-copy"><strong>{preset.name || text.unnamed}</strong><small>{preset.prompt}</small></span>
                    <span className="positive-preset-list-count"><Icon name="images" />{preset.previewImages?.length ?? 0}</span>
                  </button>;
                })}
              </nav>
              <article className="positive-preset-detail">
                {selected ? <>
                  <header>
                    <div><h3>{selected.name}</h3><small>{new Date(selected.createdAt).toLocaleDateString(language)}</small></div>
                    <div>
                      <Button type="button" variant="secondary" disabled={busy} onClick={() => startEdit(selected)}><Icon name="draw" />{text.edit}</Button>
                      <Button type="button" variant="ghost" disabled={busy} onClick={() => void deletePreset(selected)}><Icon name="trash" />{text.remove}</Button>
                    </div>
                  </header>
                  <section className="positive-preset-prompt-preview"><strong>{text.prompt}</strong><p>{selected.prompt}</p></section>
                  {imagePanel}
                  {status && <p className="positive-preset-status" role="status">{status}</p>}
                  <footer><Button type="button" variant="primary" onClick={() => applyPreset(selected)}><Icon name="swap" />{text.apply}</Button></footer>
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
        <img src={lightbox.fileUrl} alt={lightbox.name} onMouseDown={(event) => event.stopPropagation()} />
        <span>{lightbox.name}</span>
      </div>}
    </AppPortal>}
  </>;
}
