import type {ArtistTagRecord} from './artist-lab';
/** An explicitly selected local pool; never merged with ranked/catalog candidates. */
export function parseCustomArtistPool(raw: string): ArtistTagRecord[] {
 const names=new Set<string>();
 for (const token of raw.split(/[,，\r\n]+/)) {
  const name=token.trim().replace(/^[{\[\s]+|[}\]\s]+$/g,'').replace(/^artist\s*:\s*/i,'').trim().replace(/\s+/g,'_').toLowerCase();
  if(name && name.length<=200 && !/[{}\[\]<>:]/.test(name)) names.add(name);
 }
 return [...names].map((name,index)=>({id:-(index+1),name,postCount:0,deprecated:false}));
}
export function customArtistPoolText(language: unknown) {
 const labels: Record<string,string[]>={
 'zh-CN':['使用自定义画师候选库','画师列表（逗号或换行分隔）','仅从这里抽取，不混入排行榜；权重由抽卡参数统一设置。']};
 const [enable,list,hint]=labels[String(language)]??labels['zh-CN'];return {enable,list,hint};
}
