# NovelAI V4.5 提示词核心规则

## 目录

1. 输出约束
2. 单人与多人结构
3. 角色识别与原创角色
4. 空镜、静物与场景
5. 互动锚定
6. 权重
7. 成熟 Tag 检索与最短表达
8. 冲突检查

## 1. 输出约束

- 默认输出一行英文 Prompt，不附标题、解释或 Markdown。
- 混合模式约 80% Danbooru Tag、20% 简短英文自然语言。
- Tag 使用英文逗号加空格分隔。
- 不主动输出画师名和质量词；只有用户明确要求时才加入质量词。
- 不脑补未描述或图片中不可确认的内容。
- 优先保留用户明确强调的主体、动作、道具和构图。

## 2. 单人与多人结构

单人：

```text
1girl/1boy, solo, identity or appearance, clothing, expression, action, framing, background, atmosphere, short relation sentence
```

双人及以上：

```text
base prompt | character prompt 1 | character prompt 2
```

- Base 只写人数、场景、道具、镜头、整体构图、画风与可读文字。
- 角色段使用 `girl`、`boy` 或 `other`，不写 `1girl`、`1boy`。
- 角色顺序默认从左到右、从上到下。
- 角色独有外貌、服装、表情、动作和权重必须留在对应角色段。
- 简短自然语言放在对应角色段末尾，不要把全部互动句塞进 Base。

## 3. 角色识别与原创角色

- 明确的动漫、游戏或漫画角色优先使用准确英文角色 Tag；重名角色用作品名括号消歧。
- 搜索不到准确 Tag 时使用最常见英文名，不补充默认外貌和默认服装。
- 原创或未知角色使用性别 + 外貌 + 服装 + 位置绑定，例如 `boy, short black hair, white shirt`。
- 不使用 `character A`、`character B`、`someone` 或无法区分多个同性交色的 `he/she/they`。
- 两人可有限使用 `another`；三人及以上必须用外貌、服装、位置或动作锚点区分。

## 4. 空镜、静物与场景

- 无人物、静物、风景和动物场景优先以 `background dataset` 开头。
- 明确无人时加入 `no humans`。
- 物品特写加入 `object focus`，近景可加入 `close-up`。
- 动物主体可加入 `animal focus`。

## 5. 互动锚定

- 主动发起动作：`source#`。
- 接受动作或被影响：`target#`。
- 双方共同完成：`mutual#`。

常用组合：

```text
source#offer, target#offer
source#hug, target#hug, mutual#hug
source#pointing, target#pointing
source#looking at, target#looking at
source#carrying person, target#carrying person
source#holding hands, target#holding hands, mutual#holding hands
source#pulling, target#pulling
source#touching, target#touching
source#hand on shoulder, target#hand on shoulder
```

复杂互动必须同时包含普通动作 Tag、方向锚点与简短关系句。

## 6. 权重

- 普通可见元素不加权。
- 重要但不难：`1.15`–`1.25`。
- 易丢失或易串位：`1.25`–`1.35`。
- 关键互动、道具、特殊姿势、文字、罕见服装：`1.35`–`1.5`。
- 除非用户明确要求，不超过 `1.5`，也不给所有 Tag 加权。

## 7. 成熟 Tag 检索与最短表达

本节只约束 Danbooru 标签模式与混合模式；自然语言模式保持完整自然语言表达。

1. 先检索个人法典与本地 Danbooru 标签库，再决定动作、姿态和构图的 Tag。
2. 候选顺序按“语义贴合度 → 表达完整度 → 使用量”判断，热门度不能覆盖语义准确性。
3. 一个成熟 Tag 已经完整表达某个概念时，只保留该 Tag 一次，禁止同时加入其拆解词、近义词或自然语言复述。
4. 只有成熟 Tag 缺少用户明确要求的关键差异时，才补最少必要 Tag；补充词不能重复成熟 Tag 已包含的语义。
5. 法典或标签库候选与画面/描述不完全贴合时必须舍弃，不能为了使用“专业词”而硬套。
6. 输出前按概念逐项检查：人数、角色身份、动作、姿态、构图、视角、互动、场景。每个概念只保留一组最短且不冲突的表达。

示例：

- 已选 `dogeza` 时，不再堆叠一串等价的跪伏拆解词。
- 已选 `wariza` 或 `yokozuwari` 时，不再用多个近义坐姿词重复解释同一姿势。
- 已选 `cowboy shot` 时，不再加入与其冲突或重复的其他取景范围词。
- 成熟 Tag 只能替代它真正覆盖的语义；互动方向、关键道具或左右位置若未被覆盖，仍可最少量补充。

## 8. 冲突检查

- 不同时使用 `close-up` 与 `full body`。
- 不同时使用 `from front` 与 `from behind`。
- 不同时使用 `from above` 与 `from below`。
- 同一角色不能同时 `sitting` 与 `standing`，也不能同时位于左右两侧。
- 单人 Prompt 不应混入第二个人的身体部位或动作。
- 多人 Prompt 的每个动作必须绑定明确角色。
- 混合模式的自然语言不能全部集中在 Base。
