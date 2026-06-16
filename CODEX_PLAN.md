# NovelAI Studio — Codex 全量重构规划

## 一、项目概述

**技术栈**：Electron 42 · React 19 · TypeScript · Vite 8 · Zustand 5  
**定位**：NovelAI API 图像生成桌面客户端，纯中文 UI，不依赖 NAI 官方客户端  
**目录**：`F:\AI\agent\codex\novelai-image-desktop`

---

## 二、立即执行：构建与验证

```bash
cd F:\AI\agent\codex\novelai-image-desktop

# 1. 先确认旧版 exe 已关闭
# 2. 安装依赖（若未安装）
npm install

# 3. 构建验证（先做 TypeScript 类型检查）
npm run typecheck

# 4. 打包便携 exe
npm run pack
# 输出在 release/ 目录，运行 release/NovelAI-Image-Desktop-*.exe
```

**TypeScript 编译必须零错误。** 有任何 TS error 须先修完再继续。

---

## 三、文件结构说明

```
src/
  App.tsx          主 React 应用（全部 UI 组件在此文件）
  styles.css       全局样式（CSS 变量 + 组件样式 + 深色主题）
  store.ts         Zustand 全局状态
  types.ts         所有 TypeScript 类型定义
  InpaintCanvas.tsx  局部重绘画布组件

electron/
  main.ts          Electron 主进程，IPC handler 注册
  preload.ts       contextBridge 暴露 API 给渲染进程
  ipc/
    nai.ts         NovelAI API 调用逻辑（generate、reverse prompt、tag suggest 等）
    store.ts       设置/Token 持久化存储
    storage.ts     历史记录文件管理
```

---

## 四、设计系统要求（必须严格遵守）

### 4.1 颜色变量（已在 styles.css 定义，直接使用 var()）

```
亮色主题：
  --bg-window:  #f0eff9   窗口背景
  --bg-panel:   #f5f4fb   侧栏/面板
  --bg-canvas:  #ffffff   画布/卡片
  --bg-hover:   #e8e4f6   悬停背景
  --border:     #d8d4ef   边框
  --accent:     #6d28d9   品牌紫色（主色调）
  --text-primary:   #1a1625
  --text-secondary: #5a5575
  --text-muted:     #9590b0

深色主题（.theme-dark 类）：
  --bg-window:  #0c0a18
  --accent:     #a78bfa   紫色更亮
  --text-primary: #ede9fc
```

### 4.2 组件规范

- **按钮**：`.btn`（次要）/ `.btn-primary`（主操作）/ `.btn-danger` / `.btn-ghost`
- **表单**：`.field` 包裹 label+input/select/textarea
- **焦点环**：`box-shadow: 0 0 0 3px rgba(109,40,217,0.12)`（紫色，不是蓝色）
- **过渡**：`cubic-bezier(0.32, 0.72, 0, 1)`（春感弹性），按钮点击 `scale(0.97)`
- **卡片**：无边框设计或只用 `var(--border)` 薄边框，用背景色区分层级

### 4.3 禁止事项（taste-skill 反模式）

- ❌ 不使用蓝色（`rgba(15, 108, 189, ...)`）——已有历史残留须全部替换为紫色
- ❌ 不使用 `Inter` 字体
- ❌ 不使用 `box-shadow: 0 X Y rgba(0,0,0, ...)` 纯黑阴影——改用紫色调阴影
- ❌ 不使用 `linear` 或 `ease-in-out` 过渡
- ❌ Tab 栏不用填充背景选中——用 2px 底部下划线

---

## 五、功能规格

### 5.1 标签栏（Tab Bar）

已有 6 个标签页，顺序和含义：

| value | 中文 | 说明 |
|-------|------|------|
| `generate` | 生成 | T2I / I2I 生成面板 |
| `inpaint` | 重绘 | 局部重绘（Inpaint） |
| `upscale` | 超分 | 云端 2×/4× 放大 |
| `postprocess` | 后期 | Director Tools |
| `inspect` | 反推 | 图片反推提示词（核心功能） |
| `convert` | 转换 | 中文描述→Danbooru 标签 |

**样式要求**：
- 未选中：灰色文字，透明背景
- 选中：`border-bottom: 2px solid var(--accent)`，紫色文字
- 悬停：`background: var(--bg-hover)`

---

### 5.2 Tag 自动补全（PromptTextarea 组件）

**文件**：`src/App.tsx` 中的 `PromptTextarea` 组件

**逻辑**：
1. 用户在正面/负面提示词 textarea 中输入
2. 检测光标前的当前单词（向后扫描直到遇到 `,`/空格/行首）
3. 当前单词 ≥ 2 字符时，防抖 160ms 后调用 `window.naiDesktop.suggestTags(model, word)`
4. 显示最多 8 条建议，每条格式：`[彩点] [tag名称]   [使用次数]`
5. 点击或回车/Tab 键选中 → 替换当前不完整单词，末尾自动追加 `, `

**彩点颜色**（category 字段）：
- 0 通用标签：`#4ade80`（绿色）
- 1 画师：`#fb923c`（橙色）
- 3 版权：`#a78bfa`（紫色）
- 4 角色：`#60a5fa`（蓝色）
- 5 元信息：`#94a3b8`（灰色）

**键盘操作**：
- `↑`/`↓`：移动高亮
- `Enter` 或 `Tab`：插入高亮条目
- `Esc`：关闭下拉框

**下拉框位置**：紧贴 textarea 底部，绝对定位（`top: 100%`），`z-index: 200`，有 `border-top: none` 与 textarea 无缝连接

**相关 IPC 链路**：
```
renderer: window.naiDesktop.suggestTags(model, word)
preload:  ipcRenderer.invoke("nai:suggestTags", model, prompt)
main:     ipcMain.handle("nai:suggestTags", (_, model, prompt) => suggestTags(model, prompt))
nai.ts:   GET https://api.novelai.net/ai/generate-image/suggest-tags?model={model}&prompt={word}
          Authorization: Bearer {token}
          返回: { tags: [{ tag, count, category }] }
          错误时静默返回 []
```

**验证**：打开 app → 输入提示词 → 输入 `glo` → 应出现 `gloves 959k` 等建议

---

### 5.3 反推提示词面板（inspect tab）

**文件**：`src/App.tsx` 中的 `InspectPanel` 组件

**功能**：
1. 图片上传区（支持拖拽）
2. 模式选择：`Danbooru 标签` / `自然语言` / `混合`
3. 点击「反推」按钮 → 调用 `window.naiDesktop.reversePrompt(base64, mode)`
4. 结果显示在可编辑 textarea
5. 按钮：「复用至生成面板」（填入正面提示词）、「复制结果」
6. 可应用提示词模板（settings 中配置的模板）

**相关 IPC 链路**：
```
reversePrompt(imageBase64: string, mode: "tags"|"natural"|"mixed")
→ nai.ts: callVisionApi(systemPrompt, [image+text], maxTokens)
→ POST {visionApiUrl}/chat/completions
  使用 visionApiKey, visionApiModel（设置中配置）
```

**内置 System Prompt（nai.ts 中 REVERSE_SYSTEM_PROMPTS）**：
- `tags`："Analyze this image and output ONLY comma-separated Danbooru-style tags. Format: lowercase with underscores, e.g. long_hair, blue_eyes. Output tags only, no explanation."
- `natural`："Describe this image in natural language suitable for AI image generation. Be detailed and specific."
- `mixed`："Analyze this image. Output a mix of Danbooru tags and natural language phrases, comma-separated."

**验证**：设置中填入 OpenAI API Key + 模型 → 检视面板上传图片 → 点击反推 → 返回标签

---

### 5.4 提示词转换面板（convert tab）

**文件**：`src/App.tsx` 中的 `PromptConverterPanel` 组件

**功能**：
1. 输入框：中文描述，如"一个金发少女，穿着白色连衣裙，站在樱花树下"
2. 按钮「转换为 Danbooru 标签」
3. 调用 `window.naiDesktop.convertPrompt(text)`
4. 输出可编辑 textarea（用户可手动修改结果）
5. 按钮：「复用至生成面板」、「复制结果」

**相关 IPC 链路**：
```
convertPrompt(text: string)
→ nai.ts: callVisionApi(CONVERT_SYSTEM_PROMPT, text, 600)
  CONVERT_SYSTEM_PROMPT = "You are a NovelAI prompt expert. Convert the user's Chinese description into English Danbooru-style tags suitable for NovelAI image generation. Output ONLY the tags, comma-separated, lowercase with underscores. No explanation."
```

**验证**：设置中填入视觉 API 配置 → 转换面板输入中文 → 得到英文标签

---

### 5.5 菜单栏（MenuBar）

**保留**：
```javascript
["文件", ["打开输出目录", "退出"]]
["编辑", ["复制正面提示词", "复制负面提示词", "清空提示词"]]
["视图", ["使用文档"]]
["设置", ["打开设置"]]
["帮助", ["关于"]]
```

**删除**（如有）：
- 工具 > 氛围预编码管理器、抽卡器、自动化等
- 编辑 > 规范化提示词、随机风格提示词
- 任何指向 NAI Utility Tool 的内容

---

### 5.6 设置面板（SettingsModal）

左侧导航项：

| 分区 key | 显示名 | 内容 |
|----------|--------|------|
| `api` | API 配置 | Token 验证、API Endpoint、Image Endpoint |
| `storage` | 存储 | 输出目录、历史保留天数 |
| `ai-reverse` | AI 反推 | 视觉API URL/Key/Model/System Prompt |
| `templates` | 提示词模板 | 添加/删除前缀/后缀模板 |
| `appearance` | 外观 | 主题（浅色/深色/系统） |
| `performance` | 性能 | 仅信息展示 |

**注意**：Settings 中所有 `useState` Hook 必须在 `if (!settings) return null` 之前声明（否则 React Hooks 规则报错）。

---

### 5.7 历史记录面板（右侧）

- 按日期选择（下拉）
- 2列缩略图网格
- 悬停显示删除按钮（红色圆形 ×）
- 点击图片 → 加载到画布区（发送到工作台）
- 画布区工具栏：保存、另存、超分、发送到重绘/后期

---

## 六、已知问题清单（必须修复）

### BUG-1：焦点环颜色错误
**位置**：`src/styles.css`  
**问题**：`box-shadow: 0 0 0 2px rgba(15, 108, 189, 0.12)` 是蓝色  
**修复**：改为 `rgba(109, 40, 217, 0.12)` 紫色

```css
/* 查找所有 rgba(15, 108, 189 并替换为 rgba(109, 40, 217 */
```

### BUG-2：画布背景色错误
**位置**：`src/styles.css` `.canvas-area`  
**问题**：`radial-gradient(...rgba(15, 108, 189, 0.04)...)` 蓝色环境光  
**修复**：改为 `rgba(109, 40, 217, 0.030)` 紫色

### BUG-3：SuperDrop 覆盖层颜色错误
**位置**：`src/styles.css` `.superdrop-overlay`  
**问题**：`background: rgba(15, 108, 189, 0.1)` 蓝色  
**修复**：`background: rgba(109, 40, 217, 0.06)`

### BUG-4：Spinner 颜色错误
**位置**：`.spinner`  
**问题**：`border: 4px solid #dceaff` 蓝色  
**修复**：`border: 3px solid rgba(109, 40, 217, 0.14)`

### BUG-5：PromptTextarea onBlur 时序问题
**位置**：`src/App.tsx` `PromptTextarea`  
**问题**：用户点击下拉项时，textarea onBlur 先触发关闭下拉，导致点击无效  
**修复**：已用 `setTimeout(clearSuggestions, 180)` 延迟关闭 + 下拉项用 `onMouseDown` 替代 `onClick`（preventDefault 阻止 blur）

### BUG-6：Settings Hook 顺序问题
**位置**：`src/App.tsx` `SettingsModal`  
**问题**：`useState` for `newTplName` 等 4 个 Hook 若在 `if (!settings) return null` 之后声明会报错  
**修复**：将所有 `useState` 移到 `if (!settings) return null` 之前

### BUG-7：EBUSY 打包冲突
**问题**：打包时旧 exe 还在运行，文件锁定导致 EBUSY 错误  
**修复**：打包前必须关闭正在运行的 exe

---

## 七、完整 IPC 接口清单

以下所有接口须在三处同步声明：`electron/preload.ts`、`electron/main.ts`、`electron/ipc/nai.ts`，并在 `src/types.ts` 的 `NaiDesktopApi` 中有对应类型。

```typescript
// 已实现
hasToken()           → AccountSummary
verifyToken(token)   → TokenStatus
clearToken()         → { ok }
generate(params, extras)            → GenerateResult
generateI2I(params, i2i, extras)    → GenerateResult
inpaint(params, model, mask)        → GenerateResult
upscaleImage(scale)                 → SingleImageResult
augmentImage(tool, options)         → GenerateResult
cancel()                            → { ok }
reversePrompt(base64, mode)         → { ok, prompt?, message }
convertPrompt(text)                 → { ok, result?, message }
suggestTags(model, prompt)          → TagSuggestion[]    ← 新增
loadImage()                         → LoadImageResult
loadImageFromPath(path)             → LoadImageResult
clearWorkbenchImage()               → { ok }
getHistory(date?)                   → HistoryItem[]
getHistoryDates()                   → string[]
deleteHistory(id)                   → { ok }
openInExplorer(path)                → { ok }
selectOutputDir()                   → string | null
getSetting(key)                     → value
setSetting(key, value)              → value
getSettings()                       → AppSettings
isFirstRun()                        → boolean
completeSetup()                     → { ok }
minimize/maximize/close/openExternal
```

---

## 八、Zustand Store 状态结构

**文件**：`src/store.ts`

关键状态字段（参考现有实现，保持不变）：

```typescript
// 核心
params: GenerateParams          // 生成参数
setParam(key, value)
account: AccountSummary         // 账户状态
isGenerating: boolean
activeTab: ActiveTab
promptTab: "positive" | "negative"

// 工作台图片
workbenchImage: WorkingImage | null
i2iParams: I2IParams
inpaintModel: NAIInpaintModel
brushSize/brushMode/maskRevision/inpaintMask

// 参考图
vibeImages: VibeTransferImage[]
charCaptions: CharCaption[]

// 历史
historyDates: string[]
history: HistoryItem[]
historyDate: string
currentImage: HistoryItem | null

// 反推/转换
reversePromptMode: ReversePromptMode
convertInput: string
convertResult: string
converting: boolean

// 其他
batchCount: number
settings: AppSettings | null
toast: string | null
```

---

## 九、关键依赖版本

```json
{
  "electron": "^42.4.0",
  "react": "^19.2.7",
  "react-dom": "^19.2.7",
  "zustand": "^5.0.9",
  "axios": "^1.13.2",
  "jszip": "^3.10.1",
  "vite": "^8.0.16",
  "typescript": "^6.0.3"
}
```

**注意**：Zustand 5 的 API 与 4 不同，store 用 `create<State>()((set, get) => ({}))` 而不是 `create()`。

---

## 十、执行顺序

1. `npm run typecheck` → 修复所有 TS 错误
2. 修复 BUG-1 ~ BUG-4（颜色残留问题）
3. 验证 BUG-5（PromptTextarea 点击补全）
4. 验证 BUG-6（Settings Hook 顺序）
5. `npm run pack` → 关闭旧 exe → 运行新 exe
6. 手动测试各功能：
   - [ ] 标签自动补全（输入 `glo` 应出现建议）
   - [ ] 反推提示词（需配置视觉 API）
   - [ ] 提示词转换（需配置视觉 API）
   - [ ] 生成图片（需配置 NAI Token）
   - [ ] 深色主题切换
   - [ ] 历史记录查看
   - [ ] 局部重绘
