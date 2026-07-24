## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.5.3.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.5.3.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.5.3-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.5.3.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.5.3.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.5.3 更新内容

- 桌面端与移动端均可在“图片命名”下方选择生成目标分组，也可以直接新建分组；选择结果会持久保存。
- 生成目标分组与历史记录当前筛选分离，查看其他分组不会再改变新图片的保存位置。
- 生成队列会记录任务入队时选择的目标分组，处理中途切换分组不会把已排队图片保存到错误目录。
- 新用户默认关闭 Variety+，负面预设改为 NovelAI 官方“人物优先”；已有用户保存的生成参数保持不变。
- 修正“人物优先”过去未实际附加官方负面提示词的问题，并补齐桌面端、Android 与 iOS 的一致请求行为。

### 使用与资源说明

- 法典内容来自 `nai4.top` 的公开法典页面；原页面声明为无偿免费分享，应用保留来源链接且不修改原提示词正文。
- 成人法典默认不会取代常规法典的初始视图，用户可在法典标签中主动选择。
- 所有 NovelAI 生图请求仍由用户自己的 Token 发起，实际 Anlas 规则与服务限制以 NovelAI 官方返回为准。
