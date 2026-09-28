## Langbai NovelAI Studio 2.4.2

### v2.4.2 更新内容

### 酒馆 Agent：先确认，再下载
- Windows 与 Android 打开酒馆 Agent 页面不再自动准备或下载组件。
- 安装、更新和重新安装前显示组件版本与下载大小；取消确认不会下载。
- 未安装组件时引导用户安装，启动操作不再隐式下载。下载通过摘要与兼容性检查后才可启用。

### 安装、卸载与资料保留
- 新增组件安装、重新安装与卸载入口；运行中的 Agent 需先停止。
- 卸载前备份，保留对话、角色卡、预设、图片、设置、自定义资料与备份；重新安装后继续使用。
- 仅清理经过识别的组件文件和下载缓存，保留未知或已修改文件。
- 修复卸载后恢复备份可能重新激活已移除运行环境的问题。

### 图标与发布说明
- Agent 网页标签使用软件图标，兼容页面后续动态更新图标的情况。
- 应用版本更新至 2.4.2，移动构建号 161；独立 Agent 运行环境仍为 0.1.7（Harness 0.1.7-rc.2），无需重发相同运行环境。
- 延续 2.4.1 的 Windows 安装载荷校验、旧运行环境保留与安装器进度修复；运行环境仍独立下载，不嵌入应用安装包。
- 发布门禁包含桌面测试、实际 Windows 安装与升级、Agent 下载启动、macOS 双架构验证，以及移动构建与 Android 签名连续性检查。Android 已完成自动化与原生编译验证，未宣称完成实体手机安装验收。

### 下载与平台
- Windows x64：`Langbai-NovelAI-Studio-Setup-2.4.2.exe`（安装版）、`Langbai-NovelAI-Studio-2.4.2.exe`（便携版）。
- macOS：通用 DMG / ZIP，未签名；Linux x64：AppImage。
- Android：`app-release.apk`；iOS：`novelai-mobile-unsigned.ipa`，需自行签名或侧载。
- 本地 Agent 引擎支持 Windows x64 与 Android ARM64（Android 8+）；其他平台保留原有酒馆功能。
