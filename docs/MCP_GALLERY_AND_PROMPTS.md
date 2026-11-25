# 桌面 MCP：图库、提示词和生成参数

连接选择仍由用户在「账户管理」完成，不通过 MCP 配置或读取 Key。选择 OpenAI 兼容生图账号时，MCP 的 Anlas 估价及收费图片工具仍会拒绝，不会把未知的中转站扣费当作 Anlas，也不会自动回退到 NovelAI；请在软件文生图界面使用该账号。读取工作台状态时可看到当前模型和协议能力，不包含凭据。

桌面端设置中开启「MCP 服务」后，客户端重新获取工具清单。本次不改变已有连接地址、密钥或生图的 Anlas 限额。

## 生成到正确的分组

1. 用 `list_history_groups` 查询分组 ID；没有时用 `create_history_group` 建立。
2. 在 `generate_image`、`img2img` 或 `inpaint` 指定 `historyGroupId`。只影响当前请求；不指定时继承工作台，`__ungrouped` 则只保存到日期目录。
3. `prepare_generation` 可预览规范化参数、角色提示词和参考图数量，不提交生成或查余额；`estimate_cost` 用于单独估价。支持模型、尺寸、Seed、步数、采样器、CFG、Effort、角色、参考图、文件名前缀、透明背景、SMEA 及模型模式等选项；以当前模型支持的能力为准。

在 `img2img` 中传入 `enhanceMagnitude`（整数 1–5）可使用官网增强预设。五档的（强度，噪声）依次为（0.2，0）、（0.4，0）、（0.5，0）、（0.6，0）、（0.7，0.1）。选档后会覆盖单独传入的 `strength` 和 `noise`。`prepare_generation` 返回选档参数，`estimate_cost` 使用相同档位估价（`operation: "img2img"`）。

## 整理已保存图片

桌面「历史与素材」「作品」及 MCP 的 `move_history_images` 使用同一移动逻辑：保留原日期，把图片移到 `保存目录/原日期/目标分组`；设为未分组时回到日期目录。同名不覆盖，图片内容和历史 ID 不变。旧版只改过分组、磁盘位置未更新的图片，可手动对该图片重选目标分组，或用 `move_history_images` 重新指定当前组。本次不在启动时扫描或搬移整个图库；不移动配置保存目录之外的文件。

`preview_history_tag_classification` 从内嵌元数据预览分类；`apply_history_tag_classification` 需在桌面确认后才搬移原图。`trace_history_iterations` 保留 50% 相似度、角色更换另列的推断逻辑。

## 提示词和其他工具

- `list_prompt_templates`、`read_prompt_template`：浏览六种图片模板和两种漫画模板及用户副本。可按槽位和 ID 读正文，也能读当前版本的转换、反推、优化、自定义助手模板。不通过 MCP 覆盖或修改模板。
- `list_prompt_presets`、`list_reference_presets`、`search_artist_styles`：读取正面、风格与参考图预设或搜索画风词；参考图可以使用预设返回的句柄。
- `convert_prompt`、`reverse_prompt`、`plan_comic_prompts`：调用现有转换／反推服务。需要调用方确认（`confirmed: true`），服务商可能计费；漫画只返回推荐页数或逐页提示词，不生图。只读图片参数时请使用 `read_image_metadata`。
- 账号密钥、通用设置写入及未列出的功能没有经由本次扩展暴露。

## 已注册工具清单（59 项）

“新增／增强”指本轮桌面更新；移动端不提供本地 MCP 服务。

### 生成与参数

| 工具 | 功能 | 本次 |
| --- | --- | --- |
| `get_state` | 查看当前工作台参数、模型能力及账户状态 | 已有 |
| `prepare_generation` | 预览生效的生成参数、角色、参考图数量和保存分组，不生图、不查询余额 | 新增 |
| `estimate_cost` | 估算 Anlas，不执行生成 | 已有 |
| `generate_image` | 文生图；可指定保存分组 | 增强 |
| `img2img` | 图生图；可指定保存分组 | 增强 |
| `inpaint` | 局部重绘；可指定保存分组 | 增强 |
| `upscale` | 2 倍／4 倍放大 | 已有 |
| `director_tool` | 调用已支持的导演工具 | 已有 |
| `make_mask` | 为局部重绘制作蒙版 | 已有 |

### 图库与图片

| 工具 | 功能 | 本次 |
| --- | --- | --- |
| `list_history` | 按日期或分组查询本地生成历史 | 已有 |
| `list_history_groups` | 查询分组名称和 ID | 新增 |
| `create_history_group` | 创建或复用图库分组 | 已有 |
| `move_history_images` | 搬移图库原文件，保留日期并同步历史路径 | 增强 |
| `preview_history_tag_classification` | 读取图片内嵌 Tag，预览分类方案 | 已有 |
| `apply_history_tag_classification` | 在软件中确认后分类并搬移原文件 | 增强 |
| `trace_history_iterations` | 按提示词相似度和时间推断迭代，角色改变另列 | 已有 |
| `import_image` | 导入本地 PNG、JPEG 或 WebP | 已有 |
| `view_image` | 预览本地图片 | 已有 |
| `read_image_metadata` | 读取本地图片内嵌参数 | 已有 |
| `search_nax_collections` | 查询 NAX 模型实验目录，返回带来源署名的原站链接，不镜像图片。 | 新增 |
| `apply_to_workbench` | 把图片及内嵌生成参数加载到工作台 | 已有 |

### 模板、预设与提示词

| 工具 | 功能 | 本次 |
| --- | --- | --- |
| `list_prompt_templates` | 列出图片及漫画模板、选用状态和自定义副本 | 新增 |
| `read_prompt_template` | 读取指定模板正文或转换、反推、优化、自定义助手的当前模板 | 新增 |
| `prepare_character_group` | 预览角色组合，返回规范 JSON 和角色提示 | 只读 |
| `save_character_group` | 保存具名角色组合，不覆盖已有预设 | 本地写入 |
| `list_prompt_presets` | 查询正面和风格提示词预设 | 新增 |
| `list_reference_presets` | 查询氛围转移／精准参考预设及引用 ID | 新增 |
| `list_style_assets` | 查看画风分组、预设、封面及示例图句柄，支持按组分页 | 新增 |
| `create_style_group` | 创建或复用画风分组，不影响图库 | 新增 |
| `move_style_presets` | 预览并批量移动预设到指定分组 | 新增 |
| `attach_style_images` | 将图片逐项分配为预设封面或示例，不改变生成参数 | 新增 |
| `list_workbench_references` | 回读当前工作台已挂载的参考图 ID、用途和参数 | 新增 |
| `set_style_cover` | 将该预设已有的示例图设为封面，不复制、不参与生图 | 新增 |
| `mount_workbench_reference` | 必须明确选择氛围迁移或精准参考；不生图、不切换模型 | 新增 |
| `unmount_workbench_reference` | 按用途和 ID 从工作台卸载，不删除图片 | 新增 |
| `search_artist_styles` | 搜索本地画风与画师标签 | 新增 |
| `related_offline_tags` | 按最多 12 个原 Tag 或唯一译名，查找本地共现候选，并用已启用的词包校验及翻译；不联网、不重复返回输入标签。 | 已有 |
| `browse_nax_collection` | 只读访问 NAX 公共合集（`collectionId` 必填，可选 `chapter` 分册、`page` 界面页），返回每页最多 24 项对照图片及出处；只连接固定原站和图床，不启动浏览器。 | 已有 |
| `search_tags` | 按英文原 Tag 或当前离线词包翻译搜索，返回原 Tag、翻译和使用量；可选排序：`relevance`（默认，完整匹配 → 开头匹配 → 中间或末尾的片段 → 已识别主题的相关标签；英文原 Tag 和词包译名均可检索）、`popular`（使用量）、`alphabetical`（原 Tag 名）。不发起网络请求。桌面共用只读 SQLite 连接及有界缓存，不需要 Python 服务。未启用词包时提示先下载，不回退旧库或网络。 | 已有 |
| `convert_prompt` | 调用配置的转换服务；Tag/混合模式的词汇提示只查当前离线词包；需确认，模型请求可能计费 | 新增 |
| `reverse_prompt` | 调用配置的图片反推服务；词汇提示及结果中的 `tagMatches` 来自选定离线词包，不改变原提示词。需确认，模型请求可能计费 | 新增 |
| `plan_comic_prompts` | 推荐页数或生成逐页提示词，不提交生图；可能计费 | 新增 |

### 工作台资源与批处理

| 工具 | 功能 | 操作边界 |
| --- | --- | --- |
| `browse_prompt_library` | 分页搜索正面、负面、画风、常用片段的名称和正文 | 只读 |
| `edit_prompt_library` | 按 ID 批量改名、改正文，或新建；画风支持 0–5 星 | 预览后提交，不改工作台 |
| `apply_prompt_library_entry` | 将指定条目追加或替换到生成工作台对应文本框 | 预览后提交；不挂图、不生图；含角色的组合用已有角色工具 |
| `rename_history_group` | 修改历史分组显示名称 | 不搬移磁盘文件 |
| `rename_history_images` | 批量修改托管作品文件名 | 预览后提交，保留扩展名，逐项返回实际文件名 |
| `export_history_zip` | 将选中的历史 ID 导出为 ZIP | 用户在桌面选择保存位置，不接受客户端写入路径 |
| `read_image_metadata_batch` | 批读图片内嵌参数；每项单独报告成功或失败 | 只读；不是 AI 反推 |
| `list_local_favorites` | 分页列出本地收藏 | 不暴露文件路径 |
| `favorite_history_images` | 将指定作品批量复制到收藏 | 按内容去重，保留原图 |
| `manage_local_favorites` | 批量改收藏副本名，或移除收藏记录 | 移除记录须桌面确认，不删除原图或副本 |
| `save_reference_preset` | 将图片句柄保存为具名的氛围或精准参考预设 | 返回可复用的图片句柄，不挂载 |
| `organize_reference_presets` | 批量改名、移动参考预设，可指定新分组 | 不改变已挂载参考 |
| `mount_workbench_references` | 同时挂载最多 8 张图片，须明确选同一用途 | 模型、容量、用途校验失败不挂载 |
| `update_workbench_references` | 按已挂载 ID 批量调整强度、信息量或类型、保真度 | 先检查全组，不替换底图 |
| `unmount_workbench_references` | 按用途和 ID 批量卸载 | 不删原图或预设 |
| `delete_workspace_resources` | 永久删除明确选中的作品，或指定提示词库条目及其专属预览 | 精确预览 + 桌面用户逐批确认，最多 12 项 |
| `delete_reference_presets` | 永久删除选中的参考预设和库内副本 | 同样需要预览和桌面确认，不卸载工作台图片 |

**调用约定。** 带预览的调用先省略 `revision`；核对返回对象后，以同一组参数带回该值。修改参数或相关记录后必须重新预览。删除弹窗默认取消，无桌面窗口时不能提交；不存在可以代替点击的 `confirmed:true`。磁盘操作查看逐项结果，不要盲目重试整批。整理预设、收藏、读参数不触发生成或反推，不产生 API 费用。

**典型用法。** 把两张作品加入收藏：先调用 `favorite_history_images({"ids":["历史ID1","历史ID2"]})`，再带返回的 revision 提交，用 `list_local_favorites` 核对。把参考图存库后参与生成：先 `save_reference_preset`，需要时再用返回的 `reference-preset:…` 调用 `mount_workbench_references`。在 `list_workbench_references` 读到的才是工作台挂载 ID；卸载不会移除库里的预设。

**本轮盘点边界。** 原有历史搬组、按标签归档、画风批量挂封面、角色组合准备、模板读取、估价和单次生成继续走各自工具。没有新增从 MCP 直接控制任务队列、启动整批付费出图、改写账号／通用设置的接口：它们需要独立的费用确认、任务归属或凭据边界。工程库的跨项目编辑与导入导出不按普通图片文件处理。目录选择、画布手绘和拖拽保留为界面操作；在线收藏不是本地收藏库。不提供任意目录的批量改名或删除。


### 示例：整理画风与挂载到工作台

1. 用 `list_style_assets` 获取实际预设 ID，需要新组时调用 `create_style_group`。向 `move_style_presets` 传 `{"presetIds":["id1","id2"],"group":"水彩"}`，先看每项的原组和目标组；用相同参数加返回的 `revision` 才写入。无效 ID 或分组不会创建一半的移动。
2. 使用 `import_image` 返回的 ID、历史图片 ID、参考预设句柄或画风示例句柄。向 `attach_style_images` 传 `{"items":[{"presetId":"id1","image":"图片句柄","role":"cover"},{"presetId":"id2","image":"图片句柄","role":"example"}]}`。同样先预览再带 revision 提交。每批最多 32 项、每个预设最多 9 张；检查每项 ok。设置新封面不会删除旧图。仅作展示，不挂载、不生图。
3. 只有明确要求参与生成时调用 `mount_workbench_reference`：例如 `{"image":"图片句柄","kind":"precise","type":"style","strength":0.7}`。氛围迁移用 `"kind":"vibe"`。在工作台确认添加后才报告成功。模型不支持、已有冲突参考或正在生成时拒绝，不切换模型、不覆盖底图。超时先用 `list_workbench_references` 回读，不自动重试。用 `unmount_workbench_reference` 可单独移除。MCP 的独立生图调用仍按该调用的显式 references 执行，不自动继承工作台图片。

V5 Full 的精准参考需要 High；Curated 也支持精准参考。切换到 Med 后，工作室保留已挂载的参考图。切回 High 可继续使用，移除精准参考图后可用 Med 生成。MCP 预览、估价和生成会拒绝 Med 搭配精准参考。每张输出按每张参考图加收 5 Anlas。生成参数 `preciseReferences[].type` 和工作台挂载工具的 `type` 均支持 `costume`（服装）、`character_mainoutfit`（角色并优先相同服装）、`character&style_anyoutfit`（角色与画风且允许换装）。`character` 允许换装，`character&style` 优先相同服装，`style` 只参考画风。V5 强度范围 0–5，V4.5 强度范围 0–1 并支持 `fidelity`。V5 局部重绘不支持精准参考，氛围迁移可使用 V4.5。[NovelAI 官方公告](https://journal.novelai.net/precise-reference-v5/)

桌面与 MCP 生图共用参考图预处理。V5 和 V4.5 各自选择目标尺寸，等比缩放保留整图，比例不符时居中补白。


### Windows 画风自动迭代

- 原生 detective.start 支持可选 `lockedArtists: [{tag, weight, weightRange?: {min, max}}]`，最多 8 位、权重 0.25–2.4；指定范围时只在范围内尝试，省略范围时沿用固定权重。沿用人工扣费确认和原生启动校验；目录外画师只加到本次任务，不修改本地模型目录。
- 图片另存位置由用户通过原生目录选择器设置。工具参数不接受任意路径，未设置则继续使用内部任务目录。

### v2.9.9 候选：V5 文本接口

- 升级时，未记录技能版本但有旧版自定义正文的转换或反推任务保留原模板。显式选用的版本优先；不会用一个任务的版本覆盖另一个。
- `convert_prompt` / `reverse_prompt`：未指定 templateVersion / skillVersion 时分别继承软件转换或反推的选择；显式覆盖仅对本次生效。V5 Full 可选 1.0.0、2.0.0、3.0.0，V4.5 仅 1.0.0；模式 mixed / tags / natural。color=color|mono、bubbles=ignore|extract；反推另有 contentOnly。已知角色可请求双版本。黑白输出把对白外的常见色相转为灰阶；保留引号内原文。整页分镜按格分段，无台词允许空的气泡字段。以上是本地结果处理，不额外发起生成请求。反推只向视觉 API 提交重新编码的像素。
- `plan_comic_prompts`：可用 list_prompt_templates 按格式查询 templateId；省略时使用该格式在软件内的选中版本。不能跨格式选用。先用 action=storyboard，传剧本、format 和 totalPages。审阅返回的 pages 与 characters 后，action=generate，指定 batchFrom、pages=1 和 approvedPage；一页一请求，重编译用相同页号。可选 recommend 只推荐页数。每次均需 confirmed；仅调用文字模型，不代替生图确认。
- 单条台词精简：`plan_comic_prompts(action=shorten)` 发送单句，不发送整部剧本。超长或多行回复不替换原句。

生成工具的可选布尔参数 `autoAppendQuotedText` 与工作台共用：省略时沿用保存的设置（默认开启）。V5 与官网一样，从基础提示和已启用角色的配对引号（含单引号和「」）提取文字，按角色位置和文字顺序组成 `teXt:` 块，多段之间空一行。任一启用角色已有手写 `Text:` 时也不会另造自动块。标准或轻量质量预设保留 `no text`；关闭自动提取不关闭质量预设。从图片或历史记录复用提示词与采样参数时也遵循此开关。已有的非空手写文字块不重复追加，原文（含空格、标点和换行）保留在质量标签等自动内容之后；关闭自动提取也不会删除手写块。

### 角色提示的批量填充（基于 Yuemil 的 PR #93）
- 桌面「角色提示 → 批量填充」可复制给外部 AI 的生成或修改指令、读取当前角色、粘贴或导入 UTF-8 JSON/TXT。先显示解析预览，再由用户确认写回。命名保存的是整组角色提示词，不是 AI 指令。
- `prepare_character_group`：给出 `text` 或已有组合的 `presetId`（二选一），可指定 `model`；仅返回规范 JSON 和可传给生成工具的 `characterPrompts`，不改工作台，不扣费。按位置写回是桌面 UI 的确认操作。
- `save_character_group`：给出 `name`、`text` 和可选的 `model`，创建具名角色组合；重复名称自动区分，不覆盖已有组合。通过 `list_prompt_presets` 查找已有条目。此操作不触发生成。

### 输入画师串抽卡：角色与画风分栏

界面可选择使用生成页的角色。通过 MCP 复用一条已抽出的候选时，把候选画师串放在 `stylePrompt`；角色逐个放在 `characterPrompts`，用 `prompt`、`negativePrompt` 和可选的 `x/y` 表达。先用 `prepare_generation` 核对角色与参考图计数；不要把角色词拼进画师串。MCP 不因界面开关自动继承角色，也不会仅因预览而生成或扣费。

转换与图片反推经 MCP 调用时复用桌面传输层。仅官方 OpenCode Go v1 推理请求携带会话标识；一次任务内复用，不新增 MCP 参数、权限或工具。
