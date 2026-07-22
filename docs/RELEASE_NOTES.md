## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.4.3.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.4.3.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.4.3-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.4.3.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.4.3.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.4.3 更新内容

- **新增画风实验室（仅 Windows）**：包含“目标画风反推”和“随机画师组合”两条独立流程；固定内容、Seed 与参数后，一条画师串对应一张 NovelAI 图片。
- 目标反推加入无候选基准、单画师相对贡献、带权组合迭代与本地相似度排序；默认按需下载 DINOv2 Base，也可选择量化 DINOv2 Small。评分是当前提示词与 Seed 下的实验结果，不代表画师的永久通用属性。
- 随机组合使用 Danbooru 画师标签作品数作为人气先验（不是独立用户数），经平方根降权后生成主画师、辅助画师和点缀画师的多层权重配方；可从喜欢结果继续变异。非画师词变异默认关闭，负权重抑制项不会被转成正向内容。
- 用户提供的画师串与参考 HTML 仅用于归纳组合语法，没有内置、复制或打包进软件；评分模型权重同样不随安装包分发。
- **保护 Windows 更新时的默认输出图片**：默认输出目录统一迁移到系统“图片/Langbai NovelAI Studio”。安装器会先备份旧安装目录中的 `outputs`，新版本再安全合并并重映射历史记录；自定义输出路径保持不变。
- 本版本的新增画风实验室仅面向 Windows；移动端没有新增对应入口。
