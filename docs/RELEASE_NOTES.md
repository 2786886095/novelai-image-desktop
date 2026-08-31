## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.0.8.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.0.8.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.0.8-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.0.8.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.0.8.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.0.8 更新内容
- Android 与 iOS 新增 `.naisbackup` 系统文件关联：可从文件管理器、聊天软件或云盘直接通过“分享／用其他应用打开”唤起 Langbai Studio。
- 共享备份会在后台复制并显示读取状态，完成后直接进入专用导入确认页；类别选择、安全合并、导入前救援备份和配置二次覆盖确认全部保留。
- 手机端备份选择器不再依赖系统识别自定义扩展名；允许选择任意文档，再通过归档清单严格验证，解决部分手机看不到 `.naisbackup` 的问题。
- 导出的备份文件新增专用 MIME 类型，提升 Android 与 iOS 跨应用分享识别率；共享缓存会在退出导入页后自动清理。
- 桌面、Android 与 iOS 的提示词标准化改用安全默认值：保留下划线转空格，但默认不删除非 ASCII 内容、不移除质量词／画师标签，也不去除重复 Tag。
