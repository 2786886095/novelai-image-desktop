## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.8.6.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.8.6.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.8.6-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.8.6.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.8.6.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.8.6 更新内容

- 根据 NovelAI V5 官方发布公告纠正能力判断：V5 首发暂不支持精准参考（Precise Reference）与氛围迁移（Vibe Transfer）。
- 修复 V5 携带精准参考时触发 `Error encoding v4 director references` / `invalid.prod-ai.svc.cluster.local` HTTP 400 的问题。
- 桌面端与 Android/iOS 移动端会在请求发出前拦截不兼容组合，并提供一键切换到 V4.5；已有参考图不会被删除。
- 批量图生图、漫画生成器、小说推文与单图生成统一使用同一套模型能力判断，不再静默丢弃参考图或自动无参考图重试扣费。
- 保持 V5 的结构化角色提示词协议不变，避免修正精准参考能力时误把 V5 降级成旧版负面提示词格式。
