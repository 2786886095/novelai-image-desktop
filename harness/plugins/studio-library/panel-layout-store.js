import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function createPanelLayoutStore(home){
 let writes=Promise.resolve();
 const file=path.join(home,'studio-panel-layout.json');
 const profile=p=>{if(p!=='phone'&&p!=='desktop')throw Error('无效布局类别');return p};
 const rect=r=>{if(r===null)return null;if(!r||typeof r!=='object'||Array.isArray(r))throw Error('无效面板布局');const out={};for(const key of ['x','y','width','height']){const n=r[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100000||((key==='width'||key==='height')&&n<1))throw Error('无效面板尺寸');out[key]=Math.round(n)}return out};
 async function read(){try{const data=JSON.parse(await fs.readFile(file,'utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error('布局文件格式错误');return data}catch(e){if(e.code==='ENOENT')return {};throw e}}
 return {
  async get(args){const p=profile(args.profile);await writes;const data=await read();return {rect:rect(data[p]??null)}},
  set(args){const p=profile(args.profile),value=rect(args.rect);const task=writes.then(async()=>{const data=await read();data[p]=value;await fs.mkdir(home,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(data),{mode:0o600,flag:'wx'});await fs.rename(temp,file)}finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e})}return {rect:value}});writes=task.catch(()=>{});return task},
 };
}
