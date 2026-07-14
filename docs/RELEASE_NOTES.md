## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.3.3.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.3.3.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.3.3-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.3.3.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.3.3.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.3.3 更新内容

- **新增「AI绘画咒语图库」**：原生接入 [AITag](https://aitag.win/) 公开数据源，不使用 iframe 或 WebView。
  - 支持作品/作者/标签/模型/ID 搜索、提示词搜索、最新作品、本月排行和翻页，可浏览多图作品并逐张查看。
  - 元数据复用现有 NAI、SD WebUI/Forge、ComfyUI 解析器，支持逐项复制与一键套用兼容参数。
  - 桌面端通过受限 Electron IPC 代理访问，Android/iOS 使用原生 HTTP；均不携带 NovelAI Token。
  - 保留跳转 AITag 原作品页面的入口。
  - AITag 接口为网站公开数据接口，非正式版本化 SDK，未来若接口结构调整可能需要同步适配。
- **「恢复图片原数据」参数名双语化**：非英文界面下，参数名统一显示为「本地化名称（英文原名）」（如「正面提示词 (Positive prompt)」），涵盖 NovelAI/A1111/Forge/ComfyUI 常见字段；每项参数新增单独复制按钮。
