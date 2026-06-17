## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows** (x64) | `Langbai-NovelAI-Studio-0.7.0.exe` | 便携版，双击即用，无需安装 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-0.7.0-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-0.7.0.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-0.7.0.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v0.7.0 更新内容

- **灵感胶囊**：可折叠（默认收起为一行），内置约 190 个中文概念词库，支持「蓝眼白发夜景」这类复合中文查询，一键插入对应 Danbooru 标签。
- **标签权重微调**：提示词下方按标签提供 − / ＋ 控件，基于 NovelAI 的 `{}` / `[]` 语法增减权重并显示近似倍率。
- **中英翻译**：一键将中文提示词翻译为英文。
- **图片命名**：生成面板新增文件名前缀输入框，配合命名模板使用。
- **修复**：批量生成时的「暂停 / 停止」按钮此前显示为空白，现已恢复清晰文字标识。
