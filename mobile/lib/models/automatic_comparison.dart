const comparisonSurfaces=['generate:t2i','generate:i2i','generate:enhance','inpaint','postprocess:upscale','postprocess:director'];
bool automaticComparisonAllowed(String surface)=>comparisonSurfaces.contains(surface)&&surface!='generate:t2i';
Map<String,bool> normalizeAutomaticComparison(dynamic value)=>{for(final key in comparisonSurfaces) key:automaticComparisonAllowed(key)&&(value is Map && value[key] is bool ? value[key] as bool : true)};
List<String> comparisonLabels(String language)=>switch(language){
 'zh-CN'=>['自动对比','完成后自动打开对比；关闭后仍可手动查看。','查看对比','关闭对比','角色名称'],
 'zh-TW'=>['自動對比','完成後自動開啟對比；關閉後仍可手動查看。','查看對比','關閉對比','角色名稱'],
 'ja-JP'=>['自動比較','完了後に比較を開きます。オフでも手動で比較できます。','比較を表示','比較を閉じる','キャラクター名'],
 'ko-KR'=>['자동 비교','완료 후 비교를 엽니다. 꺼도 수동 비교가 가능합니다.','비교 보기','비교 닫기','캐릭터 이름'],
 _=>['Automatic comparison','Open comparison after completion; manual comparison remains available.','Show comparison','Close comparison','Character name']};
