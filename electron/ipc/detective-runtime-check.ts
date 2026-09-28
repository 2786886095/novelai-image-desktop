import {app} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {DetectiveRuntimeValidation} from '../../src/artist-detective-contract';

type Paths={python?:string;assets?:string;variant?:'full'|'light'};
const cache=new Map<string,DetectiveRuntimeValidation>();
let recordsFile='';
let records=new Map<string,DetectiveRuntimeValidation>();
function loadRecords() {
  const file=path.join(app.getPath?.('userData') ?? app.getAppPath(),'artist-detective-validation.json');
  if(recordsFile===file)return;
  recordsFile=file;records=new Map();
  try {
    const data=JSON.parse(fs.readFileSync(file,'utf8'));
    if(data.version!==1 || !Array.isArray(data.entries))return;
    for(const row of data.entries.slice(-32)) {
      if(!Array.isArray(row))continue;
      const [key,value]=row;
      if(typeof key==='string' && value?.state==='passed' && typeof value.checkedAt==='string' &&
        value.details?.gpu && value.details?.architecture && Number.isFinite(value.details?.selfScore) && value.details.selfScore>=0.99)
        records.set(key,value);
    }
  } catch { /* No valid remembered checks yet. */ }
}
function remember(key:string,value?:DetectiveRuntimeValidation) {
  loadRecords();records.delete(key);
  if(value?.state==='passed')records.set(key,value);
  while(records.size>32)records.delete(records.keys().next().value!);
  const temp=recordsFile+'.tmp';
  try {
    fs.mkdirSync(path.dirname(recordsFile),{recursive:true});
    fs.writeFileSync(temp,JSON.stringify({version:1,entries:[...records]},null,2));
    fs.renameSync(temp,recordsFile);
  } catch { /* Disk errors must not turn a failed check into a success. */ }
}
function previous(key:string) {loadRecords();return cache.get(key) ?? records.get(key);}
function checkError(error:unknown,c:Paths) {
  const e=error as NodeJS.ErrnoException;
  if(e?.code==='ENOENT' || e?.code==='ENOTDIR') {
    const missing=e.path ? String(e.path) : '';
    return c.python && missing && path.resolve(missing)===path.resolve(c.python)
      ? '运行环境文件不存在或已移动，请点击“使用已有运行环境”重新选择 Python。'
      : '模型文件不存在或目录已移动，请点击“使用已有模型目录”重新选择完整的模型目录。';
  }
  return error instanceof Error?error.message:String(error);
}
let pendingKey:string|undefined;
let pending:Promise<DetectiveRuntimeValidation>|undefined;
let controller:AbortController|undefined;
app.once?.('will-quit',()=>controller?.abort());
export const detectiveRuntimeChecking=()=>!!pending;
export const cancelDetectiveRuntimeCheck=()=>controller?.abort();
function fingerprint(c:Paths) {
  if(!c.python||!c.assets)throw Error('Python/model paths are missing');
  const root=fs.realpathSync(c.assets), manifest=path.join(root,'manifest.json');
  const files=JSON.parse(fs.readFileSync(manifest,'utf8')).files;
  if(!files||!Object.keys(files).length)throw Error('Model manifest has no files');
  const paths=[c.python,manifest,...Object.keys(files).map(name=>{
    const file=path.resolve(root,name),relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Invalid model manifest path');
    return file;
  })];
  const libraries=['artist_detective/desktop/assets.py','artist_detective/evaluation/encoder.py','torch/version.py'];
  for(const name of libraries) {
    const file=path.join(path.dirname(c.python),'Lib','site-packages',name);
    if(fs.existsSync(file))paths.push(file);
  }
  return JSON.stringify([c.variant,paths.map(p=>{const s=fs.statSync(p);return [p,s.size,s.mtimeMs,s.ctimeMs];})]);
}
export function detectiveRuntimeValidation(c:Paths):DetectiveRuntimeValidation {
  if(!c.python||!c.assets)return {state:'unchecked'};
  try{const key=fingerprint(c);return previous(key)??{state:'unchecked'};}
  catch(e){return {state:'failed',message:checkError(e,c)};}
}
export function validateDetectiveRuntime(c:Paths,force=false):Promise<DetectiveRuntimeValidation> {
  let key:string;
  try{key=fingerprint(c);}catch(e){return Promise.resolve({state:'failed',message:checkError(e,c)});}
  if(pending)return key===pendingKey?pending:Promise.resolve({state:'failed',message:'Another model is being verified; retry after it completes'});
  const remembered=previous(key);
  if(!force&&remembered?.state==='passed')return Promise.resolve(remembered);
  // Revoke old success before a forced check, including interrupted checks.
  remember(key);
  if(cache.size>=8)cache.delete(cache.keys().next().value!);
  cache.set(key,{state:'checking'});pendingKey=key;
  controller=new AbortController();
  const root=app.getAppPath();
  const script=path.join(root.endsWith('.asar')?root+'.unpacked':root,'scripts','artist-detective-check.py');
  pending=(async()=>{
    try{
      const {stdout}=await promisify(execFile)(c.python!,['-B','-I',script,c.assets!],{windowsHide:true,timeout:600_000,signal:controller!.signal,maxBuffer:2*1024*1024,env:{...process.env,PYTHONUTF8:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});
      const line=stdout.split(/\r?\n/).find(s=>s.startsWith('DETECTIVE_CHECK_OK:'));
      if(!line)throw Error('Runtime check did not return success');
      const details=JSON.parse(line.slice('DETECTIVE_CHECK_OK:'.length));
      if(!details.gpu||!details.architecture||!Number.isFinite(details.selfScore)||details.selfScore<0.99)throw Error('Invalid runtime check result');
      const expected=c.variant==='full'?'PE-Spatial-G14-448':c.variant==='light'?'PE-Spatial-L14-448':undefined;
      if(expected && details.architecture!==expected)throw Error(`Model variant mismatch: expected ${expected}, received ${details.architecture}`);
      if(key!==fingerprint(c))throw Error('Model or runtime changed during validation; retry');
      const value:DetectiveRuntimeValidation={state:'passed',checkedAt:new Date().toISOString(),details};
      cache.set(key,value);remember(key,value);
    }catch(e){cache.set(key,{state:'failed',message:checkError(e,c).slice(-2000)});}
    return cache.get(key)!;
  })().finally(()=>{pending=undefined;pendingKey=undefined;controller=undefined;});
  return pending;
}
