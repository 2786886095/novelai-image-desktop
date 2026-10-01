import { normalizeStudioComposerActions, studioComposerActionLabel } from './agent/composer-actions';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { LuArrowDown, LuArrowUp, LuCheck, LuChevronDown, LuCopy, LuImage, LuLoaderCircle, LuMessageSquare, LuPencil, LuPlus, LuSearch, LuSettings, LuSparkles, LuSquare, LuArchive, LuArchiveRestore, LuTrash2, LuEllipsis, LuX, LuUserRound, LuBot, LuNetwork, LuWrench, LuGauge, LuFileText, LuShieldCheck, LuZap, LuPanelLeftOpen, LuPanelLeftClose, LuPanelRightOpen, LuPanelRightClose } from 'react-icons/lu';
import type { AgentComposerAction, AgentConversation, AgentDiscoveredModel, AgentAttachment, AgentEvent, AgentMessage, AgentPermissionRequest, AgentWorkspaceData } from './agent/types';
import { AGENT_PROVIDER_PRESETS, agentProviderRequiresApiKey, inferAgentProviderPreset } from './agent/provider-catalog';
import { studioSourceUrl, studioWebSources, studioContextMeter, preparedStudioPreview, shouldFollowStudioScroll, studioToolStatus, studioUxText, validStudioModelConfig } from './agent/ux';
import { clampCompactThreshold } from './agent/context';
import type { AppSettings } from './types';
import { useAppStore } from './store';
import {confirmAction} from './components/confirm';
import {MotionDisclosure} from './components/MotionDisclosure';
import {useStudioRegionMotion} from './use-studio-motion';
import {normalizeAgentUiPreferences,type AgentUiPreferences} from './agent/preferences';
import { AppPortal, SelectMenu, SelectMenuCompat } from './components/ui';
import './pi-agent-page.css';
import {useDisclosurePresence,disclosureAttributes} from './components/disclosure-motion';
import {AgentQuestionCards} from './components/AgentQuestionCards';
import type {AgentQuestionRequest} from './agent/types';
import {AgentResourcePanel} from './components/AgentResourcePanel';
import {studioSessionOptions,type StudioConversationOptions} from './agent/workspace-controls';

function providerIcon(id: string): ReactNode {
  if(id==='custom')return <LuWrench/>;
  return <span className="pi-provider-brand"><img className="brand-light" src={`${import.meta.env.BASE_URL}provider-logos/light/${id}.png`} alt=""/><img className="brand-dark" src={`${import.meta.env.BASE_URL}provider-logos/dark/${id}.png`} alt=""/></span>;
}

function AgentDialog({title, children, close}: {title: string; children: ReactNode; close: () => void}) {
  const ref=useRef<HTMLElement>(null),id=useId();
  useLayoutEffect(()=>{ref.current?.querySelector<HTMLElement>('[autofocus],input,button')?.focus({preventScroll:true});},[]);
  return <AppPortal><div className="modal-backdrop pi-dialog-mask" onMouseDown={event=>{if(event.target===event.currentTarget)close();}} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();close();}}}>
    <section ref={ref} className="pi-agent pi-modal" role="dialog" aria-modal="true" aria-labelledby={id}>
    <header><h2 id={id}>{title}</h2><button type="button" className="pi-icon" aria-label={studioUxText(useAppStore.getState().settings?.language, 'close')} onClick={close}><LuX /></button></header>{children}
    </section></div></AppPortal>;

}

function AgentToolGroup({message, language, children}: {message: AgentMessage; language: unknown; children: ReactNode}) {
  const [expanded, setExpanded] = useState<boolean>();
  const id = useId();
  const attention = message.tools.some(tool => ['pending', 'running', 'error'].includes(tool.status));
  const open = expanded ?? attention;
  return <section className="pi-tool-group"><button type="button" className="pi-tool-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setExpanded(!open)}>
    {message.tools.some(tool=>tool.status==='error')?<LuX aria-hidden/>:attention?<LuLoaderCircle aria-hidden/>:<LuCheck aria-hidden/>}<span>{studioUxText(language,'toolProgress',String(message.tools.length))}</span><LuChevronDown className={open?'is-expanded':''} aria-hidden/>
  </button><MotionDisclosure id={id} open={open}><div className="pi-tools">{children}</div></MotionDisclosure></section>;
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
  const [archivedView, setArchivedView] = useState(settings?.agentUiPreferences?.archivedView??false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelDraft, setModelDraft] = useState<Partial<AppSettings>>({});
  const [providerPreset, setProviderPreset] = useState('');
  const [saving, setSaving] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [models, setModels] = useState<AgentDiscoveredModel[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryState, setDiscoveryState] = useState<'idle'|'ready'|'empty'|'error'>('idle');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const discoveryRun = useRef(0);
  useEffect(()=>{discoveryRun.current++;setModels([]);setDiscoveryState('idle');setDiscoveryMessage('');setDiscovering(false)},[settings?.agentApiProtocol,settings?.agentApiBaseUrl,settings?.agentApiKey]);
  const [compacting, setCompacting] = useState(false);
  const [draftActions, setDraftActions] = useState<Record<string, AgentComposerAction[]>>({});
  const contextRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {const node=event.target as Element;if(node.closest('.select-menu-popover'))return;if(contextRef.current&&!contextRef.current.contains(node))contextRef.current.open=false;};
    document.addEventListener('pointerdown',dismiss,true);return()=>document.removeEventListener('pointerdown',dismiss,true);
  }, []);
  const [configError, setConfigError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(()=>settings?.agentUiPreferences?.sidebarOpen??window.innerWidth>760);
  const [resourcesOpen,setResourcesOpen]=useState(settings?.agentUiPreferences?.resourcesOpen??false);
  const [resourceTab,setResourceTab]=useState<NonNullable<AgentUiPreferences['resourceTab']>>(settings?.agentUiPreferences?.resourceTab??'presets');
  const sidebarPresent=useDisclosurePresence(sidebarOpen),resourcesPresent=useDisclosurePresence(resourcesOpen);
  const leftToggle=useRef<HTMLButtonElement>(null),rightToggle=useRef<HTMLButtonElement>(null);
  const [optionsBusy,setOptionsBusy]=useState(false);
  const [composerHeight,setComposerHeight]=useState(()=>{if(settings?.agentUiPreferences?.composerHeight)return settings.agentUiPreferences.composerHeight;try{return Math.max(108,Math.min(420,Number(localStorage.getItem('studio-agent-composer-height'))||154));}catch{return 154;}});
  const preferencesReady=useRef(!!settings),preferenceWrite=useRef(Promise.resolve());
  const flushPreferences=useRef<(()=>void)|undefined>(undefined);
  useEffect(()=>()=>{flushPreferences.current?.();},[]);
  useEffect(()=>{if(settings&&!preferencesReady.current){const value=normalizeAgentUiPreferences(settings.agentUiPreferences);setSidebarOpen(value.sidebarOpen??window.innerWidth>760);setResourcesOpen(value.resourcesOpen??false);setArchivedView(value.archivedView??false);setResourceTab(value.resourceTab??'presets');if(value.composerHeight)setComposerHeight(value.composerHeight);preferencesReady.current=true;}},[settings]);
  useEffect(()=>{
    if(!preferencesReady.current)return;
    const value=normalizeAgentUiPreferences({sidebarOpen,resourcesOpen,archivedView,resourceTab,composerHeight});
    const save=()=>{preferenceWrite.current=preferenceWrite.current.then(async()=>{await window.naiDesktop.setSetting('agentUiPreferences',value);useAppStore.setState(state=>({settings:state.settings?{...state.settings,agentUiPreferences:value}:state.settings}));}).catch(reason=>{useAppStore.getState().setToast(String(reason));});};
    // Debounce dragging, flush on unmount; serialize writes so old replies cannot win.
    flushPreferences.current=save;
    const timer=window.setTimeout(()=>{save();flushPreferences.current=undefined;},200);
    return()=>{window.clearTimeout(timer);};
  },[sidebarOpen,resourcesOpen,archivedView,resourceTab,composerHeight]);
  const resizePress=useRef<{y:number;height:number}|null>(null);
  const [questions,setQuestions]=useState<AgentQuestionRequest[]>([]);
  const [permissions, setPermissions] = useState<AgentPermissionRequest[]>([]);
  const [answering, setAnswering] = useState(false);
  const [image, setImage] = useState<AgentAttachment>();
  const [chatAction, setChatAction] = useState<AgentConversation>();
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
    void Promise.all([window.naiDesktop.getAgentWorkspace(), window.naiDesktop.getAgentPendingPermissions(),window.naiDesktop.getAgentPendingQuestions?.()??Promise.resolve([])])
      .then(([value, pending, pendingQuestions]) => { if (alive) { updateWorkspace(value); setPermissions(pending);setQuestions(pendingQuestions); setError(''); } })
      .catch((reason) => { if (alive) setError(String(reason)); }).finally(() => { if (alive) setLoading(false); });
    const unsubscribe = window.naiDesktop.onAgentEvent((event: AgentEvent) => {
      if (!alive) return;
      if (event.kind === 'workspace') updateWorkspace(event.workspace);
      if (event.kind === 'error' && (!event.conversationId || event.conversationId === selectedId.current)) setError(event.message);
      if(event.kind==='question')setQuestions(current=>[...current.filter(q=>q.id!==event.request.id),event.request]);
      if(event.kind==='question-resolved')setQuestions(current=>current.filter(q=>q.id!==event.requestId));
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

  const chat = useMemo(() => workspace?.conversations.find((item) => item.id === workspace.selectedConversationId) ?? workspace?.conversations.find(item=>!item.archivedAt), [workspace]);
  const archived = !!chat?.archivedAt;
  selectedId.current = chat?.id;
  const configured = !!settings?.agentApiBaseUrl?.trim() && !!settings.agentApiModel?.trim() &&
    (!agentProviderRequiresApiKey(settings.agentApiProtocol, settings.agentApiBaseUrl) || !!settings.agentApiKey?.trim());
  const pendingQuestion=questions.find(q=>q.conversationId===chat?.id);
  const pending = permissions.find((item) => item.conversationId === chat?.id);
  const running = busy || compacting || optionsBusy || !!pending || !!pendingQuestion || chat?.status === 'running' || chat?.status === 'waiting-permission';
  const sessionOptions=studioSessionOptions(chat);
  const text = chat ? drafts[chat.id] ?? '' : '';
  const selectedActions = chat ? draftActions[chat.id] ?? [] : [];
  useEffect(() => {if(chat)try{const cached=sessionStorage.getItem(`studio-agent-actions:${chat.id}`);if(cached)setDraftActions(current=>({...current,[chat.id]:current[chat.id]??normalizeStudioComposerActions(JSON.parse(cached))}));}catch{/* Optional named-selection cache. */}},[chat?.id]);
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
  }, [chat?.id, chat?.messages, pending, pendingQuestion?.id]);
  const resizeMax=()=>Math.max(108,Math.min(420,(inputRef.current?.closest('.pi-main')?.clientHeight??window.innerHeight)*.5));
  const effectiveComposerHeight=Math.min(composerHeight,resizeMax());
  const resizeComposer=(value:number)=>{const next=Math.round(Math.max(108,Math.min(resizeMax(),value)));setComposerHeight(next);try{localStorage.setItem('studio-agent-composer-height',String(next));}catch{/* Optional layout preference. */}};
  const saveOptions=async(patch:Partial<StudioConversationOptions>)=>{
    if(!chat||running||archived)return;setOptionsBusy(true);setError('');
    try{const result=await window.naiDesktop.setStudioConversationOptions(chat.id,patch);if(result.ok)updateWorkspace(result.workspace);else setError(result.message??t('statusError'));}
    catch(reason){setError(String(reason));}finally{setOptionsBusy(false);}
  };

  const setText = (value: string, id = chat?.id) => {
    if (!id) return;
    setDrafts((current) => ({ ...current, [id]: value }));
    try { sessionStorage.setItem(`studio-agent-draft:${id}`, value); } catch { /* Draft still retained while page is mounted. */ }
  };
  const prefill = (value: string) => { setText(value); inputRef.current?.focus(); };
  const setChatActions = (value: AgentComposerAction[], id=chat?.id) => {
    if(!id)return; const actions=normalizeStudioComposerActions(value);
    setDraftActions(current=>({...current,[id]:actions}));
    try{sessionStorage.setItem(`studio-agent-actions:${id}`,JSON.stringify(actions));}catch{/* Remains in memory. */}
  };
  const mutateChat = async (action: Promise<{ok: boolean; workspace: AgentWorkspaceData; message?: string}>) => {
    if (chat && transcript.current) readingPositions.current[chat.id] = {top: transcript.current.scrollTop, following: following.current};
    try { const result = await action; if (result.ok) { updateWorkspace(result.workspace); if(window.innerWidth<=760)setSidebarOpen(false); } else setError(result.message ?? t('statusError')); }
    catch (reason) { setError(String(reason)); }
  };
  const importResources=async(kind:'presets'|'worldbooks'|'characters')=>{
    if(running||optionsBusy)return;setOptionsBusy(true);setError('');
    try{const result=await window.naiDesktop.importStudioResources(kind);if(result.ok){updateWorkspace(result.workspace);if(!result.cancelled&&result.message)useAppStore.getState().setToast(result.message);}else setError(result.message??t('statusError'));}catch(reason){setError(String(reason));}finally{setOptionsBusy(false);}
  };
  const run = async () => {
    if (archived || !chat || running || !configured || (!text.trim() && !selectedActions.length && !chat.draftAttachments.length)) return;
    const input = text.trim(); const id = chat.id; const actions = selectedActions;
    const before = chat.messages.filter((item) => item.role === 'user').length;
    setText('', id); setChatActions([],id); setError(''); setBusy(true); following.current = true;
    try {
      const result = await window.naiDesktop.sendAgentMessage({ conversationId: id, text: input, actions });
      if (!result.ok) {
        const after = latestWorkspace.current?.conversations.find((item) => item.id === id)?.messages.filter((item) => item.role === 'user').length ?? before;
        if (after === before) {setText(input, id);setChatActions(actions,id);}
        setError(result.message ?? t('statusError'));
      }
    } catch (reason) {
      const after = latestWorkspace.current?.conversations.find((item) => item.id === id)?.messages.filter((item) => item.role === 'user').length ?? before;
      if (after === before) {setText(input, id);setChatActions(actions,id);}
      setError(String(reason));
    }
    finally { setBusy(false); }
  };
  const importAttachments = async (sourcePaths?: string[]) => {
    if (archived || !chat || running) return;
    try {
      const result = await window.naiDesktop.importAgentFiles(chat.id, sourcePaths);
      if (!result.ok && !result.cancelled) setError(result.message ?? t('statusError'));
      updateWorkspace(await window.naiDesktop.getAgentWorkspace());
    } catch (reason) { setError(String(reason)); }
  };
  const compact = async () => {
    if (archived || !chat || running || !configured) return;
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
  const openSettings = () => { setProviderPreset(inferAgentProviderPreset(settings?.agentApiProtocol??'openai-compatible',settings?.agentApiBaseUrl??'')); setModelDraft({ agentApiProtocol: settings?.agentApiProtocol ?? 'openai-compatible', agentApiBaseUrl: settings?.agentApiBaseUrl ?? '', agentApiModel: settings?.agentApiModel ?? '', agentApiKey: settings?.agentApiKey ?? '', agentVisionEnabled: settings?.agentVisionEnabled !== false, agentProviderName: settings?.agentProviderName, agentContextWindow: settings?.agentContextWindow, agentMaxOutputTokens: settings?.agentMaxOutputTokens }); setConfigError(''); setSettingsOpen(true); };
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
    {message.error && <div role="alert" className="pi-notice pi-notice-error"><strong>{t('statusError')}</strong><p>{message.error}</p><small>{t('errorHint')}</small><button disabled={running} onClick={()=>{const index=chat?.messages.findIndex(item=>item.id===message.id)??-1;const request=chat?.messages.slice(0,index).reverse().find(item=>item.role==='user');if(request){prefill(request.content);setChatActions(request.actions??[])}}}>{t('retryDraft')}</button><button onClick={()=>void copy(message.error??'',message.id)}>{t('copy')}</button></div>}
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
    {!!message.actions?.length && <div className="pi-selected-actions pi-message-selections">{message.actions.map((action,index)=><span key={index}><LuWrench aria-hidden/>{studioComposerActionLabel(action,settings?.language,settings?.promptTemplates)}</span>)}</div>}
    {message.content && <footer className="pi-message-actions"><button title={t('copy')} onClick={()=>void copy(message.content,message.id)}><LuCopy/>{t(copied===message.id?'copied':'copy')}</button>{message.role==='user' && <button onClick={()=>{prefill(message.content);setChatActions(message.actions??[])}}><LuPencil/>{t('editRequest')}</button>}</footer>}
  </article>;
  const meter = studioContextMeter(chat?.context);
  const chatListMotion=useStudioRegionMotion(archivedView);
  const chats = workspace?.conversations.filter(item=>!!item.archivedAt===archivedView).filter((item)=>item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];

  const changeArchived = async (id: string, value: boolean) => {
    if (running) return;
    try {const result=await window.naiDesktop.setAgentConversationArchived(id,value);if(result.ok){updateWorkspace(result.workspace);if(!value)setArchivedView(false);}else setError(result.message??t('statusError'));}catch(reason){setError(String(reason));}
  };
  const deleteChat=async(item:AgentConversation)=>{
    if(running||['running','waiting-permission'].includes(item.status))return;
    if(!await confirmAction(t('deleteChatConfirm',item.title),t('deleteChat'),undefined,undefined,{confirm:t('deleteChat'),cancel:t('cancel')}))return;
    await mutateChat(window.naiDesktop.deleteAgentConversation(item.id));
  };
  const rowAction = (item: AgentConversation, action: string) => {if(action==='rename'){setChatName(item.title);setChatAction(item);}else if(action==='delete')void deleteChat(item);else void changeArchived(item.id,action==='archive');};

  return <div className={`pi-agent${sidebarOpen?' has-left-pane':''}${resourcesOpen?' has-right-pane':''}`}>
    <div id="pi-conversations-pane" className="pi-pane-slot pi-pane-left" {...disclosureAttributes(sidebarOpen)} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();setSidebarOpen(false);leftToggle.current?.focus();}}}>
    {sidebarPresent&&<aside id="pi-conversations" className="pi-sidebar is-open" aria-label={t('chats')}>
      <button disabled={running} title={running?t('busySwitch'):undefined} onClick={()=>{setArchivedView(false);void mutateChat(window.naiDesktop.createAgentConversation(t('newChat')))}}><LuPlus/>{t('newChat')}</button>
      <label className="pi-search"><LuSearch aria-hidden/><input aria-label={t('searchChats')} placeholder={t('searchChats')} value={search} onChange={(event)=>setSearch(event.target.value)}/></label>
      <div className="pi-chat-scope" aria-label={t('chats')}><button aria-pressed={!archivedView} onClick={()=>setArchivedView(false)}><LuMessageSquare/>{t('activeChats')}</button><button aria-pressed={archivedView} onClick={()=>setArchivedView(true)}><LuArchive/>{t('archivedChats')}</button></div>
      <nav ref={chatListMotion}>{chats.map(item=><div className={`pi-chat-row${item.id===chat?.id?' is-active':''}`} key={item.id}><button className="pi-chat-select" aria-current={item.id===chat?.id?'page':undefined} disabled={running} title={running?t('busySwitch'):item.title} onClick={()=>void mutateChat(window.naiDesktop.selectAgentConversation(item.id))}>{item.archivedAt?<LuArchive/>:<LuMessageSquare/>}<span>{item.title}</span></button><SelectMenu value="" minMenuWidth={148} ariaLabel={`${t('chatActions')}: ${item.title}`} label={<LuEllipsis/>} className="pi-chat-more" popoverClassName="pi-chat-menu" disabled={running} options={[{value:'rename',label:t('rename'),icon:<LuPencil/>},item.archivedAt?{value:'restore',label:t('restoreChat'),icon:<LuArchiveRestore/>}:{value:'archive',label:t('archiveChat'),icon:<LuArchive/>},{value:'delete',label:t('deleteChat'),icon:<LuTrash2/>,disabled:['running','waiting-permission'].includes(item.status)}]} onChange={action=>rowAction(item,action)}/></div>)}{!chats.length&&<p>{t(archivedView?'noArchivedChats':'noChats')}</p>}</nav>
      <div className="pi-sidebar-footer"><span className={`pi-model-dot ${configured?'is-ready':''}`}/><span role="status">{pending?t('statusPending'):running?t('statusRunning'):t(configured?'ready':'missingModel')}</span><button className="pi-icon" disabled={running} aria-label={t('modelSettings')} title={t('modelSettings')} onClick={openSettings}><LuSettings/></button></div>
    </aside>}
    </div>
    {sidebarOpen && <button className="pi-sidebar-scrim" aria-label={t('close')} onClick={()=>{setSidebarOpen(false);leftToggle.current?.focus()}}/>}
    <button ref={leftToggle} className="pi-side-toggle pi-left-toggle" aria-label={t(sidebarOpen?'collapseChats':'expandChats')} title={t(sidebarOpen?'collapseChats':'expandChats')} aria-expanded={sidebarOpen} aria-controls="pi-conversations-pane" onClick={()=>{if(window.innerWidth<=1100)setResourcesOpen(false);setSidebarOpen(!sidebarOpen)}}>{sidebarOpen?<LuPanelLeftClose/>:<LuPanelLeftOpen/>}</button>
    <section className="pi-main">
      {!configured && !loading && !archived && <div className="pi-setup"><div><strong>{t('missingModel')}</strong><p>{t('setupBody')}</p></div><button className="pi-primary" onClick={openSettings}>{t('setup')}</button></div>}
      {archived&&<div className="pi-archive-banner"><LuArchive/><span>{t('archivedReadOnly')}</span><button disabled={running} onClick={()=>chat&&void changeArchived(chat.id,false)}><LuArchiveRestore/>{t('restoreChat')}</button></div>}
      <div className="pi-transcript-wrap"><main className="pi-transcript" tabIndex={0} ref={transcript} aria-label={t('chats')} onScroll={()=>{const el=transcript.current;if(el){following.current=shouldFollowStudioScroll(el.scrollTop,el.clientHeight,el.scrollHeight);if(chat)readingPositions.current[chat.id]={top:el.scrollTop,following:following.current};setAway(!following.current)}}}>
        {loading ? <p role="status">{t('statusRunning')}</p> : !chat?.messages.length && <div className="pi-empty"><LuSparkles className="pi-empty-icon"/><h3>{t('heroTitle')}</h3><p>{t('heroBody')}</p><div className="pi-starters"><button onClick={()=>prefill(t('quickSettingsDraft'))}><LuSettings/>{t('quickSettings')}</button><button onClick={()=>prefill(t('quickPromptDraft'))}><LuPencil/>{t('quickPrompt')}</button><button onClick={()=>{prefill(t('quickReferenceDraft'));void importAttachments()}}><LuImage/>{t('quickReference')}</button></div></div>}
        {chat?.messages.filter(item=>item.role!=='system').map(renderMessage)}

        {pendingQuestion&&<AgentQuestionCards key={pendingQuestion.id} request={pendingQuestion} language={settings?.language} onRespond={async response=>{
          const result=await window.naiDesktop.respondAgentQuestion?.(response)??{ok:false};
          if(!result.ok)setQuestions(await window.naiDesktop.getAgentPendingQuestions?.()??[]);
          return result;
        }}/>}
        {running&&!pending&&!pendingQuestion && <div className="pi-working" role="status"><span className="pi-pulse"/><span>{t('workingBody')}</span></div>}
      </main>{away&&<button className="pi-latest" onClick={()=>{following.current=true;setAway(false);if(transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight}}><LuArrowDown/>{t('latest')}</button>}</div>
      {pending && <div className="pi-decision-tray" aria-label={t("decisionArea")}>{pending.type==='langbai_generate_image'?plan(pending.metadata??{},true):<section className="pi-plan"><header><strong>{t('confirmTool',pending.title)}</strong></header><div className="pi-plan-body"><p>{t('confirmationHint')}</p>{pending.metadata?.positivePrompt!=null&&<p>{String(pending.metadata.positivePrompt)}</p>}{Boolean(pending.metadata?.paid)&&<p className="pi-cost">{typeof pending.metadata?.estimatedAnlas==='number'?t('estimatedCost',String(pending.metadata.estimatedAnlas)):t('unknownCost')} {t('paidWarning')}</p>}<details><summary>{t('details')}</summary><pre>{JSON.stringify(pending.metadata,null,2)}</pre></details></div><footer><button disabled={answering} onClick={()=>void respond('reject')}>{t('cancel')}</button><button className="pi-primary" disabled={answering} onClick={()=>void respond('once')}>{t('confirm')}</button></footer></section>}</div>}
      {error && <div role="alert" className="pi-notice pi-notice-error pi-global-error"><span>{error}</span><button className="pi-icon" aria-label={t('close')} onClick={()=>setError('')}><LuX/></button></div>}
      <div className="pi-compose-area">
        {!!chat?.draftAttachments.length && <div className="pi-attachments">{chat.draftAttachments.map(item=><div key={item.id}>{item.kind==='image'&&item.fileUrl?<button className="pi-thumb" onClick={()=>setImage(item)} aria-label={t('preview')}><img src={item.fileUrl} alt={item.name}/></button>:<LuImage/>}<span>{item.name}</span><button className="pi-icon" disabled={running} aria-label={t('removeAttachment')} onClick={()=>void mutateChat(window.naiDesktop.deleteAgentAttachment(chat.id,item.id))}><LuX/></button></div>)}</div>}
        {!!selectedActions.length&&<div className="pi-selected-actions" aria-label={t('selectedActions')}>{selectedActions.map((action,index)=><span key={index}><LuWrench aria-hidden/><span>{studioComposerActionLabel(action,settings?.language,settings?.promptTemplates)}</span><button className="pi-icon" disabled={archived||running} aria-label={`${t('removeAction')}: ${studioComposerActionLabel(action,settings?.language,settings?.promptTemplates)}`} onClick={()=>setChatActions(selectedActions.filter((_,i)=>i!==index))}><LuX/></button></span>)}</div>}
        <div className="pi-composer-shell" style={{height:effectiveComposerHeight}}>
        <div className="pi-composer-grip" role="separator" tabIndex={0} aria-orientation="horizontal" aria-label={t('resizeComposer')} title={t('resizeComposer')} aria-valuemin={108} aria-valuemax={Math.round(resizeMax())} aria-valuenow={effectiveComposerHeight} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);resizePress.current={y:e.clientY,height:effectiveComposerHeight};}} onPointerMove={e=>{const start=resizePress.current;if(start)resizeComposer(start.height+start.y-e.clientY);}} onPointerUp={()=>{resizePress.current=null;}} onPointerCancel={()=>{resizePress.current=null;}} onLostPointerCapture={()=>{resizePress.current=null;}} onKeyDown={e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();resizeComposer(e.key==='Home'?108:e.key==='End'?resizeMax():effectiveComposerHeight+(e.key==='ArrowUp'?16:-16));}}}><span/></div>
        <div className="pi-composer"><button className="pi-icon" disabled={archived||!chat||running} aria-label={t('addAttachment')} onClick={()=>void importAttachments()}><LuPlus/></button><textarea readOnly={archived} ref={inputRef} aria-label={t('compose')} title={t('sendHint')} value={text} rows={1} onChange={event=>setText(event.target.value)} placeholder={t(archived?'archivedReadOnly':'hint')} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();void run()}}}/>{running?<button className="pi-icon pi-stop" aria-label={t('stop')} onClick={()=>chat&&void window.naiDesktop.abortAgentMessage(chat.id)}><LuSquare/></button>:<button className="pi-primary pi-icon" aria-label={t('send')} disabled={archived||!configured||(!text.trim()&&!selectedActions.length&&!chat?.draftAttachments.length)} onClick={()=>void run()}><LuArrowUp/></button>}</div><div className="pi-compose-meta">
          <div className="pi-execution-modes" role="group" aria-label={t('approvalMode')}><button disabled={archived||running||!chat} aria-pressed={sessionOptions.approvalMode==='confirm'} title={t('confirmModeHint')} onClick={()=>void saveOptions({studioApprovalMode:'confirm'})}><LuShieldCheck/>{t('confirmMode')}</button><button className={sessionOptions.approvalMode==='auto'?'pi-full-auto':''} disabled={archived||running||!chat} aria-pressed={sessionOptions.approvalMode==='auto'} title={t('autoModeHint')} onClick={()=>void saveOptions({studioApprovalMode:'auto'})}><LuZap/>{t('autoMode')}</button></div>
          <button className="pi-option-toggle" disabled={archived||running||!chat} aria-pressed={sessionOptions.webSearchEnabled} title={t('webToggleHint')} onClick={()=>void saveOptions({studioWebSearchEnabled:!sessionOptions.webSearchEnabled})}><LuSearch/>{t('webQuery')}</button>
          <button className="pi-option-toggle" disabled={archived||running||!chat} aria-pressed={sessionOptions.templateEnabled} title={t('presetSwitchHint')} onClick={()=>void saveOptions({studioTemplateEnabled:!sessionOptions.templateEnabled})}><LuFileText/>{t('presetToggle')}</button>
          {sessionOptions.approvalMode==='auto'&&<small className="pi-auto-note" role="status">{t('autoCostNote')}</small>}
          <button className="pi-model-chip" disabled={running} onClick={()=>setModelPickerOpen(true)} title={t('modelSettings')}><span className={`pi-model-dot ${configured?'is-ready':''}`}/><span>{settings?.agentApiModel||t('missingModel')}</span><LuChevronDown aria-hidden/></button><details ref={contextRef} className="pi-context" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}><summary title={`${t('context')} · ${meter.used.toLocaleString()} / ${meter.limit.toLocaleString()} ${t(meter.estimated?'tokensEstimated':'tokensReported')}`}><LuGauge aria-hidden/><span>{Math.round(meter.percent)}%</span></summary><div className="pi-context-panel"><p>{t('context')} · {meter.used.toLocaleString()} / {meter.limit.toLocaleString()} {t(meter.estimated?'tokensEstimated':'tokensReported')}</p><progress className={chat?.context.danger?'is-danger':undefined} aria-label={t('context')} max={100} value={meter.percent}/><div className="pi-context-controls"><button disabled={archived||running||!configured||!chat?.messages.length} onClick={()=>void compact()}>{t(compacting?'statusRunning':'compactNow')}</button><label><input type="checkbox" disabled={running} checked={settings?.agentAutoCompact===true} onChange={async event=>{try{await window.naiDesktop.setSetting('agentAutoCompact',event.target.checked);await refreshSettings()}catch(reason){setError(String(reason))}}}/>{t('autoCompact')}</label><label>{t('compactThreshold')}<SelectMenuCompat aria-label={t('compactThreshold')} disabled={running} value={clampCompactThreshold(settings?.agentAutoCompactThreshold)} onChange={async event=>{try{await window.naiDesktop.setSetting('agentAutoCompactThreshold',Number(event.target.value));await refreshSettings()}catch(reason){setError(String(reason))}}}>{Array.from(new Set([0.5,0.7,0.8,0.88,0.9,0.95,clampCompactThreshold(settings?.agentAutoCompactThreshold)])).sort((a,b)=>a-b).map(value=><option key={value} value={value}>{Math.round(value*100)}%</option>)}</SelectMenuCompat></label><small>{t('compactHint')}</small></div>{chat?.lastSummary&&<pre>{chat.lastSummary}</pre>}</div></details></div>
        </div>
      </div>
    </section>
    <button ref={rightToggle} className="pi-side-toggle pi-right-toggle" aria-label={t(resourcesOpen?'collapseResources':'expandResources')} title={t(resourcesOpen?'collapseResources':'expandResources')} aria-expanded={resourcesOpen} aria-controls="pi-creative-resources-pane" onClick={()=>{if(window.innerWidth<=1100)setSidebarOpen(false);setResourcesOpen(!resourcesOpen)}}>{resourcesOpen?<LuPanelRightClose/>:<LuPanelRightOpen/>}</button>
    {resourcesOpen&&<button className="pi-resource-scrim" aria-label={t('close')} onClick={()=>{setResourcesOpen(false);rightToggle.current?.focus()}}/>}
    <div id="pi-creative-resources-pane" className="pi-pane-slot pi-pane-right" {...disclosureAttributes(resourcesOpen)} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();setResourcesOpen(false);rightToggle.current?.focus();}}}>
    {resourcesPresent&&<AgentResourcePanel tab={resourceTab} onTab={setResourceTab} workspace={workspace} chat={chat} language={settings?.language} disabled={archived||running||!chat} onChange={patch=>void saveOptions(patch)} onImport={kind=>void importResources(kind)}/> }
    </div>
    {modelPickerOpen&&<AgentDialog title={t('modelSettings')} close={()=>{if(!saving&&!discovering)setModelPickerOpen(false)}}><p>{settings?.agentApiProtocol} · {settings?.agentApiModel||t('missingModel')}</p><button disabled={discovering||saving||running||!configured} onClick={()=>void discoverModels()}>{t(discovering?'statusRunning':discoveryState==='error'||discoveryState==='empty'?'retryModels':'loadModels')}</button>{discoveryState!=='idle'&&<p className={discoveryState==='error'?'pi-notice pi-notice-error':'pi-notice'} role={discoveryState==='error'?'alert':'status'}>{t(discoveryState==='empty'?'emptyModels':discoveryState==='error'?'failedModels':'foundModels')} {discoveryMessage}</p>}<div className="pi-model-list">{models.map(model=><button disabled={saving||running} key={model.id} aria-pressed={model.id===settings?.agentApiModel} onClick={()=>void chooseModel(model.id)}><LuBot aria-hidden/><span>{model.displayName}</span>{model.id===settings?.agentApiModel&&<LuCheck aria-hidden/>}<small>{model.id} · {t('modelSource_'+model.metadataSource)}</small></button>)}</div><footer><button disabled={saving||discovering||running} onClick={()=>{setModelPickerOpen(false);openSettings()}}><LuSettings/>{t('advancedSettings')}</button></footer></AgentDialog>}
    {settingsOpen&&<AgentDialog title={t('modelSettings')} close={()=>{if(!saving)setSettingsOpen(false)}}><p>{t('configureHint')}</p><p className="pi-notice">{t('imageApi')}</p><label>{t('providerPreset')}<SelectMenu ariaLabel={t('providerPreset')} popoverClassName="pi-provider-menu" disabled={saving} value={providerPreset} options={[{value:'',label:t('selectProvider'),icon:<LuNetwork/>},...AGENT_PROVIDER_PRESETS.map(preset=>({value:preset.id,label:preset.label,icon:providerIcon(preset.id)}))]} onChange={id=>{const preset=AGENT_PROVIDER_PRESETS.find(item=>item.id===id);setProviderPreset(id);if(preset)setModelDraft({...modelDraft,agentApiProtocol:preset.protocol,agentApiBaseUrl:preset.baseUrl,agentApiModel:preset.model,agentProviderName:preset.providerName,agentContextWindow:preset.contextWindow,agentMaxOutputTokens:preset.maxOutputTokens,agentVisionEnabled:preset.vision,agentApiKey:''})}}/></label><label>{t('apiAddress')}<input autoFocus placeholder="https://your-provider.example/v1" value={modelDraft.agentApiBaseUrl??''} onChange={e=>setModelDraft({...modelDraft,agentApiBaseUrl:e.target.value})}/></label><label>{t('modelId')}<input value={modelDraft.agentApiModel??''} onChange={e=>setModelDraft({...modelDraft,agentApiModel:e.target.value})}/></label><label>{t('apiKey')}<input type="password" autoComplete="off" value={modelDraft.agentApiKey??''} onChange={e=>setModelDraft({...modelDraft,agentApiKey:e.target.value})}/></label><details><summary>{t('details')}</summary><label>{t('protocol')}<SelectMenu ariaLabel={t('protocol')} popoverClassName="pi-provider-menu" disabled={saving} value={modelDraft.agentApiProtocol??'openai-compatible'} options={[{value:'openai-compatible',label:'OpenAI Chat Completions',icon:providerIcon('openai')},{value:'openai-responses',label:'OpenAI Responses',icon:providerIcon('openai')},{value:'anthropic-messages',label:'Anthropic Messages',icon:providerIcon('anthropic')},{value:'google-gemini',label:'Google Gemini',icon:providerIcon('gemini')}]} onChange={protocol=>setModelDraft({...modelDraft,agentApiProtocol:protocol as AppSettings['agentApiProtocol']})}/></label><label className="pi-check"><input type="checkbox" checked={modelDraft.agentVisionEnabled!==false} onChange={e=>setModelDraft({...modelDraft,agentVisionEnabled:e.target.checked})}/>{t('imageAnalysis')}</label></details>{configError&&<p role="alert" className="pi-error">{configError}</p>}<footer><button disabled={saving} onClick={()=>setSettingsOpen(false)}>{t('cancel')}</button><button className="pi-primary" disabled={saving} onClick={()=>void saveModel()}>{t(saving?'saveBusy':'save')}</button></footer></AgentDialog>}
    {chatAction&&<AgentDialog title={t('rename')} close={()=>setChatAction(undefined)}><label>{t('chatName')}<input autoFocus value={chatName} maxLength={100} onChange={e=>setChatName(e.target.value)}/></label><footer><button onClick={()=>setChatAction(undefined)}>{t('cancel')}</button><button className="pi-primary" disabled={!chatName.trim()||running} onClick={()=>{void mutateChat(window.naiDesktop.renameAgentConversation(chatAction.id,chatName.trim()));setChatAction(undefined)}}>{t('save')}</button></footer></AgentDialog>}
    {image&&<AgentDialog title={t('preview')} close={()=>setImage(undefined)}><img className="pi-preview-image" src={image.fileUrl} alt={image.name}/><p>{image.name}</p><footer><button onClick={()=>setImage(undefined)}>{t('close')}</button></footer></AgentDialog>}
  </div>;
}
