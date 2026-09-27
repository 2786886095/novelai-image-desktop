import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppPortal, Button } from '../../components/ui';
import type { ComparisonEntry } from '../model';
import { normalizeReferenceTag } from '../reference-types';
import type { ReferenceState, ReferenceAction, ReferenceCandidate } from '../reference-types';

function referenceErrorText(error: string): string {
  if (error.includes('No exact category-1 Danbooru artist tag found')) {
    return '未匹配到 D 站画师标签，可绑定画师页面或本地上传。';
  }
  if (error.includes('No accessible general or sensitive posts found')) {
    return '未找到可访问的普通/敏感级静态原作，可本地上传。';
  }
  return error;
}

const ReferenceContext = createContext<{
  state?: ReferenceState;
  error: string;
  busy: boolean;
  act: (action: ReferenceAction) => Promise<ReferenceCandidate[] | undefined>;
} | null>(null);

export function ReferenceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ReferenceState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const sequence = useRef(0);
  const mutating = useRef(false);
  const act = useCallback(async (action: ReferenceAction) => {
    if (!window.naiDesktop?.artistReferences) return;
    const requestId = ++sequence.current;
    mutating.current = true;
    setBusy(true); setError('');
    try {
      const result = await window.naiDesktop.artistReferences(action);
      if (alive.current && requestId === sequence.current) { setState(result.state); setError(result.error ? referenceErrorText(result.error) : ""); }
      return result.error ? undefined : result.candidates ?? [];
    } catch (err) { if (alive.current) setError(referenceErrorText(err instanceof Error ? err.message : String(err))); }
    finally { mutating.current = false; if (alive.current) setBusy(false); }
  }, []);
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = 10000;
      try {
        if (window.naiDesktop?.artistReferences && !mutating.current) {
          const requestId = ++sequence.current;
          const result = await window.naiDesktop.artistReferences({ type: 'load' });
          delay = result.state.running ? 2000 : 10000;
          if (alive.current && requestId === sequence.current) setState(result.state);
        }
      } catch (err) { if (alive.current) setError(referenceErrorText(err instanceof Error ? err.message : String(err))); }
      if (alive.current) timer = setTimeout(poll, delay);
    };
    void poll();
    return () => { alive.current = false; clearTimeout(timer); };
  }, []);
  return <ReferenceContext.Provider value={{ state, error, busy, act }}>{children}</ReferenceContext.Provider>;
}

export function ReferenceToolbar({ entries, selected }: { entries: ComparisonEntry[]; selected: boolean }) {
  const ctx = useContext(ReferenceContext);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState('');
  const backup = async (mode: 'export' | 'import') => {
    setBackupBusy(true);
    try { setBackupNotice((await window.naiDesktop.artistReferenceBackup(mode)).message); await ctx?.act({ type: 'load' }); }
    catch (error) { setBackupNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBackupBusy(false); }
  };
  if (!ctx) return null;
  const tags = [...new Set(entries.filter(e => e.kind === 'single').map(e => normalizeReferenceTag(e.prompt)).filter(Boolean))];
  const queue = ctx.state?.queue ?? [];
  const done = queue.filter(item => item.status === 'done').length;
  const failed = queue.filter(item => item.status === 'error').length;
  const pending = queue.some(item => item.status === 'pending' || item.status === 'running');
  return <section className="comparison-reference-toolbar" aria-label="共享原作资料">
    <div><strong>共享原作资料</strong><p>原作封面与 D 站收录数在所有项目共用；只补充缺失资料。收录数不代表 NovelAI 训练数量。</p><small>默认获取公开可访问的 General / Sensitive 静态作品，等比例保存预览。</small></div>
    <div className="comparison-inline-actions"><Button variant="secondary" disabled={ctx.busy || !ctx.state || !tags.length} onClick={() => void ctx.act({ type: 'start', tags })}>补充{selected ? '已选' : '当前筛选'}原作（{tags.length} 位）</Button>
      {ctx.state?.running ? <Button variant="ghost" disabled={ctx.busy} onClick={() => void ctx.act({ type: 'pause' })}>暂停获取</Button> : pending && <Button variant="ghost" disabled={ctx.busy || Boolean(ctx.state?.resumeAt && ctx.state.resumeAt > Date.now())} onClick={() => void ctx.act({ type: 'resume' })}>继续获取</Button>}
      {failed > 0 && <Button variant="ghost" disabled={ctx.busy || ctx.state?.running} onClick={() => void ctx.act({ type: 'retry' })}>重试失败（{failed}）</Button>}
    </div>
    {ctx.state?.resumeAt && ctx.state.resumeAt > Date.now() && <p role="status">站点暂时限流，已暂停。可在 {new Date(ctx.state.resumeAt).toLocaleTimeString()} 后继续。</p>}
    {queue.find(item => item.status === 'pending' && item.error)?.error && <small>{queue.find(item => item.status === 'pending' && item.error)?.error}</small>}
    {queue.length > 0 && <small role="status">全局获取队列：{done} / {queue.length} 已完成 · {failed} 失败 · {ctx.state?.running ? '获取中' : pending ? '已暂停，可继续' : '已结束'}</small>}
    <details><summary>原作库备份（独立于项目 ZIP）</summary><p>备份所有项目共用的原作资料；导入时仅补充尚不存在的画师，不覆盖已有选择。</p><div className="comparison-inline-actions"><Button variant="ghost" disabled={backupBusy || ctx.busy} onClick={() => void backup('export')}>备份原作库 ZIP</Button><Button variant="ghost" disabled={backupBusy || ctx.busy || ctx.state?.running || queue.some(item => item.status === 'running')} onClick={() => void backup('import')}>导入原作库</Button></div>{backupNotice && <p role="status">{backupNotice}</p>}</details>
    {ctx.error && <p role="alert">{ctx.error}</p>}
  </section>;
}

export function ReferenceCard({ entry, showPreview = true, actions }: { entry: ComparisonEntry; showPreview?: boolean; actions?: ReactNode }) {
  const ctx = useContext(ReferenceContext);
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [candidates, setCandidates] = useState<ReferenceCandidate[]>([]);
  const [link, setLink] = useState('');
  const [bindError, setBindError] = useState('');
  if (!ctx || entry.kind !== 'single') return <div className="comparison-inline-actions">{actions}</div>;
  const tag = normalizeReferenceTag(entry.prompt);
  const record = ctx.state?.records[tag];
  const cover = record?.cover;
  const choose = async () => {
    setOpen(true); setChoosing(true);
    const items = await ctx.act({ type: 'candidates', tag });
    setCandidates(items ?? []);
  };
  return <div className="comparison-reference-card">
    <div className="comparison-reference-count" title="D站收录数，不代表模型训练数量"><span>D站收录：</span>{record?.postCount == null ? <span>未查询</span> : <strong className={`comparison-reference-count-value ${record.postCount >= 200 ? 'is-high' : record.postCount >= 80 ? 'is-medium' : 'is-low'}`}>{record.postCount}</strong>}</div>
    {showPreview && cover && <button type="button" className="comparison-reference-thumb" onClick={() => { setChoosing(false); setOpen(true); }}><img src={cover.imageUrl} loading="lazy" alt={`${entry.name} 原作参考`} /></button>}
    {cover?.source === 'local' && <small className="comparison-reference-local-source">本地上传原作</small>}
    {record?.checkedAt && <small>查询日期：{new Date(record.checkedAt).toLocaleDateString()}</small>}
    {record?.error && <small role="status">{referenceErrorText(record.error)}</small>}
    <div className="comparison-inline-actions"><Button variant="ghost" disabled={ctx.busy || !ctx.state} onClick={() => void ctx.act(cover ? { type: 'refresh', tag } : { type: 'start', tags: [tag] })}>{cover ? '刷新收录数' : '补充原作'}</Button><Button variant="ghost" disabled={ctx.busy || !ctx.state} onClick={() => void ctx.act({ type: 'local-upload', tag })}>本地上传原作</Button><Button variant="ghost" disabled={ctx.busy || !ctx.state} onClick={() => void choose()}>选择原作 / 绑定画师</Button>{actions}</div>
    {open && <AppPortal><div className="comparison-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}><section className="comparison-reference-dialog" role="dialog" aria-modal="true" aria-label={`${entry.name} 原作参考`} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <header><div><h3>{entry.name} · 原作参考</h3><p>更换封面会同步到所有项目，保留各项目 AI 图片和评分。</p></div><Button autoFocus variant="ghost" onClick={() => setOpen(false)}>关闭</Button></header>
      {ctx.error && <p role="alert">{ctx.error}</p>}
      {!choosing && cover ? <><img className="comparison-reference-large" src={cover.imageUrl} alt={`${entry.name} 原作`} />{cover.source === 'local' ? <p>来源：本地上传（图片已复制到共享原作库）</p> : <Button variant="ghost" onClick={() => void window.naiDesktop.openExternal(cover.postUrl)}>打开原作来源</Button>}<Button variant="secondary" onClick={() => void choose()}>更换全局参考封面</Button><Button variant="ghost" onClick={() => void ctx.act({ type: 'local-upload', tag })}>改用本地原作</Button></> : <>
        <div className="comparison-reference-candidates">{candidates.map(item => <button type="button" key={item.postId} disabled={ctx.busy} onClick={async () => { const result = await ctx.act({ type: 'choose', tag, postId: item.postId }); if (result) setChoosing(false); }}><img loading="lazy" src={item.imageUrl} alt={`原作 ${item.postId}`} /><span>选择 #{item.postId}</span></button>)}</div>
        {!candidates.length && <p>{ctx.busy ? '正在查询原作…' : '未找到可用预览，可绑定准确的画师页面后重试，或使用本地上传原作。'}</p>}
        <Button variant="secondary" disabled={ctx.busy} onClick={() => void ctx.act({ type: 'local-upload', tag })}>本地上传原作</Button>
        <form className="comparison-reference-bind" onSubmit={async e => { e.preventDefault(); const match = link.trim().match(/^(?:https:\/\/danbooru\.donmai\.us\/artists\/)?(\d+)\/?(?:\?.*)?$/); if (!match) { setBindError('请输入 Danbooru 画师页面链接或数字 ID'); return; } setBindError(''); const result = await ctx.act({ type: 'bind', tag, artistId: Number(match[1]) }); if (!result) return; setCandidates(await ctx.act({ type: 'candidates', tag }) ?? []); }}><label>绑定 D 站画师页面（所有项目共用）<input value={link} onChange={e => setLink(e.target.value)} placeholder="https://danbooru.donmai.us/artists/82182" /></label><Button type="submit" variant="secondary" disabled={ctx.busy || !link.trim()}>绑定并查询</Button>{bindError && <p role="alert">{bindError}</p>}</form>
      </>}
    </section></div></AppPortal>}
  </div>;
}

export function ReferenceComparison({ entry, aiImage, preview = false, emptyLabel = '暂无生成图片' }: { entry: ComparisonEntry; aiImage: string; preview?: boolean; emptyLabel?: string }) {
  const ctx = useContext(ReferenceContext);
  const cover = entry.kind === 'single' ? ctx?.state?.records[normalizeReferenceTag(entry.prompt)]?.cover : undefined;
  return <div className={`comparison-reference-pair${(cover || (preview && entry.kind === 'single')) ? ' has-original' : ''}`}>
    {(cover || (preview && entry.kind === 'single')) && <figure><figcaption>画师原作参考</figcaption>{cover ? <img loading="lazy" src={cover.imageUrl} alt={`${entry.name} 原作参考`} /> : <span className="comparison-reference-empty">暂无原作参考</span>}</figure>}
    <figure><figcaption>AI 生成结果</figcaption>{aiImage ? <img loading="lazy" src={aiImage} alt={`${entry.name} AI 生成`} /> : <span>{emptyLabel}</span>}</figure>
  </div>;
}
