import axios from 'axios';
import {parseNaiAccountSummary} from './nai-account-summary';
import {normalizeNaiAccountInput,validateAccountProfile,novelAiRelayModelIds,novelAiRelayModelsUrl,relayModelIds,type NaiAccountRoute,type NaiAccountInput,type NaiAccountValidationResult} from '../../src/nai-accounts';
import {proxyConfigForUrl} from './proxy';
import {getSettings} from './store';

function compatibleSubscription(data:unknown,legacyFormat:boolean):boolean {
 const body=data as any;
 const sub=body?.subscription??body?.information?.subscription??body?.data?.subscription??body?.data?.information?.subscription??body;
 if(!sub||typeof sub!=='object'||Array.isArray(sub))return false;
 // The legacy /user/data contract can omit active or encode tier as a decimal string.
 // Anlas is optional metadata, not an authentication requirement. Missing is not zero.
 const tier=typeof sub.tier==='number'?sub.tier:legacyFormat&&typeof sub.tier==='string'&&/^\d+$/.test(sub.tier)?Number(sub.tier):NaN;
 return Number.isSafeInteger(tier)&&tier>=0&&(typeof sub.active==='boolean'||legacyFormat&&sub.active===undefined);
}

/** Authenticated read-only routes. Model discovery does not prove generation and never fabricates Anlas or free allowances. */
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
 const protocol=relay?account.relayProtocol:undefined;
 const modelsOnly=protocol==='models'||protocol==='openai-images';
 const reads:{url:string;route:NaiAccountRoute}[]=[];
 if(!modelsOnly){
  reads.push({url:account.imageBaseUrl.replace(/\/+$/,'')+'/user/data',route:'/user/data'});
  if(relay)reads.push({url:account.apiBaseUrl.replace(/\/+$/,'')+'/user/subscription',route:'/user/subscription'});
 }
 if(relay&&protocol!=='native')reads.push({url:novelAiRelayModelsUrl(account.apiBaseUrl),route:'/v1/models'});
 let lastRoute:NaiAccountRoute|undefined;
 try{
  const settings={...getSettings()};
  let nativeHtml=false;
  for(const [index,{url,route}] of reads.entries()){
   lastRoute=route;
   const proxy=await proxyConfigForUrl('nai',url,settings);
   const response=await axios.get(url,{...proxy,timeout:8000,maxRedirects:0,maxContentLength:256*1024,responseType:'json' as const,validateStatus:()=>true,headers:{Accept:'application/json',Authorization:`Bearer ${account.token.trim()}`}});
   const status=response.status;
   if(status===401||status===403)return {ok:false,code:'auth',status,route};
   if([404,405,501].includes(status)&&index+1<reads.length)continue;
   if(nativeHtml&&[404,405,501].includes(status))return {ok:false,code:'invalid-response',status:200,route};
   if([301,302,303,307,308,404,405,501].includes(status))return {ok:false,code:'unsupported',status,route};
   if(status!==200)return {ok:false,code:'http',status,route};
   if(relay&&route!=='/v1/models'&&typeof response.data==='string'&&/^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(response.data)){
    nativeHtml=true;if(index+1<reads.length)continue;
    return {ok:false,code:'invalid-response',status,route};
   }
   if(route==='/v1/models'){
    const ids=modelsOnly?relayModelIds(response.data):novelAiRelayModelIds(response.data);
    if(ids===undefined)return {ok:false,code:'invalid-response',status,route};
    if(!modelsOnly&&!ids.length||protocol==='openai-images'&&!ids.includes(account.relayModel!))
      return {ok:false,code:'unsupported',status,route};
    return {ok:true,code:'passed',status,route,modelIds:ids};
   }
   if(!compatibleSubscription(response.data,true))return {ok:false,code:'invalid-response',status,route};
   const summary=parseNaiAccountSummary(response.data);
   return {ok:true,code:'passed',status,account:relay?{...summary,hasActiveSubscription:false,opusUsage:undefined,opusUsageUpdatedAt:undefined}:summary};
  }
  return {ok:false,code:'unsupported',status:0,route:lastRoute};
 }catch{return {ok:false,code:'network',status:0,route:lastRoute};}
}

/** Error text is intentionally bounded and contains neither credentials nor upstream response bodies. */
export function requireNaiAccountValidation(result:NaiAccountValidationResult){
 if(!result.ok)throw Error(`NAI_ACCOUNT_VALIDATION:${result.code}:${result.status}${result.route?':'+result.route:''}`);
}
