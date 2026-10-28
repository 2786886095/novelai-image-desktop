import tables from './store-locales.json';
import type {AppLanguage} from './types';
export const STORE_LOCALES=tables as Record<AppLanguage,Record<string,string>>;
/** Application status and toast text; the UI is Simplified Chinese only. */
export function localizedStoreText(_language:string|undefined,key:string){return STORE_LOCALES['zh-CN'][key] ?? key;}
