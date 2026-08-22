## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.8.1.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.8.1.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.8.1-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.8.1.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.8.1.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.8.1 更新内容

- “恢复图片原数据”新增分组历史图片选择器：支持全部、未分组及指定分组筛选，直接点击缩略图即可查看 NovelAI、Stable Diffusion WebUI / Forge 与 ComfyUI 原数据并复用兼容参数。
- 桌面端与 Android / iOS 同步支持分组历史读取；大量记录使用缩略图懒加载和分批展示，减少页面首次打开和滚动卡顿。
- 原数据查看状态改为仅在本次软件运行期间保留：切换页面后仍可继续查看，完全退出并重新启动软件后自动恢复初始状态，不再长期保存最近导入图。
- 历史图片卡片的分组选择器调整到图片下方，仅在鼠标悬停或键盘聚焦时显示；触屏设备保持可直接操作，减少图片遮挡。
- 左下角账号区域现在可整体折叠，Opus、Anlas、刷新按钮与 V5 免费额度会一并收起，生成队列和控制按钮保持可用。
- 删除历史图片不再弹出系统原生确认窗口，操作完成后使用软件内反馈提示；同步统一相关按钮、文字和图标的布局基线。
