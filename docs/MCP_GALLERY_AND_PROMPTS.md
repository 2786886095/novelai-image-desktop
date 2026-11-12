# 桌面 MCP：图库、提示词和生成参数

桌面端设置中开启「MCP 服务」后，客户端重新获取工具清单。本次不改变已有连接地址、密钥或生图的 Anlas 限额。

## 生成到正确的分组

1. 用 `list_history_groups` 查询分组 ID；没有时用 `create_history_group` 建立。
2. 在 `generate_image`、`img2img` 或 `inpaint` 指定 `historyGroupId`。只影响当前请求；不指定时继承工作台，`__ungrouped` 则只保存到日期目录。
3. `prepare_generation` 可预览规范化参数、角色提示词和参考图数量，不提交生成或查余额；`estimate_cost` 用于单独估价。支持模型、尺寸、Seed、步数、采样器、CFG、Effort、角色、参考图、文件名前缀、透明背景、SMEA 及模型模式等选项；以当前模型支持的能力为准。

## 整理已保存图片

桌面「历史与素材」「作品」及 MCP 的 `move_history_images` 使用同一移动逻辑：保留原日期，把图片移到 `保存目录/原日期/目标分组`；设为未分组时回到日期目录。同名不覆盖，图片内容和历史 ID 不变。旧版只改过分组、磁盘位置未更新的图片，可手动对该图片重选目标分组，或用 `move_history_images` 重新指定当前组。本次不在启动时扫描或搬移整个图库；不移动配置保存目录之外的文件。

`preview_history_tag_classification` 从内嵌元数据预览分类；`apply_history_tag_classification` 需在桌面确认后才搬移原图。`trace_history_iterations` 保留 50% 相似度、角色更换另列的推断逻辑。

## 提示词和其他工具

- `list_prompt_templates`、`read_prompt_template`：浏览六种图片模板和两种漫画模板及用户副本。可按槽位和 ID 读正文，也能读当前版本的转换、反推、优化、自定义助手模板。不通过 MCP 覆盖或修改模板。
- `list_prompt_presets`、`list_reference_presets`、`search_artist_styles`：读取正面、风格与参考图预设或搜索画风词；参考图可以使用预设返回的句柄。
- `convert_prompt`、`reverse_prompt`、`plan_comic_prompts`：调用现有转换／反推服务。需要调用方确认（`confirmed: true`），服务商可能计费；漫画只返回推荐页数或逐页提示词，不生图。只读图片参数时请使用 `read_image_metadata`。
- 账号密钥、通用设置写入及未列出的功能没有经由本次扩展暴露。

## 已注册工具清单（29 项）

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
| `apply_to_workbench` | 把图片及内嵌生成参数加载到工作台 | 已有 |

### 模板、预设与提示词

| 工具 | 功能 | 本次 |
| --- | --- | --- |
| `list_prompt_templates` | 列出图片及漫画模板、选用状态和自定义副本 | 新增 |
| `read_prompt_template` | 读取指定模板正文或转换、反推、优化、自定义助手的当前模板 | 新增 |
| `list_prompt_presets` | 查询正面和风格提示词预设 | 新增 |
| `list_reference_presets` | 查询氛围转移／精准参考预设及引用 ID | 新增 |
| `search_artist_styles` | 搜索本地画风与画师标签 | 新增 |
| `search_tags` | 搜索 Tag | 已有 |
| `convert_prompt` | 调用配置的转换服务；需调用方确认，可能计费 | 新增 |
| `reverse_prompt` | 调用配置的图片反推服务；需调用方确认，可能计费 | 新增 |
| `plan_comic_prompts` | 推荐页数或生成逐页提示词，不提交生图；可能计费 | 新增 |
