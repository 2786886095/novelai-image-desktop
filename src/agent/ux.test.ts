import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { studioSourceUrl, studioWebSources, studioTemplateApplyRequest, studioStoredTemplate, studioTemplateRequest, studioContextMeter, studioTemplateDraft, preparedStudioPreview, shouldFollowStudioScroll, studioToolStatus, studioUxText, validStudioModelConfig } from './ux';
it('keeps technical status names out of normal user feedback in every locale', () => {
  for (const language of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    expect(studioUxText(language, studioToolStatus('completed'))).not.toBe('completed');
    expect(studioUxText(language, 'planTitle')).not.toBe('planTitle');
  }
});
it('follows new content only when the user is near the end', () => {
  expect(shouldFollowStudioScroll(0, 500, 1500)).toBe(false);
  expect(shouldFollowStudioScroll(980, 500, 1500)).toBe(true);
});
it('validates model setup without accepting credential-bearing endpoints', () => {
  expect(validStudioModelConfig('https://api.example/v1', 'model')).toBe(true);
  expect(validStudioModelConfig('file:///a', 'model')).toBe(false);
  expect(validStudioModelConfig('https://user:secret@example/v1', 'model')).toBe(false);
  expect(validStudioModelConfig('https://example/v1', ' ')).toBe(false);
});
it('only shows completed preparation output as a readable plan', () => {
  const tool = { id: 't1', name: 'langbai_prepare_generation', title: '生图准备', status: 'completed' as const, output: '{"positivePrompt":"cat"}' };
  expect(preparedStudioPreview(tool)?.positivePrompt).toBe('cat');
  expect(preparedStudioPreview({ ...tool, output: 'not json' })).toBeUndefined();
  expect(preparedStudioPreview({ ...tool, name: 'langbai_generate_image' })).toBeUndefined();
});

it('localizes collapsible tools and the approval tray consistently', () => {
  for (const language of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    expect(studioUxText(language, 'toolProgress', '3')).toContain('3');
    expect(studioUxText(language, 'decisionArea')).not.toBe('decisionArea');
  }
});

it('keeps context estimates explicit and meters finite and bounded', () => {
  expect(studioContextMeter()).toEqual({used: 0, limit: 0, percent: 0, estimated: true});
  expect(studioContextMeter({used: 120, limit: 100, estimated: true})).toEqual({used: 120, limit: 100, percent: 100, estimated: true});
  expect(studioContextMeter({used: NaN, limit: Infinity, estimated: false})).toEqual({used: 0, limit: 0, percent: 0, estimated: false});
  expect(studioContextMeter({used: 25, limit: 100, estimated: false}).percent).toBe(25);
});
it('prefills saved prompt data without losing negative prompts or executing tools', () => {
  expect(JSON.parse(studioTemplateDraft({name: 'my template', prefix: 'cat', suffix: 'ink', negativePrompt: 'blur'}))).toEqual({template: 'my template', positivePrompt: 'cat, ink', negativePrompt: 'blur'});
  expect(JSON.parse(studioTemplateDraft({name: 'empty', prefix: '', suffix: '', negativePrompt: ''})).positivePrompt).toBe('');
});
it('covers actionable context and template controls in every supported locale', () => {
  for (const language of ['zh-CN','zh-TW','en-US','ja-JP','ko-KR']) for (const key of ['context','tokensEstimated','tokensReported','compactNow','autoCompact','actions','prefillOnly','templateSave','webQuery','reattach','advancedSettings']) {
    expect(studioUxText(language, key)).not.toBe(key);
  }
});

it('wires owned page controls to real preload APIs and keeps model setup out of the header', () => {
  const source = readFileSync(new URL('../PiAgentPage.tsx', import.meta.url), 'utf8');
  const header = source.split('<header className="pi-header">')[1].split('</header>')[0];
  expect(header).not.toContain('openSettings');
  expect(source).toContain('window.naiDesktop.discoverAgentModels(');
  expect(source).not.toContain('getAgentModels(');
  expect(source).toContain('window.naiDesktop.compactAgentConversation(chat.id)');
  expect(source).toContain("setSetting('agentAutoCompact'");
  expect(source).toContain('importAttachments([item.filePath])');
  expect(source).toContain("tool:'langbai_search_web',args:{query:'SEARCH_QUERY',limit:5}");
  expect(source).toContain('prefill(studioTemplateDraft(template))');
  expect(source).not.toMatch(/executeShell|readFileSync|mcpClient/);
});

it('reads the selected actual saved system template, without leaking provider settings', () => {
  const settings = {convertPromptTemplates:{mixed:'my V5',tags:'tags',natural:''},convertPromptTemplatesV45:{mixed:'my V45'},reversePromptTemplates:{mixed:'reverse'},promptOptimizeTemplate:'my optimize',promptAssistantTemplate:'my assistant',agentApiKey:'PRIVATE-FIXTURE'} as unknown as import('../types').AppSettings;
  expect(studioStoredTemplate(settings,'convert','mixed','v5')).toBe('my V5');
  expect(studioStoredTemplate(settings,'convert','mixed','v4.5')).toBe('my V45');
  expect(studioStoredTemplate(settings,'reverse','mixed','v5')).toBe('reverse');
  expect(studioStoredTemplate(settings,'optimize','mixed','v5')).toBe('my optimize');
  expect(studioStoredTemplate(settings,'assistant','mixed','v5')).toBe('my assistant');
  expect(studioStoredTemplate(settings,'convert','natural','v5')).toBe('');
  expect(studioStoredTemplate(null,'convert','mixed','v5')).toBe('');
});
it('prefills exact tool arguments and requires a fresh revision before saving', () => {
  expect(JSON.parse(studioTemplateRequest('reverse','tags','v4.5'))).toEqual({tool:'studio_prompt_template',args:{kind:'reverse',mode:'tags',templateVersion:'v4.5'}});
  expect(JSON.parse(studioTemplateRequest('optimize','tags','v4.5'))).toEqual({tool:'studio_prompt_template',args:{kind:'optimize'}});
  const save = JSON.parse(studioTemplateRequest('convert','mixed','v5','save'));
  expect(save.tool).toBe('langbai_templates');
  expect(save.args.action).toBe('read');
  expect(save.args).not.toHaveProperty('expectedRevision');
  expect(save.requires).toContain('fresh expectedRevision');
});

it('blocks non-http links and credential-bearing URLs before external opening', () => {
  expect(studioSourceUrl('https://example.org/article?q=cat')).toBe('https://example.org/article?q=cat');
  expect(studioSourceUrl('http://example.org/page')).toBe('http://example.org/page');
  for (const url of ['javascript:alert(1)','file:///secret','//example.org','https://user:secret@example.org','https://example.org/?access_token=SECRET','https://example.org/?API_KEY=SECRET','https://example.org/#access_token=SECRET','https://example.org/?X-Amz-Signature=SECRET','https://example.org/\npage','https://example.org/\\page','not a URL']) expect(studioSourceUrl(url)).toBeUndefined();
});
it('extracts bounded readable source data, preserving warning and fetch time', () => {
  const tool={id:'search',name:'langbai_search_web',title:'Search',status:'completed' as const,output:JSON.stringify({sources:[{title:'Example',url:'https://example.org/source',snippet:'A snippet'},{title:'Unsafe',url:'https://user:secret@example.org',snippet:'blocked'},{title:'Duplicate',url:'https://example.org/source',snippet:'duplicate'}],fetchedAt:'2026-10-01T01:00:00Z',warning:'Snippets only'})};
  expect(studioWebSources(tool)).toEqual({sources:[{title:'Example',url:'https://example.org/source',snippet:'A snippet'}],fetchedAt:'2026-10-01T01:00:00Z',warning:'Snippets only',blocked:1,invalid:false});
  expect(studioWebSources({...tool,output:JSON.stringify({data:{sources:[]}})})?.sources).toEqual([]);
  expect(studioWebSources({...tool,output:'not JSON'})?.invalid).toBe(true);
  expect(studioWebSources({...tool,output:JSON.stringify({sources:{}})})?.invalid).toBe(true);
  expect(studioWebSources({...tool,output:'x'.repeat(250001)})?.invalid).toBe(true);
  expect(studioWebSources({...tool,status:'error'})).toBeUndefined();
  expect(studioWebSources({...tool,name:'another_tool'})).toBeUndefined();
});
it('drafts actual convert/edit prompt calls with selected mode and version and no image call', () => {
  expect(JSON.parse(studioTemplateApplyRequest('convert','tags','v4.5','cat'))).toEqual({tool:'langbai_convert_prompt',args:{text:'cat',mode:'tags',templateVersion:'v4.5'}});
  expect(JSON.parse(studioTemplateApplyRequest('optimize','mixed','v5','cat'))).toEqual({tool:'langbai_edit_prompt',args:{currentPrompt:'cat',kind:'optimize',mode:'mixed',templateVersion:'v5'}});
  expect(JSON.parse(studioTemplateApplyRequest('assistant','natural','v5','cat')).args).toEqual({currentPrompt:'cat',kind:'custom',instruction:'INSTRUCTION',mode:'natural',templateVersion:'v5'});
  expect(JSON.parse(studioTemplateApplyRequest('convert','mixed','v5','')).args.text).toBe('CURRENT_PROMPT');
});

it('keeps the source renderer in the actual timeline and uses the existing external opener', () => {
 const source=readFileSync(new URL('../PiAgentPage.tsx',import.meta.url),'utf8');
 expect(source).toContain('<AgentWebSources preview={web}');
 expect(source.indexOf('<AgentWebSources preview={web}')).toBeLessThan(source.indexOf('{(tool.output || tool.error) && <details>'));
 expect(source).toContain('const url = studioSourceUrl(value)');
 expect(source).toContain('window.naiDesktop.openExternal(url)');
 expect(source).toContain("setDiscoveryState(result.models.length?'ready':'empty')");
 expect(source).toContain("t('modelSource_'+model.metadataSource)");
 expect(source).toContain("studioTemplateApplyRequest(templateKind,templateMode,templateVersion,text)");
});
