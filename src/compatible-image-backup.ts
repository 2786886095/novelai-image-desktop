import type { AppSettings, CompatibleImageSettings } from './types';
import { imageGenerationEndpoint, buildCompatibleImageRequest } from './image-provider-contract';
export type PortableImageSettings = Required<Pick<AppSettings, 'imageProvider' | 'compatibleImage' | 'imageApiKey'>> & {imageCredentialState?: 'unavailable'};
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Device credential pointers and process revisions must never travel to another installation. */
export function exportImageSettings(settings: Partial<AppSettings>): PortableImageSettings {
  const c = settings.compatibleImage ?? {} as CompatibleImageSettings;
  return { ...(settings.credentialIssues?.includes('imageApiKey') ? {imageCredentialState: 'unavailable' as const} : {}), imageProvider: settings.imageProvider ?? 'novelai', imageApiKey: settings.imageApiKey ?? '', compatibleImage: {
    baseUrl: c.baseUrl ?? '', model: c.model ?? '', size: c.size ?? '1024x1024', responseFormat: c.responseFormat ?? 'auto',
    extensions: structuredClone(c.extensions ?? {}),
  } };
}
/** Absent in older archives => preserve. Present => an indivisible endpoint/key/provider tuple. */
export function readImageSettingsBackup(api: Record<string, unknown>): PortableImageSettings | null {
  if (api.imageCredentialState === 'unavailable') throw new Error('备份源的图片密钥未解锁，不能作为空密钥恢复；请在源设备重新保存密钥后导出。');
  const keys = ['imageProvider', 'compatibleImage', 'imageApiKey'];
  if (!keys.some(k => own(api, k))) return null;
  if (!keys.every(k => own(api, k)) || typeof api.imageProvider !== 'string' || !['novelai', 'openai-images'].includes(api.imageProvider) ||
      typeof api.imageApiKey !== 'string' || api.imageApiKey.length > 8192 || /[\r\n\x00]/.test(api.imageApiKey) || !record(api.compatibleImage)) {
    throw new Error('备份的图片服务配置不完整或无效；接口、模型配置和独立密钥须一起恢复。');
  }
  const c = api.compatibleImage;
  const config = { baseUrl: c.baseUrl ?? '', model: c.model ?? '', size: c.size ?? '1024x1024', responseFormat: c.responseFormat ?? 'auto', extensions: c.extensions ?? {} };
  if (typeof config.baseUrl !== 'string' || typeof config.model !== 'string' || typeof config.size !== 'string' ||
      !['auto', 'b64_json', 'url'].includes(String(config.responseFormat)) || !record(config.extensions)) throw new Error('备份的图片服务配置类型无效。');
  if (config.baseUrl.trim()) imageGenerationEndpoint(config.baseUrl);
  if (api.imageProvider === 'openai-images' && (!config.baseUrl.trim() || !config.model.trim())) throw new Error('备份缺少图片接口或模型。');
  buildCompatibleImageRequest({ model: config.model.trim() || 'backup-validation', responseFormat: config.responseFormat as CompatibleImageSettings['responseFormat'] },
    { prompt: 'backup validation', size: config.size, n: 1, extensions: config.extensions });
  return exportImageSettings({ imageProvider: api.imageProvider as PortableImageSettings['imageProvider'], compatibleImage: config as CompatibleImageSettings, imageApiKey: api.imageApiKey });
}
