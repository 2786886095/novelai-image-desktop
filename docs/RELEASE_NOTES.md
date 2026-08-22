## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.7.7.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.7.7.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.7.7-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.7.7.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.7.7.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.7.7 更新内容

- 软件更新检查改为中国大陆优先：桌面端与移动端先访问 Gitee，Gitee 不可用或尚未同步时自动回退 GitHub。
- Windows 安装版与便携版均可在软件内下载经 SHA-512 校验的 Setup.exe；下载完成后由用户确认安装。
- 针对 Gitee 社区版单附件 100 MB 限制，发布流水线自动把安装包拆成 90 MB 分片；客户端下载后本地合并并校验，不牺牲安装包内容。
- Android 更新入口优先直达 Gitee 的 APK 附件，GitHub Release 保留为全球线路和容灾来源。
- GitHub 发版时自动创建同版本 Gitee Release，并同步 Windows 更新分片、更新清单、`latest.yml` 与 Android APK。
