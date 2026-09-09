## Langbai NovelAI Studio 2.2.5

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-2.2.5.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-2.2.5.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-2.2.5-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-2.2.5.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-2.2.5.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v2.2.5 更新内容
- 图片保存与下载改为明显的顶层状态提示：下载中持续显示，成功后展示数量与实际保存位置；桌面端可直接打开保存位置，部分失败、失败和取消分别反馈，并避免相同任务重复点击下载。
- 修复酒馆长会话、多图和流式回复场景下的动态消息高度测量，减少文字重叠、图片穿插和滚动溢出。
- 修复 AITag 部分图片下载失败的问题，改进请求来源信息、图片格式识别与批量下载结果统计；已成功下载的图片会保留并明确反馈。
- QuickTagCloud 图库补齐分组、资料库和子分类导航，改善原图比例卡片、自适应显示与分页操作。
- 桌面端加图区域支持 Ctrl+V 粘贴，并按最近点击或聚焦的区域确定目标；完善 WebP 图片的解码与后续处理。
- 酒馆多轮生图编辑加入画面状态快照和 Tag 变更检查，减少服装等既有要求被后续改动覆盖；画风 Tag 库可用于右侧风格提示词。
- 桌面与移动端同步相关图库、图像输入及酒馆改进。

### 验证情况
- 发布前桌面 593 项测试通过；Flutter 461 项测试通过、1 项既有跳过；类型检查与 Flutter 分析通过。
- Windows、macOS、Linux、Android 与 iOS 产物由对应发布流水线构建。iOS 仍为未签名侧载包，macOS 仍未签名。

> 本版集中改进下载反馈、图库和酒馆稳定性，不代表所有使用场景的问题均已解决。
