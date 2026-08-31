## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.0.9.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.0.9.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.0.9-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.0.9.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.0.9.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.0.9 更新内容
- 修复更新后使用不久即明显卡顿、滑动失效甚至卡死的问题：自动备份不再在启动 20 秒后抢占资源，也不会与正在进行的生成任务竞争。
- 自动备份默认迁移为轻量模式，只保存配置、记录、分组和预设元数据；手动导出仍默认全选全部数据，用户也可在设置中明确开启自动备份图片。
- 手机端 ZIP 压缩移到后台 isolate，PNG/JPG/WebP 不再重复压缩，备份期间界面仍可正常响应触控与滚动。
- 桌面端重页面改为首次访问才挂载，小型工具在空闲时分批预热；超大的个人法典工具改为用户准备打开时才加载。
- 手机端不再首帧同时构建全部 13 个页面，未访问页面延迟创建，隐藏页面动画自动暂停，降低长期使用时的内存与 GPU 压力。
