import { useDeferredValue, useEffect, useMemo, useState } from "react";
import bundledSnapshot from "./data/prompt-codex.json";
import { Button } from "./components/ui";
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
} from "./prompt-codex";
import type { AppLanguage } from "./types";

const BUNDLED = bundledSnapshot as PromptCodexSnapshot;
const PAGE_SIZE = 120;

const TEXT = {
  "zh-CN": {
    title: "NovelAI 个人法典",
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
  "zh-TW": {
    title: "NovelAI 個人法典",
    subtitle: "離線收錄三套法典，可依原章節、統一分類或關鍵字查找並直接複製。",
    back: "返回工具",
    search: "搜尋名稱、章節或 Tag",
    all: "全部",
    section: "原始章節",
    category: "統一分類",
    update: "手動更新",
    updating: "正在更新…",
    updated: "已更新",
    source: "開啟來源",
    copy: "複製提示詞",
    copied: "已複製",
    empty: "沒有相符項目",
    more: "繼續顯示",
    results: "筆結果",
    adult: "成人內容",
    date: "資料時間",
    website: "造訪原網站",
    introduction: "法典說明",
    introductionHint: "作者、版本、使用方式與測試環境（不作為提示詞參與搜尋）",
  },
  "en-US": {
    title: "NovelAI Personal Codex",
    subtitle:
      "Three offline codices with original sections, unified categories, search, and one-click copy.",
    back: "Back to Tools",
    search: "Search names, sections, or tags",
    all: "All",
    section: "Source section",
    category: "Unified category",
    update: "Update now",
    updating: "Updating…",
    updated: "Updated",
    source: "Open source",
    copy: "Copy prompt",
    copied: "Copied",
    empty: "No matching entries",
    more: "Show more",
    results: "results",
    adult: "Adult content",
    date: "Data date",
    website: "Visit original site",
    introduction: "About these codices",
    introductionHint:
      "Author, version, usage, and test environment (excluded from prompt search)",
  },
  "ja-JP": {
    title: "NovelAI 個人プロンプト法典",
    subtitle:
      "3冊をオフライン収録。元の章、統一分類、キーワードで検索してコピーできます。",
    back: "ツールへ戻る",
    search: "名称・章・Tag を検索",
    all: "すべて",
    section: "元の章",
    category: "統一分類",
    update: "手動更新",
    updating: "更新中…",
    updated: "更新済み",
    source: "出典を開く",
    copy: "プロンプトをコピー",
    copied: "コピーしました",
    empty: "一致する項目がありません",
    more: "さらに表示",
    results: "件",
    adult: "成人向け",
    date: "データ日時",
    website: "元サイトを開く",
    introduction: "法典について",
    introductionHint: "作者・版・使い方・テスト環境（プロンプト検索には含みません）",
  },
  "ko-KR": {
    title: "NovelAI 개인 프롬프트 법전",
    subtitle:
      "세 법전을 오프라인으로 제공하며 원본 장·통합 분류·키워드로 찾아 복사할 수 있습니다.",
    back: "도구로 돌아가기",
    search: "이름, 장 또는 태그 검색",
    all: "전체",
    section: "원본 장",
    category: "통합 분류",
    update: "수동 업데이트",
    updating: "업데이트 중…",
    updated: "업데이트됨",
    source: "출처 열기",
    copy: "프롬프트 복사",
    copied: "복사됨",
    empty: "일치하는 항목이 없습니다",
    more: "더 보기",
    results: "개 결과",
    adult: "성인 콘텐츠",
    date: "데이터 시간",
    website: "원본 사이트 열기",
    introduction: "법전 안내",
    introductionHint: "작성자, 버전, 사용법 및 테스트 환경 (프롬프트 검색에서 제외)",
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
  "zh-TW": {
    all: "全部",
    artist: "畫師",
    style: "畫風 / 質感",
    clothing: "服飾",
    lighting: "光影 / 色彩",
    scene: "場景",
    composition: "構圖 / 動作",
    character: "角色",
    other: "其他",
    "adult-other": "成人其他",
  },
  "en-US": {
    all: "All",
    artist: "Artists",
    style: "Style / texture",
    clothing: "Clothing",
    lighting: "Lighting / color",
    scene: "Scenes",
    composition: "Composition / pose",
    character: "Characters",
    other: "Other",
    "adult-other": "Adult / other",
  },
  "ja-JP": {
    all: "すべて",
    artist: "画家",
    style: "画風 / 質感",
    clothing: "衣装",
    lighting: "光 / 色",
    scene: "背景",
    composition: "構図 / 動作",
    character: "キャラクター",
    other: "その他",
    "adult-other": "成人向けその他",
  },
  "ko-KR": {
    all: "전체",
    artist: "작가",
    style: "화풍 / 질감",
    clothing: "의상",
    lighting: "조명 / 색상",
    scene: "장면",
    composition: "구도 / 동작",
    character: "캐릭터",
    other: "기타",
    "adult-other": "성인 / 기타",
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
  const [snapshot, setSnapshot] = useState<PromptCodexSnapshot>(BUNDLED);
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
    void window.naiDesktop.promptCodexCache().then((cached) => {
      if (cached) setSnapshot(cached);
    });
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
      setMessage(error instanceof Error ? error.message : String(error));
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
            {text.date} · {new Date(snapshot.generatedAt).toLocaleDateString()}
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
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {Object.entries(CATEGORY_LABELS[language]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.section}</span>
            <select
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
            </select>
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
