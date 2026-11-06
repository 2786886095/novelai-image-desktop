import type { AppLanguage } from "./types";
const values = {
  "range": [
    "每串随机抽取数量",
    "每串隨機抽取數量",
    "Random tags per string",
    "各文字列のランダム Tag 数",
    "문자열당 무작위 Tag 수"
  ],
  "min": [
    "最少",
    "最少",
    "Minimum",
    "最少",
    "최소"
  ],
  "max": [
    "最多",
    "最多",
    "Maximum",
    "最多",
    "최대"
  ],
  "always": [
    "每串必加",
    "每串必加",
    "Always include",
    "毎回追加",
    "항상 추가"
  ],
  "random": [
    "随机加入",
    "隨機加入",
    "Random subset",
    "ランダム追加",
    "무작위 추가"
  ],
  "help": [
    "仅限制“随机加入”的 Tag；手动输入和必加 Tag 保留。修改后重新抽卡生效，不会自动生图。",
    "僅限制「隨機加入」的 Tag；手動輸入與必加 Tag 保留。修改後重新抽卡生效，不會自動生圖。",
    "Counts apply only to random library tags. Typed and always-included tags remain. Redraw to apply; no automatic generation.",
    "ランダム指定の Tag のみ対象。手入力と必須 Tag は保持。変更後は再抽選。自動生成しません。",
    "무작위 라이브러리 Tag에만 적용됩니다. 직접 입력과 항상 추가 Tag는 유지됩니다. 재추첨으로 적용하며 자동 생성하지 않습니다."
  ],
  "empty": [
    "先选择 Tag，再点“随机加入”启用数量范围。",
    "先選擇 Tag，再點「隨機加入」啟用數量範圍。",
    "Select a tag and choose Random subset to enable this range.",
    "Tag を選択してランダム追加に切り替えると有効になります。",
    "Tag 선택 후 무작위 추가를 누르면 범위를 설정할 수 있습니다."
  ],
  "selected": [
    "已选 {count} 个；可分别设置必加或随机加入。",
    "已選 {count} 個；可分別設定必加或隨機加入。",
    "{count} selected; choose always included or random for each tag.",
    "{count} 件選択。各 Tag を必須またはランダムに設定できます。",
    "{count}개 선택. 각 Tag를 항상 추가 또는 무작위로 설정합니다."
  ],
  "summary": [
    "已抽取 {count} 串；手动输入与必加 Tag 保留，随机 Tag 按每串范围独立抽取。",
    "已抽取 {count} 串；手動輸入與必加 Tag 保留，隨機 Tag 按每串範圍獨立抽取。",
    "Prepared {count} strings. Typed/always tags remain; random tags are sampled independently per string.",
    "{count} 組を準備。手入力と必須 Tag を保持し、ランダム Tag は各組で抽選します。",
    "{count}개 준비 완료. 직접 입력과 필수 Tag를 유지하고 무작위 Tag를 문자열별로 추첨합니다."
  ],
  "remove": [
    "移除",
    "移除",
    "Remove",
    "削除",
    "삭제"
  ]
} as const;
export function styleTagDrawText(language: AppLanguage, key: keyof typeof values): string {
  const index = {"zh-CN":0,"zh-TW":1,"en-US":2,"ja-JP":3,"ko-KR":4}[language] ?? 0;
  return values[key][index];
}
