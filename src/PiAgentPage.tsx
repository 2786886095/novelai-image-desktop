import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { LuArrowDown, LuArrowUp, LuCheck, LuChevronDown, LuCopy, LuImage, LuLoaderCircle, LuMessageSquare, LuPencil, LuPlus, LuSearch, LuSettings, LuSparkles, LuSquare, LuTrash2, LuX, LuUserRound } from 'react-icons/lu';
import type { AgentDiscoveredModel, AgentAttachment, AgentEvent, AgentMessage, AgentPermissionRequest, AgentWorkspaceData } from './agent/types';
import { AGENT_PROVIDER_PRESETS, agentProviderRequiresApiKey } from './agent/provider-catalog';
import { studioFlowStage, studioSourceUrl, studioWebSources, studioTemplateApplyRequest, studioStoredTemplate, studioTemplateRequest, studioContextMeter, studioTemplateDraft, preparedStudioPreview, shouldFollowStudioScroll, studioToolStatus, studioUxText, validStudioModelConfig } from './agent/ux';
import { clampCompactThreshold } from './agent/context';
import type { AppSettings } from './types';
import { useAppStore } from './store';
import './pi-agent-page.css';

function AgentDialog({title, children, close}: {title: string; children: ReactNode; close: () => void}) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="pi-modal" aria-labelledby={id} onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><h2 id={id}>{title}</h2><button type="button" className="pi-icon" aria-label={studioUxText(useAppStore.getState().settings?.language, 'close')} onClick={close}><LuX /></button></header>{children}
  </dialog>;
}

function AgentToolGroup({message, language, children}: {message: AgentMessage; language: unknown; children: ReactNode}) {
  const [expanded, setExpanded] = useState<boolean>();
  const id = useId();
  const attention = message.tools.some(tool => ['pending', 'running', 'error'].includes(tool.status));
  const open = expanded ?? attention;
  return <section className="pi-tool-group"><button type="button" className="pi-tool-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setExpanded(!open)}>
    {message.tools.some(tool=>tool.status==='error')?<LuX aria-hidden/>:attention?<LuLoaderCircle aria-hidden/>:<LuCheck aria-hidden/>}<span>{studioUxText(language,'toolProgress',String(message.tools.length))}</span><LuChevronDown className={open?'is-expanded':''} aria-hidden/>
  </button><div id={id} hidden={!open} className="pi-tools">{children}</div></section>;
}

export function AgentWebSources({preview, language, onOpen}: {preview: ReturnType<typeof studioWebSources>; language: unknown; onOpen: (url: string) => void}) {
  if (!preview) return null;
  const t = (key: string) => studioUxText(language,key);
  return <section className="pi-web-sources" aria-label={t('webSources')}><strong>{t('webSources')}</strong>{preview.fetchedAt&&<p className="pi-muted">{t('fetchedAt')} <time>{preview.fetchedAt}</time></p>}<p className="pi-notice">{t('sourceWarning')}</p>{preview.warning&&<p>{preview.warning}</p>}{preview.invalid?<p role="alert">{t('invalidSources')}</p>:!preview.sources.length&&<p>{t('emptySources')}</p>}{preview.blocked>0&&<p>{t('blockedSources')}</p>}<ol>{preview.sources.map(source=><li key={source.url}><a href={source.url} onClick={event=>{event.preventDefault();onOpen(source.url)}} onAuxClick={event=>{event.preventDefault();if(event.button===1)onOpen(source.url)}}>{source.title}</a><small>{new URL(source.url).hostname}</small>{source.snippet&&<p>{source.snippet}</p>}</li>)}</ol></section>;
}

/** Studio's own tools and durable conversations; no new general Agent powers. */
export default function PiAgentPage({ active }: { active: boolean }) {
  const settings = useAppStore((state) => state.settings);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const t = useCallback((key: string, name?: string) => studioUxText(settings?.language, key, name), [settings?.language]);
  const [workspace, setWorkspace] = useState<AgentWorkspaceData>();
  const latestWorkspace = useRef<AgentWorkspaceData | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelDraft, setModelDraft] = useState<Partial<AppSettings>>({});
  const [saving, setSaving] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [models, setModels] = useState<AgentDiscoveredModel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryState, setDiscoveryState] = useState<'idle'|'ready'|'empty'|'error'>('idle');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const discoveryRun = useRef(0);
  useEffect(()=>{discoveryRun.current++;setModels([]);setDiscoveryState('idle');setDiscoveryMessage('');setDiscovering(false)},[settings?.agentApiProtocol,settings?.agentApiBaseUrl,settings?.agentApiKey]);
  const [compacting, setCompacting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [templateKind, setTemplateKind] = useState<'convert'|'reverse'|'optimize'|'assistant'>('convert');
  const [templateMode, setTemplateMode] = useState<'mixed'|'tags'|'natural'>(settings?.agentPromptTemplateMode??'mixed');
  const [templateVersion, setTemplateVersion] = useState<'v5'|'v4.5'>(settings?.convertPromptTemplateVersion??'v5');
  const [configError, setConfigError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [permissions, setPermissions] = useState<AgentPermissionRequest[]>([]);
  const [answering, setAnswering] = useState(false);
  const [image, setImage] = useState<AgentAttachment>();
  const [chatAction, setChatAction] = useState<'rename' | 'delete'>();
  const [chatName, setChatName] = useState('');
  const [copied, setCopied] = useState('');
  const [away, setAway] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);
  const readingPositions = useRef<Record<string, {top: number; following: boolean}>>({});
  const restoredChat = useRef<string | undefined>(undefined);
  const selectedId = useRef<string | undefined>(undefined);
  const updateWorkspace = useCallback((value: AgentWorkspaceData) => { latestWorkspace.current = value; setWorkspace(value); }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoading(true);
    void Promise.all([window.naiDesktop.getAgentWorkspace(), window.naiDesktop.getAgentPendingPermissions()])
      .then(([value, pending]) => { if (alive) { updateWorkspace(value); setPermissions(pending); setError(''); } })
      .catch((reason) => { if (alive) setError(String(reason)); }).finally(() => { if (alive) setLoading(false); });
    const unsubscribe = window.naiDesktop.onAgentEvent((event: AgentEvent) => {
      if (!alive) return;
      if (event.kind === 'workspace') updateWorkspace(event.workspace);
      if (event.kind === 'error' && (!event.conversationId || event.conversationId === selectedId.current)) setError(event.message);
      if (event.kind === 'permission') setPermissions((current) => [...current.filter((item) => item.id !== event.request.id), event.request]);
      if (event.kind === 'permission-resolved') setPermissions((current) => current.filter((item) => item.id !== event.permissionId));
      if (event.kind === 'message-delta') {
        const current = latestWorkspace.current;
        if (!current) return;
        const next = structuredClone(current);
        const message = next.conversations.find((chat) => chat.id === event.conversationId)?.messages.find((item) => item.id === event.messageId);
        if (message) { message.content += event.delta; updateWorkspace(next); }
      }
    });
    return () => { alive = false; unsubscribe(); };
  }, [active, updateWorkspace]);

  const chat = useMemo(() => workspace?.conversations.find((item) => item.id === workspace.selectedConversationId) ?? workspace?.conversations[0], [workspace]);
  selectedId.current = chat?.id;
  const configured = !!settings?.agentApiBaseUrl?.trim() && !!settings.agentApiModel?.trim() &&
    (!agentProviderRequiresApiKey(settings.agentApiProtocol, settings.agentApiBaseUrl) || !!settings.agentApiKey?.trim());
  const pending = permissions.find((item) => item.conversationId === chat?.id);
  const running = busy || compacting || !!pending || chat?.status === 'running' || chat?.status === 'waiting-permission';
  const text = chat ? drafts[chat.id] ?? '' : '';
  const latestReply=chat?.messages.filter(message=>message.role==='assistant').at(-1);
  const flowStage=studioFlowStage(latestReply?.tools,!!pending);
  useEffect(() => {
    setError('');
    if (chat) {
      try { const saved = sessionStorage.getItem(`studio-agent-draft:${chat.id}`); if (saved) setDrafts((current) => ({ ...current, [chat.id]: current[chat.id] ?? saved })); } catch { /* Optional session cache. */ }
    }
  }, [chat?.id]);
  useLayoutEffect(() => {
    if (!chat || !transcript.current || restoredChat.current === chat.id) return;
    const saved = readingPositions.current[chat.id];
    following.current = saved?.following ?? true;
    setAway(!following.current);
    transcript.current.scrollTop = following.current ? transcript.current.scrollHeight : saved?.top ?? 0;
    restoredChat.current = chat.id;
  }, [chat?.id]);
  useEffect(() => {
    const el = transcript.current;
    if (following.current && el) el.scrollTop = el.scrollHeight;
  }, [chat?.id, chat?.messages, pending]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(160, Math.max(42, input.scrollHeight))}px`;
  }, [text]);

  const setText = (value: string, id = chat?.id) => {
    if (!id) return;
    setDrafts((current) => ({ ...current, [id]: value }));
    try { sessionStorage.setItem(`studio-agent-draft:${id}`, value); } catch { /* Draft still retained while page is mounted. */ }
  };
  const prefill = (value: string) => { setText(value); inputRef.current?.focus(); };
  const mutateChat = async (action: Promise<{ok: boolean; workspace: AgentWorkspaceData; message?: string}>) => {
    if (chat && transcript.current) readingPositions.current[chat.id] = {top: transcript.current.scrollTop, following: following.current};
    try { const result = await action; if (result.ok) { updateWorkspace(result.workspace); setSidebarOpen(false); } else setError(result.message ?? t('statusError')); }
    catch (reason) { setError(String(reason)); }
  };
  const run = async () => {
    if (!chat || running || !configured || (!text.trim() && !chat.draftAttachments.length)) return;
    const input = text.trim(); const id = chat.id;
    const before = chat.messages.filter((item) => item.role === 'user').length;
    setText('', id); setError(''); setBusy(true); following.current = true;
    try {
      const result = await window.naiDesktop.sendAgentMessage({ conversationId: id, text: input });
      if (!result.ok) {
        const after = latestWorkspace.current?.conversations.find((item) => item.id === id)?.messages.filter((item) => item.role === 'user').length ?? before;
        if (after === before) setText(input, id);
        setError(result.message ?? t('statusError'));
      }
    } catch (reason) {
      const after = latestWorkspace.current?.conversations.find((item) => item.id === id)?.messages.filter((item) => item.role === 'user').length ?? before;
      if (after === before) setText(input, id);
      setError(String(reason));
    }
    finally { setBusy(false); }
  };
  const importAttachments = async (sourcePaths?: string[]) => {
    if (!chat || running) return;
    try {
      const result = await window.naiDesktop.importAgentFiles(chat.id, sourcePaths);
      if (!result.ok && !result.cancelled) setError(result.message ?? t('statusError'));
      updateWorkspace(await window.naiDesktop.getAgentWorkspace());
    } catch (reason) { setError(String(reason)); }
  };
  const compact = async () => {
    if (!chat || running || !configured) return;
    setCompacting(true); setError('');
    try {
      const result = await window.naiDesktop.compactAgentConversation(chat.id);
      if (!result.ok) setError(result.message ?? t('statusError'));
      updateWorkspace(await window.naiDesktop.getAgentWorkspace());
    } catch (reason) { setError(String(reason)); }
    finally { setCompacting(false); }
  };
  const discoverModels = async () => {
    if (discovering || !settings) return;
    const request = ++discoveryRun.current;
    setDiscovering(true); setModels([]); setDiscoveryState('idle'); setDiscoveryMessage(''); setError('');
    try {
      const result = await window.naiDesktop.discoverAgentModels({ protocol: settings.agentApiProtocol, baseUrl: settings.agentApiBaseUrl, apiKey: settings.agentApiKey, currentModel: settings.agentApiModel });
      if(request!==discoveryRun.current)return;
      setDiscoveryMessage(result.message);
      if (result.ok) {setModels(result.models);setDiscoveryState(result.models.length?'ready':'empty')}
      else setDiscoveryState('error');
    } catch (reason) { if(request===discoveryRun.current){setDiscoveryState('error');setDiscoveryMessage(String(reason))} }
    finally { if(request===discoveryRun.current)setDiscovering(false); }
  };
  const chooseModel = async (id: string) => {
    setSaving(true);
    try { await window.naiDesktop.setSetting('agentApiModel', id); await refreshSettings(); setModelPickerOpen(false); }
    catch (reason) { setError(String(reason)); }
    finally { setSaving(false); }
  };
  const openSettings = () => { setModelDraft({ agentApiProtocol: settings?.agentApiProtocol ?? 'openai-compatible', agentApiBaseUrl: settings?.agentApiBaseUrl ?? '', agentApiModel: settings?.agentApiModel ?? '', agentApiKey: settings?.agentApiKey ?? '', agentVisionEnabled: settings?.agentVisionEnabled !== false, agentProviderName: settings?.agentProviderName, agentContextWindow: settings?.agentContextWindow, agentMaxOutputTokens: settings?.agentMaxOutputTokens }); setConfigError(''); setSettingsOpen(true); };
  const saveModel = async () => {
    if (saving) return;
    if (!validStudioModelConfig(String(modelDraft.agentApiBaseUrl ?? ''), String(modelDraft.agentApiModel ?? ''))) { setConfigError(t('configInvalid')); return; }
    setSaving(true); setConfigError('');
    try {
      for (const [key, value] of Object.entries(modelDraft)) await window.naiDesktop.setSetting(key as keyof AppSettings, value as never);
      await refreshSettings(); setSettingsOpen(false); setError('');
    } catch (reason) { setConfigError(String(reason)); }
    finally { setSaving(false); }
  };
  const respond = async (response: 'once' | 'reject', revise = false) => {
    if (!pending || answering) return;
    setAnswering(true);
    try {
      const result = await window.naiDesktop.respondAgentPermission(pending.id, response);
      if (!result.ok) setError(result.message ?? t('statusError'));
      else { setPermissions((current) => current.filter((item) => item.id !== pending.id)); if (revise) prefill(t('changePlanDraft')); }
    } catch (reason) { setError(String(reason)); }
    finally { setAnswering(false); }
  };
  const openSource = async (value: string) => {
    const url = studioSourceUrl(value);
    if (!url) {setError(t('blockedSources'));return;}
    try { await window.naiDesktop.openExternal(url); } catch (reason) {setError(String(reason));}
  };
  const copy = async (value: string, id: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(id); }
    catch (reason) { setError(String(reason)); }
  };
  const plan = (value: Record<string, unknown>, actions = false) => <section className={`pi-plan ${actions ? 'pi-plan-pending' : ''}`} aria-label={t('planTitle')}>
    <header><LuSparkles aria-hidden/><strong>{t('planTitle')}</strong>{actions && <span>{t('statusPending')}</span>}</header>
    <div className="pi-plan-body">
    {(actions || 'estimatedAnlas' in value) && <p className="pi-cost">{typeof value.estimatedAnlas === 'number' ? t('estimatedCost',String(value.estimatedAnlas)) : t('unknownCost')}</p>}
    <dl>{[['model',value.model],['size',value.width && value.height ? `${value.width} × ${value.height}` : undefined],['steps',value.steps],['count',value.count]].filter(([,v])=>v!==undefined).map(([key,v])=><div key={String(key)}><dt>{t(String(key))}</dt><dd>{String(v)}</dd></div>)}</dl>
    {value.positivePrompt != null && <div className="pi-plan-prompt"><span>{t('prompt')}</span><p>{String(value.positivePrompt)}</p></div>}
    {actions && <><p>{t('confirmationHint')}</p><p className="pi-cost">{t('paidWarning')}</p></>}</div>
    {actions && <footer><button disabled={answering} onClick={()=>void respond('reject')}>{t('cancel')}</button><button disabled={answering} onClick={()=>void respond('reject',true)}><LuPencil/>{t('changePlan')}</button><button className="pi-primary" disabled={answering} onClick={()=>void respond('once')}><LuCheck/>{t('confirm')}</button></footer>}
  </section>;
  const renderMessage = (message: AgentMessage) => <article key={message.id} className={`pi-message pi-message-${message.role}`}>
    <div className="pi-message-role"><span className="pi-message-avatar">{message.role==='user'?<LuUserRound aria-hidden/>:<LuSparkles aria-hidden/>}</span>{t(message.role === 'user' ? 'you' : 'title')}</div>
    {message.content && <div className="pi-message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{message.content}</ReactMarkdown></div>}
    {message.error && <div role="alert" className="pi-notice pi-notice-error"><strong>{t('statusError')}</strong><p>{message.error}</p><small>{t('errorHint')}</small><button disabled={running} onClick={()=>{const index=chat?.messages.findIndex(item=>item.id===message.id)??-1;const request=chat?.messages.slice(0,index).reverse().find(item=>item.role==='user');if(request)prefill(request.content)}}>{t('retryDraft')}</button><button onClick={()=>void copy(message.error??'',message.id)}>{t('copy')}</button></div>}
    {message.status === 'aborted' && <p className="pi-muted">{t('statusStopped')}</p>}
    {message.tools.length > 0 && <AgentToolGroup message={message} language={settings?.language}>{message.tools.map((tool) => {
      const preview = preparedStudioPreview(tool);
      const web = studioWebSources(tool);
      return <div key={tool.id} className="pi-tool"><div className="pi-tool-heading">{['pending','running'].includes(tool.status)?<LuLoaderCircle aria-hidden/>:tool.status==='completed'?<LuCheck aria-hidden/>:<LuX aria-hidden/>}<span>{tool.name === 'langbai_prepare_generation' ? t('planTitle') : tool.title}</span><span className={`pi-status pi-status-${tool.status}`}>{t(studioToolStatus(tool.status))}</span></div>
        {preview && !(pending && message.id === chat?.messages.at(-1)?.id) && plan(preview)}
        {tool.status==='error'&&<p role="alert" className="pi-notice pi-notice-error">{tool.error||t('statusError')}</p>}
        {tool.status === 'denied' && <p>{t('cancelledSafe')}</p>}
        <AgentWebSources preview={web} language={settings?.language} onOpen={url=>void openSource(url)}/>
        {(tool.output || tool.error) && <details><summary>{t('details')}</summary><pre>{tool.error || tool.output}</pre></details>}
      </div>;
    })}</AgentToolGroup>}
    {message.attachments.filter((item) => item.kind === 'image').map((item) => <div key={item.id} className="pi-image-wrap">{item.fileUrl && !item.unavailable ? <button className="pi-image-button" aria-label={t('preview')} onClick={()=>setImage(item)}><img className="pi-result-image" src={item.fileUrl} alt={item.name}/></button> : <div className="pi-notice"><p>{t('missingImage')}</p><button disabled={running} onClick={()=>void importAttachments()}>{t('reattach')}</button></div>}{message.role==='assistant' && <button disabled={running||!!item.unavailable} onClick={()=>{prefill(t('continueImageDraft'));void importAttachments([item.filePath])}}><LuPencil/>{t('continueImage')}</button>}</div>)}
    {message.content && <footer className="pi-message-actions"><button title={t('copy')} onClick={()=>void copy(message.content,message.id)}><LuCopy/>{t(copied===message.id?'copied':'copy')}</button>{message.role==='user' && <button onClick={()=>prefill(message.content)}><LuPencil/>{t('editRequest')}</button>}</footer>}
  </article>;
  const savedTemplate = studioStoredTemplate(settings, templateKind, templateMode, templateVersion);
  const meter = studioContextMeter(chat?.context);
  const chats = workspace?.conversations.filter((item)=>item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];

  return <div className="pi-agent">
    <aside className={`pi-sidebar ${sidebarOpen?'is-open':''}`} aria-label={t('chats')}>
      <header><strong><LuSparkles/>{t('title')}</strong><button className="pi-icon pi-mobile-only" aria-label={t('close')} onClick={()=>setSidebarOpen(false)}><LuX/></button></header>
      <button disabled={running} title={running?t('busySwitch'):undefined} onClick={()=>void mutateChat(window.naiDesktop.createAgentConversation(t('newChat')))}><LuPlus/>{t('newChat')}</button>
      <label className="pi-search"><LuSearch aria-hidden/><input aria-label={t('searchChats')} placeholder={t('searchChats')} value={search} onChange={(event)=>setSearch(event.target.value)}/></label>
      <nav>{chats.map((item)=><button key={item.id} aria-current={item.id===chat?.id?'page':undefined} className={item.id===chat?.id?'is-active':''} disabled={running} title={running?t('busySwitch'):item.title} onClick={()=>void mutateChat(window.naiDesktop.selectAgentConversation(item.id))}><LuMessageSquare/><span>{item.title}</span></button>)}{!chats.length && <p>{t('noChats')}</p>}</nav>
      <div className="pi-sidebar-footer"><span className={`pi-model-dot ${configured?'is-ready':''}`}/><span>{t(configured?'ready':'missingModel')}</span></div>
    </aside>
    {sidebarOpen && <button className="pi-sidebar-scrim" aria-label={t('close')} onClick={()=>setSidebarOpen(false)}/>}
    <section className="pi-main">
      <header className="pi-header"><button className="pi-icon pi-mobile-only" aria-label={t('chats')} onClick={()=>setSidebarOpen(true)}><LuMessageSquare/></button><div className="pi-header-title"><h2>{t('title')}</h2><span className="pi-conversation-subtitle" title={chat?.title}>{chat?.title??t('newChat')}</span></div><span className={`pi-header-status${running?' is-busy':''}`} role="status">{pending?t('statusPending'):running?t('statusRunning'):t(configured?'ready':'missingModel')}</span><div className="pi-header-actions"><button className="pi-icon" disabled={!chat||running} aria-label={t('rename')} onClick={()=>{setChatName(chat?.title??'');setChatAction('rename')}}><LuPencil/></button><button className="pi-icon" disabled={!chat||running} aria-label={t('deleteChat')} onClick={()=>setChatAction('delete')}><LuTrash2/></button></div></header>
      <ol className="pi-flow" aria-label={t('flowLabel')}>{['flowChat','flowPlan','flowResult'].map((key,index)=><li key={key} aria-current={flowStage===index?'step':undefined}><span>{index+1}</span>{t(key)}</li>)}</ol>
      {!configured && !loading && <div className="pi-setup"><div><strong>{t('missingModel')}</strong><p>{t('setupBody')}</p></div><button className="pi-primary" onClick={openSettings}>{t('setup')}</button></div>}
      <div className="pi-transcript-wrap"><main className="pi-transcript" tabIndex={0} ref={transcript} aria-label={t('chats')} onScroll={()=>{const el=transcript.current;if(el){following.current=shouldFollowStudioScroll(el.scrollTop,el.clientHeight,el.scrollHeight);if(chat)readingPositions.current[chat.id]={top:el.scrollTop,following:following.current};setAway(!following.current)}}}>
        {loading ? <p role="status">{t('statusRunning')}</p> : !chat?.messages.length && <div className="pi-empty"><LuSparkles className="pi-empty-icon"/><h3>{t('heroTitle')}</h3><p>{t('heroBody')}</p><div className="pi-starters"><button onClick={()=>prefill(t('quickSettingsDraft'))}><LuSettings/>{t('quickSettings')}</button><button onClick={()=>prefill(t('quickPromptDraft'))}><LuPencil/>{t('quickPrompt')}</button><button onClick={()=>{prefill(t('quickReferenceDraft'));void importAttachments()}}><LuImage/>{t('quickReference')}</button></div></div>}
        {chat?.messages.filter(item=>item.role!=='system').map(renderMessage)}

        {running&&!pending && <div className="pi-working" role="status"><span className="pi-pulse"/><span>{t('workingBody')}</span></div>}
      </main>{away&&<button className="pi-latest" onClick={()=>{following.current=true;setAway(false);if(transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight}}><LuArrowDown/>{t('latest')}</button>}</div>
      {pending && <div className="pi-decision-tray" aria-label={t("decisionArea")}>{pending.type==='langbai_generate_image'?plan(pending.metadata??{},true):<section className="pi-plan"><header><strong>{t('confirmTool',pending.title)}</strong></header><div className="pi-plan-body"><p>{t('confirmationHint')}</p>{pending.metadata?.positivePrompt!=null&&<p>{String(pending.metadata.positivePrompt)}</p>}{Boolean(pending.metadata?.paid)&&<p className="pi-cost">{typeof pending.metadata?.estimatedAnlas==='number'?t('estimatedCost',String(pending.metadata.estimatedAnlas)):t('unknownCost')} {t('paidWarning')}</p>}<details><summary>{t('details')}</summary><pre>{JSON.stringify(pending.metadata,null,2)}</pre></details></div><footer><button disabled={answering} onClick={()=>void respond('reject')}>{t('cancel')}</button><button className="pi-primary" disabled={answering} onClick={()=>void respond('once')}>{t('confirm')}</button></footer></section>}</div>}
      {error && <div role="alert" className="pi-notice pi-notice-error pi-global-error"><span>{error}</span><button className="pi-icon" aria-label={t('close')} onClick={()=>setError('')}><LuX/></button></div>}
      <div className="pi-compose-area">
        <details className="pi-context"><summary>{t('context')} · {meter.used.toLocaleString()} / {meter.limit.toLocaleString()} {t(meter.estimated?'tokensEstimated':'tokensReported')}<progress className={chat?.context.danger?'is-danger':undefined} aria-label={t('context')} max={100} value={meter.percent}/></summary><div className="pi-context-controls"><button disabled={running||!configured||!chat?.messages.length} onClick={()=>void compact()}>{t(compacting?'statusRunning':'compactNow')}</button><label><input type="checkbox" disabled={running} checked={settings?.agentAutoCompact===true} onChange={async event=>{try{await window.naiDesktop.setSetting('agentAutoCompact',event.target.checked);await refreshSettings()}catch(reason){setError(String(reason))}}}/>{t('autoCompact')}</label><label>{t('compactThreshold')}<select aria-label={t('compactThreshold')} disabled={running} value={clampCompactThreshold(settings?.agentAutoCompactThreshold)} onChange={async event=>{try{await window.naiDesktop.setSetting('agentAutoCompactThreshold',Number(event.target.value));await refreshSettings()}catch(reason){setError(String(reason))}}}>{Array.from(new Set([0.5,0.7,0.8,0.88,0.9,0.95,clampCompactThreshold(settings?.agentAutoCompactThreshold)])).sort((a,b)=>a-b).map(value=><option key={value} value={value}>{Math.round(value*100)}%</option>)}</select></label><small>{t('compactHint')}</small></div>{chat?.lastSummary&&<pre>{chat.lastSummary}</pre>}</details>
        <div className="pi-action-picker"><button disabled={!chat||running} aria-expanded={actionsOpen} onClick={()=>setActionsOpen(!actionsOpen)}><LuSparkles/>{t('actions')}<LuChevronDown/></button>{actionsOpen&&<div className="pi-action-list"><p>{t('prefillOnly')}</p><button onClick={()=>{prefill(t('webDraft')+'\n'+JSON.stringify({tool:'langbai_search_web',args:{query:'SEARCH_QUERY',limit:5}},null,2));setActionsOpen(false)}}><LuSearch/>{t('webQuery')}</button><button onClick={()=>{prefill(t('templateListDraft')+'\n'+studioTemplateRequest(templateKind,templateMode,templateVersion));setActionsOpen(false)}}>{t('templateList')}</button><button onClick={()=>{prefill(t('templateSaveDraft')+'\n'+studioTemplateRequest(templateKind,templateMode,templateVersion,'save'));setActionsOpen(false)}}>{t('templateSave')}</button><section className="pi-template-info"><label>{t('templateKind')}<select value={templateKind} onChange={event=>setTemplateKind(event.target.value as typeof templateKind)}>{(['convert','reverse','optimize','assistant'] as const).map(kind=><option value={kind} key={kind}>{t('templateKind_'+kind)}</option>)}</select></label>{(templateKind==='convert'||templateKind==='reverse')&&<><label>{t('templateMode')}<select value={templateMode} onChange={event=>setTemplateMode(event.target.value as typeof templateMode)}>{(['mixed','tags','natural'] as const).map(mode=><option key={mode} value={mode}>{mode}</option>)}</select></label><label>{t('templateVersion')}<select value={templateVersion} onChange={event=>setTemplateVersion(event.target.value as typeof templateVersion)}><option value="v5">V5</option><option value="v4.5">V4.5</option></select></label></>}<p>{t(savedTemplate?'customTemplate':'builtinTemplate')}</p>{savedTemplate&&<pre>{savedTemplate}</pre>}<button onClick={()=>{prefill(t('readTemplateDraft')+'\n'+studioTemplateRequest(templateKind,templateMode,templateVersion));setActionsOpen(false)}}>{t('readTemplate')}</button>{templateKind!=='reverse'&&<button onClick={()=>{prefill(t('applyTemplateDraft')+'\n'+studioTemplateApplyRequest(templateKind,templateMode,templateVersion,text));setActionsOpen(false)}}>{t('applyTemplate')}</button>}</section>{settings?.promptTemplates.map(template=><button key={template.id} onClick={()=>{prefill(studioTemplateDraft(template));setActionsOpen(false)}}>{template.name}</button>)}</div>}</div>
        {!!chat?.draftAttachments.length && <div className="pi-attachments">{chat.draftAttachments.map(item=><div key={item.id}>{item.kind==='image'&&item.fileUrl?<button className="pi-thumb" onClick={()=>setImage(item)} aria-label={t('preview')}><img src={item.fileUrl} alt={item.name}/></button>:<LuImage/>}<span>{item.name}</span><button className="pi-icon" disabled={running} aria-label={t('removeAttachment')} onClick={()=>void mutateChat(window.naiDesktop.deleteAgentAttachment(chat.id,item.id))}><LuX/></button></div>)}</div>}
        <div className="pi-composer"><button className="pi-icon" disabled={!chat||running} aria-label={t('addAttachment')} onClick={()=>void importAttachments()}><LuPlus/></button><textarea ref={inputRef} aria-label={t('compose')} value={text} rows={1} onChange={event=>setText(event.target.value)} placeholder={t('hint')} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();void run()}}}/>{running?<button className="pi-icon pi-stop" aria-label={t('stop')} onClick={()=>chat&&void window.naiDesktop.abortAgentMessage(chat.id)}><LuSquare/></button>:<button className="pi-primary pi-icon" aria-label={t('send')} disabled={!configured||(!text.trim()&&!chat?.draftAttachments.length)} onClick={()=>void run()}><LuArrowUp/></button>}</div><div className="pi-compose-footer"><button className="pi-model-chip" disabled={running} onClick={()=>setModelPickerOpen(true)} title={t('modelSettings')}><span className={`pi-model-dot ${configured?'is-ready':''}`}/><span>{settings?.agentApiModel||t('missingModel')}</span><LuChevronDown aria-hidden/></button><small className="pi-compose-hint">{running?t('busySwitch'):t('sendHint')}</small></div>
      </div>
    </section>
    {modelPickerOpen&&<AgentDialog title={t('modelSettings')} close={()=>{if(!saving&&!discovering)setModelPickerOpen(false)}}><p>{settings?.agentApiProtocol} · {settings?.agentApiModel||t('missingModel')}</p><button disabled={discovering||saving||running||!configured} onClick={()=>void discoverModels()}>{t(discovering?'statusRunning':discoveryState==='error'||discoveryState==='empty'?'retryModels':'loadModels')}</button>{discoveryState!=='idle'&&<p className={discoveryState==='error'?'pi-notice pi-notice-error':'pi-notice'} role={discoveryState==='error'?'alert':'status'}>{t(discoveryState==='empty'?'emptyModels':discoveryState==='error'?'failedModels':'foundModels')} {discoveryMessage}</p>}<div className="pi-model-list">{models.map(model=><button disabled={saving||running} key={model.id} aria-pressed={model.id===settings?.agentApiModel} onClick={()=>void chooseModel(model.id)}>{model.displayName} <small>{model.id} · {t('modelSource_'+model.metadataSource)}</small></button>)}</div><footer><button disabled={saving||discovering||running} onClick={()=>{setModelPickerOpen(false);openSettings()}}><LuSettings/>{t('advancedSettings')}</button></footer></AgentDialog>}
    {settingsOpen&&<AgentDialog title={t('modelSettings')} close={()=>{if(!saving)setSettingsOpen(false)}}><p>{t('configureHint')}</p><p className="pi-notice">{t('imageApi')}</p><label>{t('providerPreset')}<select value="" onChange={event=>{const preset=AGENT_PROVIDER_PRESETS.find(item=>item.id===event.target.value);if(preset)setModelDraft({...modelDraft,agentApiProtocol:preset.protocol,agentApiBaseUrl:preset.baseUrl,agentApiModel:preset.model,agentProviderName:preset.providerName,agentContextWindow:preset.contextWindow,agentMaxOutputTokens:preset.maxOutputTokens,agentVisionEnabled:preset.vision,agentApiKey:''})}}><option value="">{t('selectProvider')}</option>{AGENT_PROVIDER_PRESETS.map(preset=><option value={preset.id} key={preset.id}>{preset.label}</option>)}</select></label><label>{t('apiAddress')}<input autoFocus placeholder="https://your-provider.example/v1" value={modelDraft.agentApiBaseUrl??''} onChange={e=>setModelDraft({...modelDraft,agentApiBaseUrl:e.target.value})}/></label><label>{t('modelId')}<input value={modelDraft.agentApiModel??''} onChange={e=>setModelDraft({...modelDraft,agentApiModel:e.target.value})}/></label><label>{t('apiKey')}<input type="password" autoComplete="off" value={modelDraft.agentApiKey??''} onChange={e=>setModelDraft({...modelDraft,agentApiKey:e.target.value})}/></label><details><summary>{t('details')}</summary><label>{t('protocol')}<select value={modelDraft.agentApiProtocol??'openai-compatible'} onChange={e=>setModelDraft({...modelDraft,agentApiProtocol:e.target.value as AppSettings['agentApiProtocol']})}><option value="openai-compatible">OpenAI Chat Completions</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic-messages">Anthropic Messages</option><option value="google-gemini">Google Gemini</option></select></label><label className="pi-check"><input type="checkbox" checked={modelDraft.agentVisionEnabled!==false} onChange={e=>setModelDraft({...modelDraft,agentVisionEnabled:e.target.checked})}/>{t('imageAnalysis')}</label></details>{configError&&<p role="alert" className="pi-error">{configError}</p>}<footer><button disabled={saving} onClick={()=>setSettingsOpen(false)}>{t('cancel')}</button><button className="pi-primary" disabled={saving} onClick={()=>void saveModel()}>{t(saving?'saveBusy':'save')}</button></footer></AgentDialog>}
    {chatAction&&chat&&<AgentDialog title={t(chatAction==='rename'?'rename':'deleteChat')} close={()=>setChatAction(undefined)}>{chatAction==='rename'?<label>{t('chatName')}<input autoFocus value={chatName} maxLength={100} onChange={e=>setChatName(e.target.value)}/></label>:<p>{t('deleteHint')}</p>}<footer><button onClick={()=>setChatAction(undefined)}>{t('cancel')}</button><button className={chatAction==='delete'?'pi-danger':'pi-primary'} disabled={chatAction==='rename'&&!chatName.trim()} onClick={()=>{void mutateChat(chatAction==='rename'?window.naiDesktop.renameAgentConversation(chat.id,chatName.trim()):window.naiDesktop.deleteAgentConversation(chat.id));setChatAction(undefined)}}>{t(chatAction==='rename'?'save':'deleteChat')}</button></footer></AgentDialog>}
    {image&&<AgentDialog title={t('preview')} close={()=>setImage(undefined)}><img className="pi-preview-image" src={image.fileUrl} alt={image.name}/><p>{image.name}</p><footer><button onClick={()=>setImage(undefined)}>{t('close')}</button></footer></AgentDialog>}
  </div>;
}
