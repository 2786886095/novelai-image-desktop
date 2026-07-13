## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.3.1.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.3.1.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.3.1-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.3.1.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.3.1.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.3.1 更新内容

- **新增「恢复图片原数据」工具**：工具页新增独立入口，本地解析 PNG / JPG / WebP 内嵌的生成参数，支持识别 NovelAI 原图参数、AUTOMATIC1111 / Forge 的 `parameters` 信息、以及 ComfyUI 的 `prompt` / `workflow` JSON。
  - 可逐项查看所有可读取的参数，也可以直接复制完整原始元数据。
  - 一键套用兼容参数：提示词、负面提示词、尺寸、Steps、CFG、采样器、调度器、Seed（固定种子会按固定套用，不会被随机化）。
  - SD 模型、VAE、LoRA、ComfyUI 工作流等 NovelAI 不支持的内容只展示，不会被误套到生成参数里。
  - 反推面板里原有的"恢复参数"功能也统一升级到同一套解析逻辑，因此现在也能识别 SD 来源的 JPG/WebP，NovelAI 原图的识别效果不受影响。
  - 全程本地解析，不发送任何请求，不消耗 Anlas；元数据已被社交平台/压缩工具清除的图片会明确提示读取不到，不会瞎猜参数。
  - 桌面端、Android/平板、五种语言均已支持。
