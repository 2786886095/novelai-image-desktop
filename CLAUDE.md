# NovelAI Image Desktop — 重构规划文档 v3（终稿）

> 本文档基于 **NAI-Utility-Tool 实际截图**制定，由 Claude 设计，供 Codex 实现。
> 截图来自用户提供，显示了该工具的真实 UI 风格和功能布局。

---

## 参考依据（截图分析）

从用户提供的四张截图可知：

1. **Splash 页面**：全屏动漫插画（女仆+知更鸟），右侧显示 "NAI / Utility / Tool" 大标题 + 彩色分隔线 + 版本号
2. **引导页（5步）**：覆盖式 Modal，左侧小卡片含动漫角色，右侧为设置内容；第一步选择语言
3. **主界面（生成页）**：
   - 顶部：原生菜单栏（文件/编辑/工具/视图/设置/帮助）+ 功能标签页（生成/重绘/超分/后期/检视）
   - **左侧窄面板**（约280px）：模型选择 + 风格提示词 + 正负面提示词tabs + 角色/氛围/精确参考按钮 + 尺寸 + 种子 + Variety+ + 高级参数
   - **中央大画布**：白色区域，"点击生成开始" 占位文字
   - **右侧历史面板**：按日期选择历史记录
4. **设置（弹窗）**：白色对话框，左侧分类导航（使用/网络API/本地储存/性能/外观/语言/开发者），右侧 Toggle 卡片列表

---

## 核心 UI 风格修正（与之前规划的最大差异）

| 项目 | 之前错误设计 | 根据截图的正确设计 |
|---|---|---|
| 主题 | 深色紫色主题 | **浅色主题（Windows风格灰白蓝）** |
| 主色 | `#7c5cbf` 紫色 | `#1565c0` 或 `#0078d4` 蓝色 |
| 背景 | `#0f0f13` 深黑 | `#f5f5f5` 浅灰 |
| 布局 | 三栏（左提示词/中预览/右参数） | **左窄面板 + 中央大画布 + 右历史面板** |
| 导航 | 侧边图标栏 | **顶部菜单栏 + 功能标签页** |
| 设置 | 独立页面 | **弹窗 Modal（分类侧边导航）** |
| 历史 | 独立图库页面 | **右侧历史面板（按日期）** |
| 引导 | 3步 | **5步，含动漫角色插图** |
| Splash | Logo动画 | **全屏动漫插画 + 右侧标题** |

---

## 技术栈

| 层级 | 选型 |
|---|---|
| 框架 | Electron 42 + React 19 + TypeScript |
| 构建 | Vite 8 + concurrently |
| 样式 | Tailwind CSS v4（浅色主题） |
| 状态 | Zustand 5 |
| 持久化 | electron-store 10（主进程） |
| NAI API | axios（主进程直接调用，不用三方SDK） |
| 图片解压 | jszip |
| 工具 | clsx, date-fns |

---

## 依赖

```json
{
  "dependencies": {
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "zustand": "^5.0.0",
    "electron-store": "^10.0.0",
    "jszip": "^3.10.1",
    "axios": "^1.8.0",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.0.0",
    "concurrently": "^10.0.0",
    "cross-env": "^10.0.0",
    "electron": "^42.4.0",
    "electron-builder": "^26.0.0",
    "typescript": "^6.0.0",
    "vite": "^8.0.0",
    "wait-on": "^9.0.0"
  }
}
```

---

## 目录结构

```
novelai-image-desktop/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/
│       ├── nai.ts          # API 调用（verify + generate）
│       ├── storage.ts      # 图片存储 + 历史读取
│       └── settings.ts     # electron-store 封装
├── src/
│   ├── main.tsx
│   ├── App.tsx             # 顶层：Splash → Onboarding → Main
│   ├── styles.css
│   ├── assets/
│   │   └── splash.png      # 动漫插画（女仆角色，或用SVG占位）
│   ├── types/
│   │   ├── nai.ts
│   │   ├── app.ts
│   │   └── ipc.ts
│   ├── store/
│   │   ├── useAppStore.ts
│   │   ├── useGenStore.ts
│   │   └── useHistoryStore.ts
│   ├── pages/
│   │   ├── SplashPage.tsx
│   │   └── MainPage.tsx    # 登录后的主窗口
│   ├── components/
│   │   ├── onboarding/
│   │   │   └── OnboardingWizard.tsx   # 5步引导
│   │   ├── shell/
│   │   │   ├── TitleBar.tsx           # 自定义标题栏（无边框）
│   │   │   ├── MenuBar.tsx            # 文件/编辑/工具/视图/设置/帮助
│   │   │   ├── TabBar.tsx             # 生成/重绘/超分/后期/检视
│   │   │   ├── LeftPanel.tsx          # 左侧控制面板容器
│   │   │   ├── Canvas.tsx             # 中央画布区域
│   │   │   └── HistoryPanel.tsx       # 右侧历史面板
│   │   ├── generate/
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── PromptTabs.tsx         # 正面/负面词 Tab切换
│   │   │   ├── StylePromptInput.tsx   # 风格提示词单行输入
│   │   │   ├── PromptTextarea.tsx     # 主提示词大文本框（含权重高亮/抽卡器）
│   │   │   ├── ActionButtons.tsx      # 添加角色/氛围迁移/精确参考
│   │   │   ├── SizeInputs.tsx         # 尺寸数字输入
│   │   │   ├── SeedInput.tsx          # 种子输入+随机+复用
│   │   │   ├── VarietyToggle.tsx      # 多样化 Variety+
│   │   │   ├── AdvancedParamsModal.tsx # 高级参数弹窗
│   │   │   └── GenerateButton.tsx
│   │   ├── settings/
│   │   │   └── SettingsModal.tsx      # 设置弹窗（分类导航+Toggle卡片）
│   │   ├── history/
│   │   │   ├── DatePicker.tsx
│   │   │   └── HistoryGrid.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       ├── Toggle.tsx
│   │       ├── Slider.tsx
│   │       ├── Modal.tsx
│   │       └── Toast.tsx
├── public/
│   └── icon.png
├── scripts/
│   ├── cleanup-portable-release.mjs
│   └── copy-ascii-release.mjs
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.electron.json
```

---

## CSS / 颜色规范（浅色主题）

```css
/* src/styles.css */
@import "tailwindcss";

:root {
  /* 背景层 */
  --bg-window:   #f0f0f0;   /* 窗口底色（Windows灰） */
  --bg-panel:    #f5f5f5;   /* 左侧面板背景 */
  --bg-canvas:   #ffffff;   /* 中央画布背景 */
  --bg-dialog:   #ffffff;   /* 弹窗背景 */
  --bg-hover:    #e8e8e8;   /* hover 背景 */
  --bg-selected: #dce6f5;   /* 选中状态背景 */

  /* 边框 */
  --border:      #d0d0d0;
  --border-focus:#1565c0;

  /* 主色（蓝色，参考截图按钮颜色） */
  --accent:      #1565c0;
  --accent-hover:#1976d2;
  --accent-text: #ffffff;

  /* 文字 */
  --text-primary:   #1a1a1a;
  --text-secondary: #5a5a5a;
  --text-muted:     #9a9a9a;
  --text-disabled:  #c0c0c0;

  /* 状态 */
  --success: #2e7d32;
  --error:   #c62828;
  --warning: #e65100;
  --info:    #0277bd;

  /* Tab 激活 */
  --tab-active-bg:     #ffffff;
  --tab-active-border: #1565c0;
  --tab-inactive:      #6a6a6a;
}

body {
  background: var(--bg-window);
  color: var(--text-primary);
  font-family: 'Microsoft YaHei UI', 'Segoe UI', 'Noto Sans SC', sans-serif;
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

/* 允许文本选中区域 */
textarea, input[type="text"], input[type="number"] {
  user-select: text;
}
```

---

## 页面 1：SplashPage.tsx（全屏插画）

**参考截图 2**，实现全屏 Splash：

```
布局：flex-row，高度 100vh
左侧（55%）：
  动漫插画图片（src/assets/splash.png）
  object-fit: cover，撑满左侧

右侧（45%）：
  背景：纯白 #ffffff
  垂直居中对齐，padding 60px

  文字布局：
    "NAI"     font-size: 96px, font-weight: 900, color: #d0d0d0, line-height: 1
    "Utility" font-size: 96px, font-weight: 900, color: #d0d0d0, line-height: 1
    "Tool"    font-size: 96px, font-weight: 900, color: #d0d0d0, line-height: 1

  彩色分隔线（截图中的彩虹渐变横线）：
    height: 3px
    background: linear-gradient(to right, #ff4444, #ff8800, #ffcc00, #44aa44, #0088ff, #8844ff)
    margin: 20px 0

  版本信息（右对齐）：
    "Version x.x.x"
    "An open-source NovelAI frontend"

动画：
  - 右侧内容淡入（opacity 0→1, 0.8s）
  - Splash 显示 2.5s 后自动 fade out

并发逻辑：
  - Splash 显示期间检查 naiDesktop.hasToken()
  - 动画结束后：
    - 无 token → MainPage（未登录状态，显示引导/登录流程）
    - 有 token → 验证后跳转 MainPage（已登录状态）

注意：splash.png 如不存在，用 CSS 渐变或SVG占位图代替
```

---

## 页面 2：OnboardingWizard.tsx（5步引导）

**参考截图 1**，实现 5 步引导覆盖 Modal。

**触发条件**：MainPage 首次加载且无 `settings.hasOnboarded`

**整体布局**（Modal，宽度 880px，高度 560px）：

```
顶部：
  左侧：5个步骤圆点（当前蓝色填充，其余灰色空心）
  右侧：[跳过向导] 文字按钮

主体（flex-row）：
  左侧卡片（280px，白色圆角卡片，淡蓝色渐变背景）：
    顶部：左"NAI Utility Tool" 右"第 N/5 步"（小字badge）
    中间：动漫角色插图（固定高度320px）
    底部：当前步骤的短标签（如"欢迎"）

  右侧内容区（flex:1，padding 40px）：
    每步的标题 + 说明 + 交互控件

底部：
  右侧：[下一步] 蓝色按钮（最后一步变为 [完成]）
        前几步额外有 [上一步] ghost按钮
```

**5步内容**：

```
Step 1 — 设置用户语言
  标题：🌐 设置用户语言
  说明：已根据系统语言检测为 简体中文。您也可以自行选择其他语言。
  控件：Select 下拉（简体中文 / English / 日本語）

Step 2 — 设置 API
  标题：🔑 配置 NovelAI API Token
  说明：在 NovelAI 账户设置中获取 Persistent API Token。Token 格式为 pst-...
  控件：
    Token 输入框（password类型，可切换显示）
    [如何获取 Token？] 外链
    [验证并保存] 按钮
  验证成功后：按钮变绿 ✓ 已验证

Step 3 — 选择保存目录
  标题：📁 选择图片保存位置
  说明：生成的图片将保存到此目录。
  控件：
    路径显示框 + [浏览...] 按钮

Step 4 — 了解界面
  标题：🖼️ 界面简介
  说明：三栏布局介绍（静态示意图或文字说明）
    · 左侧面板：提示词和生成参数
    · 中央画布：图片预览区域
    · 右侧面板：历史记录

Step 5 — 完成
  标题：🎉 一切就绪！
  说明：您可以随时在"设置"中修改这些配置。
  控件：[开始使用] 按钮
```

---

## 主页面：MainPage.tsx

主窗口由以下部分组成（从上到下，从左到右）：

```
┌──────────────────────────────────────────────────────┐
│ TitleBar（36px）：拖拽区 + [_ □ ×]                    │
├──────────────────────────────────────────────────────┤
│ MenuBar（28px）：文件 编辑 工具 视图 设置 帮助           │
├──────────────────────────────────────────────────────┤
│ TabBar（36px）：[生成✓] [重绘] [超分] [后期] [检视]     │
├──────────┬───────────────────────────┬───────────────┤
│ 左侧面板  │       中央画布             │  右侧历史面板  │
│ 280px    │       flex:1              │   200px       │
│          │                           │               │
│ [各控件]  │   [图片预览/占位]          │  历史记录      │
│          │                           │  按日期浏览    │
│          │   [底部工具栏]             │               │
│          │                           │               │
│ [生成按钮]│                           │               │
└──────────┴───────────────────────────┴───────────────┘
│ 状态栏（22px）：就绪 / 生成中... / 错误信息             │
└──────────────────────────────────────────────────────┘
```

---

## 左侧面板详细（LeftPanel.tsx + 子组件）

```tsx
// 背景：var(--bg-panel)，1px 右边框
// 内部垂直排列，overflow-y: auto，padding 8px

// ① ModelSelector.tsx
// label: "模型"（小字）
// Select 下拉（全宽），选项：
//   nai-diffusion-4-5-full（截图默认值）
//   nai-diffusion-4-5
//   nai-diffusion-4-5-curated
//   nai-diffusion-4
//   nai-diffusion-3
//   nai-diffusion-furry-3

// ② PromptTabs.tsx
// [正面提示词][负面提示词] tab + [□复制] 图标按钮
// 正面词激活时显示正面词输入区域
// 负面词激活时显示负面词输入区域

// ③ StylePromptInput.tsx（在 PromptTabs 上方）
// 单行 input，placeholder: "输入风格提示词..."
// 对应 NAI 的 style prompt / 前缀

// ④ PromptTextarea.tsx
// 多行 textarea，高度约 200px，可调整
// placeholder: "输入正面提示词..." 或 "输入负面提示词..."（依tab）
// 功能（可按设置开关）：
//   - 权重高亮：{word:1.2} 高亮显示权重语法（用 contenteditable div 实现）
//   - 自动补全：输入时显示 danbooru tag 补全下拉
//   - 抽卡器：textarea 内或旁边显示"抽卡器"展开区

// ⑤ ActionButtons.tsx
// 三个小按钮（文字+图标，secondary style）：
// [⊙ 添加角色] → 弹出角色设置 Modal
// [⊡ 氛围迁移] → 展开氛围迁移（Vibe Transfer）面板
// [⊕ 精确参考] → 展开精确参考（Reference Image/ControlNet）面板

// ⑥ SizeInputs.tsx
// label: "尺寸"
// [832] × [1216] 数字输入框（上下箭头）
// 下方有预设尺寸快速选择（可选）

// ⑦ SeedInput.tsx
// label: "种子 (0 = 随机)"
// 数字输入框 + [⇄ 随机] 图标 + [↩ 复用] 图标
// 0 表示随机（区别于之前设计的-1）

// ⑧ VarietyToggle.tsx
// ☐ 多样化 (Variety+) checkbox + 说明tooltip

// ⑨ AdvancedParamsBtn
// [⚙ 高级参数...] ghost按钮，点击打开 AdvancedParamsModal

// ⑩ GenerateButton.tsx（面板底部，固定）
// 未设置API时：[🌐 请先设置API]（蓝色，disabled样式，点击→弹出API设置）
// 已设置API空闲：[▶ 生成]（蓝色，全宽，Ctrl+Enter）
// 生成中：[⏹ 停止]（红色）
```

---

## 中央画布（Canvas.tsx）

```tsx
// 背景：var(--bg-canvas) 白色
// 内容：
//   无图时：居中灰色文字 "点击生成开始"
//   生成中：进度条（顶部细条）+ 中间旋转动画
//   有图时：img 标签 object-fit:contain
//           生成完成后显示底部浮动工具条（可按设置关闭）：
//             [💾 保存] [📋 复制] [♻️ 重新生成] [🔍 放大] [📌 钉住]

// 底部工具悬浮条（FloatingToolbar.tsx）：
//   透明背景，图片底部对齐显示
//   hover 时完全显示，否则半透明

// SuperDrop（拖拽处理）：
//   监听 ondrop 事件
//   拖入图片时弹出选择：[用作重绘底图] [用作氛围迁移] [用作精确参考]
```

---

## 右侧历史面板（HistoryPanel.tsx）

```tsx
// 背景：var(--bg-panel)，1px 左边框
// 标题："历史记录"（加粗小字）
// 日期选择：Select 下拉（"选择日期"，列出有历史记录的日期）
// 图片网格：2列缩略图，点击在画布显示
// 空状态："暂无历史记录"
// 每张缩略图：
//   hover 显示 [×删除] 按钮
//   右键菜单：在画布中显示 / 复制参数 / 在资源管理器打开 / 删除
```

---

## 功能标签页（TabBar.tsx）

```tsx
// tabs: 生成 / 重绘 / 超分 / 后期 / 检视
// 激活状态：白色背景 + 底部蓝色 2px 线 + 黑色文字
// 非激活：灰色文字，hover 浅灰背景

// 各 Tab 的左侧面板内容：
// 生成：上述完整左面板
// 重绘（Inpainting）：
//   - 上传底图区域
//   - 蒙版编辑工具（简单版：选择蒙版 or 自动蒙版）
//   - Inpaint 参数
//   - 提示词（同生成）
// 超分（Upscale）：
//   - 上传图片
//   - 放大倍数（2x/4x）
//   - 去噪强度
// 后期（Post-process）：
//   - 上传图片
//   - Director Tools：[情感] [线稿提取] [上色]
// 检视（Inspect）：
//   - 上传/拖入图片
//   - 读取 NAI 图片 metadata（如有嵌入）
//   - 显示生成参数

// 注意：v1 优先实现"生成"Tab，其余 Tab 可以显示"即将推出"
```

---

## 菜单栏（MenuBar.tsx）

```tsx
// 原生风格下拉菜单（不用系统菜单）
// 样式：背景 var(--bg-window)，高度 28px，font-size 12px

文件：
  新建会话    Ctrl+N
  ─────
  保存图片    Ctrl+S
  批量导出...
  ─────
  退出        Alt+F4

编辑：
  复制提示词
  粘贴提示词
  清空提示词
  ─────
  撤销        Ctrl+Z
  重做        Ctrl+Y

工具：
  Token 计算器
  Tag 搜索
  批量生成...
  ─────
  打开输出目录
  清理历史记录

视图：
  显示历史面板  ✓
  显示状态栏   ✓
  ─────
  放大         Ctrl++
  缩小         Ctrl+-
  重置缩放     Ctrl+0

设置：
  打开设置     Ctrl+,
  ─────
  API 配置
  退出登录

帮助：
  使用文档（外链）
  检查更新
  ─────
  关于
```

---

## 设置弹窗（SettingsModal.tsx）

**参考截图 3**：

```
布局：全屏覆盖Modal，白色对话框，宽度 800px，高度 600px

标题栏："设置"

左侧导航（200px）：
  每项：图标 + 文字，点击高亮（蓝色左边框）
  - ⚙ 使用
  - 🌐 网络/API
  - 🗂 本地储存
  - ⚡ 性能
  - 🎨 外观
  - 🌍 语言
  - 👨‍💻 开发者选项

右侧内容：各分类的 Toggle 卡片列表

卡片样式：
  白色圆角卡片，flex-row
  左侧：图标（24px）+ 标题（加粗）+ 描述（小字灰色）
  右侧：Toggle 开关（蓝色激活）

底部："关闭" 按钮（蓝色，居中）

分类内容：

【使用】
  权重高亮        在提示词编辑区域高亮显示权重语法。                默认：开
  启用自动补全    输入提示词时自动显示标签补全候选。                默认：开
  启用抽卡器      在正面、负面和角色提示词中启用抽卡器展开。        默认：开
  使用 SuperDrop  将图片拖入窗口后可以指定工作区以及处理方式。     默认：开
  生图完成后显示工具悬浮条  在生图工作区内，生图完成后在画布区域显示悬浮工具条。  默认：开
  生成后历史记录回顶        生成图片保存后，自动切换历史记录到对应日期，并回到最新项目顶部。  默认：开
  新图片删除保护  刚接收到新图片后的1秒内，阻止预览、历史记录和Delete键删除该图片。  默认：开

【网络/API】
  API Endpoint    https://image.novelai.net  （可修改）
  Token 输入框（可查看/修改）
  [验证 Token] 按钮
  代理设置（可选）

【本地储存】
  输出目录        路径 + [浏览]
  子目录模式      [扁平] [按日期] [按模型]
  历史记录保留天数  30天（数字输入）
  [打开输出目录] 按钮
  [清理历史记录] 危险按钮

【性能】
  并发生成数量    1（数字，暂时固定为1）
  历史缩略图分辨率  [低] [中] [高]

【外观】
  主题            [浅色] [深色] [跟随系统]（v1仅实现浅色）
  语言            （同引导步骤1的选择）
  字体大小        [小] [中] [大]

【语言】
  语言下拉选择

【开发者选项】
  显示调试日志  Toggle
  开发者工具    [打开DevTools] 按钮
  API 日志      Toggle
  重置所有设置  危险按钮
```

---

## 高级参数弹窗（AdvancedParamsModal.tsx）

```
标题："高级参数"
宽度：560px

内容（两列布局）：

左列：
  Steps（采样步数）        Slider 1-50，default 28
  CFG Scale（提示词引导）  Slider 1.0-10.0，step 0.1，default 6.0
  Sampler（采样器）        Select
    k_euler_ancestral（Euler Ancestral，推荐）
    k_euler
    k_dpmpp_2m
    k_dpmpp_2m_sde
    k_dpmpp_sde
    k_dpmpp_2s_ancestral
    ddim_v3

右列：
  SMEA                 Toggle（V3/V4/V4.5支持）
  SMEA DYN             Toggle（SMEA开启时可用）
  Quality Toggle       Toggle（自动添加质量词）
  UC Preset            4按钮：Heavy / Light / Human / None

底部：
  [重置为默认] ghost按钮  [确认] 蓝色按钮
```

---

## NAI API 实现（electron/ipc/nai.ts）

```typescript
import axios from 'axios'
import JSZip from 'jszip'
import path from 'path'
import fs from 'fs'

const NAI_API = 'https://api.novelai.net'
const NAI_IMG = 'https://image.novelai.net'

// Token 验证（调用订阅接口）
export async function verifyToken(token: string) {
  const res = await axios.get(`${NAI_API}/user/subscription`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  })
  return { valid: true, tier: res.data?.tier ?? 'unknown' }
}

// 生成图片
export async function generateImage(
  token: string,
  params: GenerateParams,
  signal?: AbortSignal
): Promise<{ buffers: Buffer[]; actualSeed: number }> {
  const actualSeed = params.seed === 0
    ? Math.floor(Math.random() * 2 ** 32)
    : params.seed

  // 构建 prompt（带质量词）
  let positivePrompt = params.stylePrompt
    ? `${params.stylePrompt}, ${params.positivePrompt}`
    : params.positivePrompt
  
  if (params.qualityToggle) {
    positivePrompt = `best quality, amazing quality, very aesthetic, absurdres, ${positivePrompt}`
  }

  const body = {
    input: positivePrompt,
    model: params.model,
    action: 'generate',
    parameters: {
      params_version: 3,
      width: params.width,
      height: params.height,
      scale: params.cfgScale,
      sampler: params.sampler,
      steps: params.steps,
      seed: actualSeed,
      n_samples: 1,
      ucPreset: params.ucPreset,
      qualityToggle: false,  // 已手动处理
      sm: params.smea,
      sm_dyn: params.smea && params.smeaDyn,
      negative_prompt: params.negativePrompt,
      add_original_image: false,
      variety: params.variety ?? false,
    },
  }

  const res = await axios.post(`${NAI_IMG}/ai/generate-image`, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    responseType: 'arraybuffer',
    signal,
    timeout: 120000,
  })

  const zip = await JSZip.loadAsync(res.data as ArrayBuffer)
  const buffers: Buffer[] = []
  for (const [, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      buffers.push(await file.async('nodebuffer'))
    }
  }
  return { buffers, actualSeed }
}
```

---

## 类型定义（src/types/nai.ts）

```typescript
export const NAI_MODELS = [
  { label: 'NAI Diffusion 4.5 Full',    value: 'nai-diffusion-4-5-full' },
  { label: 'NAI Diffusion 4.5',         value: 'nai-diffusion-4-5' },
  { label: 'NAI Diffusion 4.5 Curated', value: 'nai-diffusion-4-5-curated' },
  { label: 'NAI Diffusion 4',           value: 'nai-diffusion-4' },
  { label: 'NAI Diffusion 3',           value: 'nai-diffusion-3' },
  { label: 'NAI Diffusion Furry 3',     value: 'nai-diffusion-furry-3' },
] as const

export type NAIModel = typeof NAI_MODELS[number]['value']

export const NAI_SAMPLERS = [
  { label: 'Euler Ancestral',     value: 'k_euler_ancestral' },
  { label: 'Euler',               value: 'k_euler' },
  { label: 'DPM++ 2M',            value: 'k_dpmpp_2m' },
  { label: 'DPM++ 2M SDE',        value: 'k_dpmpp_2m_sde' },
  { label: 'DPM++ SDE',           value: 'k_dpmpp_sde' },
  { label: 'DPM++ 2S Ancestral',  value: 'k_dpmpp_2s_ancestral' },
  { label: 'DDIM',                value: 'ddim_v3' },
] as const

export type NAISampler = typeof NAI_SAMPLERS[number]['value']

export interface GenerateParams {
  model: NAIModel
  stylePrompt: string         // 风格提示词（单行）
  positivePrompt: string
  negativePrompt: string
  width: number
  height: number
  steps: number
  cfgScale: number
  sampler: NAISampler
  seed: number                // 0 = 随机
  ucPreset: 0 | 1 | 2 | 3    // Heavy/Light/Human/None
  qualityToggle: boolean
  smea: boolean
  smeaDyn: boolean
  variety: boolean            // Variety+/多样化
}

export const DEFAULT_PARAMS: GenerateParams = {
  model: 'nai-diffusion-4-5-full',
  stylePrompt: '',
  positivePrompt: '',
  negativePrompt: '',
  width: 832,
  height: 1216,
  steps: 28,
  cfgScale: 6,
  sampler: 'k_euler_ancestral',
  seed: 0,
  ucPreset: 0,
  qualityToggle: true,
  smea: false,
  smeaDyn: false,
  variety: false,
}

export interface HistoryItem {
  id: string
  filePath: string
  thumbPath: string
  date: string          // 'yyyy-MM-dd'
  createdAt: string
  params: GenerateParams
  actualSeed: number
}
```

---

## Preload（electron/preload.ts）

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('naiDesktop', {
  // Auth
  hasToken:    ()               => ipcRenderer.invoke('nai:hasToken'),
  verifyToken: (t: string)      => ipcRenderer.invoke('nai:verify', t),
  clearToken:  ()               => ipcRenderer.invoke('nai:clearToken'),

  // Generate
  generate: (params: unknown)   => ipcRenderer.invoke('nai:generate', params),
  cancel:   ()                  => ipcRenderer.invoke('nai:cancel'),

  // History / Storage
  getHistory:      (date?: string)      => ipcRenderer.invoke('storage:getHistory', date),
  getHistoryDates: ()                   => ipcRenderer.invoke('storage:getHistoryDates'),
  deleteHistory:   (id: string)         => ipcRenderer.invoke('storage:delete', id),
  openInExplorer:  (path: string)       => ipcRenderer.invoke('storage:open', path),
  selectOutputDir: ()                   => ipcRenderer.invoke('storage:selectDir'),

  // Settings
  getSetting:  (key: string)            => ipcRenderer.invoke('settings:get', key),
  setSetting:  (key: string, v: unknown)=> ipcRenderer.invoke('settings:set', key, v),
  isFirstRun:  ()                       => ipcRenderer.invoke('settings:isFirstRun'),
  completeSetup: ()                     => ipcRenderer.invoke('settings:completeSetup'),

  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close:    () => ipcRenderer.invoke('window:close'),
  openExternal: (url: string) => ipcRenderer.invoke('window:openExternal', url),
})
```

---

## 状态管理

### useAppStore.ts

```typescript
type AppPage = 'splash' | 'main'

interface AppStore {
  page: AppPage
  isLoggedIn: boolean
  showOnboarding: boolean
  toasts: Toast[]
  
  navigate:       (p: AppPage) => void
  setLoggedIn:    (v: boolean) => void
  setOnboarding:  (v: boolean) => void
  toast: (type: 'success'|'error'|'info'|'warning', msg: string) => void
}
```

### useGenStore.ts

```typescript
interface GenStore extends GenerateParams {
  activeTab: 'positive' | 'negative'
  isGenerating: boolean
  currentImage: string | null    // file:// URL
  lastSeed: number
  progress: number               // 0-100（模拟）
  
  setParam:     <K extends keyof GenerateParams>(k: K, v: GenerateParams[K]) => void
  setActiveTab: (t: 'positive' | 'negative') => void
  generate:     () => Promise<void>
  cancel:       () => void
  randomSeed:   () => void
  reuseSeed:    () => void       // seed = lastSeed
}
```

---

## 实现顺序（Codex 执行）

### Phase 1 — 清理 & 骨架
1. 清空 `src/` 目录下旧文件
2. 安装新依赖（zustand, electron-store, jszip, axios, clsx, date-fns）
3. 实现 `electron/main.ts`（窗口配置，show: false，ready-to-show 后显示）
4. 实现 `electron/preload.ts`
5. 实现 `electron/ipc/nai.ts`（verifyToken + generateImage）
6. 实现 `electron/ipc/storage.ts`（saveImages, getHistory, getHistoryDates, deleteItem）
7. 实现 `electron/ipc/settings.ts`（get/set/isFirstRun/completeSetup）
8. 更新 `tsconfig.electron.json`

### Phase 2 — 类型 & 状态
9.  `src/types/nai.ts`（模型、采样器、参数类型、默认值）
10. `src/types/app.ts` + `src/types/ipc.ts`
11. `src/store/useAppStore.ts`
12. `src/store/useGenStore.ts`
13. `src/store/useHistoryStore.ts`

### Phase 3 — 基础 UI 组件
14. `src/styles.css`（浅色主题 CSS 变量）
15. `src/components/ui/Button.tsx`（primary/secondary/ghost/danger/icon）
16. `src/components/ui/Input.tsx`（text + number + password）
17. `src/components/ui/Select.tsx`（自定义下拉）
18. `src/components/ui/Toggle.tsx`（蓝色开关）
19. `src/components/ui/Slider.tsx`（自定义范围滑块，显示值）
20. `src/components/ui/Modal.tsx`（通用 Modal 容器）
21. `src/components/ui/Toast.tsx`（右下角通知）

### Phase 4 — Shell 组件
22. `src/components/shell/TitleBar.tsx`（无边框标题栏 + 窗口控制按钮）
23. `src/components/shell/MenuBar.tsx`（菜单栏，下拉菜单）
24. `src/components/shell/TabBar.tsx`（生成/重绘/超分/后期/检视）

### Phase 5 — 页面与布局
25. `src/pages/SplashPage.tsx`（全屏插画 + 标题 + 淡入淡出）
26. `src/components/onboarding/OnboardingWizard.tsx`（5步引导）
27. `src/components/shell/LeftPanel.tsx`（左侧面板容器）
28. `src/components/generate/`（各控件组件）
29. `src/components/shell/Canvas.tsx`（画布区域）
30. `src/components/shell/HistoryPanel.tsx`（右侧历史）
31. `src/pages/MainPage.tsx`（组装所有 Shell 组件）
32. `src/components/generate/AdvancedParamsModal.tsx`
33. `src/components/settings/SettingsModal.tsx`

### Phase 6 — 功能完善
34. `src/App.tsx`（Splash → Main 页面切换）
35. 连接 useGenStore.generate() 到 IPC
36. 历史记录按日期显示
37. Seed 随机 / 复用
38. SuperDrop（拖拽处理）
39. 端到端测试

---

## 关键注意事项

1. **CORS**：所有 NAI API 调用在主进程，绝不在 renderer 直接 fetch
2. **Token 存储**：electron-store，不传到 renderer；renderer 只调用 `generate(params)` 而不传 token
3. **seed = 0 表示随机**（根据截图，不是 -1）
4. **无边框窗口**：`frame: false`，TitleBar 容器加 `-webkit-app-region: drag`，交互元素加 `no-drag`
5. **Tailwind v4**：`@import "tailwindcss"` 在 CSS 顶部，不需要配置文件
6. **浅色主题**：整个 UI 是浅灰/白色主题，蓝色作为主色，不是深色主题
7. **Splash 图片**：`src/assets/splash.png` 需要一张动漫风格图片；若无可用图片，用一个浅色渐变 SVG 占位，右侧标题文字是必须实现的
8. **历史面板**：右侧是按日期分组的历史缩略图，不是独立的图库页面
9. **设置是弹窗**：不是独立页面，按 Ctrl+, 或菜单打开
10. **axios 在主进程**：需 `"type": "commonjs"` 或确保 electron 主进程用 CJS，axios 需要 require() 方式
11. **jszip**：`responseType: 'arraybuffer'` → `JSZip.loadAsync(res.data)` → 遍历 zip.files 取出 Buffer
