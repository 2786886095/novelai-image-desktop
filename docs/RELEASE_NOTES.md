## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.6.4.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.6.4.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.6.4-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.6.4.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.6.4.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.6.4 更新内容

- 为 Android 与 iOS 重绘功能加入独立的全屏蒙版编辑器，避免原先内嵌画布与页面滚动争抢手势导致手指绘制偶尔无响应。
- 支持单指绘制/擦除、双指缩放和平移，并加入画笔大小、原图与蒙版透明度、撤销、重做、清空、反转蒙版和重置视图。
- 针对手机横竖屏和平板布局分别适配控制区，补齐安全区域、触控尺寸以及简体中文、繁体中文、英语、日语和韩语文案。
- 修复重绘完成后旧蒙版状态未完整清除的问题，并为蒙版擦除与反转补充导出逻辑和自动化测试。
