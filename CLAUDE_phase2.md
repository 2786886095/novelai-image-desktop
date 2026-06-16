# Phase 2 实现规划 — 图生图 / 局部重绘 / 超分 / Director Tools

> 本文件是给 **Codex** 的实施规范。基于已完成的 Phase 1（API-only 文生图核心闭环）继续开发。
> 不要改动已经正常工作的文生图逻辑，只添加新功能。

---

## 0. 实施优先级

1. **图生图（I2I）** — API 改动最小，复用 buildPayload，只加 image/strength/noise
2. **局部重绘（Inpaint）** — 需要前端 Canvas 画蒙版 + action:infill
3. **超分（Upscale）** — 独立端点，返回 binary 不是 ZIP
4. **Director Tools（Augment）** — 独立端点，返回 ZIP，UI 最复杂

---

## 1. 文件变更总览

### 新增文件
```
src/InpaintCanvas.tsx        重绘专用 Canvas 组件（蒙版绘制）
```

### 修改文件
```
src/types.ts                  追加新类型，不删除现有类型
src/store.ts                  追加 workbench 状态和新 action
src/App.tsx                   更新 4 个 Tab 面板，追加 CSS
electron/ipc/nai.ts           追加 4 个新 API 函数
electron/main.ts              注册新 IPC handler
electron/preload.ts           暴露新方法到 window.naiDesktop
```

---

## 2. NAI API 完整参考

### 2.1 图生图（I2I）

```
POST https://image.novelai.net/ai/generate-image
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/zip, application/octet-stream
```

payload 与 T2I 完全相同，只在 `parameters` 对象里追加三个字段：

```json
{
  "input": "<正面提示词>",
  "model": "nai-diffusion-4-5-full",
  "action": "generate",
  "parameters": {
    "...所有 T2I 参数不变...",
    "image": "<base64，无 data: 前缀>",
    "strength": 0.7,
    "noise": 0.0,
    "extra_noise_seed": 0
  }
}
```

- `strength` 范围 0.0（忽略原图）~ 1.0（完全保留），默认 **0.7**
- `noise` 范围 0.0 ~ 0.99，默认 **0.0**
- `extra_noise_seed` 为 0 时服务端随机
- 响应格式、ZIP 解包、保存逻辑与 T2I 完全一致，复用 `extractImages` 和存储逻辑

### 2.2 局部重绘（Inpaint）

```
POST https://image.novelai.net/ai/generate-image
```

```json
{
  "input": "<正面提示词>",
  "model": "nai-diffusion-4-5-curated-inpainting",
  "action": "infill",
  "parameters": {
    "...基础参数（params_version, width, height, scale, sampler, steps, seed, uc, ...）...",
    "v4_prompt": { "...V4+ 同款结构..." },
    "v4_negative_prompt": { "...V4+ 同款结构..." },
    "image": "<base64 原图，无前缀>",
    "mask": "<base64 二值 PNG，白=重绘区，黑=保留区>",
    "add_original_image": true
  }
}
```

**重绘专用模型名称**（与生成模型分开，加 `-inpainting` 后缀）：

| 标签 | model 值 |
|------|----------|
| NAI Diffusion 4.5 Curated（推荐） | `nai-diffusion-4-5-curated-inpainting` |
| NAI Diffusion 4 Curated | `nai-diffusion-4-curated-inpainting` |
| NAI Diffusion 4 Full | `nai-diffusion-4-full-inpainting` |
| NAI Diffusion 3 | `nai-diffusion-3-inpainting` |

蒙版规范：
- 尺寸必须与原图 **完全相同**
- 纯 RGB PNG（不需要 Alpha 通道）
- 白色 `(255,255,255)` = 该区域将被重绘
- 黑色 `(0,0,0)` = 该区域保留原图
- base64 编码，无 `data:image/png;base64,` 前缀

`isV4Plus(model)` 对 inpainting 模型也有效（字符串包含 "-4"），`v4_prompt` 结构照常拼装。

### 2.3 超分（Upscale）

```
POST https://image.novelai.net/ai/upscale
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "image": "<base64 PNG/JPEG，无前缀>",
  "width": 1024,
  "height": 1024,
  "scale": 4
}
```

- `scale`：只允许 `2` 或 `4`
- `width`/`height`：原图尺寸（不是输出尺寸）
- **响应是直接的 binary PNG**，不是 ZIP，`responseType: "arraybuffer"` 直接保存
- 输出文件命名：`${timestamp}-upscale${scale}x-${originalBasename}.png`
- 保存后写入历史，`model` 字段填 `"upscale"`，`params` 为空对象

### 2.4 后期处理（Director Tools / Augment）

```
POST https://image.novelai.net/ai/augment-image
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/zip
```

基础结构：

```json
{
  "image": "<base64，无前缀>",
  "width": 1024,
  "height": 1024,
  "req_type": "bg-removal",
  "defry": 0
}
```

各 `req_type` 附加字段：

| req_type | 额外字段 | 说明 |
|----------|----------|------|
| `bg-removal` | — | 去除背景 |
| `lineart` | `defry: 0~5` | 线稿提取，defry=去噪强度 |
| `sketch` | `defry: 0~5` | 草图风格化 |
| `colorize` | `prompt: string`, `defry: 0~5` | 上色，prompt 为颜色描述 |
| `emotion` | `prompt: "<emotion>;;0"`, `defry: 0~5` | 表情迁移 |
| `declutter` | `defry: 0~5` | 去除多余元素 |

emotion 的 prompt 格式：`"<值>;;<强度>"` 例如 `"happy;;2"`

可用表情值：`neutral` `happy` `sad` `angry` `surprised` `scared` `disgusted` `amazed`

响应：`application/zip`，与 T2I 格式一致，用 `extractImages` 解包。

---

## 3. 新增 TypeScript 类型（src/types.ts 末尾追加）

```typescript
// ===== 工作台通用 =====

/** 加载到工作台的输入图片 */
export interface WorkingImage {
  filePath: string;
  fileUrl: string;   // file:// URL，用于 <img src>
  width: number;
  height: number;
}

// ===== 图生图 =====

export interface I2IParams {
  strength: number;       // 0.0 ~ 1.0，默认 0.7
  noise: number;          // 0.0 ~ 0.99，默认 0.0
  extraNoiseSeed: number; // 0 = 服务端随机
}

export const DEFAULT_I2I_PARAMS: I2IParams = {
  strength: 0.7,
  noise: 0.0,
  extraNoiseSeed: 0,
};

// ===== 重绘 =====

export const NAI_INPAINT_MODELS = [
  { label: "NAI Diffusion 4.5 Curated（推荐）", value: "nai-diffusion-4-5-curated-inpainting" },
  { label: "NAI Diffusion 4 Curated", value: "nai-diffusion-4-curated-inpainting" },
  { label: "NAI Diffusion 4 Full", value: "nai-diffusion-4-full-inpainting" },
  { label: "NAI Diffusion 3", value: "nai-diffusion-3-inpainting" },
] as const;

export type NAIInpaintModel = (typeof NAI_INPAINT_MODELS)[number]["value"];

// ===== 超分 =====

export type UpscaleScale = 2 | 4;

export interface UpscaleResult {
  ok: boolean;
  message: string;
  item?: HistoryItem;
}

// ===== Director Tools =====

export const DIRECTOR_TOOLS = [
  { label: "去除背景", value: "bg-removal", hasPrompt: false },
  { label: "线稿提取", value: "lineart",    hasPrompt: false },
  { label: "草图化",   value: "sketch",     hasPrompt: false },
  { label: "上色",     value: "colorize",   hasPrompt: true  },
  { label: "表情迁移", value: "emotion",    hasPrompt: true  },
  { label: "去除杂乱", value: "declutter",  hasPrompt: false },
] as const;

export type DirectorTool = (typeof DIRECTOR_TOOLS)[number]["value"];

export const EMOTION_OPTIONS = [
  { label: "中性（Neutral）",  value: "neutral"   },
  { label: "开心（Happy）",    value: "happy"     },
  { label: "悲伤（Sad）",      value: "sad"       },
  { label: "愤怒（Angry）",    value: "angry"     },
  { label: "惊讶（Surprised）",value: "surprised" },
  { label: "害怕（Scared）",   value: "scared"    },
  { label: "厌恶（Disgusted）",value: "disgusted" },
  { label: "惊叹（Amazed）",   value: "amazed"    },
] as const;

export type EmotionValue = (typeof EMOTION_OPTIONS)[number]["value"];

export interface AugmentOptions {
  defry: number;           // 0 ~ 5，默认 0
  colorizePrompt: string;  // colorize 时的颜色描述
  emotion: EmotionValue;   // emotion 时的表情
  emotionLevel: number;    // emotion 强度 0 ~ 5
}

export const DEFAULT_AUGMENT_OPTIONS: AugmentOptions = {
  defry: 0,
  colorizePrompt: "",
  emotion: "happy",
  emotionLevel: 0,
};

export interface AugmentResult {
  ok: boolean;
  message: string;
  item?: HistoryItem;
}

// ===== IPC 返回：加载图片 =====
export interface LoadImageResult {
  ok: boolean;
  image?: WorkingImage;
  message?: string;
}
```

---

## 4. NaiDesktopApi 接口追加（src/types.ts 的 NaiDesktopApi interface）

在 `NaiDesktopApi` 中追加：

```typescript
// 图生图
generateI2I: (params: GenerateParams, i2i: I2IParams) => Promise<GenerateResult>;

// 重绘
inpaint: (
  params: GenerateParams,
  inpaintModel: NAIInpaintModel,
  maskBase64: string
) => Promise<GenerateResult>;

// 超分
upscaleImage: (scale: UpscaleScale) => Promise<UpscaleResult>;

// 后期处理
augmentImage: (tool: DirectorTool, options: AugmentOptions) => Promise<AugmentResult>;

// 工作台图片加载（弹出文件选择框）
loadImage: () => Promise<LoadImageResult>;
```

注意：`generateI2I`、`inpaint`、`upscaleImage`、`augmentImage` 不传 base64 图片数据——
主进程从磁盘读取 `workbenchImagePath`（通过 `loadImage` 已记住路径）。
只有 `maskBase64`（由前端 Canvas 生成）通过 IPC 传递。

---

## 5. electron/ipc/nai.ts 新增函数

### 5.1 辅助函数：从磁盘读取 base64

```typescript
// 在文件顶部附近添加
import { app } from "electron";

/** 记录当前工作台图片路径（跨 IPC 调用共享） */
let workbenchImagePath: string | null = null;

export function setWorkbenchImagePath(p: string | null) {
  workbenchImagePath = p;
}

async function readWorkbenchBase64(): Promise<string> {
  if (!workbenchImagePath) throw new Error("请先加载图片。");
  const buf = await fs.readFile(workbenchImagePath);
  return buf.toString("base64");
}
```

### 5.2 loadImage（弹出文件选择框，记住路径）

```typescript
import { dialog } from "electron";
import { pathToFileURL } from "url";

export async function loadImageFile(): Promise<LoadImageResult> {
  const result = await dialog.showOpenDialog({
    title: "选择图片",
    filters: [{ name: "图片文件", extensions: ["png", "jpg", "jpeg", "webp"] }],
    properties: ["openFile"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false };
  }

  const filePath = result.filePaths[0];
  const buffer = await fs.readFile(filePath);
  const dims = readImageDimensions(buffer);
  const fileUrl = pathToFileURL(filePath).toString();
  workbenchImagePath = filePath;

  return {
    ok: true,
    image: { filePath, fileUrl, width: dims.width, height: dims.height },
  };
}

/** 从 PNG/JPEG/WebP 文件头读取尺寸 */
function readImageDimensions(buf: Buffer): { width: number; height: number } {
  // PNG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF0 (0xC0) / SOF2 (0xC2)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 9) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const len = buf.readUInt16BE(offset + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      }
      offset += 2 + len;
    }
  }
  // WebP VP8
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = buf.subarray(12, 16).toString("ascii");
    if (chunk === "VP8 " && buf.length > 29) {
      return { width: (buf.readUInt16LE(26) & 0x3fff) + 1, height: (buf.readUInt16LE(28) & 0x3fff) + 1 };
    }
    if (chunk === "VP8L" && buf.length > 25) {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return { width: 0, height: 0 };
}
```

### 5.3 generateI2I（图生图）

```typescript
export async function generateI2I(
  params: GenerateParams,
  i2i: I2IParams
): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!params.positivePrompt.trim()) return { ok: false, message: "请输入正面提示词。", items: [] };
  if (!workbenchImagePath) return { ok: false, message: "请先加载参考图片。", items: [] };

  currentAbort?.abort();
  currentAbort = new AbortController();

  const imageBase64 = await readWorkbenchBase64();
  const actualSeed = params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);
  const payload = buildPayload(params, actualSeed);

  // 在 parameters 中追加 i2i 字段
  (payload.parameters as Record<string, unknown>).image = imageBase64;
  (payload.parameters as Record<string, unknown>).strength = i2i.strength;
  (payload.parameters as Record<string, unknown>).noise = i2i.noise;
  (payload.parameters as Record<string, unknown>).extra_noise_seed =
    i2i.extraNoiseSeed > 0 ? i2i.extraNoiseSeed : crypto.randomInt(1, 2_147_483_647);

  const settings = getSettings();
  const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");

  try {
    const res = await axios.post(`${imageBaseUrl}/ai/generate-image`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/zip, application/octet-stream",
      },
      responseType: "arraybuffer",
      timeout: 180_000,
      signal: currentAbort.signal,
    });

    const buffers = await extractImages(res.data);
    if (buffers.length === 0) return { ok: false, message: "API 返回成功，但压缩包中没有图片。", items: [] };

    const now = new Date();
    const date = dateStamp(now);
    const dir = path.join(settings.outputDir, date);
    await fs.mkdir(dir, { recursive: true });

    const items: HistoryItem[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const id = crypto.randomUUID();
      const ext = detectExt(buffers[i]);
      const filePath = path.join(dir, `${now.getTime()}-i2i-${i + 1}-${params.model}.${ext}`);
      await fs.writeFile(filePath, buffers[i]);
      items.push({
        id, filePath, fileUrl: pathToFileURL(filePath).toString(),
        date, createdAt: now.toISOString(),
        params: { ...params, seed: actualSeed }, actualSeed,
        model: params.model, width: params.width, height: params.height,
      });
    }
    addHistory(items);
    void refreshStoredAccount();
    return { ok: true, message: `图生图完成，已保存 ${items.length} 张图片。`, items, actualSeed };
  } catch (error: any) {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return { ok: false, message: "已取消。", items: [] };
    }
    const status = error?.response?.status;
    const text = error?.response?.data
      ? Buffer.isBuffer(error.response.data)
        ? error.response.data.toString("utf8")
        : JSON.stringify(error.response.data)
      : error?.message;
    return { ok: false, message: `图生图失败${status ? `（HTTP ${status}）` : ""}：${text ?? "未知错误"}`, items: [] };
  } finally {
    currentAbort = null;
  }
}
```

### 5.4 inpaintImage（局部重绘）

```typescript
export async function inpaintImage(
  params: GenerateParams,
  inpaintModel: NAIInpaintModel,
  maskBase64: string
): Promise<GenerateResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。", items: [] };
  if (!workbenchImagePath) return { ok: false, message: "请先加载原图。", items: [] };
  if (!maskBase64) return { ok: false, message: "请先绘制蒙版区域。", items: [] };

  currentAbort?.abort();
  currentAbort = new AbortController();

  const imageBase64 = await readWorkbenchBase64();
  const actualSeed = params.seed > 0 ? params.seed : crypto.randomInt(1, 2_147_483_647);

  // 使用重绘模型构建 payload，action 改为 "infill"
  const inpaintParams = { ...params, model: inpaintModel as unknown as NAIModel };
  const payload = buildPayload(inpaintParams, actualSeed);
  payload.action = "infill";
  (payload.parameters as Record<string, unknown>).image = imageBase64;
  (payload.parameters as Record<string, unknown>).mask = maskBase64;
  (payload.parameters as Record<string, unknown>).add_original_image = true;

  const settings = getSettings();
  const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");

  try {
    const res = await axios.post(`${imageBaseUrl}/ai/generate-image`, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/zip, application/octet-stream",
      },
      responseType: "arraybuffer",
      timeout: 180_000,
      signal: currentAbort.signal,
    });

    const buffers = await extractImages(res.data);
    if (buffers.length === 0) return { ok: false, message: "重绘成功但无图片返回。", items: [] };

    const now = new Date();
    const date = dateStamp(now);
    const dir = path.join(settings.outputDir, date);
    await fs.mkdir(dir, { recursive: true });

    const items: HistoryItem[] = [];
    for (let i = 0; i < buffers.length; i++) {
      const id = crypto.randomUUID();
      const ext = detectExt(buffers[i]);
      const filePath = path.join(dir, `${now.getTime()}-inpaint-${i + 1}-${inpaintModel}.${ext}`);
      await fs.writeFile(filePath, buffers[i]);
      items.push({
        id, filePath, fileUrl: pathToFileURL(filePath).toString(),
        date, createdAt: now.toISOString(),
        params: { ...params, seed: actualSeed }, actualSeed,
        model: inpaintModel, width: params.width, height: params.height,
      });
    }
    addHistory(items);
    return { ok: true, message: `重绘完成，已保存 ${items.length} 张图片。`, items, actualSeed };
  } catch (error: any) {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return { ok: false, message: "已取消。", items: [] };
    }
    const status = error?.response?.status;
    const text = error?.response?.data
      ? Buffer.isBuffer(error.response.data) ? error.response.data.toString("utf8") : JSON.stringify(error.response.data)
      : error?.message;
    return { ok: false, message: `重绘失败${status ? `（HTTP ${status}）` : ""}：${text ?? "未知错误"}`, items: [] };
  } finally {
    currentAbort = null;
  }
}
```

### 5.5 upscaleImg（超分）

```typescript
export async function upscaleImg(scale: UpscaleScale): Promise<UpscaleResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。" };
  if (!workbenchImagePath) return { ok: false, message: "请先加载图片。" };

  currentAbort?.abort();
  currentAbort = new AbortController();

  const buf = await fs.readFile(workbenchImagePath);
  const dims = readImageDimensions(buf);
  const imageBase64 = buf.toString("base64");
  const settings = getSettings();
  const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");

  try {
    const res = await axios.post(
      `${imageBaseUrl}/ai/upscale`,
      { image: imageBase64, width: dims.width, height: dims.height, scale },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 300_000,
        signal: currentAbort.signal,
      }
    );

    // 超分响应是直接的 binary PNG，不是 ZIP
    const imgBuf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data);
    if (imgBuf.length === 0) return { ok: false, message: "超分成功但未返回图片。" };

    const now = new Date();
    const date = dateStamp(now);
    const dir = path.join(settings.outputDir, date);
    await fs.mkdir(dir, { recursive: true });

    const baseName = path.basename(workbenchImagePath, path.extname(workbenchImagePath));
    const filePath = path.join(dir, `${now.getTime()}-upscale${scale}x-${baseName}.png`);
    await fs.writeFile(filePath, imgBuf);

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      filePath,
      fileUrl: pathToFileURL(filePath).toString(),
      date,
      createdAt: now.toISOString(),
      params: { ...DEFAULT_PARAMS },  // import DEFAULT_PARAMS from types
      actualSeed: 0,
      model: `upscale-${scale}x`,
      width: dims.width * scale,
      height: dims.height * scale,
    };
    addHistory([item]);
    return { ok: true, message: `超分 ${scale}x 完成，已保存。`, item };
  } catch (error: any) {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return { ok: false, message: "已取消。" };
    }
    const status = error?.response?.status;
    const text = error?.response?.data
      ? Buffer.isBuffer(error.response.data) ? error.response.data.toString("utf8") : JSON.stringify(error.response.data)
      : error?.message;
    return { ok: false, message: `超分失败${status ? `（HTTP ${status}）` : ""}：${text ?? "未知错误"}` };
  } finally {
    currentAbort = null;
  }
}
```

upscaleImg 需要 import `DEFAULT_PARAMS` from `"../../src/types"`。

### 5.6 augmentImg（Director Tools）

```typescript
export async function augmentImg(
  tool: DirectorTool,
  options: AugmentOptions
): Promise<AugmentResult> {
  const token = getToken();
  if (!token) return { ok: false, message: "请先配置 API Token。" };
  if (!workbenchImagePath) return { ok: false, message: "请先加载图片。" };

  currentAbort?.abort();
  currentAbort = new AbortController();

  const buf = await fs.readFile(workbenchImagePath);
  const dims = readImageDimensions(buf);
  const imageBase64 = buf.toString("base64");
  const settings = getSettings();
  const imageBaseUrl = normalizeBaseUrl(settings.imageBaseUrl, "https://image.novelai.net");

  const body: Record<string, unknown> = {
    image: imageBase64,
    width: dims.width,
    height: dims.height,
    req_type: tool,
    defry: options.defry,
  };

  if (tool === "emotion") {
    body.prompt = `${options.emotion};;${options.emotionLevel}`;
  } else if (tool === "colorize") {
    body.prompt = options.colorizePrompt;
  }

  try {
    const res = await axios.post(`${imageBaseUrl}/ai/augment-image`, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/zip",
      },
      responseType: "arraybuffer",
      timeout: 180_000,
      signal: currentAbort.signal,
    });

    const buffers = await extractImages(res.data);
    if (buffers.length === 0) return { ok: false, message: "后期处理成功但无图片返回。" };

    const now = new Date();
    const date = dateStamp(now);
    const dir = path.join(settings.outputDir, date);
    await fs.mkdir(dir, { recursive: true });

    const ext = detectExt(buffers[0]);
    const filePath = path.join(dir, `${now.getTime()}-${tool}.${ext}`);
    await fs.writeFile(filePath, buffers[0]);

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      filePath,
      fileUrl: pathToFileURL(filePath).toString(),
      date,
      createdAt: now.toISOString(),
      params: { ...DEFAULT_PARAMS },
      actualSeed: 0,
      model: `director-${tool}`,
      width: dims.width,
      height: dims.height,
    };
    addHistory([item]);
    return { ok: true, message: `${tool} 完成，已保存。`, item };
  } catch (error: any) {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return { ok: false, message: "已取消。" };
    }
    const status = error?.response?.status;
    const text = error?.response?.data
      ? Buffer.isBuffer(error.response.data) ? error.response.data.toString("utf8") : JSON.stringify(error.response.data)
      : error?.message;
    return { ok: false, message: `后期处理失败${status ? `（HTTP ${status}）` : ""}：${text ?? "未知错误"}` };
  } finally {
    currentAbort = null;
  }
}
```

---

## 6. electron/main.ts 新增 IPC 注册

在 `registerIpc()` 函数中追加：

```typescript
// 导入新函数（文件顶部）
import {
  loadImageFile, generateI2I, inpaintImage, upscaleImg, augmentImg,
  setWorkbenchImagePath
} from "./ipc/nai";
import type { AugmentOptions, DirectorTool, I2IParams, NAIInpaintModel, UpscaleScale } from "../src/types";

// 在 registerIpc() 中追加：
ipcMain.handle("nai:loadImage", () => loadImageFile());
ipcMain.handle("nai:clearWorkbenchImage", () => { setWorkbenchImagePath(null); return { ok: true }; });
ipcMain.handle("nai:generateI2I", (_e, params, i2i: I2IParams) => generateI2I(params, i2i));
ipcMain.handle("nai:inpaint", (_e, params, inpaintModel: NAIInpaintModel, maskBase64: string) =>
  inpaintImage(params, inpaintModel, maskBase64));
ipcMain.handle("nai:upscale", (_e, scale: UpscaleScale) => upscaleImg(scale));
ipcMain.handle("nai:augment", (_e, tool: DirectorTool, options: AugmentOptions) => augmentImg(tool, options));
```

---

## 7. electron/preload.ts 追加桥接

在 `contextBridge.exposeInMainWorld("naiDesktop", {...})` 对象中追加：

```typescript
loadImage: () => ipcRenderer.invoke("nai:loadImage"),
clearWorkbenchImage: () => ipcRenderer.invoke("nai:clearWorkbenchImage"),
generateI2I: (params: GenerateParams, i2i: I2IParams) =>
  ipcRenderer.invoke("nai:generateI2I", params, i2i),
inpaint: (params: GenerateParams, inpaintModel: NAIInpaintModel, maskBase64: string) =>
  ipcRenderer.invoke("nai:inpaint", params, inpaintModel, maskBase64),
upscaleImage: (scale: UpscaleScale) => ipcRenderer.invoke("nai:upscale", scale),
augmentImage: (tool: DirectorTool, options: AugmentOptions) =>
  ipcRenderer.invoke("nai:augment", tool, options),
```

同时在文件顶部 import 中追加所需类型：

```typescript
import type {
  AppSettings, GenerateParams, SettingKey,
  I2IParams, NAIInpaintModel, UpscaleScale, DirectorTool, AugmentOptions
} from "../src/types";
```

---

## 8. src/store.ts — 新增 Workbench 状态和 Action

### 8.1 在 AppState interface 追加

```typescript
// Workbench 共享状态（图生图/重绘/超分/后期共用）
workbenchImage: WorkingImage | null;

// 图生图参数
i2iParams: I2IParams;

// 重绘参数
inpaintModel: NAIInpaintModel;
brushSize: number;
brushMode: "paint" | "erase";
inpaintMask: string | null;   // base64 PNG，由前端 Canvas 导出

// 超分参数
upscaleScale: UpscaleScale;

// Director Tools 参数
directorTool: DirectorTool;
augmentOptions: AugmentOptions;

// Action
loadWorkbenchImage: () => Promise<void>;
clearWorkbenchImage: () => void;
setI2IParam: <K extends keyof I2IParams>(key: K, value: I2IParams[K]) => void;
setInpaintModel: (model: NAIInpaintModel) => void;
setBrushSize: (size: number) => void;
setBrushMode: (mode: "paint" | "erase") => void;
setInpaintMask: (mask: string | null) => void;
setUpscaleScale: (scale: UpscaleScale) => void;
setDirectorTool: (tool: DirectorTool) => void;
setAugmentOption: <K extends keyof AugmentOptions>(key: K, value: AugmentOptions[K]) => void;
generateI2I: () => Promise<void>;
inpaint: () => Promise<void>;
upscaleCurrentImage: () => Promise<void>;
runDirectorTool: () => Promise<void>;
```

### 8.2 在 create() 初始值中追加

```typescript
workbenchImage: null,
i2iParams: { ...DEFAULT_I2I_PARAMS },
inpaintModel: "nai-diffusion-4-5-curated-inpainting",
brushSize: 32,
brushMode: "paint",
inpaintMask: null,
upscaleScale: 4,
directorTool: "bg-removal",
augmentOptions: { ...DEFAULT_AUGMENT_OPTIONS },
```

### 8.3 Action 实现

```typescript
async loadWorkbenchImage() {
  const result = await window.naiDesktop.loadImage();
  if (result.ok && result.image) {
    set({ workbenchImage: result.image, inpaintMask: null });
  }
},

clearWorkbenchImage() {
  void window.naiDesktop.clearWorkbenchImage();
  set({ workbenchImage: null, inpaintMask: null });
},

setI2IParam(key, value) {
  set((s) => ({ i2iParams: { ...s.i2iParams, [key]: value } }));
},

setInpaintModel(model) { set({ inpaintModel: model }); },
setBrushSize(size) { set({ brushSize: size }); },
setBrushMode(mode) { set({ brushMode: mode }); },
setInpaintMask(mask) { set({ inpaintMask: mask }); },
setUpscaleScale(scale) { set({ upscaleScale: scale }); },
setDirectorTool(tool) { set({ directorTool: tool }); },
setAugmentOption(key, value) {
  set((s) => ({ augmentOptions: { ...s.augmentOptions, [key]: value } }));
},

async generateI2I() {
  const state = get();
  if (!state.account.hasToken) {
    set({ showSettings: true, toast: "请先在设置中配置 API Token。" });
    return;
  }
  if (!state.workbenchImage) {
    set({ toast: "请先加载参考图片。" });
    return;
  }
  set({ isGenerating: true, lastError: "", statusText: "正在图生图..." });
  const result = await window.naiDesktop.generateI2I(state.params, state.i2iParams);
  if (result.ok && result.items.length > 0) {
    const current = result.items[0];
    set({ isGenerating: false, currentImage: current, statusText: result.message, toast: result.message });
    await get().refreshHistory(current.date);
    await get().refreshAccount();
  } else {
    set({ isGenerating: false, lastError: result.message, statusText: "图生图失败", toast: result.message });
  }
},

async inpaint() {
  const state = get();
  if (!state.account.hasToken) {
    set({ showSettings: true, toast: "请先配置 API Token。" });
    return;
  }
  if (!state.workbenchImage) { set({ toast: "请先加载原图。" }); return; }
  if (!state.inpaintMask) { set({ toast: "请先用画笔标记要重绘的区域。" }); return; }
  if (!state.params.positivePrompt.trim()) { set({ toast: "请输入正面提示词。" }); return; }

  set({ isGenerating: true, lastError: "", statusText: "正在重绘..." });
  const result = await window.naiDesktop.inpaint(state.params, state.inpaintModel, state.inpaintMask);
  if (result.ok && result.items.length > 0) {
    const current = result.items[0];
    set({ isGenerating: false, currentImage: current, statusText: result.message, toast: result.message });
    await get().refreshHistory(current.date);
    await get().refreshAccount();
  } else {
    set({ isGenerating: false, lastError: result.message, statusText: "重绘失败", toast: result.message });
  }
},

async upscaleCurrentImage() {
  const state = get();
  if (!state.account.hasToken) {
    set({ showSettings: true, toast: "请先配置 API Token。" });
    return;
  }
  if (!state.workbenchImage) { set({ toast: "请先加载图片。" }); return; }

  set({ isGenerating: true, lastError: "", statusText: `正在超分 ${state.upscaleScale}x...` });
  const result = await window.naiDesktop.upscaleImage(state.upscaleScale);
  if (result.ok && result.item) {
    set({ isGenerating: false, currentImage: result.item, statusText: result.message, toast: result.message });
    await get().refreshHistory(result.item.date);
  } else {
    set({ isGenerating: false, lastError: result.message, statusText: "超分失败", toast: result.message });
  }
},

async runDirectorTool() {
  const state = get();
  if (!state.account.hasToken) {
    set({ showSettings: true, toast: "请先配置 API Token。" });
    return;
  }
  if (!state.workbenchImage) { set({ toast: "请先加载图片。" }); return; }

  set({ isGenerating: true, lastError: "", statusText: `正在运行 ${state.directorTool}...` });
  const result = await window.naiDesktop.augmentImage(state.directorTool, state.augmentOptions);
  if (result.ok && result.item) {
    set({ isGenerating: false, currentImage: result.item, statusText: result.message, toast: result.message });
    await get().refreshHistory(result.item.date);
  } else {
    set({ isGenerating: false, lastError: result.message, statusText: "后期处理失败", toast: result.message });
  }
},
```

---

## 9. src/InpaintCanvas.tsx（新文件）

蒙版绘制画布组件。独立文件，不在 App.tsx 里。

```tsx
import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "./store";

export function InpaintCanvas() {
  const workbenchImage = useAppStore((s) => s.workbenchImage);
  const brushSize = useAppStore((s) => s.brushSize);
  const brushMode = useAppStore((s) => s.brushMode);
  const setInpaintMask = useAppStore((s) => s.setInpaintMask);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  // 初始化：画布设置为原图尺寸，全黑（=全部保留）
  useEffect(() => {
    if (!canvasRef.current || !workbenchImage) return;
    const canvas = canvasRef.current;
    canvas.width = workbenchImage.width;
    canvas.height = workbenchImage.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setInpaintMask(null);
  }, [workbenchImage, setInpaintMask]);

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      const rect = canvas.getBoundingClientRect();
      // 坐标映射：CSS 尺寸 → 实际像素
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const r = (brushSize / 2) * Math.max(scaleX, scaleY);

      if (brushMode === "paint") {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "white";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "black";
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    [brushSize, brushMode]
  );

  const exportMask = useCallback(() => {
    if (!canvasRef.current) return;
    // 导出为 base64 PNG（无前缀）
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    setInpaintMask(base64);
  }, [setInpaintMask]);

  if (!workbenchImage) {
    return (
      <div className="inpaint-empty">
        <p>在左侧点击"加载图片"后即可在此绘制蒙版</p>
      </div>
    );
  }

  return (
    <div className="inpaint-stage">
      {/* 底图 */}
      <img
        className="inpaint-base-img"
        src={workbenchImage.fileUrl}
        alt="原图"
        draggable={false}
      />
      {/* 蒙版画布，叠加在底图上 */}
      <canvas
        ref={canvasRef}
        className="inpaint-mask-canvas"
        onMouseDown={(e) => { isDrawingRef.current = true; draw(e); }}
        onMouseMove={draw}
        onMouseUp={() => { isDrawingRef.current = false; exportMask(); }}
        onMouseLeave={() => { if (isDrawingRef.current) { isDrawingRef.current = false; exportMask(); } }}
        style={{ cursor: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}'><circle cx='${brushSize/2}' cy='${brushSize/2}' r='${brushSize/2-1}' stroke='%230f6cbd' stroke-width='2' fill='${brushMode === "paint" ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}'/></svg>") ${brushSize/2} ${brushSize/2}, crosshair` }}
      />
    </div>
  );
}
```

---

## 10. src/App.tsx — 各 Tab 面板更新

App.tsx 中的每个 Tab 从 "coming-soon" 替换为真实 UI。以下是各面板的完整组件结构（用描述代替完整代码，Codex 自行编写组件，保持和 LeftPanel 一致的代码风格）。

### 10.1 WorkbenchImageUpload 公用组件

所有需要上传图片的 Tab（重绘/图生图/超分/后期）共用一个上传区组件：

```tsx
function WorkbenchImageUpload() {
  const workbenchImage = useAppStore((s) => s.workbenchImage);
  const loadWorkbenchImage = useAppStore((s) => s.loadWorkbenchImage);
  const clearWorkbenchImage = useAppStore((s) => s.clearWorkbenchImage);

  return (
    <div className="wb-upload">
      {workbenchImage ? (
        <>
          <img src={workbenchImage.fileUrl} alt="已加载" className="wb-thumb" />
          <small>{workbenchImage.width} × {workbenchImage.height}</small>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <Button className="full" onClick={loadWorkbenchImage}>重新加载</Button>
            <Button variant="ghost" onClick={clearWorkbenchImage}>清除</Button>
          </div>
        </>
      ) : (
        <Button className="full" onClick={loadWorkbenchImage}>📂 加载图片...</Button>
      )}
    </div>
  );
}
```

CSS for `.wb-upload`:
```css
.wb-upload { padding: 8px 0 12px; }
.wb-thumb { width: 100%; border-radius: 6px; aspect-ratio: 1; object-fit: contain; background: #f0f0f0; }
```

### 10.2 图生图 Tab（I2IPanel）

左侧面板，在 WorkbenchImageUpload 之后：
- Strength slider（`<input type="range" min={0} max={1} step={0.01}`，显示当前值）
- Noise slider（同上）
- Extra Noise Seed 输入框（0=随机）
- 分割线
- 和文生图相同的：模型选择、Style Prompt、正负提示词 tabs + textarea、尺寸、Seed、Variety
- 底部：生成按钮调用 `generateI2I()`

画布区（ImageCanvas）：
- 不需要修改，显示 `currentImage` 即可

### 10.3 重绘 Tab（InpaintPanel）

左侧面板：
- `<WorkbenchImageUpload />`
- 重绘模型选择（`NAI_INPAINT_MODELS` 下拉）
- 画笔大小 slider（8 ~ 128，默认 32）
- 画笔模式 toggle（画 / 擦）
- 清空蒙版按钮（`setInpaintMask(null)` + 重新初始化 canvas）
- 正负提示词 tabs + textarea
- 底部：重绘按钮 → `inpaint()`

主画布区：
- 当 `activeTab === "inpaint"` 时，将 `<ImageCanvas>` 替换为 `<InpaintCanvas>`（从 `./InpaintCanvas` import）

在 `MainPage` 的 workspace 里，判断 activeTab：
```tsx
{activeTab === "inpaint" ? <InpaintCanvas /> : <ImageCanvas />}
```

等等——实际上 ImageCanvas 组件是放在 `.workspace` 中间列的。只需在 ImageCanvas 内部（或 MainPage 的 workspace）根据 activeTab 决定渲染哪个画布即可。

### 10.4 超分 Tab（UpscalePanel）

左侧面板：
- `<WorkbenchImageUpload />`
- 倍率选择（2× / 4×）用两个按钮（选中时高亮）
- 如果有 workbenchImage，显示"原始尺寸 → 输出尺寸"预览文字
  - `{workbenchImage.width}×{workbenchImage.height} → {workbenchImage.width * scale}×{workbenchImage.height * scale}`
- 底部：超分按钮 → `upscaleCurrentImage()`，占满宽度

画布区：正常显示 `currentImage`（超分结果会自动写入 `currentImage`）。

### 10.5 后期 Tab（DirectorPanel）

左侧面板：
- `<WorkbenchImageUpload />`
- 工具选择：6 个按钮排成 2 列网格（类似 `.preset-row` 的 `grid-template-columns: 1fr 1fr 1fr`，但这里是 `1fr 1fr`）
  - 选中的工具按钮背景高亮（`.btn-primary` 样式）
- 动态参数（根据 `directorTool` 显示）：
  - `colorize`：Prompt 输入框（`colorizePrompt`）
  - `emotion`：表情下拉 + 强度 slider（0~5）
  - 其他：Defry slider（0~5，标签"去噪强度"）
- 底部：运行按钮 → `runDirectorTool()`

---

## 11. styles.css 追加

在现有 styles.css 末尾追加：

```css
/* ===== 工作台共用 ===== */

.wb-upload { padding: 8px 0 12px; }
.wb-thumb {
  width: 100%;
  border-radius: 6px;
  aspect-ratio: auto;
  max-height: 160px;
  object-fit: contain;
  background: #f0f0f0;
  border: 1px solid var(--border);
}

/* ===== Inpaint 画布 ===== */

.inpaint-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-canvas);
}

.inpaint-base-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  display: block;
}

.inpaint-mask-canvas {
  position: absolute;
  inset: 0;
  margin: auto;
  /* canvas 尺寸由 JS 设置，CSS 不设 width/height */
  max-width: 100%;
  max-height: 100%;
  opacity: 0.5;
  mix-blend-mode: screen;
  touch-action: none;
}

.inpaint-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}

/* ===== Director Tools 工具选择 ===== */

.director-tools {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 12px;
}

.director-tools button {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 6px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  text-align: center;
}

.director-tools button.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}
```

---

## 12. 注意事项 & 常见陷阱

1. **inpaint 的 canvas 坐标映射**：canvas 元素的 CSS 尺寸和实际像素尺寸（canvas.width/height）不一样，必须用 `getBoundingClientRect()` + scale 比例换算，否则笔触偏移。

2. **mask 导出时机**：`setInpaintMask` 在 `mouseUp` 和 `mouseLeave` 时调用，确保每次停笔后 store 里的 mask 都是最新的。不要在每次 `mousemove` 时 export（性能太差）。

3. **超分 responseType**：upscale 端点返回的是裸 binary PNG，不是 ZIP，不要用 `extractImages`，直接 `Buffer.from(res.data)` 保存。

4. **workbenchImagePath 作用域**：这是 electron 主进程中的模块级变量，不需要序列化到 store，也不需要持久化，关闭窗口即清空。

5. **model 类型兼容性**：`inpaintImage` 里用了 `params.model = inpaintModel as unknown as NAIModel`，这是因为 inpainting 模型不在 `NAI_MODELS` 的字面量联合类型里。`buildPayload` 根据 model 字符串里是否包含 "-4" 来判断 V4+ 结构，inpainting 模型名称同样满足这个条件。

6. **蒙版混合模式**：`inpaint-mask-canvas` 使用 `mix-blend-mode: screen`，这让白色涂抹区在底图上显示为高亮蓝色，用户可以直观看到要重绘的区域。

7. **I2I 图片尺寸**：图生图时，`params.width / params.height` 决定**输出**尺寸，不必和输入图片尺寸一致。API 会根据输出尺寸重新采样。左侧面板的宽高输入保持正常显示，让用户决定输出尺寸。

8. **Director Tools 返回 ZIP**：augment-image 返回格式和 generate-image 一样是 ZIP，直接复用 `extractImages(res.data)`。

9. **清空 workbenchImage 时也清 mask**：`clearWorkbenchImage` action 需要同时调 `setInpaintMask(null)` 并且触发 InpaintCanvas 的 canvas 重置（通过 useEffect 监听 workbenchImage 变化实现）。

---

## 13. 版本号

Phase 2 完成后 `package.json` version 改为 `"0.3.0"`，同时更新 `SplashPage` 和 `TitleBar` 中的版本字符串。
