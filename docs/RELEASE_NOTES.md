## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.3.7.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.3.7.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.3.7-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.3.7.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.3.7.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.3.7 更新内容

- **「AI绘画咒语图库」启动预热，进入基本秒开（桌面端）**：应用启动后台会预取最新作品首屏及前 12 个作品的详情/缩略图；首次进入图库直接展示预热好的快照，不再长时间显示"正在读取数据"，随后自动静默同步真正最新的数据，不受常规的 10 分钟数据缓存影响。缩略图磁盘缓存与"作品列表是否最新"完全分离，只用来避免同一张图反复下载。
- 点击"刷新"会清空数据缓存后强制拉取最新内容；从生成/重绘等页面切回已打开的图库时，界面保持原样，不会被自动刷新打断。
