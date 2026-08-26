## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.9.4.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.9.4.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.9.4-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.9.4.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.9.4.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.9.4 更新内容
- 桌面端与 Android/iOS 设置新增“下载与更新源”，可选择 `GitHub（国际线路推荐）` 或 `Gitee（中国大陆用户推荐）`。
- 默认下载与更新源改为 GitHub；所选源无法访问时会自动尝试另一个源，不会因单一镜像故障中断更新。
- Windows 软件内更新会按用户选择优先下载并校验安装包；Android 更新入口也会跟随所选下载源。
- 修复手机版角色位置编辑器的触摸冲突：在编号标记上上下拖动时只移动角色位置，不再带动整个生成页面上下滑动；离开标记后页面仍可正常滚动。
