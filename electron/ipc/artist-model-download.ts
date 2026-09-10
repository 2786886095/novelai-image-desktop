import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {proxyConfig} from './proxy';

const pending = new Map<string, Promise<void>>();
/** Download only the public scorer assets. Never replace a valid file with a partial response. */
export async function prepareArtistModel(root: string, modelId: string, quantized: boolean): Promise<void> {
 if (!/^onnx-community\/dinov2-(base|small)$/.test(modelId)) throw new Error('Unknown artist scoring model');
 const files=['config.json','preprocessor_config.json',`onnx/model${quantized?'_quantized':''}.onnx`];
 const results=await Promise.allSettled(files.map(file=>{
  const target=path.join(root,modelId,file);
  const task=pending.get(target);if(task)return task;
  const download=(async()=>{
   try {
    const stat=await fs.promises.stat(target);
    if(file.endsWith('.json')) {const data=JSON.parse(await fs.promises.readFile(target,'utf8'));if(data&&typeof data==='object'&&!Array.isArray(data))return;}
    else if(stat.size>1024*1024)return;
   } catch { /* absent or incomplete asset: fetch a fresh copy */ }
   await fs.promises.mkdir(path.dirname(target),{recursive:true});
   const temporary=`${target}.${process.pid}.pending`;
   const url=`https://huggingface.co/${modelId}/resolve/main/${file}`;
   try {
    const response=await axios.get(url,{...proxyConfig('ai'),responseType:'stream',timeout:60000,signal:AbortSignal.timeout(10*60*1000),maxRedirects:8,headers:{'User-Agent':'Langbai-NovelAI-Studio/Artist-Scorer'}});
    await pipeline(response.data,fs.createWriteStream(temporary));
    const stat=await fs.promises.stat(temporary);
    const expected=Number(response.headers['content-length']);
    if(expected>0 && !response.headers['content-encoding'] && stat.size!==expected)throw new Error('Incomplete model download');
    if(file.endsWith('.json')) {const data=JSON.parse(await fs.promises.readFile(temporary,'utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Invalid model configuration');}
    else if(stat.size<1024*1024)throw new Error('Invalid ONNX model response');
    await fs.promises.rename(temporary,target);
   } catch(error) {
    await fs.promises.rm(temporary,{force:true});
    const status=axios.isAxiosError(error)?error.response?.status:undefined;
    throw new Error(`Artist scorer download failed (${modelId}/${file}${status?`, HTTP ${status}`:''}). Check the AI proxy in Settings and retry. Existing downloaded files are retained.`);
   }
  })();pending.set(target,download);
  return download.finally(()=>pending.delete(target));
 }));
 const failure=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failure)throw failure.reason;
}
