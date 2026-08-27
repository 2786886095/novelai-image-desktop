## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.9.6.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.9.6.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.9.6-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.9.6.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.9.6.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.9.6 更新内容
- 修复 NovelAI 官网图片导入后 Seed 可能变化的问题：完整支持 `1～4294967295` 的 32 位无符号 Seed，不再把大于 `2147483647` 的种子截断。
- 从“原数据”页面一键使用时，会保持图片内 Seed 原值并锁定为固定 Seed；提示词、负面词、模型、尺寸、采样器、Steps、CFG、角色提示词与位置等可识别参数同步恢复。
- 桌面端将图片拖入或选择到生成工作台后，会自动读取嵌入元数据并覆盖对应生成参数，不再只加载图片。
- Android/iOS 从相册选择图片到生成工作台时，同样自动读取并恢复可识别参数；图片未包含的参数继续保留当前设置。
- 元数据解析失败或图片不含生成数据时仍可正常载入工作台，不会因损坏或缺失的元数据阻止图片使用。
