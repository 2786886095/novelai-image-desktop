## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.4.9.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.4.9.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.4.9-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.4.9.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.4.9.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.4.9 更新内容

- **新增 NovelAI 个人法典（全端）**：离线收录“所长常规NovalAI个人法典”“所长色色NovalAI个人法典(上)”和“所长色色NovalAI个人法典(下)”，共 14,600 条结构化记录。
- 支持按法典、原始章节、统一分类和关键词检索，并可逐条复制提示词或打开原始来源。
- 新增手动更新：桌面端与移动端均可重新读取公开页面并缓存最新结构化数据；更新失败时继续使用上次成功缓存或内置快照。
- 数据读取、解析和缓存均在本地完成；移动端将大体积解析与编码放到后台 isolate，降低搜索和更新时的界面卡顿。
- **随机画师串抽卡加入页内收藏夹（Windows、Android、iOS）**：可在“本轮结果 / 收藏夹”之间直接切换。
- 收藏会保留当时选中的图片、A/B 类别、完整画师串与权重、随机风格/光影词及其权重；收藏图片不会被下一轮临时图片清理删除。
- 收藏夹视图和法典界面均完成简体中文、繁体中文、英语、日语、韩语适配。
- 新增法典解析、离线快照和手机竖屏、手机横屏、平板横屏布局回归测试。

### 使用与资源说明

- 法典内容来自 `nai4.top` 的公开法典页面；原页面声明为无偿免费分享，应用保留来源链接且不修改原提示词正文。
- 成人法典默认不会取代常规法典的初始视图，用户可在法典标签中主动选择。
- 所有 NovelAI 生图请求仍由用户自己的 Token 发起，实际 Anlas 规则与服务限制以 NovelAI 官方返回为准。
