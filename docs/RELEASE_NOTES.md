# 发行说明

## Latest — 桌面备份导出修复

[下载当前版本](https://github.com/2786886095/novelai-image-desktop/releases/latest) · [当前源码](https://github.com/2786886095/novelai-image-desktop/tree/main) · [构建与验收记录](https://github.com/2786886095/novelai-image-desktop/releases/latest/download/verification.json)

- 修复 Windows、macOS、Linux 导出包含空文件的酒馆 Agent 工作区时误报 Portable size mismatch；空文件随备份原样导出与恢复。
- 备份依旧校验文件存在性、大小和 SHA-256，不放宽损坏文件检查。
- Android 和 iOS 仅同步版本。
- Android 请使用正式签名 APK。iOS 附件为未签名 IPA，需自行签名，不能直接安装到普通 iPhone；不是 App Store 或 TestFlight 发行。
