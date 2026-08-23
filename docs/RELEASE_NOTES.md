## Langbai NovelAI Studio

请根据你的操作系统下载对应安装包：

| 系统 | 安装包 | 安装说明 |
| --- | --- | --- |
| 🪟 **Windows**（便携版，x64） | `Langbai-NovelAI-Studio-1.8.3.exe` | 双击即用，无需安装 |
| 🪟 **Windows**（安装版，x64） | `Langbai-NovelAI-Studio-Setup-1.8.3.exe` | 安装向导可自选路径、创建快捷方式；支持软件内一键更新 |
| 🍎 **macOS** (Intel + Apple 芯片通用) | `Langbai-NovelAI-Studio-1.8.3-universal.dmg` | 拖入「应用程序」；**未签名**，首次打开请右键 →「打开」 |
| 🍎 **macOS**（压缩包，同上通用版） | `Langbai-NovelAI-Studio-1.8.3.zip` | 解压后即为 `.app`，同样需右键「打开」 |
| 🐧 **Linux** (x64) | `Langbai-NovelAI-Studio-1.8.3.AppImage` | `chmod +x` 后直接运行 |
| 🤖 **Android** | `app-release.apk` | 直接安装；需允许「未知来源」 |
| 📱 **iOS** | `novelai-mobile-unsigned.ipa` | **未签名**，需使用 AltStore / Sideloadly 等工具自行侧载 |

> 桌面端与移动端均为 **API-only** 客户端，需要自备 NovelAI Persistent API Token。

### v1.8.3 更新内容

- 风格参考图弹窗现已支持直接拖入 PNG、JPG、JPEG 与 WebP 图片，也可点击空白导入区选择文件；每个风格仍最多保存 3 张。
- 修复升级、重启或设置写入后风格参考图文件仍在磁盘、界面却显示为 0/3 的问题；软件会自动扫描并重新关联旧图片。
- 风格参考图新增独立持久化清单，即使设置索引意外被覆盖，图片名称、路径和创建时间仍可自动恢复。
- 修复本机氛围迁移/精准参考预设索引丢失后整个本机预设库显示为空的问题；现会从独立预设元数据与本地图片恢复。
- 本机参考预设新增独立元数据文件与 `library.json` 备份，后续保存、移动分组和参数更新都会同步持久化。
- 恢复扫描仅接受本机预设目录内的受支持图片，并继续校验文件是否真实存在，避免无效路径或失效记录进入预设库。
- 补齐简体中文、繁体中文、英语、日语和韩语的拖拽导入提示与完成反馈。
