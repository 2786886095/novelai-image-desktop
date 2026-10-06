export const HISTORY_DEFAULT_WIDTH = 340;
export const HISTORY_MIN_WIDTH = 220;
export const HISTORY_MAX_WIDTH = 480;
export const HISTORY_COLLAPSE_AT = 72;

export function normalizeHistoryWidth(value: number) {
  return Number.isFinite(value) && value > 0
    ? Math.round(Math.max(HISTORY_MIN_WIDTH, Math.min(HISTORY_MAX_WIDTH, value)))
    : HISTORY_DEFAULT_WIDTH;
}

export function readHistoryCollapsed() {
  try { return localStorage.getItem('langbai.ws.history-collapsed') === 'true'; }
  catch { return false; }
}

export function historyRailText(language: unknown) {
  const texts: Record<string, [string, string, string]> = {
    'zh-CN': ['收起历史与素材', '展开历史与素材', '拖动调整历史与素材；拖到右侧可收起'],
    'zh-TW': ['收起歷史與素材', '展開歷史與素材', '拖曳調整歷史與素材；拖到右側可收起'],
    'en-US': ['Hide history and materials', 'Show history and materials', 'Resize history and materials; drag right to hide'],
    'ja-JP': ['履歴と素材を閉じる', '履歴と素材を開く', '履歴と素材の幅を変更；右にドラッグすると閉じます'],
    'ko-KR': ['기록 및 소재 접기', '기록 및 소재 펼치기', '기록 및 소재 너비 조절; 오른쪽으로 끌어 접기'],
  };
  const [hide, show, resize] = texts[String(language)] ?? texts['zh-CN'];
  return { hide, show, resize };
}
