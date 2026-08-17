## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.6.8.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.6.8.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.6.8-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.6.8.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.6.8.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.6.8 更新内容

- 桌面端与移动端工具页新增独立“参考图预设”中心，可从本机图片创建氛围迁移或精准参考预设，并进行命名、分组、筛选、删除和直接应用。
- 氛围迁移与精准参考面板加入快捷保存和预设库入口；预设完整保留图片、参考类型、强度、保真度、信息提取量和原始尺寸。
- 参考图预设持久化保存在应用数据目录，支持单个、分组和全部 `.nairp` 导入导出，可在桌面端与移动端之间迁移。
- 参考图缩略图和预览改为自适应完整显示，并修复手机窄屏下独立预设中心可能出现的高度溢出。
- 移动端版本检查改为发布清单与 GitHub API 双来源回退，并加入短暂重试；网络失败时仅显示简洁的“检查失败”，不再暴露或挤入整段 Socket 异常。
