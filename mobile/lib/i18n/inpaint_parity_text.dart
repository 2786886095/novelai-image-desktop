import 'app_locales.dart';
String inpaintParityText(Object? language,String key){
 const labels={
 'zh-CN':{'select':'框选工作区域','return':'返回编辑','work':'工作尺寸','preserve':'保留原图尺寸；自定义尺寸保持不变','restoreError':'无法恢复原图与蒙版，当前编辑内容已保留。'},
 'zh-TW':{'select':'框選工作區域','return':'返回編輯','work':'工作尺寸','preserve':'保留原圖尺寸；自訂尺寸維持不變','restoreError':'無法恢復原圖與遮罩，目前編輯內容已保留。'},
 'en-US':{'select':'Select work region','return':'Return to edit','work':'Work size','preserve':'Original canvas preserved; custom size unchanged','restoreError':'Could not restore original image and mask; current editor was preserved.'},
 'ja-JP':{'select':'作業領域を選択','return':'編集に戻る','work':'作業サイズ','preserve':'元画像のサイズを保持・カスタム値は変更しません','restoreError':'元画像とマスクを復元できませんでした。現在の編集内容は保持されています。'},
 'ko-KR':{'select':'작업 영역 선택','return':'편집으로 돌아가기','work':'작업 크기','preserve':'원본 캔버스 유지 · 사용자 크기 변경 없음','restoreError':'원본 이미지와 마스크를 복원하지 못했습니다. 현재 편집 내용은 유지됩니다.'},
 };
 return labels[normalizeAppLocaleCode(language)]?[key]??labels['en-US']![key]??key;
}
