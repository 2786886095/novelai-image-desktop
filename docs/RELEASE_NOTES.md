# 更新记录

## Latest · 发行与项目同步（2026-10-13）

- 当前发行与下载入口统一指向 [GitHub Latest](https://github.com/2786886095/novelai-image-desktop/releases/latest)，由 Latest 附件选择 Windows 安装版 / 便携版、macOS DMG / ZIP、Linux AppImage、Android APK、iOS IPA；首页当前区不固定版本号、日期标签、源码 SHA 或带版本的安装包名。
- 已发行源码和五种语言 README、项目首页说明及维护规则同步到 [默认分支 main](https://github.com/2786886095/novelai-image-desktop/tree/main)。历史记录下方保留真实版本与日期，不修改构建、移动版本或更新校验的必要版本字段。
- 当前 iOS IPA 未签名，需自行取得适用的 Apple 签名与 provisioning profile 才能安装，不能直接安装到普通 iPhone；不是 App Store / TestFlight 发行。其他系统的签名、校验清单和安装限制以 Latest 的证据为准。
- 当前应手动下载；Latest / 稳定分类本身不会产生新版本号、更新清单或自动升级能力。自动更新须按实际发行条件核对。
- 当前完整 39 功能正式验收矩阵尚未齐，受控网络 / 模拟器检查不等于所有真机与真实付费服务验收；#69 真实环境 TLS 根因仍未确认。不能用稳定标签代替验收证明。
- 以后按项目 AGENTS.md 的“GitHub 项目同步与 Latest 入口”规则执行，避免只更新 Release 而遗漏 main / 首页。

---

## 2026-10-12 · 2.5.7 五端公开发行

- GitHub 的[同一发布页](https://github.com/2786886095/novelai-image-desktop/releases/tag/issues-68-71-preview-20261012)已从预发布改为稳定版 / Latest，并补发现有 iOS 未签名 IPA。桌面版本仍为 2.5.7，Android / iOS 为 2.5.7+176；没有伪装为新版本或重新命名旧二进制。
- 七个安装包均对应[发行源码 48defea369317ea37bc6a12cc095b3c0c8f1703e](https://github.com/2786886095/novelai-image-desktop/tree/48defea369317ea37bc6a12cc095b3c0c8f1703e)：Windows 安装版与便携版、macOS universal DMG 与 ZIP、Linux x86_64 AppImage、Android APK、iOS unsigned IPA。
- #68：中文全角逗号 U+FF0C 在本地按标签分隔并规范为英文逗号，避免翻译结果错位。
- #70：应用译文前保存下次源 / 目标语言方向，保存失败不替换原提示词，重开方向正确。
- #71：翻译状态区预留空间，避免状态出现 / 消失引起输入框和按钮上下跳动。上述三个具体 issue 已关闭；#69 真实环境 TLS 故障根因仍未确认，保留开放。
- 同时包含已观察的首请求重试、AI 记录滚动、作品批量删除 / 移动作品组、本地删图后的记录清理及特定不支持参数的 422 请求修正，不推广为所有网络 / 422 问题的修复。

### 下载与校验

| 平台 | 下载 |
| --- | --- |
| Windows x64 安装版 | [Setup.exe](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/Langbai-NovelAI-Studio-Setup-2.5.7.exe) |
| Windows x64 便携版 | [便携版.exe](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/Langbai-NovelAI-Studio-2.5.7.exe) |
| macOS universal | [DMG](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/Langbai-NovelAI-Studio-2.5.7-universal.dmg) / [ZIP](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/Langbai-NovelAI-Studio-2.5.7.zip) |
| Linux x86_64 | [AppImage](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/Langbai-NovelAI-Studio-2.5.7.AppImage) |
| Android | [APK](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/app-release.apk) |
| iOS | [未签名 IPA](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/novelai-mobile-unsigned.ipa) |

[五端校验清单](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/SHA256SUMS-five-platforms.txt) · [发行证据与限制](https://github.com/2786886095/novelai-image-desktop/releases/download/issues-68-71-preview-20261012/RELEASE_VERIFICATION.json)。四端预览校验文件作为历史快照保留，不用于替代本次五端清单。

### 安装与验收边界

- 本次须手动下载安装：未新增内部版本号，也没有 latest.yml；同 2.5.7 版本不会触发新版本升级，当前自动更新器不识别此非语义版本 tag。
- iOS IPA 没有主 App 代码签名与 provisioning profile，需自行签名后按对应分发方式处理，不能直接安装到普通 iPhone，不是 App Store / TestFlight 发行。
- Windows EXE 未 Authenticode 签名；macOS 签名 / 公证未确认。
- 原生 CI 受控网络 fixture / 模拟器检查不等于所有真机与真实付费账号端到端验收；完整 39 功能正式验收矩阵尚未齐。稳定分类是维护者选择，不是正式门禁通过证据；私有原图对官网效果的比对也未确认。

---

## 2026-10-10 · v2.5.7 Windows 发行（历史记录）

## 本次更新
- 接入本地 MCP 服务，默认关闭；提供本机外部智能体连接设置，并补充鉴权、来源、账户绑定与额度限制等边界保护。
- 接入独立配置的 OpenAI 图像编辑重绘引擎，保留 NovelAI 重绘；按蒙版区域合成结果，不消费 Anlas，不自动重试付费请求。
- 修复重绘笔刷拖出可见画布后仍保持捕获的问题：结束笔画并释放指针，返回画布不会继续误画；保留画布平移。
- 支持读取 NovelAI 官网 WebP 图片内的生成参数，保留 PNG 元数据读取。
- 在线画廊从图片详情返回时恢复列表与浏览位置，并统一系统后退操作。
- 修复 Google 翻译对常见下划线英文标签漏译的问题，桌面及移动端共享测试样例同步。
- Agent 组件下载采用已批准的公开文件入口并请求新重定向，保留大小、SHA256 校验及离线复用验证。
- 补充用于整个软件检查的 Claude 审查文档；该文档不代表全部功能已完成实体设备或付费接口验收。

## 发行范围与验证
公开提供 Windows x64 安装版与便携版，并附 latest.yml 和 verification.json。移动端源码版本为 2.5.7+176，本次不发布 Android/iOS 二进制。

保留桌面类型检查与测试、移动端分析与测试、跨平台原生构建、真实打包运行及字体、实际 NSIS 解码、Windows 全新安装及 2.4.0 升级数据保留、智能体在线获取及离线复用等正式发布门槛。

重绘边界修复完成相同输入的基线、修改与回滚检查，回滚原始哈希一致。没有证明操作系统指针发生物理位置跳转；未执行真实付费生图或移动实体设备验收。

Windows 包未代码签名，SmartScreen 可能提示未知发布者；请从本仓库正式 Release 下载并核对 SHA256。

## 下载
- [Windows 安装版](https://github.com/2786886095/novelai-image-desktop/releases/download/v2.5.7/Langbai-NovelAI-Studio-Setup-2.5.7.exe)
- [Windows 便携版](https://github.com/2786886095/novelai-image-desktop/releases/download/v2.5.7/Langbai-NovelAI-Studio-2.5.7.exe)
