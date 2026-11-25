# 发行说明

## v3.0.9 — V5 精准参考

V5 Full 和 Curated 的文生图、图生图现在支持精准参考。可选角色、画风、角色与画风或服装参考。角色参考可以选择是否优先相同服装。每张输出按每张参考图加收 5 Anlas。

- V5 参考强度范围为 0–5，V4.5 为 0–1。桌面端可拖动滑块或直接输入数值，悬停时小数末位完整可见。
- 工作室按模型选择目标尺寸，等比缩放保留整张参考图，比例不符时居中补白。
- 氛围迁移面板提供切换到 V4.5 的按钮。V5 局部重绘暂不支持精准参考。
- 桌面 MCP 的参考图挂载、预设和生成参数支持 V5 参考类型及强度。

Windows、macOS、Linux 和 Android 用户可从发行附件手动下载对应平台包。iOS IPA 未签名，普通 iPhone 需自行签名后安装。

[当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [下载](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [历史发行说明](https://github.com/2786886095/novelai-image-desktop/tree/main/docs/history)

### 验收例外

iOS 系统文件夹选择器的复测未能在 5 秒内确认新建文件夹的命名框可用。本版仅豁免此项超时，其余 iOS 检查均须通过。
