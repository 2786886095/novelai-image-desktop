# NovelAI Studio

中文 API-only NovelAI 图像生成桌面客户端。程序不再使用网页登录、Cookie、DOM 点击或 Chrome CDP，所有 NovelAI 图像能力均通过 Electron 主进程调用官方 API，渲染进程不直接持有 Token。

## 当前版本范围

- Splash 启动画面与 5 步首次使用引导。
- API Token 验证、本地保存、账号套餐与 Anlas 余额读取。
- 文生图：模型、风格词、正面/负面提示词、尺寸、Seed、Steps、CFG Scale、采样器、UC Preset、Quality Toggle、SMEA、Variety+。
- 图生图：加载 PNG/JPG/WebP 基图，支持 Strength、Noise、Extra Noise Seed，使用 NovelAI `img2img` 动作。
- 全局控制：Vibe Transfer / 精确参考图片、多角色提示词与坐标。
- 局部重绘：加载原图，在内置画布绘制白色重绘区域/黑色保留区域，调用 NovelAI `infill` 动作。
- 云端超分：对工作台图片执行 2x / 4x 放大，结果保存为 PNG。
- Director Tools 后期：移除背景、线稿、草图、上色、表情迁移、去除杂乱。
- Prompt 标签自动补全：输入英文单词时自动推测可能的 Danbooru / NovelAI tag；优先使用 NovelAI suggest-tags 接口，未配置 Token 或网络失败时使用内置常用 tag 兜底。
- AI 反推：上传图片，通过用户配置的视觉模型 API 反推 Danbooru 标签 / 自然语言 / 混合提示词。
- 提示词转换：把中文或自然语言描述转换为 NovelAI 适用的英文 Danbooru 标签。
- 历史记录：按日期查看、定位文件、删除记录；点击历史图会同步加载到工作台，可直接用于图生图、重绘、超分和后期。
- 设置弹窗：API 配置、存储、AI 反推、提示词模板、外观、性能。

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

打包后会生成：

```text
release\NovelAI-Image-Desktop.exe
```

也可以双击：

```text
启动程序.bat
```

## 使用流程

1. 首次启动显示 Splash 和 5 步引导。
2. 在引导或“设置 > API 配置”中粘贴 NovelAI Persistent API Token。
3. 如需 AI 反推 / 中文转标签，在“设置 > AI 反推”中配置 OpenAI 兼容视觉模型接口。
4. 在左侧填写提示词与参数，或添加 Vibe / 精确参考 / 角色提示词。
5. 在顶部切换“生成 / 重绘 / 超分 / 后期 / 反推 / 转换”。
6. 图生图、局部重绘、超分和后期都可从本地加载图片，也可点击右侧历史图片自动加载到工作台。
7. 成功后图片显示在中央画布，并自动保存到输出目录与右侧历史。

## 安全说明

- API Token 只保存在本机 Electron 用户数据目录内。
- 渲染进程不直接持有 Token；所有 API 请求都在主进程执行。
- 当前版本不硬算 Anlas 成本，扣费以 NovelAI 官方 API 结果和账户余额为准。

## 关键文件

- `electron/main.ts`：Electron 窗口与 IPC 注册。
- `electron/ipc/nai.ts`：NovelAI Token 验证、图像 API、标签补全、AI 反推和提示词转换。
- `electron/ipc/store.ts`：本地设置、Token 摘要、历史索引存储。
- `electron/ipc/storage.ts`：历史删除、目录选择、资源管理器打开。
- `electron/preload.ts`：安全暴露 `window.naiDesktop`。
- `src/App.tsx`：浅色三栏 UI、Splash、引导、设置、历史、反推、转换。
- `src/InpaintCanvas.tsx`：局部重绘蒙版画布。
- `src/store.ts`：Zustand 前端状态。
- `src/types.ts`：共享类型和默认参数。
