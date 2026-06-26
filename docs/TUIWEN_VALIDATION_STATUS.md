# 小说推文验证状态

更新时间：2026-06-26

这份文件记录 `docs/CLAUDE_HANDOFF_NOVEL_TUIWEN.md` 里两个硬前置和主要自动化验收的当前状态，避免把“已实现”误认为“已端到端验证”。

产品 UI 更新：用户已确认前置验证全部通过，`NovelTuiwenStudio` 首屏不再显示“前置验证”板块，也不再显示 `x/4 前置` 计数；底层 `preflight` 字段仅保留作旧项目 JSON 兼容。

## 已有自动化证据

- 导入解析：`src/tuiwen/import.test.ts` 与 `electron/ipc/tuiwen-import.test.ts`
  - TXT / SRT / ASS / LRC 基础解析。
  - 桌面 IPC `tuiwen:importFile` 支持 UTF-8、UTF-8 BOM、UTF-16LE、UTF-16BE，并在严格 UTF-8 解码失败时回退 GB18030/GBK。
  - 导入后直接生成 `TuiwenShot[]`，保留字幕开始时间与时长。
- 画幅映射：`src/tuiwen/aspect.test.ts`
  - NAI 出图尺寸与视频画幅统一映射。
  - scale-to-cover / Ken Burns 过扫描参数统一计算。
  - Opus 免费像素悬崖有提示。
- 项目模型：`src/tuiwen/project.test.ts`
  - 桌面专属项目默认值。
  - `bgm` / `intro` / `outro` 导出字段。
  - 旧项目归一化。
  - 快照恢复守卫：只有当前小说推文项目仍为空、且快照本身有内容时才自动恢复；避免异步加载快照时把 `activeShotId` 指向未实际载入的旧镜头。
  - 分镜支持新增、语义拆分、合并下一镜、上下移动与删除；重排后统一重建连续序号。
- 项目快照 / 文件存储：`electron/ipc/tuiwen-snapshot.test.ts`
  - 小说推文项目快照写入 Electron `userData` 下的 `tuiwen-project-snapshot.json`，不依赖 localStorage 承载大项目。
  - 测试覆盖含大 base64 参考图、已完成/失败分镜状态、输出路径与错误信息的项目保存与读取，保证关程序后续跑所需状态不会丢。
  - 缺失快照会返回可恢复的 miss；损坏 JSON 会报告错误但不删除原文件，便于用户或开发者抢救。
- 提示词兜底：`src/tuiwen/prompt-fallback.test.ts` 与 `electron/ipc/nai-convert.test.ts`
  - 未配置转换 API、API 调用失败或模型返回中英文拒答时，自动使用本地英文 NovelAI tag 模板，不再让整批分镜卡死。
  - 模板覆盖常见人物数量、景别、视角、动作、情绪、场景、天气、光线、发色眼色和服装，并复用全局英文风格/角色/参考图反推信息。
  - `convertComicPanels()` 主流程测试会直接 mock 设置和 `axios`：未配置 API 时不发网络请求；API 报错时每镜仍返回 fallback；模型返回 `Sorry, I can't help...` 时会替换为本地 prompt，而不是把拒答写进分镜。
- 配音：`src/tuiwen/audio.test.ts` 与 `electron/ipc/tuiwen-audio.test.ts`
  - edge-tts 语音目录、朗读时长估算、超长旁白拆镜提示。
  - TTS 失败时逐镜返回错误，保留手动导入音频回退路径。
  - 字幕项目可导入一条长音频，由 Chromium 解码后按 SRT / ASS / LRC 绝对时间码切成 PCM16 WAV；主进程验证 RIFF/WAVE、限制单片 32MB并原子落盘，不依赖 FFmpeg。
- TTS 代理接线：`electron/ipc/tuiwen-audio-edge.test.ts`
  - 使用 mock `msedge-tts`，不发真实网络请求，验证 Edge TTS provider 会把主进程传入的 `agent` 继续交给 `MsEdgeTTS` 构造器。
  - 主进程 `tuiwen:tts` 调用已从 `proxyConfig("ai")` 取 `httpsAgent/httpAgent` 注入 `synthesizeTuiwenSpeech`，覆盖 §3.7 / §9 的“TTS 外部请求走代理”要求。
- 运镜与转场：
  - 关键帧预设使用统一中间表示，导出时映射到剪映 `common_keyframes`。
  - CSS 预览按项目画幅显示当前镜运镜，并在末段叠入下一镜，近似预览淡入、左右滑、缩放与擦除转场；支持手动重播。
  - `electron/ipc/tuiwen-jianying.test.ts` 覆盖自定义关键帧导出：ScaleX/ScaleY/PositionX/PositionY/Alpha/Rotation 六组 `common_keyframes` 会写入每个视频段，关键帧时间不会越过镜头时长。
  - 同一测试覆盖转场 material：如 `slideLeft` 会生成 `materials.transitions` 条目，并被视频段 `extra_material_refs` 引用。
- 剪映草稿导出：`electron/ipc/tuiwen-jianying.test.ts`
  - 写出 `draft_content.json`、`draft_meta_info.json`、`draft_virtual_store.json`。
  - 目标版本锁定为剪映 10.9.0.14196：`version=400000`、`new_version=164.0.0`、`platform.app_version=10.9.0`；`164.0.0` 来自剪映对首次导入样例的实际升级写回。
  - 支持全局 BGM 轨、片头卡、片尾卡、旁白音轨、字幕轨。
  - 素材会复制进草稿目录，草稿 JSON 不引用原始外部素材路径。
  - 恶意项目名 / 素材名（如 `..\\outside:/bad*draft?`、`..escape-image.png`）不会让草稿或复制素材逃出所选草稿根目录；路径边界判断只把真正的 `..` / `../` / `..\\` 视为越界，避免误伤合法 `..name` 目录。
  - 自动优先读取剪映 `currentCustomDraftPath`，否则回退默认草稿目录。
  - 每次导出后自动执行导入前完整性验证：三件套可读、版本锁定、素材数量、素材内聚、轨道引用、时间轴、关键帧、meta 自洽、封面与虚拟素材仓；有结构错误时不再返回“导出成功”。
- NovelAI 精准参考请求组装：`electron/ipc/nai.test.ts`
  - V4.5 精准参考会触发 multipart 请求，`director_reference_images_cached[].data` 指向 `director_ref_N` 二进制表单字段。
  - 图生图 / 重绘 / 遮罩同时使用精准参考时，`image` 与 `mask` 也会被上传为同名 form part，JSON 内只保留字段名引用，避免 NovelAI 返回 `image field references unknown form part`。
  - 普通文生图仍保持 JSON 请求，不被误转 multipart。
- 小说推文批量生成队列 / 报价分组 / 花费回写：`src/tuiwen/generation.test.ts`
  - 续跑只选择未 `done` 且有提示词的镜头，失败镜头可单独重试，不会把整批重跑。
  - V4.5 下精准参考与 vibe 参考分开计数；非 V4.5 模型会把精准参考按 vibe 成本降级，避免虚假的精准参考报价。
  - 同一批内只按尺寸、步数、模型、采样器、SMEA 与参考数量等成本相关字段分组报价；同参数镜头共享一次 `quoteAnlas`，并保留按张数分摊的 fallback。
  - 生成成功会优先用生成前后账户余额差写回 `actualAnlas`，余额不可读时才退回报价分摊值；失败不会抹掉旧图与旧花费记录，便于残局续跑。
- 小说推文离线骨架端到端：`electron/ipc/tuiwen-pipeline.test.ts`
  - 不调用 NovelAI / LLM / edge-tts；用临时字幕文件模拟导入，用本地 prompt fallback 生成英文 tag，用精准参考 + vibe 参考验证 V4.5 计数组合。
  - 用假历史项模拟生成成功并写回 `outputPath` / `actualAnlas`，用本地 WAV 切片保存旁白音频，再设置关键帧、转场、BGM、片头、片尾。
  - 最后导出剪映草稿并运行 `validateTuiwenJianYingDraft`，覆盖导入 → 提示词兜底 → 参考传递 → 批量生成状态 → 配音落盘 → 运镜/转场 → 剪映导出的本地拼装链路。
  - 这条测试只能证明本地管线字段与草稿结构不会断裂，不能替代真实 NovelAI 出图一致性、真实 LLM 质量或真实 edge-tts 可用性验证。

## 真实环境验证状态

- NovelAI V4.5 精准参考跨镜一致性：未在本轮重新验证。
  - 原因：需要真 NovelAI Opus 账号、真实生成扣费/免费额度与人工比对。
  - 当前实现状态：代码路径已复用漫画生成器 `comicGeneratePanel`，V4.5 下按 `director_reference_*` 发送全局参考；非 V4.5 回退为 vibe；请求组装已有离线单元测试覆盖 multipart form part 引用，但这不能替代真实出图一致性验证。
  - 放量前动作：用 3–5 个分镜、同一角色精准参考，确认每镜角色一致且没有参考图上传格式错误。
- 目标剪映金标准样例：**已在剪映专业版 10.9.0.14196 真实打开通过。**
  - 本机目标版本证据：`JianyingPro/Apps/10.9.0.14196/JianyingPro.exe`，文件版本 `10.9.0.14196`。
  - 可重复命令：`npm run validate:jianying-draft`；会在剪映真实草稿目录生成 8 秒、3 镜的验证工程并先跑 12 项导入前自检。
  - 验证工程包含：片头、3 镜图片、片尾、5 段文字、3 段旁白音频、全局 BGM、3 个镜间转场及关键帧。
  - 首个 `new_version=127.0.0` 样例被剪映首次导入升级为 `164.0.0`，第一次只完成外部草稿注册，第二次才显示时间线；据此将导出版本锁定为 `164.0.0`。
  - 全新 `new_version=164.0.0` 样例在 2026-06-26 **首次打开即完整显示 8 秒时间线**，无需二次进入。
  - 验收截图：`docs/assets/tuiwen-jianying-10.9-golden-open.png`。
  - 剪映会补齐 `draft.extra`、`attachment_pc_common.json`、`Timelines/`、`.backup/` 等自身文件，并保留程序生成的 5 个视频段、5 个文字段、3 个旁白段、1 个 BGM 段与 3 个转场。
  - 追版要求：每次剪映大版本更新后重新运行同一验证脚本并真实打开核对。

## 不应标记完成的条件

只要以下任一项缺失，就不要把小说推文目标视为完全完成：

- 没有真实 V4.5 精准参考跨镜一致性样例。
- 真实端到端样例未覆盖：导入 → LLM 分镜 → 精准参考真实出图 → 批量续跑 → TTS/导入音频 → 运镜 → 剪映导出。当前仅有不扣费的离线骨架端到端测试。
