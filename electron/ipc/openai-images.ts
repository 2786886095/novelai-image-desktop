import axios from 'axios';
import sharp from 'sharp';
import {buildCompatibleImageRequest,compatibleImageError,imageGenerationEndpoint,type CompatibleImageConfig,type CompatibleImageInput,type CompatibleFailurePhase} from '../../src/image-provider-contract';

export interface CompatibleImageBatch {
 images:Buffer[]; complete:boolean; submitted:boolean; cancelled:boolean; timedOut:boolean;
 error?:ReturnType<typeof compatibleImageError>;
}
export type CompatibleImageRequestOptions={signal?:AbortSignal;beforeSubmit?:()=>void|Promise<void>;timeoutMs?:number;maxBytes?:number;route?:(url:string)=>Promise<{httpAgent?:unknown;httpsAgent?:unknown;proxy?:false}>};
/** A prepared request. Built inside the guarded section so builder errors surface as configuration failures. */
export interface CompatibleImagePost {endpoint:string;body:Buffer;contentType:string;expectedCount:number}

/** One and only one billed POST. URL retrieval never receives the generation credential. */
export async function generateCompatibleImages(config:CompatibleImageConfig,input:CompatibleImageInput,options:CompatibleImageRequestOptions={}):Promise<CompatibleImageBatch>{
 return submitCompatibleImageRequest(config,()=>{
  const endpoint=imageGenerationEndpoint(config.baseUrl,config.allowInsecureHttp),body=buildCompatibleImageRequest(config,input);
  return {endpoint,body:Buffer.from(JSON.stringify(body),'utf8'),contentType:'application/json',expectedCount:input.n};
 },options);
}

/** Shared by generations and edits: one POST, no retries; output is decoded and re-encoded without upstream metadata. */
export async function submitCompatibleImageRequest(config:Pick<CompatibleImageConfig,'apiKey'|'allowInsecureHttp'>,prepare:()=>CompatibleImagePost|Promise<CompatibleImagePost>,options:CompatibleImageRequestOptions={}):Promise<CompatibleImageBatch>{
 const images:Buffer[]=[];let submitted=false,phase:CompatibleFailurePhase='configuration',status:number|undefined;
 const abort=new AbortController(),cancel=()=>abort.abort();options.signal?.addEventListener('abort',cancel,{once:true});
 if(options.signal?.aborted)abort.abort();
 const timeoutMs=options.timeoutMs??180000,maxBytes=options.maxBytes??64*1024*1024;
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;cancel();},timeoutMs);
 // Private instance avoids inherited/global authentication, interceptors and retry wrappers.
 const client=axios.create({timeout:timeoutMs,maxContentLength:maxBytes,maxBodyLength:maxBytes,maxRedirects:0,responseType:'arraybuffer',validateStatus:()=>true,signal:abort.signal});
 const routeFor = async (url:string) => {
  abort.signal.throwIfAborted();
  if(!options.route)return undefined;
  return new Promise<{httpAgent?:unknown;httpsAgent?:unknown;proxy?:false}>((resolve,reject)=>{
   const onAbort=()=>{cleanup();reject(Error('route aborted'));};
   const cleanup=()=>abort.signal.removeEventListener('abort',onAbort);
   abort.signal.addEventListener('abort',onAbort,{once:true});
   Promise.resolve().then(()=>options.route!(url)).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
 };
 try{
  const {endpoint,body,contentType,expectedCount}=await prepare();
  if(typeof config.apiKey!=='string'||!config.apiKey.trim()||/[\r\n]/.test(config.apiKey))throw Error('invalid credential');
  if(body.length>maxBytes)throw Error('request byte limit');
  const route = await routeFor(endpoint);
  abort.signal.throwIfAborted();await options.beforeSubmit?.();
  abort.signal.throwIfAborted();phase='generate';submitted=true;
  const response=await client.post(endpoint,body,{...route,headers:{Authorization:`Bearer ${config.apiKey.trim()}`,'Content-Type':contentType}});
  status=response.status;if(status<200||status>=300)throw Error('HTTP status');status=undefined;
  const parsed=JSON.parse(Buffer.from(response.data).toString('utf8'));
  if(!Array.isArray(parsed.data)||!parsed.data.length)throw Error('missing data');
  let consumed=0,decodedBytes=0;
  for(const entry of parsed.data){
   abort.signal.throwIfAborted();phase='decode';let bytes:Buffer;
   if(typeof entry?.b64_json==='string'){
    const encoded=entry.b64_json;if(!encoded||encoded.length>maxBytes*4/3+4||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error('invalid base64');
    bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw Error('noncanonical base64');
   }else if(typeof entry?.url==='string'){
    phase='download';let url=new URL(entry.url);
    for(let redirects=0;;redirects++){
     const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
     if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||url.protocol==='http:'&&!config.allowInsecureHttp&&!(local&&new URL(endpoint).protocol==='http:'))throw Error('invalid image URL');
     const downloadRoute = await routeFor(url.href);
     abort.signal.throwIfAborted();
     const download=await client.get(url.href,{...downloadRoute,headers:{Authorization:undefined,Cookie:undefined}});
     status=download.status;
     if([301,302,303,307,308].includes(status)&&redirects<3&&download.headers.location){const next=new URL(download.headers.location,url);if(url.protocol==='https:'&&next.protocol!=='https:')throw Error('downgrade');url=next;continue;}
     if(status<200||status>=300)throw Error('image HTTP status');status=undefined;
     bytes=Buffer.from(download.data);break;
    }
   }else throw Error('missing image');
   phase='decode';consumed+=bytes.length;if(!bytes.length||consumed>maxBytes)throw Error('image byte limit');
   // Decode before accepting; strip all upstream textual metadata, including echoed credentials.
   const clean=await sharp(bytes,{limitInputPixels:64*1024*1024,failOn:'error'}).png().toBuffer();
   decodedBytes+=clean.length;if(decodedBytes>maxBytes)throw Error('decoded image byte limit');
   images.push(clean);
  }
  abort.signal.throwIfAborted();
  if(images.length!==expectedCount)throw Error('image count mismatch');
  return {images,complete:true,submitted,cancelled:false,timedOut:false};
 }catch{
  return {images,complete:false,submitted,cancelled:options.signal?.aborted===true,timedOut,error:compatibleImageError(phase,status)};
 }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
