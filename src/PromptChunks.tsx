import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AppPortal } from "./components/ui";
import { Icon } from "./components/icons";
import { useAppStore } from "./store";
import type { AppLanguage, PromptChunk } from "./types";

type Copy = {
  trigger: string; title: string; subtitle: string; search: string; create: string;
  name: string; namePlaceholder: string; content: string; contentPlaceholder: string;
  save: string; cancel: string; edit: string; remove: string; empty: string;
  insert: string; inserted: string; nameRequired: string; contentRequired: string;
};

const COPY: Record<AppLanguage, Copy> = {
  "zh-CN": {
    trigger: "自定义提词", title: "自定义提词块",
    subtitle: "保存常用词组并随时插入当前提示词；它不会替换或调用正面预设。",
    search: "搜索提词名称或内容", create: "新建提词", name: "名称", namePlaceholder: "例如：角色服装",
    content: "提词内容", contentPlaceholder: "例如：white dress, blue ribbon", save: "确认保存", cancel: "取消",
    edit: "编辑", remove: "删除", empty: "还没有自定义提词。", insert: "插入",
    inserted: "已插入自定义提词。", nameRequired: "请填写名称。", contentRequired: "请填写提词内容。",
  },
  "zh-TW": {
    trigger: "自訂提詞", title: "自訂提詞塊", subtitle: "儲存常用詞組並隨時插入提示詞；不會取代或呼叫正面預設。",
    search: "搜尋提詞名稱或內容", create: "新增提詞", name: "名稱", namePlaceholder: "例如：角色服裝", content: "提詞內容", contentPlaceholder: "例如：white dress, blue ribbon", save: "確認儲存", cancel: "取消", edit: "編輯", remove: "刪除", empty: "尚無自訂提詞。", insert: "插入", inserted: "已插入自訂提詞。", nameRequired: "請填寫名稱。", contentRequired: "請填寫提詞內容。",
  },
  "en-US": {
    trigger: "Custom chunks", title: "Custom prompt chunks", subtitle: "Save reusable phrases and insert them into this prompt. Positive presets remain separate.",
    search: "Search names or content", create: "New chunk", name: "Name", namePlaceholder: "For example: outfit", content: "Prompt text", contentPlaceholder: "For example: white dress, blue ribbon", save: "Save", cancel: "Cancel", edit: "Edit", remove: "Delete", empty: "No custom prompt chunks yet.", insert: "Insert", inserted: "Custom prompt chunk inserted.", nameRequired: "Enter a name.", contentRequired: "Enter prompt text.",
  },
  "ja-JP": {
    trigger: "カスタム提詞", title: "カスタムプロンプトブロック", subtitle: "よく使う語句を保存して挿入します。ポジティブプリセットとは別機能です。",
    search: "名前または内容を検索", create: "新規作成", name: "名前", namePlaceholder: "例：衣装", content: "内容", contentPlaceholder: "例：white dress, blue ribbon", save: "保存", cancel: "キャンセル", edit: "編集", remove: "削除", empty: "カスタムブロックはありません。", insert: "挿入", inserted: "挿入しました。", nameRequired: "名前を入力してください。", contentRequired: "内容を入力してください。",
  },
  "ko-KR": {
    trigger: "사용자 구문", title: "사용자 프롬프트 블록", subtitle: "자주 쓰는 구문을 저장해 현재 프롬프트에 삽입합니다. 긍정 프리셋과는 별도입니다.",
    search: "이름 또는 내용 검색", create: "새 블록", name: "이름", namePlaceholder: "예: 의상", content: "내용", contentPlaceholder: "예: white dress, blue ribbon", save: "저장", cancel: "취소", edit: "편집", remove: "삭제", empty: "저장된 사용자 구문이 없습니다.", insert: "삽입", inserted: "사용자 구문을 삽입했습니다.", nameRequired: "이름을 입력하세요.", contentRequired: "내용을 입력하세요.",
  },
};

const EMPTY_PROMPT_CHUNKS: PromptChunk[] = [];

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `prompt-chunk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function appendPromptChunk(value: string, chunk: string): string {
  const current = value.trim();
  const addition = chunk.trim().replace(/^,+\s*/, "").replace(/\s*,+$/, "");
  if (!addition) return value;
  if (!current) return `${addition}, `;
  return `${current.replace(/\s*,?\s*$/, "")}, ${addition}, `;
}

type PromptChunkPlacement = "auto" | "top-right";
type ResolvedPromptChunkPlacement = "top-end" | "bottom-end" | "top-right";

export function resolvePromptChunkTop(
  placement: ResolvedPromptChunkPlacement,
  anchorTop: number,
  anchorBottom: number,
  viewportHeight: number,
  renderedHeight: number,
  margin = 12,
  gap = 8,
) {
  if (placement === "top-right") {
    return Math.max(margin, Math.min(viewportHeight - margin - renderedHeight, anchorTop));
  }
  if (placement === "bottom-end") {
    return Math.min(viewportHeight - margin - renderedHeight, anchorBottom + gap);
  }
  return Math.max(margin, anchorTop - gap - renderedHeight);
}

export function PromptChunkControl({
  value,
  onApply,
  placement = "auto",
}: {
  value: string;
  onApply: (value: string) => void;
  placement?: PromptChunkPlacement;
}) {
  const language = useAppStore((state) => state.settings?.language ?? "zh-CN");
  const chunks = useAppStore((state) => state.settings?.promptChunks ?? EMPTY_PROMPT_CHUNKS);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const setToast = useAppStore((state) => state.setToast);
  const text = COPY[language];
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftErrors, setDraftErrors] = useState({ name: false, content: false });
  const [saving, setSaving] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16, width: 460, maxHeight: 420, placement: "top-end" as ResolvedPromptChunkPlacement });

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return chunks;
    return chunks.filter((chunk) => chunk.name.toLocaleLowerCase().includes(needle) || chunk.content.toLocaleLowerCase().includes(needle));
  }, [chunks, query]);

  const persist = useCallback(async (next: PromptChunk[]) => {
    await window.naiDesktop.setSetting("promptChunks", next);
    await refreshSettings();
  }, [refreshSettings]);

  const place = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const margin = 12;
    const gap = 8;
    const width = Math.min(460, window.innerWidth - 24);
    const contentRows = Math.min(Math.max(filtered.length, 1), 6);
    const estimatedHeight = Math.min(480, Math.max(panelRef.current?.scrollHeight ?? 0, 154 + contentRows * 58 + (editingId !== null ? 214 : 0)));
    const above = Math.max(0, anchor.top - margin - gap);
    const below = Math.max(0, window.innerHeight - anchor.bottom - margin - gap);
    const resolvedPlacement = placement === "top-right"
      ? "top-right"
      : (above >= Math.min(280, estimatedHeight) || above >= below ? "top-end" : "bottom-end");
    const availableHeight = resolvedPlacement === "bottom-end" ? below : above;
    const maxHeight = Math.max(140, Math.min(480, availableHeight));
    const renderedHeight = Math.min(estimatedHeight, maxHeight);
    const topRightLeft = anchor.right + gap;
    const left = resolvedPlacement === "top-right"
      ? (topRightLeft + width <= window.innerWidth - margin
        ? topRightLeft
        : Math.max(margin, anchor.left - width - gap))
      : Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width));
    const top = resolvePromptChunkTop(
      resolvedPlacement,
      anchor.top,
      anchor.bottom,
      window.innerHeight,
      renderedHeight,
      margin,
      gap,
    );
    setPosition({ left, top, width, maxHeight, placement: resolvedPlacement });
  }, [editingId, filtered.length, placement]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    place();
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, place]);

  const beginCreate = () => { setEditingId(""); setDraftName(""); setDraftContent(""); setDraftErrors({ name: false, content: false }); };
  const beginEdit = (chunk: PromptChunk) => { setEditingId(chunk.id); setDraftName(chunk.name); setDraftContent(chunk.content); setDraftErrors({ name: false, content: false }); };

  async function saveDraft() {
    const name = draftName.trim();
    const content = draftContent.trim();
    const nextErrors = { name: !name, content: !content };
    setDraftErrors(nextErrors);
    if (nextErrors.name || nextErrors.content) {
      setToast([nextErrors.name ? text.nameRequired : "", nextErrors.content ? text.contentRequired : ""].filter(Boolean).join(" "));
      return;
    }
    const now = new Date().toISOString();
    setSaving(true);
    try {
      if (editingId) {
        await persist(chunks.map((chunk) => chunk.id === editingId ? { ...chunk, name, content, updatedAt: now } : chunk));
      } else {
        await persist([{ id: randomId(), name, content, createdAt: now, updatedAt: now }, ...chunks]);
      }
      setQuery("");
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function removeChunk(id: string) {
    await persist(chunks.filter((chunk) => chunk.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function insertChunk(content: string) {
    onApply(appendPromptChunk(value, content));
    setToast(text.inserted);
    setOpen(false);
  }

  return <>
    <button ref={triggerRef} type="button" className={clsx("prompt-tool-btn", "prompt-chunk-trigger", open && "tool-on")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <Icon name="plus" /><span>{text.trigger}</span>
    </button>
    {open && <AppPortal>
      <div ref={panelRef} className="prompt-chunk-popover" role="dialog" aria-label={text.title} data-placement={position.placement} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
        <header className="prompt-chunk-head">
          <div><strong>{text.title}</strong><small>{text.subtitle}</small></div>
          <button type="button" aria-label={text.cancel} onClick={() => setOpen(false)}><Icon name="close" /></button>
        </header>
        <div className="prompt-chunk-search-row">
          <label className="prompt-chunk-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} /></label>
          <button type="button" className="prompt-chunk-new" onClick={beginCreate}><Icon name="plus" /> {text.create}</button>
        </div>
        <div className="prompt-chunk-content">
          {editingId !== null && <div className="prompt-chunk-editor">
            <label>
              <span>{text.name}</span>
              <input value={draftName} aria-invalid={draftErrors.name} onChange={(event) => { setDraftName(event.target.value); setDraftErrors((current) => ({ ...current, name: false })); }} placeholder={text.namePlaceholder} />
              {draftErrors.name && <small className="prompt-chunk-validation" role="alert">{text.nameRequired}</small>}
            </label>
            <label>
              <span>{text.content}</span>
              <textarea value={draftContent} aria-invalid={draftErrors.content} onChange={(event) => { setDraftContent(event.target.value); setDraftErrors((current) => ({ ...current, content: false })); }} placeholder={text.contentPlaceholder} />
              {draftErrors.content && <small className="prompt-chunk-validation" role="alert">{text.contentRequired}</small>}
            </label>
          </div>}
          <div className="prompt-chunk-list">
            {filtered.length === 0 && <div className="prompt-chunk-empty">{text.empty}</div>}
            {filtered.map((chunk) => <article className="prompt-chunk-item" key={chunk.id}>
              <button type="button" className="prompt-chunk-main" onClick={() => insertChunk(chunk.content)}><strong>{chunk.name}</strong><span>{chunk.content}</span><em>{text.insert}</em></button>
              <div className="prompt-chunk-actions"><button type="button" title={text.edit} aria-label={text.edit} onClick={() => beginEdit(chunk)}><Icon name="brush" /></button><button type="button" title={text.remove} aria-label={text.remove} onClick={() => void removeChunk(chunk.id)}><Icon name="trash" /></button></div>
            </article>)}
          </div>
        </div>
        {editingId !== null && <footer className="prompt-chunk-editor-actions prompt-chunk-popover-footer">
          <button type="button" onClick={() => setEditingId(null)}>{text.cancel}</button>
          <button type="button" className="primary" aria-label={text.save} disabled={saving} onClick={() => void saveDraft()}><Icon name="check" /> {text.save}</button>
        </footer>}
      </div>
    </AppPortal>}
  </>;
}
