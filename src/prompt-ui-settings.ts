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
  'zh-TW':{missing:'請先設定提示詞轉換 API',configure:'設定 API',more:'更多'},
  'en-US':{missing:'Configure the prompt conversion API first',configure:'Configure API',more:'More'},
  'ja-JP':{missing:'先にプロンプト変換 API を設定してください',configure:'API を設定',more:'その他'},
  'ko-KR':{missing:'프롬프트 변환 API를 먼저 설정하세요',configure:'API 설정',more:'더보기'},
 };return texts[String(language)]??texts['en-US'];
}
