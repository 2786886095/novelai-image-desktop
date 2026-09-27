import fs from 'node:fs/promises';import path from 'node:path';
export async function installBuiltinPreset(presets,dir,preset,isUntouchedDefault){
 const marker=path.join(dir,'.studio-infinite-gen4-v1.json');
 try{await fs.access(marker);return {installed:false};}catch(e){if(e.code!=='ENOENT')throw e;}
 const rows=[];let cursor;do{const page=await presets.list({limit:100,cursor});rows.push(...(page.items??[]));cursor=page.nextCursor;}while(cursor);
 const existing=rows.find(x=>x.name===preset.name);let id=existing?.id;
 if(!id){const only=rows.length===1?await presets.get(rows[0].id):null;const created=await presets.create(preset,{makeDefault:!rows.length||!!(only&&isUntouchedDefault(only))});id=created.id;}
 await fs.writeFile(marker,JSON.stringify({id,version:1}),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 return {installed:true,id};
}
