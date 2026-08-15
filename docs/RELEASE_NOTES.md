## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.6.5.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.6.5.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.6.5-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.6.5.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.6.5.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.6.5 更新内容

- 修复 NovelAI V4/V4.5 图片导入「原数据」后一键用于生成时，角色提示词、角色负面提示词、模型与部分生成开关没有被完整还原，导致固定 Seed 下仍与原图明显不一致的问题。
- 一键恢复时会按图片中的最终有效参数重建生成状态，并清除旧的 Vibe Transfer 与精准参考残留，避免风格词、质量词、负面预设或参考图被重复叠加。
- 桌面端与移动端均支持查看、编辑并重新提交逐角色负面提示词，相关请求结构与 NovelAI V4/V4.5 元数据保持一致。
- 原数据页面会持久保存最后导入的图片与解析结果；切换页面或重启软件后可继续查看和使用，无需反复导入。
- 补充桌面端和移动端的元数据解析、生成请求与持久化回归测试。
