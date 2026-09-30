import type { AppSettings } from '../types';
import rows from '../../shared/agent-ux-locales.json';
import type { AgentToolExecution } from './types';

export function studioUxText(language: unknown, key: string, name = '') {
  const index = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'].indexOf(String(language));
  const values = (rows as Record<string, string[]>)[key];
  return (values?.[index < 0 ? 0 : index] ?? key).replaceAll('{name}', name);
}

export function studioToolStatus(status: string) {
  return ({ pending: 'statusPending', running: 'statusRunning', completed: 'statusComplete',
    error: 'statusError', denied: 'statusDenied', aborted: 'statusStopped' } as Record<string, string>)[status] ?? 'statusRunning';
}

export function preparedStudioPreview(tool: AgentToolExecution): Record<string, unknown> | undefined {
  if (tool.name !== 'langbai_prepare_generation' || tool.status !== 'completed' || !tool.output || tool.output.length > 30_000) return;
  try {
    const value = JSON.parse(tool.output);
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.positivePrompt === 'string') return value;
  } catch { /* Older tool output stays in optional diagnostics. */ }
}

export function shouldFollowStudioScroll(scrollTop: number, clientHeight: number, scrollHeight: number) {
  return scrollHeight - scrollTop - clientHeight < 100;
}

export function validStudioModelConfig(base: string, model: string) {
  try { const url = new URL(base.trim()); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !!model.trim(); }
  catch { return false; }
}

/** Never present an estimate as provider-reported usage, or an invalid meter as capacity. */
export function studioContextMeter(context?: {used: number; limit: number; estimated: boolean}) {
  const used = context && Number.isFinite(context.used) ? Math.max(0, context.used) : 0;
  const limit = context && Number.isFinite(context.limit) ? Math.max(0, context.limit) : 0;
  return {used, limit, percent: limit > 0 ? Math.min(100, used / limit * 100) : 0, estimated: context?.estimated !== false};
}

export function studioTemplateDraft(template: {name: string; prefix: string; suffix: string; negativePrompt: string}) {
  return JSON.stringify({template: template.name, positivePrompt: [template.prefix, template.suffix].filter(Boolean).join(', '), negativePrompt: template.negativePrompt}, null, 2);
}

export type StudioTemplateKind = 'convert'|'reverse'|'optimize'|'assistant';
export function studioStoredTemplate(settings: AppSettings | null | undefined, kind: StudioTemplateKind, mode: 'mixed'|'tags'|'natural', version: 'v5'|'v4.5') {
  if (kind === 'optimize') return settings?.promptOptimizeTemplate?.trim() ?? '';
  if (kind === 'assistant') return settings?.promptAssistantTemplate?.trim() ?? '';
  const templates = kind === 'convert'
    ? version === 'v4.5' ? settings?.convertPromptTemplatesV45 : settings?.convertPromptTemplates
    : version === 'v4.5' ? settings?.reversePromptTemplatesV45 : settings?.reversePromptTemplates;
  return templates?.[mode]?.trim() ?? '';
}
/** Revision is deliberately not fabricated: read before preview/save/reset. */
export function studioTemplateRequest(kind: StudioTemplateKind, mode: 'mixed'|'tags'|'natural', templateVersion: 'v5'|'v4.5', action: 'read'|'save' = 'read') {
  const args = {kind, ...(kind === 'convert' || kind === 'reverse' ? {mode, templateVersion} : {})};
  return JSON.stringify(action === 'read' ? {tool: 'studio_prompt_template', args} : {tool: 'langbai_templates', args: {action: 'read', ...args}, nextAction: 'save', requires: ['fresh expectedRevision', 'body', 'user confirmation']}, null, 2);
}

export function studioSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096 || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    for (const params of [url.searchParams, new URLSearchParams(url.hash.slice(1))]) for (const key of params.keys()) if (/^(?:token|access_token|api_key|apikey|authorization|auth|password|secret|client_secret|client_assertion|jwt|credential|signature|sig|key|x-amz-.+|x-goog-.+)$/i.test(key)) return;
    return url.href;
  } catch { return; }
}
export function studioWebSources(tool: AgentToolExecution) {
  if (tool.name !== 'langbai_search_web' || tool.status !== 'completed') return;
  const invalid = {sources: [] as {title: string; url: string; snippet: string}[], fetchedAt: '', warning: '', blocked: 0, invalid: true};
  if (!tool.output || tool.output.length > 250_000) return invalid;
  try {
    const parsed = JSON.parse(tool.output);
    const data = parsed?.data ?? parsed;
    if (!data || !Array.isArray(data.sources)) return invalid;
    const sources: {title: string; url: string; snippet: string}[] = [];
    let blocked = 0;
    for (const source of data.sources.slice(0, 8)) {
      const url = studioSourceUrl(source?.url);
      if (!url || typeof source?.title !== 'string' || !source.title.trim()) { blocked++; continue; }
      if (sources.some(item => item.url === url)) continue;
      sources.push({url, title: source.title.slice(0, 500), snippet: typeof source.snippet === 'string' ? source.snippet.slice(0, 2000) : ''});
    }
    return {sources, fetchedAt: typeof data.fetchedAt === 'string' ? data.fetchedAt.slice(0, 100) : '', warning: typeof data.warning === 'string' ? data.warning.slice(0, 3000) : '', blocked, invalid: false};
  } catch { return invalid; }
}
export function studioTemplateApplyRequest(kind: 'convert'|'optimize'|'assistant', mode: 'mixed'|'tags'|'natural', templateVersion: 'v5'|'v4.5', currentPrompt: string) {
  return JSON.stringify(kind === 'convert'
    ? {tool: 'langbai_convert_prompt', args: {text: currentPrompt.trim() || 'CURRENT_PROMPT', mode, templateVersion}}
    : {tool: 'langbai_edit_prompt', args: {currentPrompt: currentPrompt.trim() || 'CURRENT_PROMPT', kind: kind === 'assistant' ? 'custom' : 'optimize', ...(kind === 'assistant' ? {instruction: 'INSTRUCTION'} : {}), mode, templateVersion}}, null, 2);
}
