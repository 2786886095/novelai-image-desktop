---
name: novelai-prompt-codex
description: 将中文画面描述、小说片段或参考图分析结果转换、校正和扩写为 NovelAI V4.5 提示词，并按需检索 NovelAI 个人法典。用于文生图提示词转换、图片反推结果精修、多人角色分段、source#/target#/mutual# 互动锚定、权重设计、冲突检查、Danbooru Tag 规范化，以及从新增资料中提炼可复用提示词经验。
---

# NovelAI 提示词法典

## 工作流

1. 判断任务是中文转提示词、图片反推精修、提示词诊断，还是资料入库。
2. 读取 `references/core-rules.md`，始终以其中的 V4.5 结构、成熟整词优先与冲突规则为最高优先级。
3. 运行 `python scripts/search_codex.py "用户描述或反推草稿" --mode convert` 检索相关条目；图片反推精修时改用 `--mode reverse`。需要排除分级条目时加 `--no-allow-adult`。
4. 普通与分级条目都可参与检索，但只召回与输入语义直接相关的条目，禁止把分级 Tag 混入无关场景。
5. 需要视角、表情、姿势、服装或场景映射时读取 `references/visual-mappings.md`；只有输入明确涉及分级内容时才读取 `references/classified-mappings.md`。
6. Danbooru 标签与混合模式必须先检索个人法典和 Danbooru 成熟 Tag；一个成熟 Tag 已能完整概括动作、姿态或构图时，只使用该 Tag 一次，不得再堆叠拆解词、近义词或自然语言复述。
7. 只有单一成熟 Tag 缺少关键差异时才使用最少必要的补充 Tag；候选不完全贴合时必须舍弃，不能硬套。
8. 输出前执行人数、角色归属、动作方向、镜头、姿态、成熟 Tag 覆盖范围、同义重复、权重与冲突检查。自然语言模式不执行成熟 Tag 强制规则。

## 输出原则

- 默认只输出最终英文 Prompt；用户要求解释、诊断或分项结果时才补充说明。
- 默认采用 80% Danbooru / NovelAI Tag 与 20% 简短英文自然语言；自然语言只补充空间、动作方向和互动关系。
- **成熟整词优先**：能由一个成熟 Tag 精确覆盖的概念只写一次；禁止同义堆砌和拆解复述。热门度只作为次级依据，语义贴合度永远优先。
- 不主动加入画师名、质量词或用户没有描述的内容。
- 单人、空镜、静物使用普通单行结构；双人及以上优先使用 `base | character 1 | character 2`。
- 原创角色用性别、外貌、服装和位置绑定，不依赖自定义名字或 `character A/B`。
- 复杂互动同时使用普通动作 Tag、`source#`/`target#`/`mutual#` 与角色段末尾的简短自然语言。
- 只给难生成、易丢失、易串位的关键元素加权，通常不超过 `1.5::...::`。
- 法典条目是检索参考，不是无条件拼接清单；拒绝复制明显拼写错误、冲突、重复或过时 Tag。

## 资料入库

提炼新资料时：

1. 只收录可复用的视觉映射、结构规则、权重经验与有效例句。
2. 不收录剧情专名、对白上下文、作者身份或与提示词无关的叙事事实。
3. 给每条内容添加来源、分类、关键词、分级标记和适用范围。
4. 与现有条目去重；对未经验证的 Tag 标记为候选，不冒充官方规范。
5. 更新 `references/guidance.json` 后，在软件仓库根目录运行 `node scripts/sync-novelai-prompt-codex.mjs`，同步软件移动端资源与个人技能。

## 资料位置

- 核心规则：`references/core-rules.md`
- 通用映射：`references/visual-mappings.md`
- 分级映射：`references/classified-mappings.md`
- 检索索引：`references/guidance.json`
- 来源与质量说明：`references/source-notes.md`
- 完整个人法典：仓库中位于 `src/data/prompt-codex.json`；同步到个人技能后位于 `references/prompt-codex.json`
