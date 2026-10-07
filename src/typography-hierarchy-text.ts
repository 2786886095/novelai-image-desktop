export function typographyHierarchyHint(language?: string): string {
  switch(language) {
    case 'zh-TW': return '正文與提示詞按完整比例放大；標題、導覽和按鈕溫和放大，避免介面擁擠。';
    case 'en-US': return 'Body text and prompts use the full scale; headings, navigation and buttons grow more gently to keep the layout readable.';
    case 'ja-JP': return '本文とプロンプトは設定どおり拡大し、見出し・ナビ・ボタンは緩やかに拡大して混雑を防ぎます。';
    case 'ko-KR': return '본문과 프롬프트는 설정대로 확대하고, 제목·탐색·버튼은 완만하게 확대해 레이아웃을 유지합니다.';
    default: return '正文与提示词按完整比例放大；标题、导航和按钮温和放大，避免界面拥挤。';
  }
}
