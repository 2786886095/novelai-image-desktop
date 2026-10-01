import axios from 'axios';
import {parseNaiAccountSummary} from './nai-account-summary';
import {normalizeNaiAccountInput,validateAccountProfile,type NaiAccountInput,type NaiAccountValidationResult} from '../../src/nai-accounts';
import {proxyConfigForUrl} from './proxy';
import {getSettings} from './store';

function compatibleSubscription(data:unknown,legacyFormat:boolean):boolean {
 const body=data as any;
 const sub=body?.subscription??body?.information?.subscription??body?.data?.subscription??body?.data?.information?.subscription??body;
 if(!sub||typeof sub!=='object'||Array.isArray(sub))return false;
 // The legacy /user/data contract can omit active or encode tier as a decimal string.
 const tier=typeof sub.tier==='number'?sub.tier:legacyFormat&&typeof sub.tier==='string'&&/^\d+$/.test(sub.tier)?Number(sub.tier):NaN;
 return Number.isSafeInteger(tier)&&tier>=0&&(typeof sub.active==='boolean'||legacyFormat&&sub.active===undefined);
}

/** Authenticated read-only account routes. Never probes generation, follows redirects, or sends relay Keys to official hosts. */
export async function validateNaiAccountReadOnly(input:NaiAccountInput,preserveLegacyImageRoute=false):Promise<NaiAccountValidationResult>{
 let account:ReturnType<typeof normalizeNaiAccountInput>;
 try{
  account=normalizeNaiAccountInput(input);
  // Only the backend probe of a saved migrated profile opts into its preserved custom image route.
  if(preserveLegacyImageRoute&&account.legacyConfiguration?.allowCustomEndpoint){
   const host=new URL(account.imageBaseUrl).hostname.toLowerCase();
   if(host!=='novelai.net'&&!host.endsWith('.novelai.net'))account={...account,method:'relay',apiBaseUrl:account.imageBaseUrl};
  }
  validateAccountProfile(account);
 }catch{return {ok:false,code:'invalid-input',status:0};}
 const relay=account.method==='relay';
 const urls=relay
  ? [account.imageBaseUrl.replace(/\/+$/,'')+'/user/data',account.apiBaseUrl.replace(/\/+$/,'')+'/user/subscription']
  : [account.imageBaseUrl.replace(/\/+$/,'')+'/user/data'];
 try{
  const settings={...getSettings()};
  for(let index=0;index<urls.length;index++){
   const url=urls[index],proxy=await proxyConfigForUrl('nai',url,settings);
   const response=await axios.get(url,{...proxy,timeout:8000,maxRedirects:0,maxContentLength:256*1024,responseType:'json' as const,validateStatus:()=>true,headers:{Accept:'application/json',Authorization:`Bearer ${account.token.trim()}`}});
   const status=response.status;
   if(status===401||status===403)return {ok:false,code:'auth',status};
   // Only a missing/unsupported read route permits the second declared relay address.
   if([404,405,501].includes(status)&&index+1<urls.length)continue;
   if([301,302,303,307,308,404,405,501].includes(status))return {ok:false,code:'unsupported',status};
   if(status!==200)return {ok:false,code:'http',status};
   if(!compatibleSubscription(response.data,true))return {ok:false,code:'invalid-response',status};
   const summary=parseNaiAccountSummary(response.data);
   // Relay balances are returned in the compatible account format, not proof of official free allowances.
   return {ok:true,code:'passed',status,account:relay?{...summary,hasActiveSubscription:false,opusUsage:undefined,opusUsageUpdatedAt:undefined}:summary};
  }
  return {ok:false,code:'unsupported',status:0};
 }catch{return {ok:false,code:'network',status:0};}
}

/** Error text is intentionally bounded and contains neither credentials nor upstream response bodies. */
export function requireNaiAccountValidation(result:NaiAccountValidationResult){
 if(!result.ok)throw Error(`NAI_ACCOUNT_VALIDATION:${result.code}:${result.status}`);
}
