## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.0.2.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.0.2.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.0.2-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.0.2.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.0.2.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.0.2 更新内容
- 新增独立“在线画廊”：整合 AI TAG、Safebooru、Danbooru、Gelbooru 与法典图鉴，支持来源切换、搜索、分页、详情、多图浏览、标签复制和下载；点击卡片只打开图片详情，不再自动写入提示词。
- Gelbooru 改为直接使用软件内置共享凭据加载，不再显示 User ID / API Key 填写与验证面板。
- 新增跨桌面、Android 与 iOS 的 `.naisbackup` 数据导入导出：默认全选，可独立选择配置、API、画师收藏、反推/转换历史、参考预设与参考图、生成图片、提示词预设及工具项目。
- 导入遵循非破坏合并：内容相同的图片跳过，同名不同内容自动添加“(1)”，日期分组、收藏、图片、参考预设与历史只合并；只有配置和 API 会在二次确认后覆盖。导入前自动生成完整安全备份。
- 设置新增自动备份、备份恢复、数据源与存储、缓存统计及资源路径；本地标签/关联数据库支持可视化进度、暂停续传、校验、用户确认后原子替换和上一版回滚，数据库操作不会覆盖用户图片。
- 生图默认启用流式预览，并在“输出目录”左侧增加即时开关；兼容 NovelAI MessagePack、SSE 与 ZIP 响应，关闭后继续使用稳定的完整图片响应。
- 优化工具页预加载、原数据历史默认折叠、队列完成反馈和图片完成显示，减少首次进入工具及任务收尾时的停顿。
- 统一浅色与深色视觉层级、Flutter 风格功能图标、列表与卡片间距；修复左侧文字、批量图生图标题、局部重绘工具栏等窄宽度溢出问题，并保留原有右上角窗口控制按钮。
- 修复画师收藏迁移与持久化，避免升级或切换工具后收藏丢失；局部重绘继续使用精确的不透明蒙版颜色。
