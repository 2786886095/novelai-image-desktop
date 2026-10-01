import type {NaiAccountInput} from '../../src/nai-accounts';
import {nextNaiAccountLabel} from '../../src/nai-accounts';
import type {NaiAccountsVault} from './nai-accounts-vault';

export interface LegacyNaiConfiguration {
 token?:string;settings:{apiBaseUrl:string;imageBaseUrl:string;allowCustomEndpoint:boolean;allowCustomEndpointFallback:boolean};
}
/** Preserve the already configured route, without probes, forwarding or deleting old bytes. */
export function migrateLegacyNaiAccount(vault:NaiAccountsVault,data:LegacyNaiConfiguration){
 if(vault.legacyMigrated()||!data.token?.trim())return {migrated:false};
 const settings=data.settings;
 const endpoint=(raw:string,official:string)=>{
  const value=raw.trim().replace(/\/+$/,'')||official;
  const url=new URL(value),host=url.hostname.toLowerCase();
  if(url.username||url.password||url.search||url.hash||/\/(dashboard|login|sign-in)(\/|$)/i.test(url.pathname))throw Error('旧接口地址不是 API 基址；凭据未改动。');
  const loopback=['localhost','127.0.0.1','[::1]','::1'].includes(host);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))throw Error('旧接口协议不受支持；凭据未改动。');
  if(host==='novelai.net'||host.endsWith('.novelai.net'))return host===new URL(official).hostname?value:official;
  return settings.allowCustomEndpoint||loopback?value:official;
 };
 const apiBaseUrl=endpoint(settings.apiBaseUrl,'https://api.novelai.net');
 const imageBaseUrl=endpoint(settings.imageBaseUrl,'https://image.novelai.net');
 const input:NaiAccountInput={label:nextNaiAccountLabel(vault.list()),method:apiBaseUrl==='https://api.novelai.net'?'token':'relay',token:data.token,apiBaseUrl,imageBaseUrl};
 const account=vault.importLegacy('legacy-user-v2',input,{allowCustomEndpoint:settings.allowCustomEndpoint,allowCustomEndpointFallback:settings.allowCustomEndpointFallback});
 return {migrated:true,account};
}
