## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.8.5.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.8.5.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.8.5-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.8.5.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.8.5.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.8.5 更新内容

- 修复 Furry 模式只能选择旧版 `NAI Diffusion Furry 3`、无法使用最新模型的问题。
- Furry 模式现在可选择 V5 Full、V5 Curated、V4.5 Full/Curated、V4 Full/Curated 与 Furry V3，默认使用 V5 Full。
- 对 V4 及以上模型按 NovelAI 官网机制在请求最前方自动加入 `fur dataset,`，并避免重复注入；独立的 Furry V3 请求保持原样。
- Anime/Furry 模式切换会保留当前兼容的现代模型，只在模型不兼容时回退到 V5 Full。
- 桌面端与 Android/iOS 移动端同步适配，并增加模型列表、请求载荷与重复标签防护测试。
