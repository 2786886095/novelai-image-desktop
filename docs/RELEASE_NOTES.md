# 发行说明

## Latest — Windows 系统托盘

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main)

- Windows 可在「设置 → 外观」开启「关闭窗口时隐藏到系统托盘」。开启后，主窗口打开、隐藏和恢复时均保留托盘图标；从托盘可恢复窗口或完全退出。
- 未开启时，点 × 仍完全退出。其他平台不新增托盘功能。
- Android、iOS：修复画师抽卡页面重开后，滚动位置与高级选项的展开状态冲突。
- iOS 如提供未签名 IPA，需自行签名，不能直接安装到普通 iPhone；不是 App Store 或 TestFlight 发行。下载及验收范围以正式发行说明为准。

### 验收范围

- Windows 画风迭代的本机 GPU 实测未验收：未运行模型安装与恢复、运行生命周期、搜索评分和选中结果生成。此项不计为通过。
