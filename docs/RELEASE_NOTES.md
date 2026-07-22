## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.4.4.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.4.4.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.4.4-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.4.4.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.4.4.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.4.4 更新内容

- **漫画生成器全面重做（桌面端、Android、iOS）**：删除旧的参考图反推、AI 拆分镜和分镜转换工作流，改为直接导入 Tag 提示词生成漫画。
- 支持逐行文本、TXT，以及带分镜标题的 JSON/CSV 批量导入；四个步骤可以随时自由切换，项目状态会持续保存。
- 全局统一风格提示词、负面提示词与 NovelAI 参数，每个分镜仍可按需启用独立参数覆盖。
- 每个分镜首次可生成 1～10 张候选图；生成完成后可继续为单个或全部分镜追加候选，并选择任意候选作为当前主图。
- 桌面端支持双击预览，移动端支持点击/长按预览；失败分镜可独立重试，停止按钮会取消当前请求与全部剩余队列。
- 点击“打包 ZIP”时才选择保存/分享位置，压缩包只包含每个分镜当前选中的主图，并附带安全精简后的项目清单和提示词文档。
- 新项目采用漫画工程 schema v2；按此前产品决策，不兼容旧漫画项目 JSON。小说推文仍在使用的共享分析接口不受影响。
