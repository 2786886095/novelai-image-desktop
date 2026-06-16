# NovelAI 图像桌面控制台：交给 Codex 的可执行细纲

> 目标：把当前已编译可运行的原型，逐项跑通为「商业化、完整、全面」的桌面软件。
> 本文是给 **codex** 的执行清单：每项都给出「现状 / 缺陷 / 修复步骤 / 验收标准」。
> 编写日期：2026-06-15。编写者：Claude（静态审计，未联网、未运行 GUI）。

---

## 0. 阅读须知与环境约束

### 0.1 这份细纲是怎么来的
- Claude 在隔离 bash 沙箱中**逐行读完**了 `electron/main.ts`、`electron/automation.ts`、`electron/preload.ts`、`src/App.tsx`、`src/types.ts`、`src/cost.ts`、`src/featureCatalog.ts`、`src/styles.css` 与打包脚本。
- `npm run typecheck`、`npm run build` 均**通过（exit 0）**，`release/` 已能产出 91MB 便携版 exe。代码不是「跑不起来」，而是有一批**功能未真正接通官方网页**和**装饰性控件**需要落地。
- **沙箱无法联网**（lobehub.com / github.com / docs.novelai.net / Web 搜索全部被网络策略拦截），也**无法启动 Windows Electron GUI**。因此本文所有「网页 DOM selector 是否命中」的判断都是**静态推断**，必须由 codex 在**有网络、能登录真实 NovelAI 账号**的环境里逐一验证。

### 0.2 codex 必须先做的事
1. 在能联网的机器上 `npm install && npm run dev`，用真实 NovelAI 账号登录，打开「设置 → 显示后台官方网页」，对照真实 DOM 验证每个 selector。
2. 参考官方文档（已写进 `src/featureCatalog.ts` 每个功能的 `docUrl`，根目录 https://docs.novelai.net/en）核对参数名与控件形态。
3. 按第 6 节的优先级顺序执行，每改一项都跑 `npm run typecheck && npm run build`，关键项手动在 GUI 里验证。

### 0.3 质量门槛（每次提交前）
```
npm run typecheck
npm run build
npm run pack         # 产出便携版 exe
启动 release/NovelAI-Image-Desktop.exe 冒烟（主窗口可见、能登录、能生成一张图）
```

---

## 1. 架构与「官方接口」积分模型（已实现，需加固）

### 1.1 架构事实
- **不直接调用 NovelAI 图像 API、不存密码**。主界面是自定义 React 前端；真正的生成/扣费发生在一个**隐藏的官方网页 BrowserWindow**（`automationWindow`）里，通过注入 JS 做 DOM 自动化（填参→点按钮→抓图）。
- 会话隔离在 `persist:novelai-image-desktop[-<id>]` 分区；退出登录会销毁窗口 + 清分区 + 换新分区 + 上本地登录锁（`authLocked`）。这套登录/退出产品化逻辑**已正确**，不要退化。

### 1.2 积分（Anlas）= 官方接口，这就是用户要的「像在官网用」
**已实现，位置：`automation.ts` 的 `getCostStatus()` + `main.ts` 的 `generateFromForm()`。**
- 成本**优先从官方执行按钮**读（`official-action-button`），其次官方页面提示（`official-page-message`），不再整页乱抓 `Free/Anlas`。
- `costAnlas`（按钮要价）vs `balanceAnlas`（账户 `Anlas:` 余额）做差，`insufficientBalance = costAnlas > balanceAnlas`，并支持「not enough / insufficient / 不足」文案识别。
- 执行前门禁（`generateFromForm` 约 1085–1103 行）：未登录→拦；`insufficientBalance`→直接返回 `blockingReason`（即「积分不足：当前 X，需要 Y」）；按钮存在但 `!canGenerate`→拦。前端 `App.tsx` 主按钮也据此 `disabled`，并对「积分不足/不可点击/未登录」`window.alert`。
- **结论：用户描述的「官网会告诉你消耗多少，余额不足就提示积分不足」已经在做。** 本节剩下的是**加固**，不是新建。

### 1.3 积分加固任务
| 编号 | 任务 | 验收 |
|---|---|---|
| 1.3.1 | 成本读取结果**持久化进历史**：`GenerationRecord.cost` 现仅存 `beforeAnlas/afterAnlas/webCostText`；补 `costStatus.costText`、`costSource`、`costAnlas`、`balanceAnlas` 快照。 | 历史详情能显示「本次官方要价 X / 来源 / 当时余额」。 |
| 1.3.2 | `insufficientBalance` 的**前端弹层**统一为一个明确的「积分不足」对话框组件（标题=积分不足，正文=当前余额/所需/去官网充值入口），替换裸 `window.alert`。 | 余额不足时弹出可读对话框，含余额、所需、`docs.novelai.net/en/subscription` 链接。 |
| 1.3.3 | 余额轮询：生成中按钮文案随官方按钮刷新（每次 snapshot 更新 `costStatus`）。 | 改尺寸/数量后点「读取网页实测」，官方要价实时变化。 |
| 1.3.4 | 失败原因分类（见 5.3）要把「积分不足」与「按钮禁用/未登录/验证码/上传失败/捕获超时/网页改版」区分开。 | 每类失败有独立中文文案与建议动作。 |

---

## 2. 逐功能审计（13 个页签）

> 图例：✅ 已接通 ｜ ⚠️ 接通但脆弱/不完整 ｜ ❌ 装饰性/未真正同步到官网

### 2.1 文生图 text2image ✅⚠️
- **现状**：`fillFormScript` 同步 prompt(0)/negative(1)/width/height/count/steps/guidance/seed/sampler/qualityTags/SMEA；`clickGenerateScript` 选「Generate N Image」按钮；`captureNewImages` 轮询抓新图。
- **缺陷**：
  - **C1（高）model 从不同步**：UI 选了模型（V4.5 Curated/Full/...），`fillFormScript` 里**没有任何 setModel**。生成永远用官网当前模型。
  - **C2（高）prompt 框靠索引猜**：`setPromptText(0)`/`(1)` 假设第 0 个可编辑区=正向、第 1 个=负向。NovelAI V4 有「base caption / 每角色 prompt / Undesired Content」多个框，索引极可能错位。
- **修复**：
  1. 新增 `setModel(name)`：定位模型选择器（多为自定义下拉，非原生 `<select>`）→ 点开 → 按文本匹配选项点击。先在真实 DOM 找模型控件的稳定锚点（aria-label / 邻近「Model」文案）。
  2. 把 prompt 定位从「索引」改为「**语义锚点**」：正向=主提示词框（通常 placeholder/邻近含「prompt」且非 undesired）；负向=邻近含「Undesired Content / negative」的框。保留索引兜底。
- **验收**：选 V4.5 Full + 指定 prompt/UC，生成图所用模型与提示词与 UI 完全一致（在官网窗口可肉眼核对）。

### 2.2 图生图 image2image ⚠️
- **现状**：上传基图→`clickFeatureScript("image2image")`（点「Add a Base Img」等）→上传到 `input[type=file]`→`setNumberNear(["strength"],..)`、`(["noise"],..)`。
- **缺陷**：strength/noise 靠标签文本邻近匹配；NovelAI 这两个常是 slider，未必有可被 `contextText` 命中的文字标签。
- **修复**：为 strength/noise 写**专用 slider adapter**（定位 slider 容器→读 min/max→设 value 并派发 input/change，或模拟拖拽）。验证基图确实进入「Image to Image」而非被当作别的上传位。
- **验收**：基图缩略图出现在官网 i2i 区，strength/noise 数值与 UI 一致。

### 2.3 风格参考 Vibe ❌（参数）/⚠️（图片）
- **现状**：`syncGlobalControls` 会切到 Vibe 页并上传图片。`cost.ts` 估算 vibe 数量成本。
- **缺陷 C3（高）**：每个 vibe 的 `strength` / `informationExtracted` 滑块、`enabled` 在 UI 收集了，但**从不同步到官网**——它们是装饰性的。多图时上传位匹配也未必对。
- **修复**：上传每张 vibe 后，按官网每行 vibe 的 strength / information-extracted 控件逐个 set；`enabled=false` 的不上传。先在真实 DOM 摸清 vibe 列表项结构。
- **验收**：UI 设 vibe1 strength=0.3、infoExtracted=0.9，官网对应行数值一致；禁用的 vibe 不出现在官网。

### 2.4 精确参考 Precise Reference ❌（参数）/⚠️（图片）
- **现状**：切页 + 上传。UI 收集 type(角色/风格/角色+风格)/strength/fidelity/enabled。
- **缺陷 C4（高）**：type/strength/fidelity **全部未同步**到官网。
- **修复**：同 2.3，为每个参考项设 type 选择 + strength + fidelity。
- **验收**：UI 改 type=风格、fidelity=0.5，官网一致。

### 2.5 多角色提示词 characterPrompts ❌（结构）
- **现状**：`characterPromptText()` 把各角色 prompt 用 ` | ` 拼进**单个主 prompt**。UI 有每角色正/负 prompt + 5×5 位置网格。
- **缺陷 C5（高）**：NovelAI V4 多角色是**独立的每角色 prompt 框 + 位置选择**，不是把 pipe 塞进主框。当前实现是降级近似；**位置网格、角色负向 prompt 完全没用上**。
- **修复**：实现「多角色 adapter」：点「Add Character」生成 N 个角色框→逐个 set 正/负 prompt→在官网位置控件上设置 5×5 坐标。`usePipeCharacterSyntax` 勾选时才走旧的 pipe 模式。
- **验收**：建 2 个角色（不同 prompt + 不同位置），官网出现 2 个角色块且位置正确。

### 2.6 画布 Canvas ⚠️（工具）
- **现状**：本地 `<canvas>` 实现 draw/erase/fill/picker + undo/redo + 保存为基图。
- **缺陷 C6（中）**：`ToolButtons` 列了 select/lasso/blur/clone 四个按钮，但 `DrawingCanvas.drawAt` **只实现 draw/erase/fill/picker**，另四个点了无反应——误导用户（违反「不能有点了没反应的控件」准则）。
- **修复（二选一）**：① 实现 blur（局部高斯/盒糊）、clone（取样点偏移复制）、select/lasso（矩形/自由选区→限制绘制范围）；② 暂不实现的按钮**移除或置灰并标注「即将支持」**。商业化建议至少实现 blur/clone，select/lasso 可标注。
- **验收**：每个可见画布工具都有真实效果；不实现的不出现可点按钮。

### 2.7 局部重绘 / 聚焦重绘 inpaint / focusedInpaint ⚠️
- **现状**：选基图→画布涂遮罩→执行时 `saveCanvasAsset` 存遮罩→`prepareFeature` 走 i2i→点 Inpaint/Focused→上传 base 再上传 mask。
- **缺陷**：
  - **C7（中）focusedRect 未同步**：聚焦重绘 UI 收集 x/y/w/h，但官网聚焦框是拖拽交互，**坐标从不传**。
  - **C8（中）遮罩上传可能错位**：`uploadImagesScript` 在「2 文件 2 输入」时把 base 给 inputs[0]、mask 给 inputs.at(-1)；但 inpaint 真实流程是先进 i2i 上传 base，再进 inpaint 在**遮罩画布**上涂，未必是「再上传一个文件」。需对照真实 DOM：官网 inpaint 的遮罩是在画布上画的，可能需要把我们本地遮罩**绘制进官网遮罩 canvas** 而非当文件传。
- **修复**：先在真实站点走一遍 inpaint，确认遮罩是「文件上传」还是「网页画布绘制」；据此重写遮罩注入。focusedRect 改为在官网聚焦控件上设置（拖拽模拟或输入框）。
- **验收**：涂一块遮罩执行，官网只重绘该区域；聚焦模式选区与 UI 一致。

### 2.8 增强 Enhance ⚠️
- **现状**：选源图→上传→`setNumberNear` 设 magnitude/strength/noise。`enhance.upscaleAmount`、`showIndividual` 收集了。
- **缺陷 C9（中）**：`showIndividual`（显示单次过程）、`upscaleAmount` 未同步；magnitude/strength/noise 同样依赖标签文本邻近匹配，脆弱。
- **修复**：专用 slider/toggle adapter；确认 Enhance 入口（官网通常在生成结果上「Enhance」）。
- **验收**：magnitude/strength/noise 与 UI 一致，勾选 Individual Passes 时官网对应开关开启。

### 2.9 放大 Upscale ⚠️
- **现状**：选源图→`clickFeatureScript("upscale")`→点执行→抓 1 张。
- **缺陷 C10（低）**：放大入口/4× 模型确认；输入>1024 时官网会拒，需前端提示。
- **修复**：源图尺寸>1024 时前端警告；确认 Upscale 按钮文案命中。
- **验收**：640×640 源图放大成功并保存。

### 2.10 导演工具 Director Tools ⚠️
- **现状**：6 个工具（removeBg/lineArt/sketch/colorize/emotion/declutter）；`prepareFeature` 点 Director Tools→点具体工具；`fillFormScript` 设 colorize/emotion 的 prompt/level/defry/emotion 文本。removeBg 期望抓 3 张。
- **缺陷 C11（中）**：emotion 的「情绪」是 `clickText([emotion])`（点英文 happy/sad...），但官网可能是下拉；level/defry 标签匹配脆弱。
- **修复**：确认每个导演工具的真实控件；emotion 用专用选择器。
- **验收**：colorize 带 prompt+defry、emotion 带情绪+level 各跑通一次并抓到结果。

### 2.11 历史 History ✅
- **现状**：本地历史（最多 1000）、分组、设为基图、复用参数、定位文件、删记录/删文件。`novelai-image://` 协议安全预览。
- **缺陷 C12（低）**：`reuseSettings` 把 `params`（含 `settings` 等嵌套）整体 spread 进 form，可能带入非 GenerationForm 字段；`reuseAsBase` 直接用 `record.localPath` 建 base 资产（文件被删则预览失败，需空态处理）。
- **修复**：`reuseSettings` 只挑白名单字段；缺图时历史项显示占位图 + 「文件已丢失」。
- **验收**：复用参数后表单字段正确；删了本地文件的历史项不白屏。

### 2.12 快速开始 quickStart ✅
- **现状**：示例 prompt 点击追加到正向 prompt 并切到文生图；文档矩阵展示。不扣费。
- **缺陷**：无功能缺陷。可补充更多分类示例（商业化体验）。

### 2.13 设置 settings ⚠️
- **现状**：账号信息、显示/隐藏后台网页、彻底退出、导出目录、图片格式、自动保存、运行日志、官方文档入口。
- **缺陷**：
  - **C13（中）图片格式 PNG/WebP 不生效**：`saveImagePayload` 用下载 blob 的真实 mime 决定扩展名，**从不按 `settings.imageFormat` 转码**。设了 WebP 仍存 PNG。
  - **C14（低）autoSave 永远为真**：`autoSave` 设置项存在但生成永远保存，开关无效。
  - **C15（低）pollTimeoutSeconds 无 UI**：默认 180s，用户改不了。
- **修复**：① 用 sharp 或 canvas 在主进程按 `imageFormat` 转码后再写盘；或如不做转码，则把该设置**改成只读说明/移除**，避免假开关。② autoSave=false 时只入历史不写盘（或移除该项）。③ 设置页加超时秒数输入。
- **验收**：选 WebP 后落盘文件是 .webp 且可打开；关闭 autoSave 后不产生本地文件。

---

## 3. 跨功能（横切）修复清单

| 编号 | 主题 | 问题 | 修复 |
|---|---|---|---|
| X1 | **DOM 适配器化** | 现在是「按文本/索引模糊点击与填值」，网页一改版就静默失效。 | 把每个功能做成 adapter，统一暴露 `prepare/syncInputs/readCost/run/capture`，并在失败时返回 `debug snapshot`（候选按钮、file input 数、textarea 数）。研究文档已点名此项。 |
| X2 | **prompt 框语义定位** | 见 C2/C5：索引猜框。 | 统一「按锚点找框」工具函数，正向/负向/每角色框分别定位。 |
| X3 | **参数真正回写** | 见 C3/C4/C7/C9/C11：大量滑块/类型/位置只在本地，不进官网。 | 为 slider/自定义下拉/位置网格写专用 setter，覆盖 vibe/precise/inpaint/enhance/director/character。 |
| X4 | **模型同步** | C1：模型从不同步。 | `setModel` 并在 fillForm 调用。 |
| X5 | **图片格式/自动保存真生效** | C13/C14：假开关。 | 真转码 + 真开关，或删除假设置。 |
| X6 | **装饰性控件清零** | C6：画布 4 个无效工具。 | 实现或移除/置灰，杜绝「点了没反应」。 |
| X7 | **抓图鲁棒性** | 「最大面积图」可能抓到参考图/基图而非结果；多图需抓 N 张。 | 抓图限定在结果区容器内；按生成时间/新出现 src 过滤；记录抓图来源用于诊断。 |
| X8 | **错误可诊断** | 失败时信息不足。 | 见 5.3 失败分类。 |

---

## 4. 前端技能落地（lobehub 等 skill 市场 → 本程序）

> ⚠️ 本环境无法联网，未能现场抓取 lobehub/SkillHub/GitHub。以下落地点综合自仓库已有调研 `docs/SKILL_MARKET_FRONTEND_RESEARCH.md`（同日 2026-06-15 完成，含 lobehub `web-frontend-development`、`frontend-design`、SkillHub、Claude Marketplaces、MCP Market、Glama、Smithery、Ultimate Frontend Design 等来源）与通用生产级前端准则。**codex 在有网环境应复核这些来源的最新内容再细化。**

### 4.1 设计系统 v3（design tokens）— 来自 frontend-design / design-system 技能
当前 `styles.css` 是硬编码色值的深色控制台，缺一致 token。落地：
- 建 `--bg/-elev/-surface`、`--text/-muted`、`--primary/-accent`、`--ok/-warn/-danger/-info` 状态色、`--space-1..6`(4/8px 基)、`--radius`、`--font` token 体系，所有组件改用 token，不写魔法值。
- 主按钮当前是金渐变；保留品牌色但**收敛渐变使用**（反 AI slop 准则：少渐变、克制留白、真实层级）。
- 状态色统一：可执行=绿、积分不足=红、读取中=蓝、警告=黄，贯穿成本卡/历史/登录门禁。

### 4.2 信息架构（IA 优先）— 来自 frontend-design 信息架构准则
按决策顺序固定动线（研究文档已定）：账号/余额/成本 → 输入（prompt/负向/基图/参考/遮罩）→ 主功能 → 全局控制（Vibe/精确/多角色）→ 输出（自动捕获/历史/复用）。当前左栏顺序基本符合，需把「全局控制会叠加到当前主功能」的提示做成持续可见徽标。

### 4.3 组件状态三态 — 来自 frontend-code-review 准则
每个列表/图片区都要有**空态/加载态/错误态**：
- 历史列表空态已有；补**加载骨架**与**图片加载失败占位**（C12）。
- 资产库、参考网格补空态。
- 成本卡在「读取中」显示 spinner 而非旧值。

### 4.4 可访问性 & 中文化 — 来自 accessibility 审计技能
- 所有英文功能名保持「中文（English）」双标（已大量做到，继续覆盖新控件）。
- 控件加 `aria-label`、可键盘聚焦、焦点环；颜色对比≥WCAG AA。
- 危险操作（退出登录/删图片）已有确认，保持。

### 4.5 性能/缓存思想 — 来自 cache-components
- 动态数据（账号/积分/按钮成本/进度）只实时读官网；可缓存数据（历史/预设/导出目录/文档矩阵）本地化。已基本符合。
- `useMemo` 派生（estimate/selectedAssets/visibleRecords）已用；新增重计算时延续。

### 4.6 工程准则 — 来自 code-reviewer / webapp-testing / find-skills
- 每功能 adapter 化（X1）。
- 引入 ESLint + Prettier（`fix` 技能准则，当前只有 tsc 兜底）。
- 引入 Playwright 对**主窗口 React UI** 的端到端冒烟（登录门禁、各页签可切换、表单回填）；对隐藏官网窗口至少做 selector 探活脚本。
- 打包体积分析（91MB 便携版，评估 asar 压缩与裁剪）。

---

## 5. 商业化检查清单

### 5.1 测试
- [ ] `npm run typecheck` / `build` / `pack` 全绿（CI 化）。
- [ ] Playwright：登录门禁、13 页签切换、表单状态、历史增删、积分不足弹层。
- [ ] 真账号手测矩阵：文生图 / 图生图 / Vibe / 精确 / 多角色 / 画布→基图 / Inpaint / Focused / Enhance / Upscale / 6 个导演工具，各自「读取网页实测→执行→自动捕获→入历史」。

### 5.2 打包与发布
- [ ] 修 `scripts/cleanup-portable-release.mjs`：当前 `release/` 残留 `win-unpacked.tmp`，清理逻辑没覆盖 `.tmp` 变体。
- [ ] 版本号/产品名/图标/签名（商业化需代码签名，至少自签或说明）。
- [ ] `pr-creator` 准则：每个可交付版本记录「用户可见变化 / 修复 / 待人工验证的官网流程 / exe 路径与大小 / 运行与回滚」。

### 5.3 失败原因分类（X8 落地）——商业化关键
生成失败必须落到这几类之一并给中文建议：
1. 未登录 → 引导重新登录。
2. 积分不足 → 余额/所需/充值入口（1.3.2）。
3. 上传失败 → 提示重选图/检查格式。
4. 官方按钮禁用 → 提示补提示词/基图/遮罩。
5. 验证码/人机校验 → 提示「显示后台网页」手动过验证。
6. 捕获超时 → 提示延长超时或手动「捕获后台当前图片」。
7. 网页改版（selector 全落空）→ 附候选按钮快照，提示等待适配更新。

### 5.4 安全与合规
- [ ] 维持 `contextIsolation:true`、官网窗口 `sandbox:true`、DevTools 屏蔽、会话隔离、文件删除限制在 userData/导出目录内（已实现，回归别破坏）。
- [ ] 不采集用户数据、不外传；日志只本地 `app.log`。
- [ ] 明确「本工具自动化操作用户自己的官方账号」，遵守 NovelAI 条款的免责说明。

### 5.5 文档同步（update-docs 准则）
- [ ] 改动后同步 `README.md`、`docs/PRODUCT_REDESIGN_SKILLS.md`、`docs/SKILL_MARKET_FRONTEND_RESEARCH.md`、本文件与 `featureCatalog`。

---

## 6. 给 codex 的执行优先级（建议顺序）

**第一梯队（接通核心生成，影响「图对不对」）**
1. X4/C1 模型同步 `setModel`。
2. X2/C2/C5 prompt 框语义定位 + 多角色独立框/位置。
3. X3/C3/C4 Vibe & 精确参考 参数回写。
4. X7 抓图鲁棒性（结果区限定 + 多图 N 张）。

**第二梯队（编辑类功能真实接通）**
5. C7/C8 Inpaint 遮罩真实注入 + 聚焦坐标。
6. C9/C11 Enhance / Director 参数回写。
7. C6 画布无效工具：实现 blur/clone 或移除 select/lasso。

**第三梯队（设置真实化 + 商业化体验）**
8. C13/C14 图片格式转码 + autoSave 真生效（或删假开关）。
9. 1.3.x 积分弹层 + 历史成本快照。
10. 5.3 失败分类。

**第四梯队（前端系统化 + 工程化）**
11. 4.1 design tokens v3、4.3 三态、4.4 可访问性。
12. 4.6 ESLint/Prettier + Playwright + 5.2 打包修复。

> 每完成一梯队：`typecheck && build && pack` + 真账号手测对应功能，再进入下一梯队。

---

## 7. 关键文件索引（改这些）
- `electron/automation.ts`：注入脚本、DOM 适配器、成本读取、抓图（X1–X4、X7、各 adapter）。
- `electron/main.ts`：IPC、prepareFeature、generateFromForm 门禁、保存/转码（1.3、C13/C14、5.3）。
- `src/App.tsx`：UI、表单状态、积分弹层、三态、装饰控件（C6、1.3.2、4.x）。
- `src/styles.css`：design tokens v3（4.1）。
- `src/cost.ts` / `featureCatalog.ts`：规则说明与文档入口（随功能变更同步）。
- `scripts/cleanup-portable-release.mjs`：打包残留清理（5.2）。
