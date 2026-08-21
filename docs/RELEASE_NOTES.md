## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.7.4.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.7.4.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.7.4-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.7.4.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.7.4.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.7.4 更新内容

- 重做在线角色精准参考库的信息层级与卡片布局，采用 WeUI 原生搜索、选择器、按钮、对话框、进度条和状态组件，减少旧界面的生硬感与视觉拥挤。
- 新增按游戏整系列下载：选择系列后显示总数量、总大小、已保存和待下载数量，确认后一次完成该游戏全部精准参考图下载。
- 整系列下载提供实时聚合进度与完成计数；自动跳过本机已有项目，失败项目不会阻断后续下载，再次执行即可重试未完成内容。
- 下载成功后才创建对应本机分组；已有“游戏 · 分类”分组会直接复用，避免空分组与重复分组。
- 桌面端使用 GSAP 提供轻量入场、卡片渐进、系列面板及确认弹窗动画，并完整适配系统“减少动态效果”设置。
- 移动端同步整系列下载、大小统计、确认流程、实时进度与失败重试，并使用 Flutter 原生自适应组件避免手机和平板布局漂移。
- 优化浅色与深色主题下的对比度、筛选区域和图片卡片密度；继续支持 Gitee 中国大陆优先线路、GitHub 回退及五语言界面。
- 增加系列统计单元测试，并完成桌面、Android/iOS 共用 Flutter 逻辑及明暗主题截图复验。
