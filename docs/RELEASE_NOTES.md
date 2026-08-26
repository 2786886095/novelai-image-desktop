## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.9.0.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.9.0.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.9.0-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.9.0.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.9.0.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.9.0 更新内容
- 桌面端与 Android/iOS 的角色提示词新增 NovelAI 官网同类的可视化位置编辑器：可在“AI 自动选择”和“自定义拖动”之间切换，并直接拖动编号标记安排角色位置。
- 位置画布自动匹配当前生成宽高比，拖动结果仍写入 NovelAI 的标准 `x/y` 中心坐标；需要精确控制时可继续编辑 X/Y 数值。
- 权重微调按钮的文字改为严格居中，左右图标不再挤偏标签；桌面和移动端同步调整。
- 五种界面语言已同步，并补充桌面指针/键盘操作与移动端触控拖动测试。
