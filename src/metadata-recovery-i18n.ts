import type { AppLanguage } from "./types";

export type MetadataRecoveryText = {
  mode: string;
  online: string;
  offline: string;
  onlinePrivacy: string;
  offlinePrivacy: string;
  onlineSummary: string;
  reading: string;
  onlineFailed: string;
  offlineFailed: string;
  retry: string;
  chooseOffline: string;
  preferenceNotSaved: string;
  mappingWrapper: string;
};

const TEXT: Record<AppLanguage, MetadataRecoveryText> = {
  "zh-CN": {
    mode: "读取模式", online: "联网 · 官方解析器（默认）", offline: "完全离线 · 本地解析器",
    onlinePrivacy: "联网只下载官方解析器及其运行资源；图片始终在本机读取，不上传图片，不调用付费生成。当前联网读取支持 PNG/WebP；JPEG 请选择完全离线。",
    offlinePrivacy: "本次元数据读取完全离线使用内置解析器，不下载官方资源，也不发送网络请求；部分特殊元数据可能无法读取。",
    onlineSummary: "零积分 · 图片不上传 · 仅联网加载解析器",
    reading: "正在读取图片原数据…",
    onlineFailed: "官方解析器未能加载或读取这张图片。未自动切换模式；可重试，或手动选择完全离线。",
    offlineFailed: "本地解析器无法读取这张图片。请检查原图是否完整；部分格式或超限元数据不受支持。",
    retry: "重试当前模式", chooseOffline: "改用完全离线",
    preferenceNotSaved: "模式已在当前会话生效，但无法保存到本机；下次打开可能恢复默认联网。",
    mappingWrapper: "Comment 包装仅用于兼容参数回填，不是新增的官方原始字段；下方原始数据保留官方返回的字段和 JSON 类型。",
  },
};

const HISTORY_STATUS = {
  "zh-CN": { historyNotLoaded: "未加载", historyUnavailable: "读取失败", historyRetry: "重新读取历史与分组", historyGroupsFailed: "分组列表读取失败，已显示全部历史图片；可重试分组。" },
} as const;
export function metadataRecoveryText(language: AppLanguage): MetadataRecoveryText & typeof HISTORY_STATUS[AppLanguage] {
  return { ...TEXT[language], ...HISTORY_STATUS[language] };
}
