import axios from 'axios';
import {Readable} from 'node:stream';
import {getSettings} from './store';
import {proxyConfigForUrl, type ProxyCategory} from './proxy';

function transportError(error:unknown):unknown {
  const code=error && typeof error==='object' && 'code' in error ? String(error.code):'';
  return ['ECONNRESET','ETIMEDOUT','ECONNABORTED','EPIPE','ENOTFOUND','EAI_AGAIN'].includes(code)
    ? new TypeError('Agent 下载连接中断，请检查软件更新代理后重试。',{cause:error}) : error;
}

/** Public asset GETs use the app's category policy, including every PAC/CDN hop.
 * Automatic redirects are disabled so a different host never inherits its
 * predecessor's proxy decision. Credentials are intentionally not accepted. */
export async function downloadRequest(category:ProxyCategory, url:string, options:{signal?:AbortSignal;headers?:Record<string,string>}={}) {
  const settings=getSettings();
  let target=new URL(url);
  for(let hop=0;hop<=8;hop++) {
    options.signal?.throwIfAborted();
    if(!['https:','http:'].includes(target.protocol)||target.username||target.password)throw Error('Invalid download URL');
    const proxy=await proxyConfigForUrl(category,target.href,settings);
    const response=await axios.get<Readable>(target.href,{
      ...proxy,headers:options.headers,signal:options.signal,responseType:'stream',
      timeout:60000,maxRedirects:0,validateStatus:()=>true,
    });
    if([301,302,303,307,308].includes(response.status)) {
      response.data.destroy();
      const location=response.headers.location;
      if(!location)throw Error('Download redirect has no location');
      const next=new URL(String(location),target);
      if(target.protocol==='https:'&&next.protocol!=='https:')throw Error('Insecure download redirect');
      target=next;continue;
    }
    return response;
  }
  throw Error('Too many download redirects');
}

/** Fetch-shaped streaming adapter; preserves the component integrity/resume path. */
export async function updateFetch(url:string, options:{signal?:AbortSignal;headers?:Record<string,string>}={}) {
  try {
    const response=await downloadRequest('update',url,options);
    const headers=new Headers();
    for(const [name,value] of Object.entries(response.headers))if(value!=null)headers.set(name,String(value));
    async function* chunks() {
      try {for await(const chunk of response.data)yield chunk;}
      catch(error){options.signal?.throwIfAborted();throw transportError(error);}
      finally{response.data.destroy();}
    }
    return new Response(Readable.toWeb(Readable.from(chunks())) as ReadableStream<Uint8Array>,{status:response.status,headers});
  } catch(error) {
    options.signal?.throwIfAborted();
    // Only transport failures participate in component range retry.
    throw transportError(error);
  }
}
