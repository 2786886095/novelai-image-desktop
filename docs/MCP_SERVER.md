# 本地 MCP 服务

让外部智能体（pi、Claude Code、Codex、Gemini CLI、Cursor、VS Code Copilot、Windsurf、Cline、OpenCode、Claude Desktop 等）通过 [Model Context Protocol](https://modelcontextprotocol.io) 直接操作本软件：生成、查看结果、裁切检查、带参考图重绘，结果照常进入历史记录与界面。

> 方向说明：这是**本软件作为 MCP 服务端**，供用户自己的本机智能体调用；软件内置的生图智能体仍然**不挂载**任何外部 MCP / 文件 / 命令能力（见 [PI_AGENT_REFERENCE_GAP.md](./PI_AGENT_REFERENCE_GAP.md) 的“安全边界”）。

## 启用

1. 设置 → **MCP 服务** → 打开“启用 MCP 服务”。首次启用自动生成访问令牌（加密保存在本机 userData）。
2. 在“接入客户端”中选择你的客户端，复制对应命令或配置。
3. 按需设置“单次调用 Anlas 上限”（默认 0 = 只允许免费操作）。

默认端口 `39280`，地址 `http://127.0.0.1:39280/mcp`。

## 安全与扣费边界

| 项 | 行为 |
|---|---|
| 默认状态 | 关闭；关闭时不监听任何端口 |
| 网络 | 校验 Host 和 Origin，只绑定 `127.0.0.1`；校验 `Origin`，防 DNS rebinding |
| 认证 | 每个请求都需要 `Authorization: Bearer <token>`（常量时间比较）；令牌可一键重新生成 |
| 扣费 | 每次付费调用先走软件自带估价；**估价不可用、余额不足或超过上限都直接拒绝，不调用 NovelAI** |
| 精准参考 | 上限按“每张参考图 × 每张输出 5 Anlas”保守计入（见下方实测） |
| 并发 | 付费调用串行排队，避免同时扣费 |
| 路径 | 图片参数接受本地绝对路径（只读导入到 `userData/mcp-attachments`，按内容哈希去重）；拒绝远程／相对路径、伪装图片和超过 16MP 的导入图片或历史 ID |

## 工具

| 工具 | 作用 | 付费 |
|---|---|---|
| `get_state` | 当前工作台参数、模型能力、账户与 Anlas、MCP 上限 | |
| `generate_image` | 文生图；支持多角色提示词与坐标、V5 `Text:` | ✓ |
| `img2img` | 图生图；支持角色提示词，V4.5 支持精准参考 / 氛围迁移；默认保持源图比例 | ✓ |
| `inpaint` | 局部重绘（配合 `make_mask`） | ✓ |
| `upscale` | 2× / 4× 超分 | ✓ |
| `director_tool` | 去背景、线稿、草图、上色、表情、整理 | ✓ |
| `estimate_cost` | 只估价不执行 | |
| `list_history` / `read_image_metadata` | 历史记录与 PNG 内嵌参数 | |
| `view_image` | 返回图片（可裁切局部，用于检查脸部等细节） | |
| `import_image` | 本地图片 → 附件 ID | |
| `make_mask` | 用矩形 / 椭圆生成重绘蒙版，附红色覆盖预览 | |
| `search_tags` | Danbooru 标签查询 | |
| `apply_to_workbench` | 把图片及参数载入工作台，方便用户手动继续 | |

省略的生成参数沿用当前工作台；`characterPrompts` 与参考图不继承。

## 推荐流程：多角色海报保持原设

V5 构图能力强但暂不支持精准参考；V4.5 支持精准参考但同时挂多张角色参考会互相串色。实测效果最好的做法：

1. V5 文生图出构图（角色提示词 + 坐标，逐角色负面词）。
2. 用 `view_image` 的 `region` 逐个裁切检查，选一张底图。
3. 每个角色头部单独裁切放大到 1024²，`img2img`（`nai-diffusion-4-5-full`，strength≈0.5）**只挂该角色自己的**精准参考（character，strength≈0.8，fidelity≈1）。
4. 羽化贴回底图。

## 上游 PR 作者报告的扣费（Opus，2026-10）

以下为 PR 作者提供的数据，本次接入没有调用付费接口复测；额度仍以实际服务端账单为准。

| 操作 | 软件估价 | 实际扣费 |
|---|---|---|
| V5 文生图 1216×832，28 步 | 0 | 0 |
| V4.5 图生图 1216×832，3 张精准参考 | 16 | 15 |
| V4.5 图生图 1024×1024，1 张精准参考 | 15 | 5 |

即 Opus 免费范围内的图生图本体不扣费，精准参考按参考图数量计费。MCP 上限据此保守计算；软件界面自身的估价公式未在本次改动中调整。

## 本地验收

执行 `node scripts/check-local-mcp.cjs .`：使用隔离临时目录和假的账户／执行器，仅创建本机回环服务器，不访问用户账户、不发起付费生图。覆盖开关、令牌、协议、费用门槛、图片／蒙版及旧令牌失效。

MCP 的 Anlas 工具只允许当前原生 NovelAI 服务；切到兼容 OpenAI 生图时拒绝执行，避免拿 Anlas 估价作为其他服务的付费授权。PR #64 的 OpenAI 重绘仍通过其独立设置与界面使用。

## 协议

Streamable HTTP，无状态（不分配会话 ID），仅 `POST /mcp`。协议版本 `2024-11-05`、`2025-03-26`、`2025-06-18`、`2025-11-25`。客户端声明接受 `text/event-stream` 时，`tools/call` 以 SSE 返回，并每 10 秒发送进度通知（有 `progressToken` 时）或心跳注释，长时间生成不会被客户端超时断开。不提供旧版独立 SSE 端点与 OAuth。
