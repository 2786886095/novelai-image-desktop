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
  };
  const [hide, show, resize] = texts[String(language)] ?? texts['zh-CN'];
  return { hide, show, resize };
}
