# 发行说明

## Latest — 固定画师权重范围与桌面界面对照

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- Windows 画风自动迭代可为每个固定画师设置权重上下限。每轮都保留固定画师，只在指定范围内尝试权重；留空沿用原固定权重，其他画师照常搜索。
- 老用户更新后首次启动会看到经典、新版界面的实拍对照，选择保留当前界面或切换；点弹窗外或按 Esc 不会误关闭。之后可在「设置 → 外观 → 桌面界面布局」随时切换，无需重启。
- Android、iOS 同步发行版本，上述两项功能仅适用于 Windows。
- Android 使用正式签名 APK。iOS 为未签名 IPA，需自行签名；不能直接装到普通 iPhone，不是 App Store 或 TestFlight 发布。
