<!-- release-summary: current-version-only; downloads: Latest -->
# Langbai NovelAI Studio

[简体中文](./README.md) · [繁體中文](./README.zh-TW.md) · [English](./README.en.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)


**下载入口：** [GitHub Latest](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) 提供当前发行说明与实际附件；安装方式与限制见下方下载区。

### 从一句灵感，到一组作品。

NovelAI 图像创作工作台，界面支持简体中文、繁体中文、英语、日语、韩语。语言切换只改变界面，不翻译用户提示词、文件名与对话内容。第三方诊断日志保留原文。

![芙宁娜主题宣传插画，软件界面为视觉示意](./docs/assets/readme/furina-workbench.png)

<a href="https://github.com/OldLi1337/novelai-image-desktop/releases/latest"><img src="https://img.shields.io/badge/下载最新版-GitHub-2563EB?style=for-the-badge&amp;labelColor=2563EB" width="216" alt="下载最新版 · GitHub" /></a>
&nbsp; **[首次使用教程](./docs/guide/GETTING_STARTED.md)** · **[查看全部功能](./docs/guide/FEATURES.md)**

> 需配置自己的 **NovelAI Persistent API Token**，生成费用与模型权限以 NovelAI 账号为准。[反推、转换和酒馆等可选 AI 服务需另行配置](./docs/guide/GETTING_STARTED.md#optional)。

[![Release](https://img.shields.io/github/v/release/OldLi1337/novelai-image-desktop?color=2563eb)](https://github.com/OldLi1337/novelai-image-desktop/releases/latest)
[![Build](https://github.com/OldLi1337/novelai-image-desktop/actions/workflows/build.yml/badge.svg)](https://github.com/OldLi1337/novelai-image-desktop/actions/workflows/build.yml)
[![Build Mobile](https://github.com/OldLi1337/novelai-image-desktop/actions/workflows/build-mobile.yml/badge.svg)](https://github.com/OldLi1337/novelai-image-desktop/actions/workflows/build-mobile.yml)
[![License: MIT](https://img.shields.io/badge/Code-MIT-586069)](./LICENSE)

## 本次更新

- **增强改为官方倍率**：「生成 → 增强」改为官方的 1× / 1.5× / MAX；原来的 2× 对常见尺寸会超过官方像素上限，1.5× 按官方方式对齐 64 像素网格。
- **提示词库常驻显示**：正、负面提示词框下方常驻预设库、「保存当前」和自定义提词入口，不用再进「更多」菜单。
- **正面预设可追加**：除替换外，正面预设也能一键追加到当前提示词末尾，与负面词库一致。
- **提示词标签**：正面预设、负面词库、自定义提词块都能设置标签，按标签筛选或搜索（`#标签` 精确筛选）。
- **提示词联想修复**：联想列表可正常关闭，迟到的结果不再弹出；选中的标签总是替换触发联想的词，不会插到别处。
- **更新来源**：软件内更新只检查本 fork 的发行版。

历史更新见[更新记录](./docs/RELEASE_NOTES.md)。

<a id="quick-start"></a>
## 先完成你的第一张图

1. **下载客户端**：从[下载区](#download)选择适合系统的安装包。普通使用者不需要安装 Node.js，也不需要运行源码命令。
2. **连接账号**：打开「设置 → API 配置」，按软件内图文教程获取并填写 Token，点击「验证 Token / 刷新积分」。
3. **开始创作**：进入「生成」，选择账号可用模型，输入提示词，检查尺寸、张数与预计费用，然后生成。桌面端结果会保存到输出目录并进入历史与素材。

第一次使用可以从一段简单的英文提示词开始，其余参数先保留默认值：

```text
1girl, solo, blue hair, blue eyes, white dress, garden, sunlight, smile
```

连接失败、Token 获取方式和结果保存位置见[首次使用教程](./docs/guide/GETTING_STARTED.md)。先跑通一次生成，再配置可选的 AI 和标签服务。

<a id="features"></a>
## 按创作任务找到工具

| 你想做什么 | 使用功能 | 从哪里开始 |
| --- | --- | --- |
| 从描述生成图片，或调整已有图片 | 文生图、图生图、角色提示词与位置 | [生成与修图](./docs/guide/FEATURES.md#generation) |
| 边聊边构思，再把方案变成图 | 酒馆 AI 生图、确认后生图 / 全自动生图 | [酒馆对话创作](./docs/guide/FEATURES.md#tavern) |
| 批量制作连续画面并挑选终稿 | 漫画生成器、分镜参数、候选图、主图 ZIP | [漫画与批量任务](./docs/guide/FEATURES.md#comic) |
| 让角色或氛围更接近参考 | 精准参考、氛围迁移、在线参考目录、预设库 | [角色参考](./docs/guide/FEATURES.md#reference) |
| 找到合适的描述和画风 | 灵感胶囊、反推、转换、画风实验室、个人法典 | [提示词与画风](./docs/guide/FEATURES.md#prompt) |
| 复用一张图的生成参数 | 原数据读取、在线画廊、兼容参数选择应用 | [素材与参数复用](./docs/guide/FEATURES.md#reuse) |
| 整理结果、继续迭代 | 历史分组、参数复用、锁种变体、重命名、ZIP 导出 | [记录与管理](./docs/guide/FEATURES.md#manage) |

### 对话、分镜、参考，各有自己的工作流

- **生图助手**：聊天/附图、软件内标签与素材工具、四种实际保存的提示词模板、公开网页来源查询、上下文压缩、方案确认后生图。生图方案绑定账户与参数；切换账户须重新准备，不自动重试收费请求。旧角色卡、世界书和组件资料保留，不作为新助手的默认入口。
- **漫画生成器**：导入逐行 Tag 或 JSON/CSV 分镜，统一全局风格与负面词，再单独微调某个分镜。每个分镜可以生成多张候选、追加尝试、选定主图，最后只导出选中的主图。
- **角色参考预设库**：按游戏、角色与形态寻找参考，将精准参考或氛围迁移配置保存为预设，分组管理、导入导出，下次创作直接复用。参考效果取决于所用模型及参数，并不保证每张图完全一致。

<a id="screenshots"></a>
## 看看实际工作台

下面是 **2026-08-30 / v2.0.1 的历史实际界面截图**，仅展示旧版布局，不代表当前发行版；功能与入口以当前包为准。顶部芙宁娜配图是宣传插画，不作为功能截图。

![生成工作台：左侧提示词与参数、中间画布、右侧历史与素材](./docs/assets/readme/workbench-light.png)

<details>
<summary>展开查看设置与外观</summary>

![设置中心：主题与工作台布局配置](./docs/assets/readme/settings-light.png)

</details>

<a id="download"></a>
## 下载与安装

### Latest · 当前发行文件

[最新发行说明与附件](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) · [更新记录](./docs/RELEASE_NOTES.md) · [默认分支源码](https://github.com/OldLi1337/novelai-image-desktop/tree/main)

| 平台 | 下载入口 | 在 Latest 附件中选择 |
| --- | --- | --- |
| Windows x64 · 安装版 | [安装版](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) | 文件名含 Setup 的 EXE；安装前备份设置与作品 |
| Windows x64 · 便携版 | [便携版](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) | 不含 Setup 的便携 EXE；下载新包替换，便携版不等于零痕迹 |
| macOS · Intel / Apple Silicon | [Universal DMG](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) / [ZIP](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) | 通用 DMG 或 ZIP；签名 / 公证状态以 Latest 说明为准 |
| Linux x86_64 | [AppImage](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) | AppImage，添加执行权限后运行 |
| Android | [APK](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) | APK，手动安装；先核对签名与升级说明，勿为更新而删除旧数据 |
| iOS（附加包） | [未签名 IPA](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) | 需自行签名后安装，不能直接安装到普通 iPhone |

校验清单、SHA256、签名和安装限制以 [Latest 的说明与附件](https://github.com/OldLi1337/novelai-image-desktop/releases/latest)为准；首页不写死发行版本、日期标签、校验文件名或带版本的安装包名。历史四端预览校验文件不用于替代当前发行清单。

**本次请手动下载安装。** 将 GitHub 发布页设为 Latest 不会自动产生新版本、更新清单或有效的自动更新标签；是否支持软件内更新应按 Latest 的真实说明核对，不能仅凭 Latest 标记保证自动升级。

尚未完成所有机型的完整实机验收。Windows 签名与 macOS 签名／公证状态以 [Latest](https://github.com/OldLi1337/novelai-image-desktop/releases/latest) 的实际说明为准。

#68 全角逗号分隔、#70 翻译方向保存、#71 翻译状态布局位移的具体缺陷已关闭；#69 真实环境 TLS 根因仍未确认，保持开放。不声称解决所有网络故障或所有 422。

Windows 便携版与安装版共享本机用户数据目录 `%APPDATA%\novelai-image-desktop\`。**便携版不等于零痕迹，也不是所有数据都写在程序旁边。** 更换包前建议备份设置和作品。

各平台文件统一从 GitHub 下载，本次按上表手动安装；一般更新机制见[安装与更新](./docs/guide/GETTING_STARTED.md#updates)，不要将一般机制当成本次已支持自动升级。

<a id="faq"></a>
## 常见问题

<details>
<summary><b>软件开源，是不是就能免费生图？</b></summary>

客户端代码开源不等于 NovelAI 服务免费。需要自己的 NovelAI 账号、Token 和对应模型权限；Anlas、订阅额度与实际扣费以官方为准。软件显示的预计费用用于辅助判断。

</details>

<details>
<summary><b>只想生成图片，也要配置反推、转换和酒馆 API 吗？</b></summary>

不需要。基础 NovelAI 生图先配置 NovelAI Token 即可。图片反推使用视觉模型 API，提示词转换使用文本模型 API，酒馆对话使用对话模型配置；这些是可选能力，费用与连接状态分别计算。

</details>

<details>
<summary><b>能读取 ComfyUI / SD 图片参数，是不是也能运行这些模型？</b></summary>

原数据工具只读取图片保留的元数据，不会因读取而执行模型。兼容的提示词、尺寸、Seed 等可应用到 NovelAI；模型、VAE、LoRA 和工作流信息用于查看。桌面端另有独立的本地 ComfyUI 工作台，需准备并连接实际环境后才能执行受支持的工作流，不等于 NovelAI 能运行这些模型。

</details>

<details>
<summary><b>手机端只有基础生图吗？</b></summary>

不止。移动端已有酒馆、漫画、参考预设、在线画廊、反推与原数据等功能。桌面端和移动端不保证每个工具完全相同；例如桌面的本地画风相似度迭代仅 Windows 提供。各项平台差异见[功能指南](./docs/guide/FEATURES.md#platforms)。

</details>

更多连接、保存与报错排查见[首次使用教程](./docs/guide/GETTING_STARTED.md#troubleshooting)。

<a id="privacy"></a>
## 数据与连接方式

- 客户端通过 API 连接 NovelAI，不依赖网页登录自动化、Cookie 抓取或浏览器点击。
- 桌面端由 Electron 主进程处理 NovelAI 请求，渲染进程不直接持有 Token；凭据与设置保存在本机配置中。
- 生成会将提示词与所需参考图片发送给 NovelAI；使用反推、转换或酒馆时，相应输入会发送到你配置的模型服务。在线画廊、参考目录和 Tag/MCP 服务各自访问对应数据源。
- 原数据读取在本地完成，不调用生图接口、不消耗 Anlas；部分离线词库和已保存的参考预设也可离线查看。**离线查看不代表离线生图。**
- 提交 Issue 前请移除 Token、API Key、私人对话与敏感图片。

<a id="development"></a>
## 给开发者

桌面端：Electron + React + TypeScript。移动端：Flutter。

[源码运行与构建](./docs/guide/DEVELOPMENT.md) · [贡献指南](./CONTRIBUTING.md) · [第三方声明](./THIRD_PARTY_NOTICES.md) · [MIT 代码许可证](./LICENSE)

<a id="community"></a>
## 交流与反馈

[提交问题](https://github.com/OldLi1337/novelai-image-desktop/issues/new) · [查看已有问题](https://github.com/OldLi1337/novelai-image-desktop/issues)

NovelAI 交流群：**921985070**。欢迎交流软件使用、提示词和创作经验。

<details>
<summary>展开 QQ 群二维码</summary>

<img src="./docs/assets/qq-group-921985070.jpg" width="280" alt="NovelAI 交流群二维码，群号 921985070" />

</details>

---

看板娘为《原神》角色芙宁娜，宣传图为 AI 生成的非官方同人视觉，与 HoYoverse / NovelAI 无官方合作或背书关系。项目代码的 MIT 许可不授予第三方角色、商标或素材权利。配图说明见[视觉素材记录](./docs/assets/readme/ASSETS.md)。
