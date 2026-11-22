import type { CharCaptionItem, GenerateExtras } from "./types";
const copy:Record<string,string[]>={"zh-CN":["抽卡时使用角色提示词","与生成页共用角色，只带入已启用角色，不带参考图","编辑生成页角色"],"zh-TW":["抽卡時使用角色提示詞","與生成頁共用角色，只帶入已啟用角色，不帶參考圖","編輯生成頁角色"],"en-US":["Use character prompts for this draw","Shares characters with Generate. Includes enabled roles only, not reference images.","Edit workbench characters"],"ja-JP":["抽選にキャラクタープロンプトを使用","生成画面とキャラクターを共有。有効なキャラクターのみ使用し、参照画像は含めません。","生成画面のキャラクターを編集"],"ko-KR":["뽑기에 캐릭터 프롬프트 사용","생성 화면과 캐릭터를 공유합니다. 활성 캐릭터만 사용하며 참조 이미지는 제외합니다.","생성 화면 캐릭터 편집"]};
export const drawRoleLabels=(locale:string)=>copy[locale]??copy['en-US'];
export const drawRoleExtras=(include:boolean,rows:readonly CharCaptionItem[]):GenerateExtras=>({
  vibeImages:[],preciseReferences:[],charCaptions:!include?[]:rows
    .filter(c=>c.enabled!==false && (c.prompt.trim() || c.negativePrompt?.trim()))
    .map(({prompt,negativePrompt,useCoords,x,y})=>({prompt,negativePrompt,useCoords,x,y}))
});
