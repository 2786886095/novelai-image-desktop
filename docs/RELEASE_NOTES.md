## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.2.8.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.2.8.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.2.8-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.2.8.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.2.8.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.2.8 更新内容

- **修复"验证 Token"偶发报错 400（Please refresh NovelAI.net...）**：该按钮原本会先单独调用一次 NovelAI 的 `/user/information` 接口做校验，最近这个接口会对部分请求返回一个不属于正常文档范围的 400 错误；实际上 App 内其余所有余额刷新、生成前校验用的都是 `/user/data`（本身就完整包含 `/user/information` 的全部信息），一直工作正常。现改为"验证 Token"也统一走 `/user/data`，不再依赖那次多余且不稳定的调用（桌面端 + 移动端同修）。
- **桌面端防止重复打开**：软件已经打开时再次双击启动，现在会直接激活/前置已打开的窗口，而不是叠加打开一个新实例。
