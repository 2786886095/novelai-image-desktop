String templateFeatureText(Object? language, String key) {
 const values=<String,Map<String,String>>{
  'zh-CN':{'image':'图片提示词','comic':'漫画提示词','library':'提示词模板库','hint':'图片六套3.0模板、漫画两套原稿；查看、另存、导入和导出，不覆盖旧版。','japanese':'日式漫画生成器','japaneseHint':'输入内容，推荐或指定页数，逐页生成提示词并确认导入；不自动生图。','legacy':'旧版模板与提示词助手','v3':'当前使用3.0.0，请在模板库管理内置与自定义副本。'},
  'zh-TW':{'image':'圖片提示詞','comic':'漫畫提示詞','library':'提示詞範本庫','hint':'六套圖片3.0範本、兩套漫畫原稿；檢視、另存、匯入和匯出，不覆蓋舊版。','japanese':'日式漫畫產生器','japaneseHint':'輸入內容，推薦或指定頁數，逐頁產生提示詞並確認匯入；不自動生圖。','legacy':'舊版範本與提示詞助手','v3':'目前使用3.0.0，請在範本庫管理內建與自訂副本。'},
  'en-US':{'image':'Image prompts','comic':'Comic prompts','library':'Prompt template library','hint':'Six image v3 templates and two original comic templates. Preview, save copies, import and export; older editions remain unchanged.','japanese':'Japanese comic generator','japaneseHint':'Describe content, recommend or enter pages, generate page prompts, then confirm import. No automatic image generation.','legacy':'Older templates and prompt assistant','v3':'Using 3.0.0. Manage built-ins and custom copies in the template library.'},
  'ja-JP':{'image':'画像プロンプト','comic':'漫画プロンプト','library':'プロンプトテンプレート','hint':'画像3.0の6種と漫画原稿2種。全文表示・別名保存・読み込み・書き出し。旧版を保持します。','japanese':'日本式漫画ジェネレーター','japaneseHint':'内容を入力し、推奨または手動ページ数でプロンプトを生成。確認後に読み込み、画像は自動生成しません。','legacy':'旧版とプロンプト助手','v3':'3.0.0を使用中です。内蔵とカスタムはテンプレート庫で管理します。'},
  'ko-KR':{'image':'이미지 프롬프트','comic':'만화 프롬프트','library':'프롬프트 템플릿','hint':'이미지3.0 여섯 개와 만화 원본 두 개. 보기·사본 저장·가져오기·내보내기. 이전 버전을 유지합니다.','japanese':'일본식 만화 생성기','japaneseHint':'내용 입력 후 페이지 수를 추천받거나 지정하고, 페이지별 프롬프트를 생성해 확인 후 가져옵니다. 자동 이미지 생성은 없습니다.','legacy':'이전 템플릿 및 프롬프트 도우미','v3':'3.0.0 사용 중입니다. 기본 및 사용자 사본은 템플릿 라이브러리에서 관리하세요.'},
 };
 return values[language]?[key]??values['zh-CN']![key]??key;
}
