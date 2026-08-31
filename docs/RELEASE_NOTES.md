## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.0.6.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.0.6.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.0.6-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.0.6.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.0.6.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.0.6 更新内容
- 桌面、Android 与 iOS 的随机画师串抽卡新增“自定义 Tag（权重随机）”：输入的每一个 Tag 都必定加入每一个画师串，不再随机遗漏，仅分别随机权重。
- 自定义 Tag 支持逗号或换行分隔、自动去重、忽略输入中原有权重，并可自行设置 0.1～10 的随机权重区间；输入和区间会跨次启动保存。
- 新增按 3D/渲染、光影/画面、质量词、氛围/环境渲染分类的 Tag 快选库；点击即可加入或移除，仍遵循“每串必带、仅权重随机”。
- 修复移动端“已有画师串权重微调”折叠状态被错误记忆、重新进入仍展开的问题；该面板改为默认折叠、紧凑输入并移到组合预览之前，消除突兀的大块灰色区域。
- 保留 v2.0.5 的可选备份路径、移动端画廊请求与图片加载修复。
