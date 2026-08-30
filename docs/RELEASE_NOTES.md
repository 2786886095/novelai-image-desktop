## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.0.3.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.0.3.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.0.3-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.0.3.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.0.3.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.0.3 更新内容
- 补齐 Android/iOS 与桌面端的在线画廊：AI TAG、Safebooru、Danbooru、Gelbooru 与法典图鉴均可切换、搜索、分页和打开多图详情；点击图片只加载详情，不会自动改写提示词。
- 移动端新增“数据与存储”：本地标签目录和相关标签数据库支持下载进度、速度、暂停续传、完整性校验、上一版恢复及缓存统计；只有用户确认后才替换数据库，图片与用户资料不受影响。
- 移动端生图默认开启流式预览，生成中显示中间图、步骤和进度，并可在生图输出区域随时关闭；不支持流式响应时安全使用普通完整图片响应。
- 移动端导航和图标补齐桌面端新增功能，并针对手机、横屏手机和平板使用自适应列数、详情分栏与安全滚动区域。
- 统一设置页折叠卡片高度，移除“数据导入、导出与自动备份”在收起状态下突兀的图标和多行说明，说明改到展开内容中。
- 发布流程不再执行全量分析、单元测试或截图测试步骤；Gitee 发布前自动清理旧版本附件配额，确保新版 Windows 与 Android 安装包可以继续上传。
