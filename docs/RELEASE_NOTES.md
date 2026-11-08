# 发行说明

## Latest — 桌面滚动条与标签补全修复

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [Linux 支持策略](LINUX_SUPPORT.md)

**本版本更新**

- 修复生成页标签补全列表被尺寸控件或底部操作区遮挡的问题。可用空间不足时会向上展开，支持拖动滚动条、点击及键盘选取。
- 加宽「输入画师串抽卡」页面和标签列表的滚动条；「加载更多」结束后保留用户正在浏览的位置。
- 本轮功能改动仅在桌面端，Android 和 iOS 只同步版本。

**验证与安装**

- 138 项相关测试和类型检查通过。Windows 候选验证了滚动条拖动、异步加载保持位置、补全点击与键盘选取。
- 五个平台从同一源码重新构建。提供 Windows 安装／便携、macOS 通用 DMG／ZIP、Linux AppImage、正式签名 Android APK；校验见 verification.json。
- iOS 为未签名 IPA，须自行签名，不能直接安装到普通 iPhone，不是 App Store 或 TestFlight 发行。未完成五平台实机、全功能及自动更新验收；建议手动下载。

历史发行记录见[归档](history/)。
