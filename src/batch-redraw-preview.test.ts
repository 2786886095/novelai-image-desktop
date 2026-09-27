import {describe, expect, it} from 'vitest';
import {appendBatchRedrawCandidates, batchRedrawPreviewEntries, buildBatchRedrawRequest, selectBatchRedrawCandidate, selectedBatchRedrawCandidate} from './batch-redraw-queue';
import {createDefaultBatchRedraw, DEFAULT_PARAMS, type BatchRedrawItem} from './types';

function item(id:string):BatchRedrawItem {return {id,name:id,base64:`original-${id}`,width:832,height:1216,prompt:'test',strength:null,overrideParams:false,params:{},status:'done',candidates:[{id:`${id}-1`,historyItemId:`${id}-1`,resultUrl:`file:///${id}-1.png`,resultPath:`${id}-1.png`},{id:`${id}-2`,historyItemId:`${id}-2`,resultUrl:`file:///${id}-2.png`,resultPath:`${id}-2.png`}]};}
describe('batch redraw output-only preview',()=>{
 it('keeps original images out of result pagination',()=>{
  const entries=batchRedrawPreviewEntries([item('a'),item('b')],'file:///a-2.png');
  expect(entries.map(e=>e.url)).toEqual(['file:///a-1.png','file:///a-2.png','file:///b-1.png','file:///b-2.png']);
  expect(entries.every(e=>!!e.candidateId)).toBe(true);
 });
 it('keeps originals separately browsable without a main-output selection',()=>{
  const entries=batchRedrawPreviewEntries([item('a'),item('b')],'data:image/png;base64,original-a');
  expect(entries.map(e=>e.url)).toEqual(['data:image/png;base64,original-a','data:image/png;base64,original-b']);
  expect(entries.every(e=>!e.candidateId)).toBe(true);
 });
 it('does not resurrect removed results or include unrelated history URLs',()=>{
  expect(batchRedrawPreviewEntries([item('a')],'file:///removed.png')).toEqual([]);
 });
 it('supports legacy results and keeps already-prefixed originals unchanged',()=>{
  const legacy={...item('a'),base64:'data:image/webp;base64,abc',candidates:[],resultPath:'old.png',resultUrl:'file:///old.png',historyItemId:'old'};
  expect(batchRedrawPreviewEntries([legacy],'file:///old.png')[0]).toMatchObject({itemId:'a',candidateId:'old'});
  expect(batchRedrawPreviewEntries([legacy],legacy.base64)[0].url).toBe(legacy.base64);
 });
 it('uses the selected candidate for display/export while every later request keeps its original input',()=>{
  const original=item('a');
  const selected=selectBatchRedrawCandidate(original,'a-2');
  expect(selected.resultUrl).toBe('file:///a-2.png');
  expect(selected.resultPath).toBe('a-2.png');
  expect(selectedBatchRedrawCandidate(selected)?.resultPath).toBe('a-2.png');
  const project=createDefaultBatchRedraw(DEFAULT_PARAMS);
  expect(buildBatchRedrawRequest(project,selected,'test').imageBase64).toBe(original.base64);
  const appended=appendBatchRedrawCandidates(selected,[{id:'a-3',historyItemId:'a-3',resultUrl:'file:///a-3.png',resultPath:'a-3.png'}]);
  expect(appended.selectedCandidateId).toBe('a-2');
  expect(appended.resultPath).toBe('a-2.png');
  expect(buildBatchRedrawRequest(project,appended,'test').imageBase64).toBe(original.base64);
  expect(batchRedrawPreviewEntries([appended],'file:///a-3.png')).toHaveLength(3);
 });
});
