import {describe,it,expect} from 'vitest';
import fixtures from '../shared/google-prompt-translation-fixtures.json';
import {prepareGooglePromptTranslation} from './google-prompt-translation';
describe('Google prompt translation: structure/name-preserving labels',()=>{
 for(const [i,row] of fixtures.entries())it(`shared case ${i}`,async()=>{
  const categories=(row as {categories?:Record<string,number>}).categories;
  const plan=await prepareGooglePromptTranslation(row.input,async tag=>categories?.[tag]);
  expect(plan.queries).toEqual(row.queries);expect(plan.restore(row.responses)).toBe(row.output);
 });
 it('fails closed on missing, merged, empty or injected structural replies',async()=>{
  const plan=await prepareGooglePromptTranslation('black_hat, blonde_hair');
  for(const response of [[],['merged'],['黑帽\n'],['黑帽\n金发\nextra'],['黑帽\n金发|other'],['黑帽\n1.2::金发']])expect(()=>plan.restore(response)).toThrow();
 });
 it('deduplicates labels and bounds requests; never drops a label across batches',async()=>{
  const tags=Array.from({length:300},(_,i)=>'descriptive_'+String(i).padStart(3,'0')+'_longer_label');
  const plan=await prepareGooglePromptTranslation(tags.join(', '),async()=>0);
  expect(plan.queries.length).toBeGreaterThan(1);expect(plan.queries.every(q=>q.length<=1200)).toBe(true);
  expect(plan.restore(plan.queries)).toBe(tags.map(t=>t.replace(/_/g,' ')).join(', '));
 });
 it('index failure must not suppress unlisted words or prose',async()=>{
  const plan=await prepareGooglePromptTranslation('character:misumi_uika, unlisted_description, black_hat',async()=>{throw Error('offline index unavailable');});
  expect(plan.queries).toEqual(['unlisted description\nblack hat']);expect(plan.restore(['未列出的描述\n黑色帽子'])).toBe('character:misumi_uika, 未列出的描述, 黑色帽子');
 });
 it('rejects oversized input before consulting the index',async()=>{
  let calls=0;await expect(prepareGooglePromptTranslation('{'+ 'a'.repeat(20001)+'}',async()=>{calls++;return 0;})).rejects.toThrow();expect(calls).toBe(0);
 });
});
