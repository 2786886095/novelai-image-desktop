## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.3.5.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.3.5.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.3.5-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.3.5.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.3.5.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.3.5 更新内容

- **「AI绘画咒语图库」兼容参数可逐项勾选**：兼容参数列表默认折叠，支持逐项勾选、全选、清空，「一键使用到生成」只应用勾选的项目；选择会全局记住（跨作品、跨会话、重启后保持一致），仍然尊重负面提示词锁定设置；图片原数据的逐项复制列表也改为默认折叠。
- **ComfyUI 工作流结构化提取**：支持 Comfy API prompt graph、顶层节点数组、`{ "nodes": [...] }` 三种输入格式，覆盖 KSampler、CheckpointLoader、CLIPTextEncode、LoraLoader、ControlNet、放大等常见节点，提取提示词、Seed、Steps、CFG、采样器、尺寸、模型/VAE/CLIP/LoRA 等具体字段，不再整块展示原始工作流 JSON。
- **AITag 预览图片本地缓存**：作品列表、详情大图与缩略图优先读取本地缓存；设置页新增缓存大小/文件数展示、一键清空，以及 1/7/30/90/180 天或永不过期的自动清理周期（桌面端 Electron 用户数据目录，移动端应用临时目录，均校验 HTTPS 来源并限制单张图片大小）。
- **工具子页面位置保持**：从漫画生成器/批量重绘/小说推文/AITag图库这类工具子页切换到生成、重绘等顶层页面后再返回工具，会恢复此前所在的子页面，而不是回到工具首页；仅在子页面主动点击「返回工具」时才回到首页。
