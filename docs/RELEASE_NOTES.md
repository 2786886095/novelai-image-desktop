# 发行说明

## Latest — 中转站接口类型

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- Windows、macOS、Linux、Android 和 iOS 的账号管理新增三种中转站接口：NovelAI 原生、用 /v1/models 验 Key 后走 NovelAI 原生生图、OpenAI 兼容文生图。
- 选择 /v1 类型时，不再调用 NovelAI 原生账号接口验证 Key。失败提示显示请求路径及 HTTP 状态（如果有响应），不显示 Key 或服务端原始响应。
- OpenAI 兼容文生图使用站方提供的图片模型 ID，通过 /v1/images/generations 提交；验证阶段不生图。该接口不承诺原生参考图、重绘或 Anlas 计费，不自动重试已提交的生图请求。
- Android 请使用正式签名 APK。iOS 附件为未签名 IPA，需自行签名，不能直接安装到普通 iPhone；不是 App Store 或 TestFlight 发行。
