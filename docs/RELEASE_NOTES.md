## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.3.4.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.3.4.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.3.4-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.3.4.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.3.4.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；未签名，需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需自备 NovelAI Persistent API Token。

### v1.3.4 更新内容

- **修复「AI绘画咒语图库」两处问题**：
  - 桌面端图库改为独立纵向滚动容器，鼠标滚轮可正常浏览全部作品和详情页。
  - 按 AITag 原站实际接口逻辑补全时间筛选：最新作品支持全部/年份/季度/更早作品，月度排行支持当前月/指定月份/更早作品；当前月请求 `/rank/monthly/real`，历史月份请求 `/rank/monthly/fixed?month=YYYY-MM`。
  - 修复移动端时间筛选参数被意外覆盖为「全部」的问题。
  - 桌面端与移动端均补全五语言时间筛选文案；年份、月份选项直接读取 AITag 配置并按时间倒序显示。
