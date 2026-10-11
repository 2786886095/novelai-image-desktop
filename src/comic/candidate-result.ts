import type {GenerateResult, TagComicCandidate} from '../types';
import type {ComicProjectStore} from './project-store';

/** Commit real backend results before any UI/account refresh, including partial success. */
export function commitComicCandidateResult(store:ComicProjectStore, projectId:string, panelId:string, result:GenerateResult, cancelled=false){
 const items=result.items;
 const failed=!result.ok||!items.length;
 store.update(project=>{
  if(project.id!==projectId||!project.panels.some(p=>p.id===panelId))throw Error('漫画工程或分镜已变化；生成图片仍保留在历史记录中');
  return {...project,historyGroupId:items[0]?.groupId??project.historyGroupId,panels:project.panels.map(panel=>{
   if(panel.id!==panelId)return panel;
   const candidates:TagComicCandidate[]=[...panel.candidates];
   for(const item of items){
    if(!candidates.some(c=>c.historyItemId===item.id))candidates.push({id:crypto.randomUUID(),historyItemId:item.id,outputPath:item.filePath,outputUrl:item.fileUrl,createdAt:item.createdAt});
   }
   return {...panel,candidates,selectedCandidateId:panel.selectedCandidateId??candidates[0]?.id,
    status:failed&&!cancelled?'failed':candidates.length?'done':'ready',error:failed&&!cancelled?(result.message||'生成未完成'):undefined};
  })};
 });
 // Persist first, then halt the remaining queue on a failed/partial response.
 if(failed&&!cancelled)throw Error(result.message||'生成未完成');
 return items[0]?.groupId;
}
