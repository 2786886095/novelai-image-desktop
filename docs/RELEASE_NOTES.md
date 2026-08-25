## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.8.9.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.8.9.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.8.9-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.8.9.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.8.9.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.8.9 更新内容
- 桌面端默认改为“自动跟随系统代理 / VPN”，通过 Electron 系统解析器读取固定代理与 PAC 的实际端口，不再强制连接 `127.0.0.1:7890`。
- 自动模式会探测本机代理端口；系统返回的端口无效时改走直连，让 Clash、Mihomo、V2Ray 等工具的 TUN / 虚拟网卡接管流量。
- Android 通过原生 `ProxySelector`、iOS 通过 CFNetwork 读取系统代理；没有显式代理时自动使用系统 VPN / TUN 路由。
- 旧版默认 `7890` 设置自动迁移，手动 HTTP、SOCKS5 与自定义代理仍作为高级覆盖选项保留；五种界面语言已同步更新。
