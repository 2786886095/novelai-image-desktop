const labels: Record<string, string[]> = {
  "zh-CN": ["部分保存的密钥未能在此启动环境解锁，原始密文已保留。请在对应 API 设置中重新验证并保存：", "生图 Token", "酒馆", "反推", "转换", "标签服务", "百度翻译", "AI 翻译"],
  "zh-TW": ["部分儲存的金鑰未能在此啟動環境解鎖，原始密文已保留。請在對應 API 設定中重新驗證並儲存：", "生圖 Token", "酒館", "反推", "轉換", "標籤服務", "百度翻譯", "AI 翻譯"],
  "en-US": ["Some saved credentials could not be unlocked in this app profile. Their encrypted originals are preserved. Verify and save them again in the corresponding API settings: ", "Image Token", "Tavern", "Reverse", "Convert", "Tag service", "Baidu translation", "AI translation"],
  "ja-JP": ["一部の保存済みキーを復号できませんでした。元の暗号文は保持しています。該当する API 設定で再検証して保存してください：", "画像 Token", "酒場", "画像解析", "変換", "タグ", "Baidu 翻訳", "AI 翻訳"],
  "ko-KR": ["일부 저장된 키를 이 앱 프로필에서 복호화하지 못했습니다. 원본 암호문은 보존됩니다. 해당 API 설정에서 다시 확인하고 저장하세요: ", "이미지 Token", "타번", "이미지 분석", "변환", "태그", "Baidu 번역", "AI 번역"],
};
export function credentialIssueMessage(language: string | undefined, fields: string[]) {
  const text = labels[language ?? "zh-CN"] ?? labels["en-US"];
  const keys = ["token", "agentApiKey", "visionApiKey", "convertApiKey", "tagServerApiKey", "baiduSecret", "translateAiApiKey"];
  return text[0] + fields.map(k => text[keys.indexOf(k) + 1] || "API").join(" / ");
}
