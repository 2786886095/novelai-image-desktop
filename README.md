# Langbai NovelAI Studio

[![Build](https://github.com/2786886095/novelai-image-desktop/actions/workflows/build.yml/badge.svg)](https://github.com/2786886095/novelai-image-desktop/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20%7C%20iOS-7c5cfa.svg)](#下载)

中文 **API-only** NovelAI 图像创作桌面客户端（Electron + React + TypeScript），附带 Flutter 移动端。

程序不使用网页登录、Cookie、DOM 点击或 Chrome CDP。NovelAI 图像能力均通过 Electron 主进程调用官方 API，渲染进程不直接持有 Token。

## 下载

- **正式版**：[Releases](https://github.com/2786886095/novelai-image-desktop/releases)（桌面 + APK + 未签名 IPA）
- **每次构建**：[Actions](https://github.com/2786886095/novelai-image-desktop/actions) 的产物（Win 便携版 EXE、macOS 通用 DMG/ZIP、Linux AppImage、Android APK、未签名 IPA）

> macOS 包未签名，首次打开需右键 → 打开；iOS 为未签名 IPA，需自行侧载（无 Apple 开发者证书）。

## 当前能力

- API Token 验证、本地保存、账号套餐与 Anlas 余额读取。
- 账户余额可在生成面板点击“刷新积分”主动同步。
- 文生图：模型、风格词、正/负面提示词、尺寸、Seed、Steps、CFG、采样器、UC Preset、Quality Toggle、SMEA、Variety+。
- 图生图：加载 PNG/JPG/WebP 基图，支持 Strength、Noise、Extra Noise Seed。
- Vibe Transfer / 精确参考、多角色提示词与角色坐标。
- 局部重绘：内置蒙版画布，调用 NovelAI `infill`。
- 云端超分：2x / 4x。
- Director Tools：移除背景、线稿、草图、上色、表情迁移、去杂乱。
- Tag 自动补全：输入英文单词时自动推测 Danbooru / NovelAI tag；无 Token 或网络失败时使用本地高频词库兜底。
- 灵感胶囊：显示 tag 与中文含义，可输入中文大概意思匹配候选 tag。
- Tag/MCP 服务：可配置 HTTP Tag 服务或 MCP HTTP 网关，用于补强自动补全、AI 反推和中文转换。
- 动态灵感胶囊：可随机换一组提示词灵感。
- AI 反推：使用独立视觉模型 API。
- 提示词转换：使用独立文本模型 API，与反推接口分离。
- 历史与素材：按日期和分组筛选，可新建 / 重命名 / 删除分组、给图片分组、一键将分组打包为 ZIP 导出。
- 图片命名模板：保存与导出文件名支持 `{date} {time} {seq} {seed} {model}` 等占位符。
- 动态提示词通配符：`{red|blue|green} hair` 批量时每张随机取一项，不影响 NovelAI 的 `{tag}` 权重语法。
- 锁种变体：一键载入某图的全部参数并锁定其种子，改一个 tag 即可生成同种子变体。
- 生成队列：批量抗失败（单张失败自动重试后跳过继续）、可暂停 / 继续，并显示**实扣 Anlas**（账户余额差值）。
- 灵感胶囊相关推荐：根据已输入的 tag 推荐常一起使用的同现 tag。
- 成本提示：各功能显示预计 Anlas 消耗、当前余额和余额不足提示；实际扣费以 NovelAI 账户余额变化为准。

## 运行

```powershell
npm install
npm run dev
```

## 构建

```powershell
npm run typecheck
npm run build
npm run pack
```

打包后主要产物：

```text
release\Langbai-NovelAI-Studio.exe
```

兼容旧启动脚本的别名仍会生成：

```text
release\NovelAI-Image-Desktop.exe
```

也可以双击：

```text
启动程序.bat
```

## 使用流程

1. 首次启动进入引导。
2. 在“设置 > API 配置”粘贴 NovelAI Persistent API Token。
3. 如需图片反推，在“设置 > AI 反推”配置视觉模型 API，并可点击“检测反推接口模型”。
4. 如需中文转 tag，在“设置 > 转换 API”配置文本模型 API，并可点击“检测转换接口模型”。
5. 如需更强的 Danbooru tag 检索，在“设置 > 提示词/补全”启用 Tag/MCP 服务并检测。
6. 在左侧填写提示词和参数；顶部切换生成、重绘、超分、后期、反推、转换。
7. 生成结果会自动保存到输出目录，并进入右侧历史与素材库。
8. 可在历史面板创建分组、筛选分组、给单张图片分配分组。

## 安全说明

- NovelAI Token 只保存在本机 Electron 用户数据目录。
- 渲染进程不直接持有 Token。
- AI 反推和转换 API Key 也保存在本机配置文件中。
- 成本为本地估算；实际扣费以 NovelAI 官方 API 与账户余额为准。

## 关键文件

- `electron/main.ts`：Electron 窗口与 IPC 注册。
- `electron/ipc/nai.ts`：NovelAI API、AI 反推、提示词转换、模型检测。
- `electron/ipc/store.ts`：本地设置、Token 摘要、历史索引、素材分组。
- `electron/ipc/storage.ts`：历史删除、目录选择、分组操作。
- `electron/preload.ts`：安全暴露 `window.naiDesktop`。
- `src/App.tsx`：主 UI、设置、历史、反推、转换。
- `src/components/ui.tsx`：共享 UI 基础组件。
- `src/prompt-data.ts`：标签分类与灵感胶囊词条。
- `src/wildcards.ts` / `src/related-tags.ts` / `src/png-meta.ts` / `src/anlas.ts`：纯逻辑模块（均带单元测试）。
- `electron/data/tag-dictionary.ts`：中文 → Danbooru 离线词库。
- `src/InpaintCanvas.tsx`：局部重绘蒙版画布。
- `src/store.ts`：Zustand 前端状态（生成队列、暂停、Anlas）。
- `src/types.ts`：共享类型和默认参数。

## 开发与测试

```powershell
npm run dev        # 渲染层 + Electron（开发模式）
npm run typecheck  # 类型检查
npm test           # vitest 单元测试
```

CI 会对 Windows / macOS / Linux 三平台跑类型检查、单元测试与打包。

## 移动端

`mobile/` 是 Flutter (Dart) 编写的 Android / iOS 客户端（Phase 1：Token 配置 + 文生图 + 图库）。详见 [`mobile/README.md`](./mobile/README.md)。

## 贡献

欢迎 PR / issue，请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。本项目基于 [MIT 许可](./LICENSE)。
