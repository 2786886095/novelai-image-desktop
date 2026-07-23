## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.5.1.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.5.1.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.5.1-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.5.1.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.5.1.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.5.1 更新内容

- 修复随机画师串抽卡在切换“本批抽卡预览 / 收藏夹”时页面立即向上跳动的问题，桌面端与移动端均会保持用户当前滚动位置。
- 取消结果视图切换栏的吸顶悬浮效果，使其随页面正常滚动，不再覆盖或遮挡下方图片与操作区域。
- 更新移动端滚动回归测试，确保后续版本不会重新引入切换回顶部的问题。

### 使用与资源说明

- 法典内容来自 `nai4.top` 的公开法典页面；原页面声明为无偿免费分享，应用保留来源链接且不修改原提示词正文。
- 成人法典默认不会取代常规法典的初始视图，用户可在法典标签中主动选择。
- 所有 NovelAI 生图请求仍由用户自己的 Token 发起，实际 Anlas 规则与服务限制以 NovelAI 官方返回为准。
