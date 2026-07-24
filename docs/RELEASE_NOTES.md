## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.5.2.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.5.2.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.5.2-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.5.2.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.5.2.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.5.2 更新内容

- 图片反推与提示词转换默认接入本地 NovelAI 个人法典：先按语义检索相关规则，再在同一次可见任务中生成或精修提示词。
- 图片反推采用“初步识别 → 法典检索 → 精修”的内部流程；第二阶段失败时会保留初步结果，不会让整次任务丢失。
- 桌面端与移动端均可查看本次匹配的法典来源，并可分别控制法典增强与成人法典；成人内容仅在语义匹配时参与检索。
- 新增可持续扩充的“NovelAI 提示词法典”技能与同步脚本，统一维护提示词规范、画面映射、权重及多人互动经验。
- 反推和转换仍只显示为一个任务、记录为一次调用；法典检索在本地完成，不消耗 NovelAI Anlas，但图片反推精修会增加一次所配置 AI 服务的调用。

### 使用与资源说明

- 法典内容来自 `nai4.top` 的公开法典页面；原页面声明为无偿免费分享，应用保留来源链接且不修改原提示词正文。
- 成人法典默认不会取代常规法典的初始视图，用户可在法典标签中主动选择。
- 所有 NovelAI 生图请求仍由用户自己的 Token 发起，实际 Anlas 规则与服务限制以 NovelAI 官方返回为准。
