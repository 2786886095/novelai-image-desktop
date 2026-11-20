# 发行说明

## Latest — V5 引号文字提取

- 桌面和手机会从正向提示词及启用的角色提示词中提取成对引号内的文字，保留正文，不把引号外的权重标记写进文字块。
- 多段文字以空行分隔；有效的手写 `Text:` 优先，保留其内容与换行。不想自动提取时可关闭，MCP 仍可沿用软件设置或按次覆盖。
- 修复仅针对最终提示词；不能保证模型逐字排印准确。使用未签名的 iOS IPA 需要自行签名，不能直接安装到普通 iPhone。

[下载和本次验收说明](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [历史发行说明](https://github.com/2786886095/novelai-image-desktop/tree/main/docs/history)

### 验收例外
- iOS 系统文件夹选择器：本次未在 5 秒内确认命名框可用，此项验收失败，经维护者同意不作为发行条件。其余 iOS 检查仍为必需。
- Windows 画风迭代 GPU 长任务未实测。
