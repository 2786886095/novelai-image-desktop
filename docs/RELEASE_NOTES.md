## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.9.3.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.9.3.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.9.3-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.9.3.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.9.3.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.9.3 更新内容
- 修复 Android/iOS 浏览器能访问 NovelAI、但手机版验证 Token 或刷新账户时仍可能出现 `Connection reset by peer` 的问题。
- 自动代理现在会按实际请求 URL 分别解析系统代理/PAC 规则，不再把 `api.novelai.net` 的路由错误复用于 `image.novelai.net`。
- Token 验证、账户刷新和网络检测等无扣费 GET 请求遇到连接重置、超时或临时 502/503/504 时，会更换连接并自动重试三次。
- 网络检测现在同时检查 NovelAI API 域名与图片账户域名；重试仍失败时显示可读提示，不再直接展示本地临时端口和底层 Socket 异常。
- 生图 POST 请求没有加入自动重试，避免在请求已到达服务器但响应中断时发生重复生成或重复扣费。
