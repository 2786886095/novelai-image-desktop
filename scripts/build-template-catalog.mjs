import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const entry=(filename,meta)=>{const raw=fs.readFileSync(path.join(root,'shared',filename));const body=raw.toString('utf8').replace(/^\uFEFF/,'');return {...meta,filename,sha256:hash(body),rawSha256:hash(raw),chars:body.length,body,placeholders:['input','image'].filter(p=>body.includes('{{'+p+'}}'))};};
const images=[];
for(const [task,folder,title] of [['reverse','01_图片反推','图片反推'],['convert','02_文字转换','文字转换']])for(const [mode,file,label] of [['tags','纯Tag.md','纯 Tag'],['natural','纯自然语言.md','自然语言'],['mixed','混合.md','混合']])images.push(entry(`templates/skill-3.0.0/${task}-${mode}.md`,{id:`skill3.${task}.${mode}`,slot:`image.${task}.${mode}`,task,mode,targetModel:'v5',title:`${title}｜${label}`,sourceFile:`${folder}/${file}`}));
const comics=[['jp-page','txt','日式整页_混合.txt','4.1','日式整页（混合）'],['single-panel','md','单分镜_混合.md','1.0','单分镜（混合）']].map(([format,ext,file,version,title])=>entry(`templates/comic/${format}.${ext}`,{id:`comic.${format}`,slot:`comic.${format}`,comicFormat:format,sourceVersion:version,title,sourceFile:`03_漫画/${file}`}));
for(const [file,value] of [['prompt-skill-catalog-v3.json',{schema:'langbai.template-catalog/1',family:'image-skill',templates:images,edition:'3.0.0',skillVersion:'3.0.0',targetModels:['v5']}],['comic-template-catalog.json',{schema:'langbai.template-catalog/1',family:'comic',templates:comics}]]){
 const target=path.join(root,'shared',file);
 if(process.argv.includes('--check')){const old=JSON.parse(fs.readFileSync(target,'utf8'));if(old.templates.length!==value.templates.length||value.templates.some(row=>{const prior=old.templates.find(x=>x.id===row.id);return !prior||Object.entries(row).some(([key,v])=>JSON.stringify(prior[key])!==JSON.stringify(v));}))throw Error('Template catalog mismatch: '+file);}
 else fs.writeFileSync(target,JSON.stringify(value,null,2)+'\n','utf8');
 const mobileTarget=path.join(root,'mobile','assets',file),catalogBytes=fs.readFileSync(target);
 if(process.argv.includes('--check')) {
  if(!fs.existsSync(mobileTarget)||!fs.readFileSync(mobileTarget).equals(catalogBytes))throw Error('Mobile template catalog bytes differ: '+file+'; run build-template-catalog.mjs');
 }else{
  fs.mkdirSync(path.dirname(mobileTarget),{recursive:true});fs.writeFileSync(mobileTarget,catalogBytes);
 }
}
console.log('TEMPLATE CATALOG PASS: 6 image3 +2 comic source bodies and raw hashes preserved; mobile catalog bytes match shared; no normalization beyond BOM removal');
