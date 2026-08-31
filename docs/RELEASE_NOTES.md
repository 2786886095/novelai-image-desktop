## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.0.7.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.0.7.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.0.7-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.0.7.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.0.7.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.0.7 更新内容
- 重做随机画师串的画风 Tag 库：改为可折叠的横向分类工作区，修复输入区重叠与占用空间过大的问题，并支持搜索、逐项移除及“每串必加 / 随机加入”两种模式。
- 接入本机 Danbooru 数据库与中英离线库，按质量、3D 渲染、媒介画法、光影、色彩、材质、画风模仿及动漫／游戏／漫画作品分类按需载入，显著扩充可选 Tag。
- “载入更多”改为原位增量追加，不再清空列表、重新加载或把滚动位置带回顶部。
- Danbooru `_(style)` 画风 Tag 新增鼠标悬停参考图；会优先选择普通／敏感级作品，并在图片失效、精确查询无结果时自动尝试其他作品、地址与基础 Tag。
- 批量图生图新增“逐图按行尺寸”：可按图片顺序每行输入一个宽×高尺寸，桌面、Android 与 iOS 共用校验与任务参数。
- 修复批量文本与漫画提示词中的空行对应关系，避免逐行尺寸、图片和提示词发生错位。
