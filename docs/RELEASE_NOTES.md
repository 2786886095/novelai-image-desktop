## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.4.8.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.4.8.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.4.8-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.4.8.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.4.8.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.4.8 更新内容

- **修复随机画师串抽卡结果区跳动（Windows、Android、iOS）**：逐张图片开始生成、生成完成、失败或手动重试时，结果页面会保持用户当前查看位置。
- 批次开始、进度变化和批次结束时，顶部状态栏不再把正在查看的结果卡片向上或向下推移。
- 桌面端关闭动态结果网格的浏览器自动滚动锚定，并为错误提示预留固定高度，避免失败卡片改变整行布局。
- 移动端为结果页加入独立滚动控制器、稳定的卡片标识与位置恢复逻辑，兼容竖屏手机、横屏手机和平板。
- 新增移动端回归测试，验证失败重试和生成完成前后的页面滚动位置保持一致。

### 使用与资源说明

- 本次更新不改变随机画师串、A/B 对照、收藏及临时图片清理规则。
- 所有 NovelAI 生图请求仍由用户自己的 Token 发起，实际 Anlas 规则与服务限制以 NovelAI 官方返回为准。
