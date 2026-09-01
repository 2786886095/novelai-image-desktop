## Langbai NovelAI Studio 2.1.1

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.1.1.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.1.1.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.1.1-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.1.1.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.1.1.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.1.1 更新内容
- 修复手机端参考预设库数量较多时一次性构建并解码全部图片，导致滚动严重卡顿、无响应甚至卡死的问题。
- 当筛选结果超过 80 个预设时默认折叠图片列表；用户展开后每批仅加载 24 张，点击“加载更多”再继续追加，避免 672 张等大图库同时进入内存。
- 参考图缩略图改为低质量、受限尺寸解码，显著降低长列表的内存与 GPU 压力。
- “应用所选预设”操作栏固定在手机屏幕底部，不再需要翻到列表最底端；窄屏会自动切换为紧凑布局。
- 搜索、分组和参考类型筛选后会重置分页与折叠状态，选择结果仍会保留，便于先筛选再批量应用。
- 新增大图库回归测试，覆盖 672 个预设、默认折叠、固定确认栏和首批 24 张加载上限；现有手机、平板多尺寸界面测试与 Flutter 静态分析均通过。

> v2.1.1 包含 v2.1.0 的全部功能与稳定性修复，建议移动端用户优先更新。
