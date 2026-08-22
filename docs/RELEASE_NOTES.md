## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.7.8.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.7.8.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.7.8-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.7.8.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.7.8.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.7.8 更新内容

- 新用户默认模型更新为 **NAI Diffusion V5 Full**；V5 请求按官网行为发送，界面不再展示无须手动配置的噪声计划。老用户保留既有设置，并在升级后收到一次模型迁移提醒，可自行切换到 V5 Full。
- 批量图生图“清空当前生成”会同步清除旧的逐图参数快照；修改全局参数后重新生成将使用最新参数，不再沿用上一轮设置。
- 风格提示词预设升级为文件夹式分组：支持创建/删除分组、移动/删除风格、预览图管理与本地持久化；桌面端和移动端均可使用。
- 统一结构图标、按钮高度、文字行高与基线对齐，修复图标越界、文字上漂、紧凑控件错位和深色模式不一致。桌面端完成明暗主题 DOM 审计，Android/iOS 完成五语言、明暗主题、手机/平板截图复验。
- 随机画师抽卡补充 33 个经 Danbooru 当前分类与弃用状态验证的候选标签，并统一别名、全角输入与缓存去重。标签有效不等于 V5 必然识别其画风，实际效果仍以固定 Seed 试生成结果为准。
- 参考预设、批量任务及移动端若干交互继续统一删除确认、失败回退和状态持久化行为。
