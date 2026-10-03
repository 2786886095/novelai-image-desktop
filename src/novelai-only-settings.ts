import {NAI_RELAY_MODEL_IDS} from './nai-accounts';
import type {AppSettings} from './types';
/** Native default; independent NovelAI envelope opt-in never copies credentials. */
export function normalizeNovelAiSettings(settings:AppSettings):AppSettings {
  return settings.imageProvider==='novelai'||settings.imageProvider==='openai-images'&&NAI_RELAY_MODEL_IDS.includes(settings.compatibleImage?.model as any)?settings:{...settings,imageProvider:'novelai'};
}
export const NOVELAI_ONLY_MESSAGE='生图统一使用 NovelAI API 配置；官方与 NovelAI 协议中转共用现有 Token 和接口地址。';
