// Text-only portable copies. Existing full .naisbackup remains the lossless
// image/attachment transfer format. Imports append new identities, never merge
// over a user's existing character, preset or binding.
export const IMPORT_COLLECTIONS=['characters','personas','lorebooks','samplerPresets','styles','positivePresets'] as const;
export type ImportCollection=typeof IMPORT_COLLECTIONS[number];
export function validateLocalLibraryImport(args:Record<string,unknown>,uuid:()=>string){
 const collection=args.collection as ImportCollection;
 if(!IMPORT_COLLECTIONS.includes(collection)||!Array.isArray(args.items)||args.items.length<1||args.items.length>50)throw Error('请选择 1–50 项受支持的本机资料');
 if(JSON.stringify(args).length>95000)throw Error('资料过大，请使用软件完整备份导入');
 function clean(value:unknown,key='',depth=0):unknown{
  if(depth>12)throw Error('资料层级过深');
  if(/path$|avatar|backgroundData|previewImages|apikey|secret|password|^token$|^accessToken$|^refreshToken$|cookie|credential|__proto__|constructor|prototype/i.test(key))return undefined;
  if(value&&typeof value==='object'&&!Array.isArray(value)&&('truncated' in value||'omitted' in value))throw Error('文本预览被截断，请使用完整备份导入');
  if(Array.isArray(value))return value.map(x=>clean(x,'',depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v,k,depth+1)]).filter(([,v])=>v!==undefined));
  return value;
 }
 const items=args.items.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('资料格式错误');
  const row=clean(raw) as Record<string,unknown>;
  if(typeof row.name!=='string'||!row.name.trim()||row.name.length>200)throw Error('资料名称不能为空或过长');
  if(['styles','positivePresets'].includes(collection)&&typeof row.prompt!=='string')throw Error('提示词预设缺少 prompt');
  // External file identities must not resolve into existing local bindings.
  delete row.lorebookId;delete row.source;
  return {...row,id:uuid(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 });
 return {collection,items};
}
