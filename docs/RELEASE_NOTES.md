## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.8.7.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.8.7.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.8.7-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.8.7.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.8.7.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.8.7 更新内容

- 随机画师串支持每串画师数量区间，默认 `3～7` 名；桌面端与 Android/iOS 可分别修改上下限。
- 画师权重默认范围调整为 `0.3～2.0`，用户可自定义最低与最高权重；倒置输入会自动按有效区间处理。
- 新增可选游戏／动漫系列风格 Tag：默认抽取 `0～2` 个，默认权重 `0.5～1.5`，数量与权重范围均可修改。
- Seed 支持“每组随机”与“固定”两种模式；随机模式确保同组 A/B 使用同一 Seed，固定模式支持手动输入或由系统随机生成后固定。
- 热门画师候选库继续使用 Danbooru 画师分类按累计作品数动态排序，并明确 Pixiv 昵称或 ID 需先映射为规范 Danbooru 画师 Tag。
- 删除过时的固定 `33/33` Danbooru 验证日期文案，并更新五种界面语言、跨端持久化与测试。
