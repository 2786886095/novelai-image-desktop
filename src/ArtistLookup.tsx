import { useRef, useState } from "react";
import { Button } from "./components/ui";
import { useAppStore } from "./store";
import { artistIndexLimit, formatLookupPrompt, matchesArtist, mergeArtistIndex, parseArtistBatch, readArtistIndex,
  type ArtistHit, type ArtistIndexRow, type ArtistPreview, type ArtistProfile } from "./artist-lookup";
import "./artist-lookup.css";

type Match = ArtistHit & { cached?: ArtistIndexRow };
type Result = { profile: ArtistProfile; hits: Match[]; failed?: boolean };
const storageKey = "langbai.artist-identity-index.v1";
const getIndex = () => {
  try { return readArtistIndex(localStorage.getItem(storageKey) || ""); } catch { return []; }
};

export default function ArtistLookup({onBack}: {onBack: () => void}) {
  const zh = String(useAppStore(state => state.settings?.language) ?? "zh-CN").startsWith("zh");
  const t = (cn: string, en: string) => zh ? cn : en;
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [index, setIndex] = useState(getIndex);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [v5, setV5] = useState(true);
  const [previews, setPreviews] = useState<Record<string, ArtistPreview[] | "loading" | "error">>({});
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const file = useRef<HTMLInputElement>(null);
  const indexRef = useRef(index);
  const currentRun = useRef(false);
  const generation = useRef(0);
  const persist = (next: ArtistIndexRow[]) => {
    const bounded = [...next];
    let json = JSON.stringify({ version: 1, artists: bounded });
    const encoder = new TextEncoder();
    while (encoder.encode(json).length > artistIndexLimit && bounded.length) {
      bounded.length = Math.floor(bounded.length * 0.85);
      json = JSON.stringify({ version: 1, artists: bounded });
    }
    localStorage.setItem(storageKey, json);
    indexRef.current = bounded;
    setIndex(bounded);
  };
  const loadIndex = async (item: File | undefined) => {
    if (!item || currentRun.current) return;
    currentRun.current = true;
    setBusy(true);
    try {
      if (item.size > artistIndexLimit) throw new Error();
      const imported = readArtistIndex(await item.text(), true);
      persist(mergeArtistIndex(indexRef.current, imported));
      setNotice(t("已合并本地身份索引。导入记录未经过在线验证。", "Local identity index merged. Imported entries are not verified online."));
    } catch {
      setNotice(t("无法导入：请选择不超过 2 MiB 的 v1 身份索引 JSON。", "Could not import: choose a v1 identity index JSON up to 2 MiB."));
    } finally { currentRun.current = false; setBusy(false); }
  };
  const search = async (offline: boolean) => {
    if (currentRun.current) return;
    let batch: ReturnType<typeof parseArtistBatch>;
    try { batch = parseArtistBatch(input); } catch {
      setNotice(t("请输入 1–12 个 Pixiv／X 主页链接或画师名。", "Enter 1–12 Pixiv/X profiles or artist names.")); return;
    }
    currentRun.current = true;
    generation.current++;
    setBusy(true); setResults([]); setSelected({}); setPreviews({}); setBroken({}); setNotice("");
    try {
      const rows: Result[] = [];
      const updates: ArtistIndexRow[] = [];
      const cachedIndex = indexRef.current;
      for (let i = 0; i < batch.profiles.length; i += 3) {
        rows.push(...await Promise.all(batch.profiles.slice(i, i + 3).map(async profile => {
          const cached = cachedIndex.filter(row => matchesArtist(profile,row)).map(row => ({ ...row, cached: row }));
          if (offline) return { profile, hits: cached };
          try {
            const hits = await window.naiDesktop.artistLookupRead("identity", profile.value);
            updates.push(...hits.filter(hit => hit.urls.length).map(hit => ({ ...hit, savedAt: Date.now(), source: "danbooru" as const })));
            return { profile, hits };
          } catch { return { profile, hits: cached, failed: true }; }
        })));
      }
      let saveFailed = false;
      if (updates.length) try { persist(mergeArtistIndex(indexRef.current, updates)); } catch { saveFailed = true; }
      setResults(rows);
      const notices = [
        batch.invalid ? t("已跳过 " + batch.invalid + " 项无效输入。", "Skipped " + batch.invalid + " invalid entries.") : "",
        saveFailed ? t("无法写入本地索引，本次结果仍可使用。", "Could not save the local index. These results are still usable.") : "",
      ];
      setNotice(notices.filter(Boolean).join(" "));
    } finally { currentRun.current = false; setBusy(false); }
  };
  const showPreviews = async (tag: string) => {
    const run = generation.current;
    setPreviews(prev => ({ ...prev, [tag]: "loading" }));
    const hits = await window.naiDesktop.artistLookupRead("preview", tag).catch(() => "error" as const);
    if (run === generation.current) setPreviews(prev => ({ ...prev, [tag]: hits }));
  };
  const unique = [...new Map(results.flatMap(r => r.hits).map(hit => [hit.tag,hit])).values()];
  const prompt = formatLookupPrompt(unique.filter(hit => Object.hasOwn(selected,hit.tag)).map(hit => ({ tag: hit.tag, weight: selected[hit.tag] })),v5);
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setNotice(t("已复制。", "Copied.")); }
    catch { setNotice(t("复制失败，可手动选择文本。", "Copy failed. Select the text to copy it manually.")); }
  };
  const download = (text: string, name: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([text], {type: mime}));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  return <main className="artist-lab artist-lookup">
    <header className="artist-lab-hero"><div><h2>{t("画师链接查询","Artist profile lookup")}</h2>
      <p>{t("用 Pixiv／X 链接找 Danbooru 画师 Tag，再组合成 NovelAI 提示词。","Find Danbooru artist tags from Pixiv/X profiles and build a NovelAI prompt.")}</p></div><Button onClick={onBack}>{t("返回工具首页","Back to tools")}</Button></header>
    <section className="artist-lookup-panel">
      <label htmlFor="artist-lookup-input">{t("画师链接或名称","Artist profiles or names")}</label>
      <textarea id="artist-lookup-input" rows={3} value={input} maxLength={12000} disabled={busy} onChange={e => setInput(e.target.value)}
        placeholder="https://www.pixiv.net/users/123&#10;https://x.com/artist_name" />
      <p>{t("最多 12 项。支持逐行输入，也可直接连续粘贴链接；相同身份会去重。","Up to 12 entries. Paste on separate lines or back to back. Duplicate profiles are merged.")}</p>
      <div className="artist-lookup-actions">
        <Button disabled={busy || !input.trim()} onClick={() => void search(false)}>{busy ? t("处理中…","Working…") : t("在线查询","Search online")}</Button>
        <Button disabled={busy || !input.trim()} onClick={() => void search(true)}>{t("仅查本地","Search local only")}</Button>
      </div>
      <details><summary>{t("本地身份索引","Local identity index")} · {index.length}</summary>
        <p>{t("在线命中后自动记录。可跨设备导入／导出；未收录时无法离线查询，作品预览需联网。","Online matches are cached. Import/export across devices. Unindexed profiles and previews cannot be looked up offline.")}</p>
        <div className="artist-lookup-actions">
          <Button disabled={busy} onClick={() => file.current?.click()}>{t("导入索引 JSON","Import index JSON")}</Button>
          <Button disabled={!index.length || busy} onClick={() => download(JSON.stringify({version:1,artists:index},null,2),"artist-identity-index.json","application/json")}>{t("导出索引 JSON","Export index JSON")}</Button>
        </div>
        <input hidden ref={file} type="file" accept=".json,application/json" onChange={e => { void loadIndex(e.target.files?.[0]); e.target.value = ""; }} />
      </details>
      <div role="status" aria-live="polite">{notice}</div>
    </section>
    {results.map(({profile,hits,failed}) => <section className="artist-lookup-panel" key={profile.key}>
      <h3>{profile.value}</h3>
      {failed && <p>{t("Danbooru 暂不可用，以下仅显示本地记录。","Danbooru is unavailable; showing local entries only.")}</p>}
      {!hits.length && <p>{t("没有可确认的画师记录。","No confirmed match.")}</p>}
      {hits.length > 1 && <p>{t("有多个候选，请核对后选择。","Multiple matches. Review before selecting.")}</p>}
      {hits.map(hit => <div className="artist-lookup-hit" key={hit.id}>
        <label><input type="checkbox" checked={Object.hasOwn(selected,hit.tag)} onChange={e => {
          const checked = e.target.checked; setSelected(prev => { const next = {...prev}; if (checked) Object.defineProperty(next,hit.tag,{value:1,enumerable:true,configurable:true,writable:true}); else delete next[hit.tag]; return next; });
        }} /> {hit.tag}</label>
        <p>Danbooru #{hit.id}{hit.cached ? " · " + (hit.cached.source === "danbooru" ? t("在线查询缓存","Online cache") : t("导入索引（未验证）","Imported (unverified)")) + " · " + new Date(hit.cached.savedAt).toLocaleDateString() : ""}</p>
        <div className="artist-lookup-actions">
          <Button onClick={() => void copy(hit.tag)}>{t("复制 Tag","Copy tag")}</Button>
          <Button disabled={previews[hit.tag] === "loading"} onClick={() => void showPreviews(hit.tag)}>{t("查看近期作品","Preview recent works")}</Button>
        </div>
        {previews[hit.tag] === "loading" && <p role="status">{t("正在读取作品…","Loading works…")}</p>}
        {previews[hit.tag] === "error" && <p role="status">{t("预览暂不可用，查询结果不受影响。","Previews are unavailable; matches are unchanged.")}</p>}
        {Array.isArray(previews[hit.tag]) && (previews[hit.tag].length ? <div className="artist-lookup-images">{(previews[hit.tag] as ArtistPreview[]).map(item =>
          <figure key={item.id}>{broken[item.id] ? <div>{t("图片无法加载","Image unavailable")}</div> :
            <img src={item.url} loading="lazy" referrerPolicy="no-referrer" alt={"Danbooru #" + item.id}
              onError={() => setBroken(prev => ({...prev,[item.id]:true}))}/>}<figcaption>{new Date(item.createdAt).toLocaleDateString()} · #{item.id}</figcaption></figure>)}</div>
          : <p>{t("没有可预览的普通级作品。","No general-rated previews available.")}</p>)}
      </div>)}
    </section>)}
    {prompt && <section className="artist-lookup-panel">
      <h3>{t("画师串","Artist prompt")}</h3>
      <label>{t("输出格式","Output format")} <select value={v5 ? "5" : "4.5"} onChange={e => setV5(e.target.value === "5")}><option value="5">NAI V5</option><option value="4.5">NAI 4.5</option></select></label>
      {unique.filter(hit => Object.hasOwn(selected,hit.tag)).map(hit => <label key={hit.tag} className="artist-lookup-weight">{hit.tag} · {t("权重","Weight")}
        <input type="number" min=".01" max="5" step=".01" value={Number.isNaN(selected[hit.tag]) ? "" : selected[hit.tag]} onChange={e => setSelected(prev => ({...prev,[hit.tag]:e.target.valueAsNumber}))}
          onBlur={() => setSelected(prev => ({...prev,[hit.tag]:Math.min(5,Math.max(.01,prev[hit.tag] || 1))}))}/></label>)}
      <textarea aria-label={t("画师串结果","Artist prompt output")} readOnly rows={3} value={prompt} />
      <div className="artist-lookup-actions"><Button onClick={() => void copy(prompt)}>{t("复制画师串","Copy prompt")}</Button>
      <Button onClick={() => download(prompt + "\n","nai-artist-prompt.txt","text/plain;charset=utf-8")}>{t("导出 TXT","Export TXT")}</Button></div>
    </section>}
  </main>;
}
