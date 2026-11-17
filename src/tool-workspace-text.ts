import {normalizeAppLanguage} from "./i18n";
const labels={
 "zh-CN": {target:"目标画风自动迭代",run:"运行状态",results:"候选结果",step:"步骤",panels:"分镜",generation:"生成参数",workSearch:"按工作流、编号或尺寸搜索"},
 "zh-TW": {target:"目標畫風自動迭代",run:"執行狀態",results:"候選結果",step:"步驟",panels:"分鏡",generation:"生成參數",workSearch:"按工作流、編號或尺寸搜尋"},
 "en-US": {target:"Target style iteration",run:"Run status",results:"Candidate results",step:"Step",panels:"Panels",generation:"Generation settings",workSearch:"Search by workflow, ID, or dimensions"},
 "ja-JP": {target:"目標画風の反復探索",run:"実行状態",results:"候補結果",step:"ステップ",panels:"コマ",generation:"生成パラメーター",workSearch:"ワークフロー・ID・サイズで検索"},
 "ko-KR": {target:"목표 화풍 탐색",run:"실행 상태",results:"후보 결과",step:"단계",panels:"컷",generation:"생성 매개변수",workSearch:"워크플로, ID 또는 크기로 검색"},
} as const;
export const toolWorkspaceText=(language:unknown)=>labels[normalizeAppLanguage(language)];
