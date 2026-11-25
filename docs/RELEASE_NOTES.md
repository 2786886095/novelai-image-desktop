# 发行说明

## Latest — 增强五档与 Med 精准参考提示

- 增强幅度与 NovelAI 官网一致。从第 1 到第 5 档，强度分别为 0.2、0.4、0.5、0.6、0.7。前四档噪声为 0，第 5 档为 0.1。桌面端、手机端和桌面 MCP 使用相同预设。
- V5 Full 的 Med 档无法使用精准参考。切到 Med 时保留已添加的参考图；切回 High 可继续使用它们，移除精准参考图后可使用 Med 生成。工作室会在提交前提示，MCP 预览和估价也会指出这个限制。
- MCP 的 `img2img` 支持 `enhanceMagnitude`（1–5）；`prepare_generation` 可预览选档参数，`estimate_cost` 可按同一档位估价。

Windows、macOS、Linux 和 Android 用户可从发行附件手动下载对应平台包。iOS IPA 未签名，普通 iPhone 需自行签名后安装。

[当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [下载](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [历史发行说明](https://github.com/2786886095/novelai-image-desktop/tree/main/docs/history)
