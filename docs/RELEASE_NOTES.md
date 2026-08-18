## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.7.1.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.7.1.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.7.1-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.7.1.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.7.1.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.7.1 更新内容

- 修复桌面端参考图管理弹窗中“打开预设库”按钮被挤压成竖排的问题，并优化弹窗在窄窗口下的自适应布局。
- 氛围迁移的新图片与新预设默认将信息提取量和参考强度设为 `1`；桌面端、漫画生成器、小说推文与移动端保持一致。
- 精准参考界面与 NovelAI 官方参数结构对齐，仅显示参考类型、参考强度和保真度；旧项目残留的信息提取字段不会再影响请求。
- 为氛围迁移和精准参考参数补充简体中文、繁体中文、英语、日语、韩语标签与效果说明。
- 参考预设缩略图现在按图片原始比例完整自适应显示，并统一优化分组、类型等下拉控件的视觉与焦点反馈。
- 预设库新增当前工具内复用：桌面端批量图生图、漫画生成器和小说推文，以及移动端批量图生图与漫画生成器均可直接选用已保存预设，无需先跳回普通生成页。
- 修复移动端双语长标签可能造成的文字溢出，并完成桌面明暗主题、Android/iOS 手机纵屏与平板横屏离屏截图复验。
