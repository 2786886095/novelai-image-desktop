## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.0.5.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.0.5.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.0.5-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.0.5.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.0.5.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.0.5 更新内容
- 移动端手动导出备份改为系统“另存为”，每次都可以自行选择 `.naisbackup` 的文件名与保存位置。
- 自动备份、导入前安全备份支持选择并持久化自定义目录，也可一键恢复应用默认目录；配置导入不会改掉当前设备的备份路径。
- 自定义目录临时失效、权限不足或外置存储离线时，会自动回退到应用默认目录继续备份，并在设置中明确提示，避免备份中断或数据丢失。
- 修复移动端“法典图鉴”请求错误 `/current.json` 的 HTTP 404，以及 AI TAG 图片 CDN 缺少来源请求头导致作品图空白的问题。
