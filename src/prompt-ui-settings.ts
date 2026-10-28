import type {AppSettings} from './types';
type PromptApiSettings=Pick<AppSettings,'convertApiUrl'|'convertApiKey'>;
export function isPromptApiConfigured(settings:PromptApiSettings|null|undefined):boolean {
  if(!settings?.convertApiKey?.trim())return false;
  try {const url=new URL(settings.convertApiUrl.trim());return url.protocol==='https:'||url.protocol==='http:';}catch{return false;}
}
let requestedSection:string|null=null;
export function requestSettingsSection(section:string){requestedSection=section;window.dispatchEvent(new CustomEvent('studio:settings-section',{detail:section}));}
export function requestPromptApiSettings(){requestSettingsSection('convert-api');}
export function takeRequestedSettingsSection(){const section=requestedSection;requestedSection=null;return section;}
export function promptSetupText(language:unknown) {
 const texts:Record<string,{missing:string;configure:string;more:string}>={
  'zh-CN':{missing:'请先配置提示词转换 API',configure:'去配置 API',more:'更多'},
 };return texts[String(language)]??texts['zh-CN'];
}
