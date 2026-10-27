# NovelAI Diffusion V5 单分镜漫画提示词模板 · v1.0

> **适用**：NovelAI Diffusion **V5 Full**。一图一格（一个镜头 = 一张图），后期拼页或用 BCS 排字。
> **与 v4.0 整页模板的分工**：
> - **本模板（单分镜）**：一图一格。要精确控制构图、连续性、角色一致性、单格张力时用。**跨格连贯性比整页强得多**，因为每格独立出图、可单独重掷。
> - **v4.0（整页）**：一图多格。要「翻页感」、气泡排版、版式张力时用。
> - **不要混用**：整页模板的版式句/格位称呼在本模板里没有意义；本模板的连续性表在整页模板里也不需要。
>
> 标记：**[官方]** = NovelAI 官方文档；**[实测]** = 我们 60+ 张受控实验（含 3-seed 复验）；**[经验]** = 实测得出、官方未承诺。

---

## 0 · 出图设置（不做好这几项，prompt 写得再对也出不来）

| # | 设置 | 值 | 原因 |
|---|---|---|---|
| 1 | 模型 | `nai-diffusion-5-full` | Curated 容量约减半，本模板的密度不适用 |
| 2 | **负面提示词 / negativePrompt** | **默认不用**（不传，用软件默认；模板正文也不写负面/UC） | **默认不加任何负面提示词。** 负面交给软件设置。唯一注意：软件默认负面里若带 `multiple views`，单格出图正好用它压住分格，保持默认即可 |
| 3 | **风格提示词 / stylePrompt** | **不传，继承软件默认**（`stylePrompt: inherit`）。**模板不生成、不代填任何画师串** | 沿用软件里锁定的默认风格提示词（`lockedStylePrompt`）。**默认不加任何风格提示词，也不自己写画师串**——风格由用户自己的设置决定。（实测参考：留空 vs 继承是两种画风，留空更接近 V5 原生动漫质感；本项目按用户设置走继承） |
| 4 | **Quality Tags / qualityPreset** | **不传，继承软件默认**（本机是 `none`） | **默认不用质量提示词。** 正文**不写** `masterpiece / best quality / very aesthetic / absurdres`（软件的风格串里已经带了，再写就是双写）。⚠️ 另外：开 standard 时工具会把质量词**追加到 prompt 末尾**，而 `Text:` 必须在段末 → 会被画成文字 |
| 5 | **色彩档词** | **一律不写**（不加 `monochrome`，也不加 `full color`） | **默认不加任何色彩/风格档词。** 色彩由风格提示词与软件设置决定，prompt 只写**画面内容**。用户明确要黑白时才加 `monochrome, greyscale`（见 §9） |
| 6 | effort | **High**（本机默认） | Medium 会丢弃负面词 [官方] |
| 7 | 尺寸 | 单格 **832×1216**（竖）或 **1216×832**（横）。格内构图决定方向，**不要用 prompt 写尺寸** |
| 8 | seed | 对比改动时固定；重掷时换 seed。**seed 不能锁身份** [官方] |

> **一句话：模板只产出「画面内容」。不写画师串/风格词（继承软件默认设置）、不写质量词、不写色彩档词、负面用软件默认。**
> 调用时只传 `positivePrompt` + 模型与采样参数（model / width / height / steps / cfgScale / sampler / noiseSchedule / seed / effort），其余全部继承。

---

## 1 · 输出契约

1. **一行一格**，行内不换行。
2. prompt **纯英文**。中文只能出现在 `Text:` 载荷和载体句的引号里。
3. 不写画师名、质量词、尺寸词。
4. tag 全小写，半角 `, ` 分隔。自然语言拆成 2–4 个短语，每个逗号片段算 1 个语义单元，不写一整段长句。
5. 分段符 ` | `（两侧各一个空格）。每段以 `girl` / `boy` / `other` 开头，不带数字。
6. **禁止「同上 / same as before」**。每格写满自己可见的内容。
7. 附注只给：设置清单、角色位置表、文字清单。不复述规则。

---

## 2 · 骨架

```text
<人数tag>, <色彩档词>, <介质tag×0–3>, <场景tag×3–8>, <景别tag×1>, <机位tag×1–3>,
<depthness|high complexity×0–1>, <环境短语×3–6>, <4类必写词×按需>, <-1::排除::×0–1>,
<text, 语言tag×0–1组>, <Text: 原文×0–1>
 | girl, <H 头部锚>, <O 服装锚(按景别删画外项)>, <状态/表情/动作tag>,
         <动作关系句×1>, <细节短语×3–8>
 | boy, …
```

**槽位规则**

| 槽位 | 规则 |
|---|---|
| 人数 tag | 本格可识别人物数，男女分开；**人数总数 = 段数**。**不写 `solo`** |
| 景别 | **只选一个**：`close-up / portrait / upper body / lower body / cowboy shot / feet out of frame / full body / wide shot / very wide shot` [官方] |
| 机位 | 从 `from above / from below / from side / from behind / dutch angle / profile / facing viewer` 里选 **1–3 个，且必须互斥**（见 §5.3） |
| base | 只放人数、场景、镜头、全局排除、文字、没人拿着的道具。**人物的外貌/服装/表情/动作一律写进段里** |
| 动作关系句 | 至少 1 句，写清**是谁的哪只手、朝哪边、碰到什么** |

---

## 3 · 长度与容量（含实测公式）

### 3.1 目标密度：按「复杂度」算，不按人头算 [实测]

```
T ≈ 5N² + 15N + E + C + L
```

| 项 | 取值 |
|---|---|
| **N** 人数 | 本格可识别人物数 |
| **E** 环境密度 | 简单房间/纯色背景 **8** ｜ 咖啡馆/教室/卧室 **18** ｜ 工坊/图书馆/街市/废墟 **25** |
| **C** 服装层次 | 基础款 **0** ｜ 多层服装+配饰 **+15**（封顶） |
| **L** 光影层数 | 平光 **0** ｜ 多层光 **+15**（封顶） |
| 视角 | **+0，不进公式**（见 §5.3） |
| 安全区间 | `T × 0.9 ~ T × 1.1` |

**实测锚点**：1 人简单环境 26（3-seed 极差 0）｜1 人复杂服装 / 多层光 / 极复杂环境各 45（平台 45–82）｜
2 人中等环境 65（极差 0）｜3 人复杂环境 110–130｜4 人 116｜6 人 ≥194（接受姿态退化）。**写满会掉分**（1 人写满 31 → 12 分，26 档 14 分），留 10–20% 余量。

### 3.2 每角色段：25–30 个 tag（硬边界）[实测]

| 区间 | 会发生什么 |
|---|---|
| **< 25** | **角色合并**：两个角色被压成**一个身体**，A 的签名道具跑到 B 身上（实测 6 人场景：银发女与红发男合成一人，女装身体穿红色运动外套、抱篮球、拿咖啡杯） |
| **25–30** | 安全区 |
| **> 30** | **角色被自己的 tag 改写**：长出机械臂（`gauntlet` 字面落地）、双马尾退化成侧马尾（`side ponytail` 压过 `twintails`）、男孩壮汉化（`muscular/scar/tattoo`） |

**多人场景的硬下限**：4 人 ≥23 / 6 人 ≥26。

### 3.3 容量上限

- 整行 ≤1400 词（V5 Full 约 1471 token [官方]）。
- 超限时**先删重复的环境短语，不删人物锚和道具锚**。
- **不要写满**：人物/角色段写满会掉分（1 人写满 31 → 12 分，26 档是 14 分）。留 10–20% 余量。

---

## 4 · 4 类必写词（比 tag 数量更重要）[实测，逐条跨 seed 4/4 生效]

| # | 类别 | 怎么写 | 不写会怎样 |
|---|---|---|---|
| ① | **关键结构显式** | 建筑/窗/家具用**具体词**：`three tall window panes, thick wooden mullions, small transom panes` | 只写 `window, transom` → 竖梃全丢 |
| ② | **颜色隔离** | 写红色饰物时**同时锁死主服装色**：`black coat, black pants, red ribbon only` | 红色串到裙子/眼睛/蕾丝边 |
| ③ | **物体数量显式** | 同类物体超过一个时点名：`second white paper cup on table` | 只写 `disposable coffee cup` → 被手里的杯子语义吸收，桌上那只消失 |
| ④ | **体型显式** | `slim, petite` 必须写 | V5 自补夸张体型（实测 5 个场景全中） |

**这四类允许直接用描述性英文短语**，不必强求 Danbooru 词表里存在（实测 `small transom panes` 这类非词表短语 V5 照样执行）。

**另外两条必写**：
- **关键属性写死**：发色 / 发型 / 服装 / 体型 四项逐项写出。**「不写」不等于「中性」，等于「交给模型随机」**——实测同一角色三份 prompt 都没写发色，三张图出现三种发色 [实测]。
- **姿态要分配**：多人共用同一个姿态词（`sitting`）时，模型只保证一两个。**姿态类事实会互相竞争** [实测]。

---

## 5 · 分镜库（单分镜的核心资产）

### 5.0 ⚠️ 画幅与景别必须配对：**竖图只用中景/近景，远景用横图**

| 画幅 | 允许的景别 | 不允许 |
|---|---|---|
| **竖图 `832×1216`（默认）** | **中景 / 近景**：`upper body`、`cowboy shot`、`portrait`、`close-up`、`close-up of hands` | ❌ `wide shot` / `very wide shot` / `full body` —— 竖幅装不下，人物会缩成一小块、环境挤成一团 |
| **横图 `1216×832`** | **远景 / 全景 / 建立格**：`wide shot`、`very wide shot`、`full body` | 横图也能拍中近景，但没必要——中近景一律优先竖图 |

**规则**：
1. **默认竖图 + 中景/近景。** 整部漫画的大部分格应该是 `upper body` / `cowboy shot` / `portrait` / `close-up`。
2. **需要远景/建立格时，把这一格改成横图**（`1216×832`），不要硬塞进竖图。
3. **出图时按格传尺寸**：竖格传 `832×1216`，横格传 `1216×832`。**不要在 prompt 里写尺寸词。**
4. 一个序列里横格不要超过 1/4——远景是调剂，不是主力。

> 实测教训：8 格测试里把 `wide shot` 塞进 832×1216，人物被压到画面下半部、环境占满上方，读起来不像漫画格。

### 5.1 景别与用途

| 景别 | 用途 | 服装/身体 tag 的取舍 | 画幅 |
|---|---|---|---|
| `wide shot` / `very wide shot` | 建立格：交代空间 | 全身 + 2–3 条场景短语 | **横图** |
| `full body` | 动作格 | 全身 | **横图** |
| `cowboy shot` | 对话格（最常用） | **不写鞋袜** | 竖图 |
| `upper body` | 对话格 / 反应格 | 上半身，删画外项 | 竖图 |
| `portrait` | 反应格 | 只写头部锚和领口 | 竖图 |
| `close-up` | 情绪顶点 / 细节 | 只写该部位 | 竖图 |
| `close-up of hands` | 手部格 | 写清手从哪边入画、碰到什么 | 竖图 |

**一页/一序列的景别配方**：建立格（横图）→ 对话格（竖）→ 反应格（竖）→ 细节格（竖）。**同一景别连续不超过 2 格。**

### 5.2 机位与张力

| 目的 | 写进 prompt |
|---|---|
| 平视（默认，占 85%） | 不写，或 `from the front` |
| 压迫 / 体量差 | `from below, low angle looking up` |
| 怼镜头 | `arm thrust toward the viewer, strong foreshortening` |
| 速度 / 冲击 | `motion blur, speed lines` / `emphasis lines` |
| 不安 | `dutch angle` |
| 情绪顶点 | `extreme close-up`（眼、手指、刀锋） |
| 俯视（躺/趴/坐的默认机位） | `from above` |
| 破框 | `her right arm breaking past the right edge of the panel` |

### 5.3 ⚠️ 机位必须互斥，视角不进密度公式 [实测]

实测：只加强「视角」维度（低角度/荷兰角/广角/画框套画框/前景遮挡堆一起）→ 得分 **13 → 11**，画面出现双杯、腿占半屏、**前景巨型糊手块占 1/3 画面**。

**规则**：
1. **一次只选一个机位组**。`low angle` 与 `high angle` 不能同写；`from below` 与 `from above` 不能同写。
2. **`straight-on` / `from front`（正面平视）与 `head down` / `looking at own hands`（低头看手）互斥** —— 同写时 V5 一律选机位、放弃低头 [实测，两次复现]。要低头就用 `from above` 或干脆不写机位。
3. **景别与机位不能打架**：`upper body` 与 `wide shot` / `extreme close-up` 不能同时写。
4. **视角类 tag 写到 1–3 个就饱和**，再多不加分只扣分。

---

## 6 · 跨格连续性规则（单分镜独有的核心）

单分镜是一格一张图，**连贯性必须靠规则保证，不能靠模型自己接**。

### 6.1 五张表（先建，跨格不改）

```
【角色卡·彩色版】代号 | 段首 | H 头部锚 6–10 | O 服装锚 4–8 | P 道具锚 0–3 | ID 带权重指纹
【角色卡·黑白版】同代号 | 同样的 H/O/P，但全部换成明暗词（见 §0.3 转换表）
【场景锚 S】地点 | 结构（用 §4① 的具体词）| 关键陈设 3–6 | 逐字复用
【光线锚 L】地点时段 | 主光方位 | 明暗 | 逐字复用
【状态表】格号 | 服装状态 | 左手 | 右手 | 伤势 | 站位
```

> **两张角色卡都必须有。** 彩色档用彩色卡、黑白档用黑白卡，**用哪套就逐字复用哪套**——
> 实测：只给彩色卡时，8 个子代理给出三种改法（照抄 → 全彩 / 改灰 → 灰度 / 只在细节句留色 → 全彩）。

### 6.2 六条连续性硬规则

1. **角色卡逐字复用**：同一角色的 H 串**逐字照抄**，不许换同义词、不许调顺序。O 按景别整项删减，但不改词。
2. **带权重身份指纹**：V5 会在同一行内**跨角色全局去重**重复的 tag [经验]。用 `1.2::black hair ::, 1.2::long hair ::, 1.2::brown eyes ::` 锁住，带权重的锚串不会被去重。
3. **180° 规则**：同一场对话里，两人的视线方向必须相反。`facing right` 与 `facing left` 成对出现。
4. **状态不重置**：已成立的状态（衣服湿了、手上有伤）不因新动作而重置；伤势出现后**所有可见格都要写**。
5. **场景锚/光线锚逐字复用**：同一地点同一时段，S 和 L 两串一个字都不改。近景格只保留镜头内的那部分。
6. **序列表自检：机位列与内容列不得矛盾**。实测事故：某格机位写 `from the front`、内容列写「背对镜头」→ 编译器无所适从。写表时先自查这一条。

### 6.3 正反打（对话序列的标准做法）

- 开左右两个等大的近景格，一人一边，机位同侧（`from the front` 或 `from the side`）。
- **不写 `over the shoulder`** [经验，跟随度低]。
- 两格的景别必须相同或相邻一档，不要一格 `close-up` 一格 `full body`。

---

## 7 · 角色一致性

1. **角色卡先出**，跨格不改。
2. **发色/发型/服装/体型四项必须写死**（见 §4）。不许靠「不写」。
3. **V5 没有 Precise Reference / Vibe Transfer** [官方]。要锁脸只有两条路：
   - **V5 出定妆图 → 再用 `img2img`，`model: nai-diffusion-4-5-full` + `preciseReferences`（type: character, strength ≈ 0.5）**（每图 +5 Anlas）
   - 固定 seed + 角色卡逐字复用（省钱近似，但不保证）
4. **表情只写在角色段里**，base 不放表情 tag（放了会全员同一张脸）。
5. **相邻格的表情不完全相同**。

---

## 8 · 文字层

| 路线 | 何时用 | 写法 |
|---|---|---|
| **T0 后期排字（默认）** | **默认全部走这条** | prompt **不写** `text` / `Text:` / 引号 / 气泡。留位置用 `empty space above her head`；**防止模型自己画随机气泡**用 `-1::speech bubble ::`。原文进「文字清单」，由 BCS / 气泡字幕后期排 |
| **T1 单格图内字（可选）** | 用户**明确要求**画面内出现文字（道具字、招牌、或 1–2 句短对白） | base 加 `text, chinese text`，载体句复述原文，最后写 `Text: "原文"` |

> **默认不生成字幕。** 只有用户明确说「要画面里有字」才走 T1。T0 下画面是**干净无字**的，文字后期加——这样重掷时不会把文字画坏、也不会因为改一句话就重出整格。
> ⚠️ **压随机气泡的剂量**：`-1::speech bubble ::` 实测 10/10 有效（10 页样片无一出现随机气泡）；若个别 seed 仍冒出气泡，再升级为 `-3::speech bubble ::`（按 §10.2 剂量曲线，-3 才是「删物体」）。
>

**硬规则（走 T1 时才适用）**
1. **`Text:` 必须是所在段（base 或该角色段）的最后一项**，后面再写的任何内容都可能被画成字 [官方 + 实测]。
   ⚠️ **实测事故**：把 `-1::color ::` 加在 `Text:` 之后 → **负权重语法被当成文字画到页面上**（右侧竖排出现「color, colored, colorful」）。负权重必须放在 `text` 组**之前**。
2. 用 `Text:` 时，同段必须有 `text` + 语言 tag [官方]。
3. **每条 ≤40 字符**；中文每条 ≤12–16 字（竖排每列 8–14 字）。
4. **每格最多 2 个气泡**。
5. **拟声不进 `Text:`**：写 tag `sound effects` + `bold hand-drawn lettering SLAM beside the fist`。
6. 静默格什么都不写，不写 `no text in this panel`。
7. **T0 下也不要写 `text` / `chinese text` tag**——写了模型会试图画字。

**载体句模板（仅当用户明确要求 T1 时用）**（每条算一个逗号片段，**句中不得再出现逗号**）

> **默认不写这些。** 下面是用户明确要画面内文字时才用的模板；实测 T1 路线 4/4 成功（竖排中文逐字正确、位置对、气泡不挡脸），但**默认不用**。

- 旁白（横排）：`a square narrator box in the top right corner reads in Chinese lettering, Text: "原文"`
- **旁白（竖排，实测 2/2 成功）**：`a tall vertical narrator box at the right edge of the page reads in vertical Chinese lettering, Text: "原文"`
- **台词（竖排，实测 2/2 成功）**：`a tall vertical speech bubble beside her mouth reads in vertical Chinese lettering, Text: "原文"`
- 对白：`a speech bubble in the upper right corner of the panel, clear of her face, with its tail pointing at her mouth, Text: "原文"`
- 内心：`a cloud-shaped thought bubble above her head`（不和 `speech bubble` 同格叠用）

**T0（默认）的写法对照**

```text
✅ 默认：留白 + 压掉随机气泡
   ..., empty space above her head, empty space at the right edge of the frame, -1::speech bubble ::, -1::text ::

❌ 默认不要：text, chinese text, a tall vertical narrator box ..., Text: "……"
```

**实测成功的两条完整示例**（可直接照抄改词）
```text
text, chinese text, a tall vertical narrator box at the right edge of the page reads in vertical Chinese lettering, Text: "那天夜里，雨一直没有停。"
text, chinese text, a tall vertical speech bubble beside her mouth reads in vertical Chinese lettering, Text: "你终于来了。"
```

---

## 9 · 色彩档：**默认不写任何色彩档词**

> ⚠️ **默认：prompt 里一个色彩档词都不写。**
> 不加 `monochrome / greyscale / screentones / pure black and white / no color`，
> **也不加** `full color / anime coloring / cel shading / colorful`。
> **色彩由软件的「风格提示词」与设置决定，模板只负责画面内容。**
> 负面里也不要追加色彩档词——负面用软件默认（§0 #2）。
>
> 用户明确说「要黑白漫画」时，才按下面「黑白档」一列写（那是唯一需要色彩档词的情形）。

| 项 | 黑白档（**只有用户明确要求时才用**） | **默认（不写任何色彩档词）** |
|---|---|---|
| base 风格位 | `monochrome, greyscale, screentones, pure black and white, no color` | **什么都不写**（连 `full color` 也不写） |
| 角色段 | **全部改明暗词**：`black / white / grey hair`、`grey eyes`、`dark necktie` | 写原色即可：`brown hair`、`amber eyes`、`red umbrella` |
| 光线 / 动作句 | 去掉色相：`blue moonlight → low moonlight`、`orange dusk light → low dusk light` | 正常写光色：`warm lamp light`、`overcast afternoon` |
| 负面 | 由用户自己在软件负面里追加 `color, colorful, colored` | **不改负面**（用软件默认） |

- `monochrome` 必须和 `greyscale` 同写 [官方]。
- **黑白档四处都要查色相词**（base 光线 / 角色段 / 动作句 / 细节句），见 §0.2、§0.3。
- 半黑白（只保留头发和眼睛颜色）：`greyscale, 1.2::greyscale with colored hair, greyscale with colored eyes ::`。
- **禁用词**（独立 tag）：`panel, panels, dialogue box, text focus, halftone, ultra complexity, multiple views, polka dot`、以及日文 tag。`lineart` 指未上色的线稿，不用来表达「线条清楚」。

---

**走黑白档时必看两条**（实测，16 张漫画页里 9 张不是黑白）：

1. **色温词也是污染源**：`cool / cold / warm / golden` 和色相词一样会把黑白页拉回彩色。
   `blue moonlight → low moonlight`、`warm lamp light → single desk lamp light`；**四处都要查**：base 光线 / 角色段 / 动作句 / 细节句。
2. **必须备一张「黑白版角色卡」逐字复用**：`brown eyes → dark eyes`、`pale blue summer dress → pale grey summer dress`；
   关键色道具用**明度**代替颜色（`red umbrella → bright white umbrella`），既保灰度又保住「这件东西在画面里是亮的」这条线索。
   只给彩色卡时，实测出现三种改法、三种结果（照抄色名 → 整格全彩，彩像素 47.6% / 89.1%）。

---

## 10 · 权重与排除

### 10.1 权重

- 只用 `数值::tag ::` 一种写法（`::` 前保留一个空格），常用 1.2，不混用 `{}` / `[]` [官方]。
- **数字权重不写闭合 `::` 会一直作用到 prompt 结尾** [官方]。
- 身份指纹用 1.2；其余默认不加权。

### 10.2 正面负权重：剂量曲线 [实测，同 seed 受控]

| 强度 | 效果 | 用途 |
|---|---|---|
| `-1::tag ::` | **削掉属性，物体还在**（`-1::red umbrella ::` → 红像素 −94.5%，伞变灰褐） | **改属性** |
| `-2::tag ::` | 相对 -1 **零增量** | **跳过，别用** |
| `-3::tag ::` | **删掉物体**（伞面消失，只剩伞杆） | **删物体** |
| `-4::` 及以下 | 未测 | — |

**三条硬规则**：
1. **位置**：写在**场景短语之后、`text` 组之前**（§8 硬规则 1）。
2. **生效前提**：**先删掉/改掉别处对同一元素的同义自然语言描述**，否则负权重会被同义句压过 [实测：上次判「负权重无效」就是这个原因]。
3. **`negativePrompt` 字段删不掉已被正面描述的内容**；要删就改正面或用正文负权重 `-3::`。
4. 全行**最多一处**负权重组。

---

## 11 · 失败分支

| 症状 | 先改 prompt | 还不行 |
|---|---|---|
| 画成分格页 / 出现多个画面 | 确认 UC 里有 `multiple views, comic, split screen` | 加 `-1::split screen ::`；换 seed |
| 人数不对 | 人数 tag = 段数；每段以 `girl/boy/other` 开头 | 检查是否有段漏了开头词 |
| **两个人合成一个身体** | **每角色段 tag 补到 ≥25** | 拆成两张图 |
| 角色长出不该有的部件 | 检查该角色段是否 >30 tag | 删掉同段互斥项（`twintails` vs `side ponytail`） |
| 黑发变棕、黑衣变橄榄 | 暖逆光下「黑」会系统性失守 [实测 RGB：原图 (34,30,31) vs 生成 (73,48,29)] | 加 `-1::warm ::`；换冷调光；换 seed |
| 关键结构丢了（窗格/家具） | 用 §4① 的具体词重写，不要只写笼统 tag | — |
| 桌上第二只道具消失 | 用 §4③ 点名数量（`second … on the table`） | — |
| 黑白页出彩色 | 查 base 光线 / 角色段 / 动作句三处的色相词，全改明暗词；补 `pure black and white, no color` | 换 seed |
| 文字不出 / 气泡是空的 | `Text:` 放到段末；补 `text` + 语言 tag；补载体句 | 改 T0 后期排字 |
| **负权重语法被画成文字** | **把负权重移到 `text` 组之前** | 删掉负权重 |
| 低头看手画成抬头看镜头 | 删掉 `straight-on` / `from front`，改 `from above` | — |
| 姿态没画对（该坐的站着） | 多人共用一个姿态词会竞争 [实测] | 拆图，或改用不同姿态 |
| 手部崩坏 | `hand focus` **无效** [实测与质量无相关性] | 换手势（并拢/侧向/虚化）+ 取景（远景/手出画） |
| 整格读不懂 | 补旁白，每格至少一条 | — |

---

## 12 · 自检清单

| # | 检查项 |
|---|---|
| 1 | 一行一格，无换行；` \| ` 两侧各一空格；每段以 `girl/boy/other` 开头 |
| 2 | 纯英文（`Text:` 和引号内除外）；没有画师名、质量词、尺寸词、禁用词 |
| 3 | 人数 tag = 段数；**不写 `solo`** |
| 4 | **每个角色段 25–30 个 tag** |
| 5 | 景别只写一个；机位 1–3 个且**互斥**；`straight-on` 与「低头」没同写 |
| 6 | **4 类必写词**：结构显式 / 颜色隔离 / 数量显式 / 体型显式 |
| 7 | 发色 / 发型 / 服装 / 体型 四项都写死了（没有靠「不写」） |
| 8 | 密度落在 `5N²+15N+E+C+L` 的 ±10% 内；没写满 |
| 9 | 角色卡 H 串逐字复用；带权重指纹在位 |
| 10 | 场景锚 / 光线锚跨格逐字相同；状态没被重置 |
| 11 | **色彩档：默认一个色彩档词都不写**（不加 `monochrome/greyscale`，也不加 `full color`）；色彩交给软件风格串。走黑白档时：用「黑白版角色卡」，四处无色相词，关键色道具用明度代替颜色 |
| 12 | **默认 T0：不写 `text` / `Text:` / 气泡 / 引号**，用 `empty space …` + `-1::speech bubble ::` 留位；只有用户明确要画面文字时才走 T1（那时 `Text:` 必须段末、负权重在 `text` 组之前） |
| 13 | 文字内容进「文字清单」，由后期排字（BCS / 气泡字幕） |
| 14 | **`stylePrompt` 不传**（继承软件默认；模板不生成、不代填画师串）；`qualityPreset` 不传；负面不传（默认不用）／`ucPreset` 继承软件默认；只传 `positivePrompt` + 模型与采样参数 |
| 15 | **序列表：机位列与内容列不矛盾**；角色卡有彩色/黑白两套，用哪套就逐字复用哪套 |
| 16 | **默认不写风格词**（画师名/风格串）、**默认不写质量词**（`masterpiece / best quality / very aesthetic`）、**默认不写色彩档词** |

---

## 13 · 示例（**默认：不写色彩档词 · 不写风格/质量词 · T0 无字**）

```text
1girl, indoors, bedroom, wooden desk, single desk lamp light, night,
cowboy shot, from the front, empty space above her head, empty space at the right edge of the frame,
three tall window panes, thick wooden mullions, small transom panes,
-1::speech bubble ::, -1::text ::
 | girl, 1.2::black hair ::, 1.2::long hair ::, blunt bangs, brown eyes, pale skin,
         mole under left eye, slim, petite, oversized white shirt, black pleated skirt,
         loose socks, bare feet, sitting on the chair, holding a diary against her chest,
         looking down, closed mouth, faint smile,
         she hugs the diary to her chest with both hands and tilts her head down toward it,
         the desk lamp casts a hard shadow of the diary across her collar
```

**对应设置**：V5 Full / High / 832×1216 / **`stylePrompt` 不传（继承软件默认）**、`qualityPreset` 不传、负面不传（默认不用）、`ucPreset` 继承软件默认 / **不写色彩档词** / **无字幕（T0）**。
**字数**：约 100 个英文词 ≈ 130 token，远低于 1400 上限；内容 tag 约 38 个，落在「1 人 + 中等环境 + 复杂服装」的目标区间内。

---

## 14 · 与 v4.0 整页模板的对应关系

| 本模板（单分镜） | v4.0（整页） |
|---|---|
| §5 分镜库（景别/机位） | §5.2 版式库（L1–L21） |
| §6 跨格连续性（四张表 + 五条规则） | §5.3 格位称呼 + RTL 镜像 + §8 角色卡 |
| §3 密度公式（按复杂度） | §3 单元数公式（按框数） |
| 单格 | 不写负面 |
| §4 4 类必写词 | （v4.0 只有「结构显式」一类） |
| §10.2 负权重剂量（-1 改属性 / -3 删物体） | §10「最多一处 `-1::`」 |
| §3.2 每角色段 25–30 | （v4.0 无此约束） |

**两份模板可以组合使用**：先用 v4.0 定整页版式和读序，再用本模板逐格出图（v4.0 §2 的 P8+ 也建议「A 逐格出图 + 后期拼页」）。

---

## 15 · 生产流程：**一个代理生成 → 子代理检查 → 修正 → 出图**

> 实测结论（8 格 A/B）：**生成必须由 1 个代理一次写完**，不要「N 个子代理各写 1 格」。
> 原因：子代理互相看不到，锚串会漂、会漏词、会各自加戏——实测跨格连续性 **1.25 vs 2.00**（满分 2）。
> 例：8 个子代理写出了**三种不同的窗**（三扇拱窗 / 两扇矩形格窗 / 连体双拱窗）；1 个代理三格全是同一款。
>
> **子代理的正确用途是「检查」，不是「生成」。**

### 15.1 四步流程

```
① 生成（1 个代理，串行）
   读模板 + 分镜表 + 五张表 → 一次写出全部 N 格的 prompt
   —— 顺手校对分镜表自身的矛盾（机位 vs 内容、色彩档词违规、画幅 vs 景别）

② 检查（N 个子代理，并行，每个查 1 格）
   每个子代理只拿「模板 + 分镜表 + 五张表 + 全部 N 格 prompt + 自己那一格」
   —— 逐项对照 §12 自检清单，输出「问题清单」，不改 prompt

③ 修正（1 个代理，串行）
   汇总全部问题清单 → 只改被指出来的项 → 输出最终 prompt

④ 出图（按格传尺寸）
   竖格 832×1216 / 横格 1216×832
   只传 positivePrompt + 采样参数；风格/负面/质量/色彩档全部继承软件默认
```

### 15.2 检查清单（子代理按这个逐项查，只报问题不改稿）

| # | 查什么 | 不合格判据 |
|---|---|---|
| 1 | **画幅 vs 景别** | 竖图用了 `wide shot` / `very wide shot` / `full body` |
| 2 | 景别数量 | 一格写了 2 个景别 |
| 3 | 机位互斥 | `low angle` 与 `high angle` 同写；`straight-on` 与 `head down` 同写 |
| 4 | 角色段 tag 数 | 少于 25（会角色合并）或多于 30（会被自己 tag 改写） |
| 5 | 角色卡 H 串 | 与角色卡**不是逐字相同**（换了词、调了顺序、漏了项） |
| 6 | 场景锚 / 光线锚 | 与锚串**不是逐字相同**，或被加了额外补充短语 |
| 7 | 180° 方向 | 正反打两格方向不相反 |
| 8 | 4 类必写词 | 结构显式 / 颜色隔离 / 数量显式 / 体型显式 有缺项 |
| 9 | 关键属性 | 发色 / 发型 / 服装 / 体型 有漏写（靠「不写」让模型决定） |
| 10 | **禁用词** | 出现 `monochrome`/`greyscale`/`full color`/`masterpiece`/`very aesthetic`/`text`/`Text:` |
| 11 | 元叙述 | prompt 里出现「这是推测」「正在写」这类说明性文字 |
| 12 | 密度 | 与 `5N²+15N+E+C+L` 偏差超 ±10% |

### 15.3 为什么「检查」可以用子代理，而「生成」不行

| | 生成（要全局） | 检查（只要局部） |
|---|---|---|
| 需要的信息 | 全部 N 格 + 五张表的一致性 | 自己那一格 + 模板规则 + 锚串 |
| 子代理够不够 | **不够**——看不到别人写的，锚串必漂 | **够**——规则是逐条可判的 |
| 实测 | 8 子代理 14.00 vs 1 代理 15.00 | — |

**一句话：壳归一个脑子，肉可以并行，检查可以并行，生成不能并行。**
