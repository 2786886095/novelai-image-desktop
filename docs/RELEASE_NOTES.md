## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.6.7.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.6.7.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.6.7-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.6.7.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.6.7.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.6.7 更新内容

- 修复手机端重绘遮罩的橡皮擦视觉行为：现在会直接移除已绘制遮罩，不再显示为覆盖笔刷。
- 手机端重绘编辑器始终显示画笔大小，画笔与橡皮擦共用可调尺寸；保持撤销、重做、缩放和最终遮罩量化逻辑。
- 新增手机端氛围图与精准参考图预设库：每张参考图可独立命名、分组并保存到应用内部目录，原文件被移动或删除后仍可使用。
- 预设完整保存氛围图的信息提取量与参考强度，以及精准参考的类型、强度、保真度、信息提取量和尺寸。
- 支持单个预设、整个分组或全部预设的 `.nairp` 导入导出；归档包含图片本体，可跨设备完整恢复。
- 修复手机窄屏下 Noise Schedule 与负面预设下拉框文字横向溢出的问题，并补充预设库小屏布局、持久化和归档往返测试。
