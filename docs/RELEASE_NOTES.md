## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.7.5.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.7.5.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.7.5-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.7.5.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.7.5.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.7.5 更新内容

- 修复在线精准参考库在桌面中等宽度窗口中，系列下载按钮与统计信息相互挤压、按钮越界的问题。
- 系列下载操作与下载大小分离：按钮只保留明确动作，总大小、待下载和已保存数量集中展示，降低视觉负担。
- 优化桌面端系列面板的响应式网格；窄窗口自动纵向排列，按钮、进度条与失败状态均保持在容器内。
- 移动端同步精简系列下载按钮，并新增简体中文、韩文、英文及手机横竖屏/平板布局回归测试。
- 新增桌面在线目录空状态、系列选择、确认、下载中、失败、完成、预览、本机预设、明暗主题和紧凑窗口截图审计入口。
- 完成 Android 与 iOS、五种语言、明暗主题、手机与平板共 1,180 张界面截图复验。
