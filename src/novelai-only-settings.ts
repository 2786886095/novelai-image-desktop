import type {AppSettings} from './types';
/** Retire only the provider selector. Never copy foreign credentials/endpoints
 * into NovelAI or change either explicit relay/fallback opt-in. Old independent
 * settings stay archived for backup compatibility, not for active routing. */
export function normalizeNovelAiSettings(settings:AppSettings):AppSettings {
  return settings.imageProvider==='novelai'?settings:{...settings,imageProvider:'novelai'};
}
export const NOVELAI_ONLY_MESSAGE='生图统一使用 NovelAI API 配置；官方与 NovelAI 协议中转共用现有 Token 和接口地址。';
