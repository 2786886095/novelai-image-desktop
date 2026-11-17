# 发行说明

## Latest — 恢复经典界面的费用预览位置

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- 桌面经典界面：文生图、图生图的费用预览移回左侧参数区末尾，随参数一起滚动；生成按钮仍固定在底部。
- 桌面新版界面：位置不变，仍在生成按钮上方。未配置账号时可展开「生成前扣费」。费用估算规则不变。
- Android、iOS 同步版本；无此次桌面界面改动。Android 为签名 APK；iOS 为未签名 IPA，需自行签名，不能直接安装到普通 iPhone。

## v2.9.6 — 固定画师权重范围与桌面界面对照

[历史发行附件](https://github.com/2786886095/novelai-image-desktop/releases/tag/v2.9.6) · [发行源码](https://github.com/2786886095/novelai-image-desktop/tree/v2.9.6) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/download/v2.9.6/verification.json)

- Windows 画风自动迭代可为每个固定画师设置权重上下限。每轮都保留固定画师，只在指定范围内尝试权重；留空沿用原固定权重，其他画师照常搜索。
- 老用户更新后首次启动会看到经典、新版界面的实拍对照，选择保留当前界面或切换；右上角「×」可关闭并保留当前界面，之后不再提示；点弹窗外或按 Esc 不会误关闭。之后可在「设置 → 外观 → 桌面界面布局」随时切换，无需重启。
- Android、iOS 同步发行版本，上述两项功能仅适用于 Windows。
- Android 使用正式签名 APK。iOS 为未签名 IPA，需自行签名；不能直接装到普通 iPhone，不是 App Store 或 TestFlight 发布。
