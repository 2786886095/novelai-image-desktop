# 发行说明

## Latest — 画风迭代候选卡片修复

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- 修复 Windows 画风迭代候选较多时，画师串和底部按钮被裁切的问题。在经典版与新版均可查看完整画师串、复制或应用到生成。
- 候选卡片按内容决定行高，不改变已有图片、评分或画师权重。
- 恢复旧画风迭代任务时保留最新的请求状态，避免旧限流记录覆盖较新的提交结果。提交结果不确定时仍需确认，不会自动重发。
- Android、iOS 同步版本；无此次桌面界面改动。Android 为签名 APK；iOS 为未签名 IPA，需自行签名，不能直接安装到普通 iPhone。
