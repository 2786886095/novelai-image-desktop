const zh = {
  changed: "配置已在其他入口修改。重新读取后再编辑，避免覆盖新配置。", reload: "重新读取配置（替换本页草稿）",
  title: "文生图服务", current: "当前：", native: "NovelAI 原生", config: "兼容图片服务配置",
  scope: "仅兼容 NovelAI 模型，使用中转站独立 Token。仅接管普通文生图；重绘、增强、参考图及画风实验室仍使用 NovelAI。费用以对应服务商为准。",
  switchNative: "切回 NovelAI 原生", switched: "已切回 NovelAI；兼容服务配置保留。", switchFailed: "切换未保存，请重试。",
  setup: "NovelAI 中转（OpenAI Images / New API 封装）", url: "图片 API URL",
  urlHelp: "支持基础地址或完整 /images/generations 路径；版本路径（如 /v1）按服务商要求填写。",
  key: "中转站独立 API Token", show: "显示密钥", hide: "隐藏密钥", model: "模型名称", modelHint: "填写站点提供的标准 NovelAI 模型 ID（如 nai-diffusion-5-full）",
  size: "图片尺寸", sizeHint: "1024x1024 或 auto", sizeHelp: "可用尺寸由所选模型决定，不套用 NovelAI 尺寸限制。",
  format: "返回格式", auto: "自动（不发送 response_format）", extensions: "可选网关扩展参数（JSON）",
  extensionHelp: "默认留空对象。仅支持 negative_prompt、steps、scale、sampler、seed；请确认服务商支持后再填写。",
  saving: "保存中…", save: "保存并使用兼容图片服务", saved: "验证通过，图片服务配置已保存。",
  invalid: "配置未保存，请检查地址、密钥、模型、尺寸、JSON 扩展参数和本机密钥存储状态。",
  privacy: "保存前只读验证；失败不保存，不发送收费请求。请求使用“AI 服务”代理设置；不会把 NovelAI Token 发送到此地址。",
  panel: "OpenAI Images 兼容文生图", missingModel: "未配置模型", missingSize: "未配置尺寸", prompt: "图片提示词", count: "本次图片数（一次请求）",
  requestHelp: "提交一次请求，不自动重试。数量、尺寸与费用由服务商决定；失败前已返回的有效图片会保存。",
  controlsHelp: "此模式仅发送上方提示词、配置的尺寸及扩展参数，不使用 NovelAI 的风格预设、角色分段或参考图。",
  settings: "配置服务 / 切换回 NovelAI", stop: "停止请求", generate: "生成图片",
};
export function compatibleImageText(_language: unknown): typeof zh {
  return zh;
}
