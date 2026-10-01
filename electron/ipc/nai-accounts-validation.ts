import axios from 'axios';
import {normalizeNaiAccountInput,validateAccountProfile,type NaiAccountInput,type NaiAccountValidationResult} from '../../src/nai-accounts';
import {proxyConfigForUrl} from './proxy';
import {getSettings} from './store';

/** The documented NovelAI subscription route only. No model/generation probes, retries or host fallback. */
export async function validateNaiAccountReadOnly(input:NaiAccountInput):Promise<NaiAccountValidationResult>{
 let account:ReturnType<typeof normalizeNaiAccountInput>;
 try{account=normalizeNaiAccountInput(input);validateAccountProfile(account);}catch{return {ok:false,code:'invalid-input',status:0};}
 const url=account.apiBaseUrl.replace(/\/+$/,'')+'/user/subscription';
 try{
  const proxy=await proxyConfigForUrl('nai',url,{...getSettings()});
  const options={...proxy,timeout:8000,maxRedirects:0,maxContentLength:256*1024,responseType:'json' as const,validateStatus:()=>true};
  if(account.method==='relay'){
   // A public 200 page cannot establish that this endpoint checks the supplied Key.
   const anonymous=await axios.get(url,{...options,headers:{Accept:'application/json'}});
   if(anonymous.status!==401&&anonymous.status!==403)return {ok:false,code:'unsupported',status:anonymous.status};
  }
  const response=await axios.get(url,{...options,headers:{Accept:'application/json',Authorization:`Bearer ${account.token.trim()}`}});
  const status=response.status;
  if(status===401||status===403)return {ok:false,code:'auth',status};
  if([301,302,303,307,308,404,405,501].includes(status))return {ok:false,code:'unsupported',status};
  if(status!==200)return {ok:false,code:'http',status};
  const data=response.data;
  const sub=data?.subscription??data?.information?.subscription??data?.data?.subscription??data;
  if(!sub||typeof sub!=='object'||Array.isArray(sub)||typeof sub.active!=='boolean'||typeof sub.tier!=='number'||!Number.isFinite(sub.tier)||sub.tier<0)return {ok:false,code:'invalid-response',status};
  return {ok:true,code:'passed',status};
 }catch{return {ok:false,code:'network',status:0};}
}

/** Error text is intentionally bounded and contains neither credentials nor upstream response bodies. */
export function requireNaiAccountValidation(result:NaiAccountValidationResult){
 if(!result.ok)throw Error(`NAI_ACCOUNT_VALIDATION:${result.code}:${result.status}`);
}
