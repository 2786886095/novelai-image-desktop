export type PromptCodexBook = {
  id: string;
  title: string;
  sourceUrl: string;
  adult: boolean;
};

export type PromptCodexEntry = {
  id: string;
  bookId: string;
  section: string;
  category: string;
  title: string;
  prompt: string;
  adult: boolean;
  sourceUrl: string;
};

export type PromptCodexSnapshot = {
  schemaVersion: 1;
  generatedAt: string;
  sourceSite: string;
  permissionNote: string;
  books: PromptCodexBook[];
  entries: PromptCodexEntry[];
};

export const PROMPT_CODEX_BOOKS: PromptCodexBook[] = [
  {
    id: "regular",
    title: "所长常规NovalAI个人法典",
    sourceUrl:
      "https://nai4.top/%E6%B3%95%E5%85%B8/%E6%89%80%E9%95%BF%E5%B8%B8%E8%A7%84novalai%E4%B8%AA%E4%BA%BA%E6%B3%95%E5%85%B8/",
    adult: false,
  },
  {
    id: "adult-upper",
    title: "所长色色NovalAI个人法典(上)",
    sourceUrl:
      "https://nai4.top/%E6%B3%95%E5%85%B8/%E6%89%80%E9%95%BF%E8%89%B2%E8%89%B2novalai%E4%B8%AA%E4%BA%BA%E6%B3%95%E5%85%B8%E4%B8%8A/",
    adult: true,
  },
  {
    id: "adult-lower",
    title: "所长色色NovalAI个人法典(下)",
    sourceUrl:
      "https://nai4.top/%E6%B3%95%E5%85%B8/%E6%89%80%E9%95%BF%E8%89%B2%E8%89%B2novalai%E4%B8%AA%E4%BA%BA%E6%B3%95%E5%85%B8%E4%B8%8B/",
    adult: true,
  },
];

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function categoryFor(section: string, title: string, adult: boolean) {
  const value = `${section} ${title}`.toLowerCase();
  if (/画师|artist|绘师|作者|编纂者/.test(value)) return "artist";
  if (/服装|服饰|衣|袜|鞋|内衣|装扮|饰品/.test(value)) return "clothing";
  if (/光|影|色|氛围|滤镜|lighting|color/.test(value)) return "lighting";
  if (/背景|场景|地点|环境|室内|室外/.test(value)) return "scene";
  if (/构图|镜头|视角|姿势|动作|手势|pose|angle/.test(value))
    return "composition";
  if (/表情|脸|眼|嘴|头发|角色|人物|种族/.test(value)) return "character";
  if (/风格|画风|媒介|笔触|质感|style/.test(value)) return "style";
  return adult ? "adult-other" : "other";
}

export function parsePromptCodexHtml(
  html: string,
  book: PromptCodexBook,
): PromptCodexEntry[] {
  const start = html.indexOf('<div class="sl-markdown-content">');
  if (start < 0) throw new Error(`Missing article body: ${book.title}`);
  const body = html.slice(start);
  const tokens = [
    ...body.matchAll(/<(h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi),
  ];
  const entries: PromptCodexEntry[] = [];
  let section = "前言";
  let pendingTitle = "";
  let pendingParts: string[] = [];
  const flush = () => {
    const prompt = pendingParts.join("\n").trim();
    if (!prompt) return;
    const title =
      pendingTitle ||
      prompt.split(/\n|[，。；]/, 1)[0].slice(0, 48) ||
      `${section} ${entries.length + 1}`;
    entries.push({
      id: `${book.id}-${entries.length + 1}`,
      bookId: book.id,
      section,
      category: categoryFor(section, title, book.adult),
      title,
      prompt,
      adult: book.adult,
      sourceUrl: book.sourceUrl,
    });
    pendingTitle = "";
    pendingParts = [];
  };
  for (const token of tokens) {
    const tag = token[1].toLowerCase();
    const text = decodeHtml(token[2]);
    if (!text || tag === "h1") continue;
    if (tag === "p" && /^(note|tip|warning|caution)$/i.test(text)) continue;
    if (tag === "h2") {
      flush();
      section = text.replace(/^#+\s*/, "");
    } else if (tag === "h3") {
      flush();
      pendingTitle = text.replace(/^#+\s*/, "");
    } else if (pendingTitle) {
      pendingParts.push(text);
    } else {
      pendingTitle =
        text.match(/^(?:PS\d+[:：]?|\d+[.、）)]\s*)[^，。；\n]{0,42}/)?.[0] ??
        "";
      pendingParts.push(text);
      flush();
    }
  }
  flush();
  return entries;
}

export function buildPromptCodexSnapshot(
  pages: Array<{ book: PromptCodexBook; html: string }>,
): PromptCodexSnapshot {
  const entries = pages.flatMap(({ book, html }) =>
    parsePromptCodexHtml(html, book),
  );
  if (entries.length < 100) throw new Error("Prompt codex update is incomplete.");
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSite: "https://nai4.top",
    permissionNote: "原页面声明为无偿免费分享；应用保留原始来源链接。",
    books: pages.map(({ book }) => book),
    entries,
  };
}
