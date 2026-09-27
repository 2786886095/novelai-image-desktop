import {it,expect} from 'vitest';import {STORE_LOCALES,localizedStoreText,localizeStoreMessage} from './store-i18n';
const slots=(s:string)=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
for(const [language,row] of Object.entries(STORE_LOCALES))it(`complete status and toast catalog: ${language}`,()=>{
 expect(Object.keys(row).sort()).toEqual(Object.keys(STORE_LOCALES['zh-CN']).sort());
 for(const [key,value] of Object.entries(row)){expect(value.trim()).not.toBe('');expect(slots(value)).toEqual(slots(STORE_LOCALES['zh-CN'][key]));if(['ja-JP','ko-KR','zh-TW'].includes(language))expect(value).not.toBe(STORE_LOCALES['en-US'][key]);}
});
it('retranslates existing notifications between all locales, including nested costs and empty parameters',()=>{
 for(const target of Object.keys(STORE_LOCALES))for(const source of Object.keys(STORE_LOCALES)){
  expect(localizeStoreMessage(target,localizedStoreText(source,'status.apiConfigured'))).toBe(localizedStoreText(target,'status.apiConfigured'));
  const text=localizedStoreText(source,'generate.singleDone').replace('{spent}',localizedStoreText(source,'generate.spent').replace('{spent}','3'));
  expect(localizeStoreMessage(target,text)).toBe(localizedStoreText(target,'generate.singleDone').replace('{spent}',localizedStoreText(target,'generate.spent').replace('{spent}','3')));
  expect(localizeStoreMessage(target,localizedStoreText(source,'generate.singleDone').replace('{spent}',''))).toBe(localizedStoreText(target,'generate.singleDone').replace('{spent}',''));
 }
});
it('preserves user filenames, group names, timestamps and unknown upstream messages',()=>{
 expect(localizeStoreMessage('ja-JP','Created group: Ready')).toBe('グループを作成しました：Ready');
 expect(localizeStoreMessage('ko-KR','已选择历史图片：原名.png')).toBe('기록 이미지 선택됨: 原名.png');
 const raw='HTTP 400: 外部服务原始错误';expect(localizeStoreMessage('en-US',raw)).toBe(raw);
});
