## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.7.6.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.7.6.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.7.6-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.7.6.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.7.6.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.7.6 更新内容

- 桌面端与移动端新增 NAI Diffusion V5 Full、V5 Curated，并将所有新建生成任务默认模型更新为 V5 Full。
- 局部重绘新增 V5 Full Inpaint 与 V5 Curated Inpaint；默认使用 V5 Full Inpaint，并在所有语言中明确显示 Inpaint 模型名称。
- 保留原 V4.5 默认参数：832×1216、28 Steps、CFG 6、CFG Rescale 0、Euler Ancestral、Karras、人物优先、质量词开启、Variety+ 关闭。
- 同步 V5 请求结构和能力边界：支持精准参考及最多 32 个角色提示词；自动隐藏或阻止 V5 不支持的氛围迁移、SMEA、Variety+ 和 Noise Schedule 手动控制。
- 新增 V5 PNG 元数据识别、成本估算、批量图生图、漫画生成器、画风实验室及多语言界面适配。
- 统一全局图标、按钮、选择器及在线参考库视觉规范，修复控件图标溢出、双箭头、间距割裂与窄窗口布局问题。
