import {normalizeAppLanguage} from "./i18n";

const keys = ["history","filters","searchLogs","all","loadFailed","noMatch","searchSettings","files","searchTools","reset","artistLookup","attachments","removeAttachment","thumbnailSize","copySeed","openWorks","imageUnavailable"] as const;
const text = {
  "zh-CN": ["历史记录","筛选","按任务或模型搜索","全部","无法读取记录，请重试。","没有符合条件的结果。","搜索设置分类","待处理文件","搜索工具","清除筛选","画师链接查询","附件","移除附件","缩略图大小","复制种子","打开作品管理","预览图暂不可用"],
  "zh-TW": ["歷史記錄","篩選","按工作或模型搜尋","全部","無法讀取記錄，請重試。","沒有符合條件的結果。","搜尋設定分類","待處理檔案","搜尋工具","清除篩選","繪師連結查詢","附件","移除附件","縮圖大小","複製種子","開啟作品管理","預覽圖暫不可用"],
  "en-US": ["History","Filters","Search by task or model","All","Could not load records. Try again.","No results match your filters.","Search settings categories","Selected files","Find a tool","Clear filters","Artist profile lookup","Attachments","Remove attachment","Thumbnail size","Copy seed","Open works library","Preview unavailable"],
  "ja-JP": ["履歴","フィルター","タスクまたはモデルで検索","すべて","記録を読み込めません。再試行してください。","条件に一致する結果がありません。","設定カテゴリを検索","選択したファイル","ツールを検索","絞り込みを解除","絵師リンク検索","添付ファイル","添付を外す","サムネイルサイズ","シードをコピー","作品管理を開く","プレビューを表示できません"],
  "ko-KR": ["기록","필터","작업 또는 모델로 검색","전체","기록을 불러오지 못했습니다. 다시 시도하세요.","조건에 맞는 결과가 없습니다.","설정 분류 검색","선택한 파일","도구 검색","필터 지우기","작가 링크 검색","첨부 파일","첨부 제거","썸네일 크기","시드 복사","작품 관리 열기","미리보기를 표시할 수 없습니다"],
} as const;
const sizes = {"zh-CN":["小","中","大"],"zh-TW":["小","中","大"],"en-US":["Small","Medium","Large"],"ja-JP":["小","中","大"],"ko-KR":["작게","보통","크게"]} as const;
export function pageUi(language:unknown){
  const locale=normalizeAppLanguage(language);
  return {...Object.fromEntries(keys.map((key,i)=>[key,text[locale][i]])) as Record<(typeof keys)[number],string>,sizes:sizes[locale]};
}
