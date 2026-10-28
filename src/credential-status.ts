const labels: Record<string, string[]> = {
  "zh-CN": ["部分保存的密钥未能在此启动环境解锁，原始密文已保留。请在对应 API 设置中重新验证并保存：", "生图 Token", "反推", "转换", "标签服务", "百度翻译", "AI 翻译", "兼容图片服务"],
};
export function credentialIssueMessage(language: string | undefined, fields: string[]) {
  const text = labels[language ?? "zh-CN"] ?? labels["zh-CN"];
  const keys = ["token", "visionApiKey", "convertApiKey", "tagServerApiKey", "baiduSecret", "translateAiApiKey", "imageApiKey"];
  return text[0] + fields.map(k => text[keys.indexOf(k) + 1] || "API").join(" / ");
}
