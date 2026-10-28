import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { errorText } from "./error-message";
import { Button, SelectMenuCompat } from "./components/ui";
import { Icon } from "./components/icons";
import { useAppStore } from "./store";
import type {
  PromptCodexEntry,
  PromptCodexSnapshot,
} from "./prompt-codex";
import {
  dedupePromptCodexEntries,
  extractPromptCodexIntroduction,
  isPromptCodexIntroductionEntry,
  PROMPT_CODEX_BOOKS,
} from "./prompt-codex";
import type { AppLanguage } from "./types";

const EMPTY_SNAPSHOT: PromptCodexSnapshot = {
  schemaVersion: 1,
  generatedAt: new Date(0).toISOString(),
  sourceSite: "https://nai4.top/",
  permissionNote: "",
  books: PROMPT_CODEX_BOOKS,
  entries: [],
};
const PAGE_SIZE = 120;

const TEXT = {
  "zh-CN": {
    title: "所长个人法典 · nai4.top",
    subtitle: "离线收录三套法典，按原章节、统一分类或关键词查找并直接复制。",
    back: "返回工具",
    search: "搜索名称、章节或 Tag",
    all: "全部",
    section: "原始章节",
    category: "统一分类",
    update: "手动更新",
    updating: "正在更新…",
    updated: "已更新",
    source: "打开来源",
    copy: "复制提示词",
    copied: "已复制",
    empty: "没有匹配条目",
    more: "继续显示",
    results: "条结果",
    adult: "成人内容",
    date: "数据时间",
    website: "访问原网站",
    introduction: "法典说明",
    introductionHint: "作者、版本、使用方式与测试环境（不作为提示词参与搜索）",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

const CATEGORY_LABELS: Record<AppLanguage, Record<string, string>> = {
  "zh-CN": {
    all: "全部",
    artist: "画师",
    style: "画风 / 质感",
    clothing: "服饰",
    lighting: "光影 / 色彩",
    scene: "场景",
    composition: "构图 / 动作",
    character: "角色",
    other: "其他",
    "adult-other": "成人其他",
  },
};

function languageOf(value: unknown): AppLanguage {
  return typeof value === "string" && value in TEXT
    ? (value as AppLanguage)
    : "zh-CN";
}

export default function PromptCodex({ onBack }: { onBack: () => void }) {
  const language = languageOf(
    useAppStore((state) => state.settings?.language),
  );
  const text = TEXT[language];
  const [snapshot, setSnapshot] = useState<PromptCodexSnapshot>(EMPTY_SNAPSHOT);
  const [bookId, setBookId] = useState("regular");
  const [category, setCategory] = useState("all");
  const [section, setSection] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const selectBook = (value: string) => {
    setBookId(value);
    setCategory("all");
    setSection("all");
    setLimit(PAGE_SIZE);
  };
  const introduction = useMemo(
    () =>
      snapshot.introduction?.length
        ? snapshot.introduction
        : extractPromptCodexIntroduction(snapshot.entries),
    [snapshot],
  );
  const promptEntries = useMemo(
    () =>
      dedupePromptCodexEntries(
        snapshot.entries.filter(
          (entry) => !isPromptCodexIntroductionEntry(entry),
        ),
      ),
    [snapshot.entries],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const cached = await window.naiDesktop.promptCodexCache();
        const next = cached ?? await window.naiDesktop.promptCodexBundled();
        if (active) setSnapshot(next);
      } catch (error) {
        if (active) setMessage(errorText(error));
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [bookId, category, section, deferredQuery]);

  useEffect(() => {
    setSection("all");
  }, [bookId]);

  const sections = useMemo(
    () =>
      Array.from(
        new Set(
          promptEntries
            .filter((entry) => bookId === "all" || entry.bookId === bookId)
            .map((entry) => entry.section),
        ),
      ),
    [bookId, promptEntries],
  );

  const filtered = useMemo(() => {
    const words = deferredQuery.split(/\s+/).filter(Boolean);
    return promptEntries.filter((entry) => {
      if (bookId !== "all" && entry.bookId !== bookId) return false;
      if (category !== "all" && entry.category !== category) return false;
      if (section !== "all" && entry.section !== section) return false;
      if (words.length === 0) return true;
      const haystack =
        `${entry.title}\n${entry.section}\n${entry.prompt}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [bookId, category, section, deferredQuery, promptEntries]);

  const update = async () => {
    setUpdating(true);
    setMessage("");
    try {
      const updated = await window.naiDesktop.promptCodexUpdate();
      setSnapshot(updated);
      setMessage(`${text.updated} · ${updated.entries.length}`);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setUpdating(false);
    }
  };

  const copy = async (entry: PromptCodexEntry) => {
    await navigator.clipboard.writeText(entry.prompt);
    setMessage(`${text.copied} · ${entry.title}`);
  };

  return (
    <main className="prompt-codex">
      <header className="prompt-codex-header">
        <div>
          <Button variant="ghost" onClick={onBack}>
            ← {text.back}
          </Button>
          <h2>{text.title}</h2>
          <p>{text.subtitle}</p>
        </div>
        <div className="prompt-codex-header-actions">
          <small>
            {text.date} · {new Date(snapshot.generatedAt).toLocaleDateString("zh-CN")}
          </small>
          <Button
            variant="ghost"
            onClick={() => void window.naiDesktop.openExternal(snapshot.sourceSite)}
          >
            <Icon name="externalLink" /> {text.website}
          </Button>
          <Button disabled={updating} onClick={() => void update()}>
            {updating ? text.updating : text.update}
          </Button>
        </div>
      </header>

      {introduction.length > 0 ? (
        <details className="prompt-codex-introduction" open>
          <summary>
            <span>
              <b>{text.introduction}</b>
              <small>{text.introductionHint}</small>
            </span>
            <Icon name="chevronDown" />
          </summary>
          <div>
            {introduction.map((item, index) => (
              <article key={`${item.title}-${index}`}>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      <section className="prompt-codex-filters">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={text.search}
          aria-label={text.search}
        />
        <div className="prompt-codex-book-tabs">
          <button
            className={bookId === "all" ? "active" : ""}
            onClick={() => selectBook("all")}
          >
            {text.all}
          </button>
          {snapshot.books.map((book) => (
            <button
              key={book.id}
              className={bookId === book.id ? "active" : ""}
              onClick={() => selectBook(book.id)}
            >
              {book.title}
              {book.adult ? <small>{text.adult}</small> : null}
            </button>
          ))}
        </div>
        <div className="prompt-codex-filter-row">
          <label>
            <span>{text.category}</span>
            <SelectMenuCompat
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {Object.entries(CATEGORY_LABELS[language]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectMenuCompat>
          </label>
          <label>
            <span>{text.section}</span>
            <SelectMenuCompat
              value={section}
              onChange={(event) => {
                setSection(event.target.value);
                setLimit(PAGE_SIZE);
              }}
            >
              <option value="all">{text.all}</option>
              {sections.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </SelectMenuCompat>
          </label>
          <b>
            {filtered.length} {text.results}
          </b>
        </div>
      </section>

      {message ? <div className="prompt-codex-message">{message}</div> : null}
      <section className="prompt-codex-results">
        {filtered.slice(0, limit).map((entry) => (
          <article key={entry.id} className="prompt-codex-entry">
            <header>
              <div>
                <small>{entry.section}</small>
                <h3>{entry.title}</h3>
              </div>
              <button type="button" onClick={() => void copy(entry)}>
                {text.copy}
              </button>
            </header>
            <pre>{entry.prompt}</pre>
            <footer>
              <span>{CATEGORY_LABELS[language][entry.category]}</span>
              <button
                type="button"
                onClick={() => void window.naiDesktop.openExternal(entry.sourceUrl)}
              >
                {text.source}
              </button>
            </footer>
          </article>
        ))}
        {filtered.length === 0 ? (
          <div className="prompt-codex-empty">{text.empty}</div>
        ) : null}
      </section>
      {limit < filtered.length ? (
        <Button
          variant="ghost"
          className="prompt-codex-more"
          onClick={() => setLimit((value) => value + PAGE_SIZE)}
        >
          {text.more} · {Math.min(limit, filtered.length)}/{filtered.length}
        </Button>
      ) : null}
    </main>
  );
}
